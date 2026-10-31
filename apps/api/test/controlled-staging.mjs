/**
 * Ephemeral CI staging harness. Never deploy this file or expose it publicly.
 * Real PostgreSQL + real Fastify, but self-signed TEST JWKS / OAuth issuer.
 */
import {createServer} from 'node:http'
import {randomUUID,createHash} from 'node:crypto'
import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {generateKeyPair,exportJWK,SignJWT} from 'jose'
import {createPool} from '../dist/database.js'
import {buildApp} from '../dist/app.js'
import {createOidcVerifier} from '../dist/identity.js'
import {provisionFirstOwner} from '../dist/bootstrap.js'

const SITE='http://127.0.0.1:4173'
const API='http://127.0.0.1:3001'
const IDP='http://127.0.0.1:4300'
const ISSUER=IDP+'/realm'
const AUDIENCE='asset-os-api'
const CLIENT_ID='asset-os-stage-public'
const REDIRECT=SITE+'/Asset-Os/'
const codeStore=new Map()
const environment={...process.env,NODE_ENV:'test',OIDC_ALLOW_TEST_LOOPBACK:'true',
 OIDC_ISSUER:ISSUER,OIDC_AUDIENCE:AUDIENCE,OIDC_JWKS_URL:ISSUER+'/keys',
 CORS_ALLOWED_ORIGINS:SITE
}
if(process.env.ASSET_OS_FULLSTACK_STAGE!=='1'||process.env.CI!=='true')
 throw Error('The controlled staging issuer is CI-only and requires explicit opt-in.')
if(!environment.DATABASE_URL||!environment.MIGRATION_DATABASE_URL)
 throw Error('Ephemeral staging needs separate test database runtime and migration credentials.')

const {privateKey,publicKey}=await generateKeyPair('RS256')
const publicJwk={...await exportJWK(publicKey),kid:'staging-only-rs256-key',use:'sig',alg:'RS256'}
const subject='controlled-stage-'+randomUUID()
const makeToken=()=>new SignJWT({scope:'asset:read asset:write'})
 .setProtectedHeader({alg:'RS256',kid:'staging-only-rs256-key'})
 .setIssuer(ISSUER).setAudience(AUDIENCE).setSubject(subject)
 .setIssuedAt().setExpirationTime('20m').sign(privateKey)
async function readBody(request){
 let text=''
 for await(const chunk of request){
  text+=chunk.toString('utf8')
  if(text.length>16000)throw Error('Input too large.')
 }
 return text
}
const oauthServer=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store')
 res.setHeader('X-Content-Type-Options','nosniff')
 const origin=req.headers.origin
 if(origin===SITE){
  res.setHeader('Access-Control-Allow-Origin',SITE)
  res.setHeader('Vary','Origin')
  res.setHeader('Access-Control-Allow-Headers','content-type')
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS')
 }
 if(req.method==='OPTIONS'){res.writeHead(origin===SITE?204:403);res.end();return}
 const url=new URL(req.url||'/',IDP)
 if(req.method==='GET'&&url.pathname==='/realm/keys'){
  res.setHeader('Content-Type','application/json')
  res.end(JSON.stringify({keys:[publicJwk]}));return
 }
 if(req.method==='GET'&&url.pathname==='/oauth/authorize'){
  const p=url.searchParams
  const allowed=p.get('client_id')===CLIENT_ID&&p.get('redirect_uri')===REDIRECT&&
   p.get('response_type')==='code'&&p.get('code_challenge_method')==='S256'&&
   /^[A-Za-z0-9_-]{40,}$/.test(p.get('code_challenge')||'')&&
   /^[A-Za-z0-9_-]{40,}$/.test(p.get('state')||'')&&p.get('audience')===AUDIENCE
  if(!allowed){res.writeHead(400);res.end('Invalid ephemeral authorization request.');return}
  const code=randomUUID()
  codeStore.set(code,{challenge:p.get('code_challenge'),created:Date.now()})
  const redirect=new URL(REDIRECT)
  redirect.searchParams.set('code',code);redirect.searchParams.set('state',p.get('state'))
  res.writeHead(302,{Location:redirect.toString()});res.end();return
 }
 if(req.method==='POST'&&url.pathname==='/oauth/token'&&origin===SITE){
  try{
   const form=new URLSearchParams(await readBody(req))
   const code=form.get('code')||''
   const pending=codeStore.get(code)
   codeStore.delete(code)
   const challenge=createHash('sha256').update(form.get('code_verifier')||'').digest('base64url')
   if(!pending||Date.now()-pending.created>120000||
      challenge!==pending.challenge||form.get('client_id')!==CLIENT_ID||
      form.get('grant_type')!=='authorization_code'||form.get('redirect_uri')!==REDIRECT){
    res.writeHead(400);res.end('Invalid one-time code or verifier.');return
   }
   res.setHeader('Content-Type','application/json')
   res.end(JSON.stringify({access_token:await makeToken(),token_type:'Bearer',expires_in:1200}));return
  }catch{res.writeHead(400);res.end('Token request denied.');return}
 }
 res.writeHead(404);res.end('Not found.')
})
const address=port=>new Promise((resolve,reject)=>
 oauthServer.listen(port,'127.0.0.1',e=>e?reject(e):resolve()))
let api=null,tempDir=null
try{
 await address(4300)
 const token=await makeToken()
 tempDir=await mkdtemp(path.join(tmpdir(),'asset-os-stage-'))
 const file=path.join(tempDir,'test-owner-token')
 await writeFile(file,token,{mode:0o600})
 await chmod(file,0o600)
 const registered=await provisionFirstOwner({
  slug:'ci-asset-stage-'+randomUUID().slice(0,8),name:'Ephemeral B2.1 Staging Tenant',
  tokenFile:file,confirm:true
 },environment)
 await rm(file,{force:true})
 const pool=createPool(environment)
 api=buildApp(pool,createOidcVerifier(environment))
 await api.listen({host:'127.0.0.1',port:3001})
 await writeFile('/tmp/asset-os-stage-tenant.json',JSON.stringify({
  tenantId:registered.tenantId,apiBaseUrl:API
 }),{mode:0o600})
 console.info('Controlled Asset OS staging is ready (real PostgreSQL, self-signed CI-only issuer).')
}catch(error){
 console.error('Controlled staging boot failed:',error instanceof Error?error.message:'unexpected error')
 if(api)await api.close().catch(()=>{})
 await new Promise(resolve=>oauthServer.close(()=>resolve()))
 if(tempDir)await rm(tempDir,{recursive:true,force:true}).catch(()=>{})
 process.exitCode=1
}
if(!process.exitCode){
 const shutdown=async()=>{
  if(api)await api.close()
  await new Promise(resolve=>oauthServer.close(()=>resolve()))
  if(tempDir)await rm(tempDir,{recursive:true,force:true}).catch(()=>{})
  process.exit(0)
 }
 process.once('SIGTERM',()=>void shutdown())
 process.once('SIGINT',()=>void shutdown())
}
