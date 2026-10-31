import {createRemoteJWKSet,jwtVerify,type JWTPayload} from 'jose'
import {Uuid} from './contracts.js'
import {withTenantTransaction,type TenantSqlClient} from './database.js'
import type pg from 'pg'

export type VerifiedIdentity={issuer:string;subject:string}
export type WorkspaceRole='WORKSPACE_OWNER'|'OPERATIONS'|'PORTFOLIO_ANALYST'|'VIEWER'
export type VerifiedMembership=VerifiedIdentity&{
 tenantId:string;identityId:string;role:WorkspaceRole
}
export type OidcVerifier={verify:(token:string)=>Promise<VerifiedIdentity>}
export class ApiFault extends Error{
 constructor(public readonly status:number,public readonly code:string,message:string){super(message)}
}
export function oidcConfiguration(env:NodeJS.ProcessEnv=process.env){
 const issuer=env.OIDC_ISSUER,audience=env.OIDC_AUDIENCE,jwks=env.OIDC_JWKS_URL
 if(!issuer&&!audience&&!jwks)return null
 if(!issuer||!audience||!jwks)throw new Error('OIDC_ISSUER, OIDC_AUDIENCE and OIDC_JWKS_URL must all be configured together.')
 let issuerUrl:URL,jwksUrl:URL
 try{issuerUrl=new URL(issuer);jwksUrl=new URL(jwks)}catch{throw new Error('OIDC issuer/JWKS must be valid absolute URLs.')}
 const allowLoopback=env.NODE_ENV==='test'&&env.OIDC_ALLOW_TEST_LOOPBACK==='true'
   &&issuerUrl.hostname==='127.0.0.1'&&jwksUrl.hostname==='127.0.0.1'
 const secure=issuerUrl.protocol==='https:'&&jwksUrl.protocol==='https:'
 if(!secure&&!allowLoopback)throw new Error('OIDC issuer and JWKS require HTTPS (test-only loopback exception).')
 if(issuerUrl.origin!==jwksUrl.origin)throw new Error('OIDC JWKS must share the pinned issuer origin.')
 if(issuerUrl.username||issuerUrl.password||jwksUrl.username||jwksUrl.password||jwksUrl.hash)
  throw new Error('OIDC authority URLs may not contain credentials or fragments.')
 if(audience.length<3||audience.length>250)throw new Error('Invalid OIDC access-token audience.')
 return {issuer,audience,jwksUrl}
}
export function createOidcVerifier(env:NodeJS.ProcessEnv=process.env):OidcVerifier|null{
 const config=oidcConfiguration(env)
 if(!config)return null
 const keys=createRemoteJWKSet(config.jwksUrl,{timeoutDuration:5000,cooldownDuration:15000})
 return {verify:async(token:string)=>{
  const {payload,protectedHeader}=await jwtVerify(token,keys,{
   issuer:config.issuer,audience:config.audience,algorithms:['RS256'],
   clockTolerance:'5s',maxTokenAge:'1h',requiredClaims:['sub','iat','exp']
  })
  if(protectedHeader.alg!=='RS256'||typeof payload.sub!=='string'||payload.sub.length<1||payload.sub.length>250)
   throw Error('Invalid OIDC subject.')
  return {issuer:payload.iss as string,subject:payload.sub}
 }}
}
export function selectTenant(header:string|undefined):string{
 if(!header||!Uuid.safeParse(header).success)
  throw new ApiFault(400,'TENANT_SELECTION_REQUIRED','Choose a valid tenant using X-Tenant-Id.')
 return header
}
export function bearerToken(header:string|undefined):string{
 if(!header||!/^Bearer [A-Za-z0-9._~-]+$/.test(header)||header.length>10000)
  throw new ApiFault(401,'AUTHENTICATION_REQUIRED','A verified bearer access token is required.')
 return header.slice(7)
}
export async function authenticate(
 authorization:string|undefined,verifier:OidcVerifier|null
):Promise<VerifiedIdentity>{
 if(!verifier)throw new ApiFault(503,'IDENTITY_NOT_CONFIGURED',
  'A verified Personal Kernel/OIDC identity provider must be configured before domain access.')
 const token=bearerToken(authorization)
 try{return await verifier.verify(token)}
 catch{throw new ApiFault(401,'INVALID_ACCESS_TOKEN','Token signature, issuer, audience or lifetime is invalid.')}
}
export async function requireMembership(
 client:TenantSqlClient,tenantId:string,identity:VerifiedIdentity
):Promise<VerifiedMembership>{
 const rows=await client.query(
  'SELECT b.id AS identity_id,m.role FROM asset_os.identity_bindings b JOIN asset_os.tenant_memberships m ON m.tenant_id=b.tenant_id AND m.identity_id=b.id JOIN asset_os.tenants t ON t.id=b.tenant_id WHERE b.tenant_id=$1 AND b.issuer=$2 AND b.external_subject=$3 AND b.binding_state=$4 AND b.verified_at IS NOT NULL AND m.state=$5 AND t.status=$6',
  [tenantId,identity.issuer,identity.subject,'VERIFIED','ACTIVE','ACTIVE'])
 if(rows.rowCount!==1)throw new ApiFault(403,'TENANT_ACCESS_DENIED','No verified active membership for the selected tenant.')
 const row=rows.rows[0] as {identity_id:string;role:WorkspaceRole}
 return {...identity,tenantId,identityId:row.identity_id,role:row.role}
}
export function requireRole(membership:VerifiedMembership,capability:'read'|'write'){
 if(capability==='write'&&!['WORKSPACE_OWNER','OPERATIONS'].includes(membership.role))
  throw new ApiFault(403,'INSUFFICIENT_ROLE','The verified tenant role cannot modify asset records.')
}
// Utility: useful for non-HTTP tests, but caller must supply verified principal.
export async function withAuthorizedTenant<T>(pool:Pick<pg.Pool,'connect'>,tenantId:string,
 verifiedIdentity:VerifiedIdentity,action:'read'|'write',
 work:(client:TenantSqlClient,member:VerifiedMembership)=>Promise<T>):Promise<T>{
 return withTenantTransaction(pool,tenantId,async client=>{
  const member=await requireMembership(client,tenantId,verifiedIdentity)
  requireRole(member,action)
  return work(client,member)
 })
}
export function tokenClaimsAreUntrustedOutsideVerification(_payload:JWTPayload):never{
 throw new Error('Token claims are not trusted until jwtVerify succeeds.')
}
