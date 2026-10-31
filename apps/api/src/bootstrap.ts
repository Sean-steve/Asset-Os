import {readFile,lstat} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import pg from 'pg'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {z} from 'zod'
import {migrationDatabaseUrl} from './config.js'
import {createOidcVerifier} from './identity.js'

export const BootstrapArgs=z.object({
 slug:z.string().regex(/^[a-z0-9][a-z0-9-]{2,62}$/),
 name:z.string().min(1).max(120),
 tokenFile:z.string().min(1).max(4096),
 confirm:z.literal(true)
})
export function parseBootstrapArgs(argv:string[]){
 const pairs=new Map<string,string>(),known=new Set(['--tenant-slug','--tenant-name','--token-file'])
 let confirm=false
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--confirm'){confirm=true;continue}
  const flag=argv[i]
  if(!known.has(flag)||!argv[i+1]||argv[i+1].startsWith('--')||pairs.has(flag))
   throw new Error('Usage: bootstrap --tenant-slug slug --tenant-name name --token-file path --confirm')
  pairs.set(flag,argv[++i])
 }
 return BootstrapArgs.parse({
  slug:pairs.get('--tenant-slug'),name:pairs.get('--tenant-name'),
  tokenFile:pairs.get('--token-file'),confirm
 })
}
/**
 * First-owner provisioning requires a signed, verified, non-expired OIDC
 * access token obtained directly by the operator. A CLI flag alone cannot
 * designate an arbitrary identity as VERIFIED.
 */
export async function provisionFirstOwner(args:z.infer<typeof BootstrapArgs>,env:NodeJS.ProcessEnv=process.env){
 const verifier=createOidcVerifier(env)
 if(!verifier)throw Error('OIDC issuer, audience and JWKS must be configured before tenant bootstrap.')
 const metadata=await lstat(args.tokenFile)
 if(!metadata.isFile()||(process.platform!=='win32'&&(metadata.mode&0o077)!==0))
  throw Error('Token file must be regular and readable only by its owner (chmod 600).')
 const raw=(await readFile(args.tokenFile,'utf8')).trim()
 if(!raw||raw.length>10000)throw Error('Token file is missing a supported access token.')
 const principal=await verifier.verify(raw)
 // No token is printed/logged. Provisioning requires schema owner access.
 const ownerUrl=migrationDatabaseUrl(env)
 const client=new pg.Client({connectionString:ownerUrl,application_name:'asset-os-first-owner-bootstrap'})
 const tenantId=randomUUID(),bindingId=randomUUID()
 await client.connect()
 try{
  await client.query('BEGIN')
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId])
  await client.query(
   'INSERT INTO asset_os.tenants(id,slug,display_name) VALUES($1,$2,$3)',
   [tenantId,args.slug,args.name])
  await client.query(
   "INSERT INTO asset_os.identity_bindings(id,tenant_id,issuer,external_subject,binding_state,verified_at) VALUES($1,$2,$3,$4,'VERIFIED',clock_timestamp())",
   [bindingId,tenantId,principal.issuer,principal.subject])
  await client.query(
   "INSERT INTO asset_os.tenant_memberships(tenant_id,identity_id,role,state) VALUES($1,$2,'WORKSPACE_OWNER','ACTIVE')",
   [tenantId,bindingId])
  await client.query('COMMIT')
  return {tenantId,bindingId,slug:args.slug}
 }catch(e){await client.query('ROLLBACK');throw e}
 finally{await client.end()}
}
async function main(){
 const args=parseBootstrapArgs(process.argv.slice(2))
 const result=await provisionFirstOwner(args)
 console.info('Verified OIDC owner bound to new tenant:',result.tenantId)
 console.info('Select X-Tenant-Id:',result.tenantId)
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 main().catch(()=>{console.error('Tenant bootstrap failed: verify token, issuer/JWKS, migration DB role and unique slug.');process.exitCode=1})
}
