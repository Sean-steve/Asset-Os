import fastify from 'fastify'
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto'
import {SignJWT,exportJWK,generateKeyPair} from 'jose'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const issuer='http://127.0.0.1:3003'
const clientId='asset-os-local-spa',audience='asset-os-api'
const redirects=new Set(['http://127.0.0.1:5173/Asset-Os/','http://localhost:5173/Asset-Os/'])
const origins=new Set(['http://127.0.0.1:5173','http://localhost:5173'])
type Auth={redirect:string;challenge:string;state:string;issued:number;attempts:number}
type Code={redirect:string;challenge:string;issued:number}
export async function createLocalIdp(env:NodeJS.ProcessEnv=process.env){
 if(env.NODE_ENV!=='development'||env.LOCAL_IDP_ENABLED!=='yes')
  throw Error('Development OIDC is loopback-only; NODE_ENV=development and LOCAL_IDP_ENABLED=yes required.')
 const password=env.LOCAL_IDP_PASSWORD||'',admin=env.LOCAL_IDP_ADMIN_SECRET||''
 if(password.length<16||admin.length<32||password===admin)throw Error('Strong separate local-only credentials required.')
 const {publicKey,privateKey}=await generateKeyPair('RS256')
 const jwk=await exportJWK(publicKey)
 Object.assign(jwk,{kid:'ephemeral-local-key',alg:'RS256',use:'sig'})
 const authorizations=new Map<string,Auth>(),codes=new Map<string,Code>()
 const app=fastify({logger:false,trustProxy:false,bodyLimit:8192})
 app.addContentTypeParser('application/x-www-form-urlencoded',{parseAs:'string'},
  (_req,raw,done)=>done(null,new URLSearchParams(raw as string)))
 app.addHook('onRequest',async(req,reply)=>{
  reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff')
   .header('Referrer-Policy','no-referrer').header('X-Frame-Options','DENY')
  const origin=req.headers.origin
  if(origin){
   if(!origins.has(origin))return reply.code(403).send({error:'origin_not_allowed'})
   reply.header('Access-Control-Allow-Origin',origin).header('Vary','Origin')
  }
  if(req.method==='OPTIONS'&&req.url==='/token'){
   reply.header('Access-Control-Allow-Methods','POST, OPTIONS')
    .header('Access-Control-Allow-Headers','content-type')
   return reply.code(204).send()
  }
 })
 const eq=(a:string,b:string)=>timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest())
 const issue=()=>new SignJWT({scope:'openid',client_id:clientId})
  .setProtectedHeader({alg:'RS256',kid:'ephemeral-local-key',typ:'JWT'})
  .setIssuer(issuer).setAudience(audience).setSubject('asset-os-local-owner')
  .setIssuedAt().setExpirationTime('20m').sign(privateKey)
 const clean=()=>{
  for(const [id,v] of authorizations)if(Date.now()-v.issued>300000)authorizations.delete(id)
  for(const [id,v] of codes)if(Date.now()-v.issued>90000)codes.delete(id)
 }
 const login=(id:string,failed=false)=>'<!doctype html><html lang="en"><meta charset="utf-8"/>'+
  '<meta name="viewport" content="width=device-width"/><title>Asset OS local login</title>'+
  '<style>body{font:16px system-ui;display:grid;place-items:center;min-height:95vh;background:#101728;color:#edf3ff}main{padding:32px;background:#1b2840;border-radius:16px;width:min(86vw,380px)}input{display:block;margin:8px 0 17px;width:95%;padding:12px}button{padding:12px 18px;background:#468ff7;color:#fff;border:0;border-radius:8px}small{color:#afbbce}</style>'+
  '<main><small>LOOPBACK DEVELOPMENT IDENTITY — NOT PRODUCTION</small><h1>Asset OS login</h1>'+
  (failed?'<p role="alert">Incorrect local credentials.</p>':'')+
  '<form method="post" action="/authorize"><input name="ticket" type="hidden" value="'+id+'"/>'+
  '<label>Username<input name="username" value="owner" required autocomplete="username"/></label>'+
  '<label>Password<input name="password" type="password" required autocomplete="current-password"/></label>'+
  '<button type="submit">Sign in securely</button></form></main></html>'
 app.get('/health/live',async()=>({status:'ok',mode:'local-only'}))
 app.get('/jwks',async()=>({keys:[jwk]}))
 app.get('/.well-known/openid-configuration',async()=>({
  issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',
  jwks_uri:issuer+'/jwks',response_types_supported:['code'],
  code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']
 }))
 app.get('/authorize',async(req,reply)=>{
  clean();const q=req.query as Record<string,string>
  if(q.response_type!=='code'||q.client_id!==clientId||!redirects.has(q.redirect_uri)||
   q.scope!=='openid'||q.audience!==audience||q.code_challenge_method!=='S256'||
   !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge||'')||
   !/^[A-Za-z0-9_-]{20,256}$/.test(q.state||''))
   return reply.code(400).send({error:'invalid_request'})
  const ticket=randomBytes(32).toString('base64url')
  authorizations.set(ticket,{redirect:q.redirect_uri,challenge:q.code_challenge,state:q.state,issued:Date.now(),attempts:0})
  return reply.type('text/html').send(login(ticket))
 })
 app.post('/authorize',async(req,reply)=>{
  clean();const b=req.body as URLSearchParams,ticket=b.get('ticket')||''
  const info=authorizations.get(ticket)
  if(!info||info.attempts>=5)return reply.code(400).send({error:'invalid_login'})
  info.attempts++
  if(b.get('username')!=='owner'||!eq(b.get('password')||'',password))
   return reply.code(401).type('text/html').send(login(ticket,true))
  authorizations.delete(ticket)
  const code=randomBytes(32).toString('base64url')
  codes.set(code,{redirect:info.redirect,challenge:info.challenge,issued:Date.now()})
  const url=new URL(info.redirect)
  url.searchParams.set('code',code);url.searchParams.set('state',info.state)
  return reply.code(303).header('Location',url.href).send()
 })
 app.post('/token',async(req,reply)=>{
  clean();const b=req.body as URLSearchParams,code=b.get('code')||'',verifier=b.get('code_verifier')||''
  const info=codes.get(code);codes.delete(code)
  const challenge=createHash('sha256').update(verifier).digest('base64url')
  if(!info||b.get('grant_type')!=='authorization_code'||b.get('client_id')!==clientId||
   b.get('redirect_uri')!==info.redirect||!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||
   !eq(challenge,info.challenge))return reply.code(400).send({error:'invalid_grant'})
  return {access_token:await issue(),token_type:'Bearer',expires_in:1200}
 })
 // CLI-only enrollment. This admin secret is never sent to browser code.
 app.post('/dev/owner-token',async(req,reply)=>{
  if(typeof req.headers['x-local-admin-secret']!=='string'||
   !eq(req.headers['x-local-admin-secret'],admin))
   return reply.code(403).send({error:'forbidden'})
  return {access_token:await issue(),expires_in:1200}
 })
 return app
}
async function main(){
 const app=await createLocalIdp()
 await app.listen({host:'127.0.0.1',port:3003})
 console.info('Local OIDC PKCE issuer: '+issuer)
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 main().catch(()=>{console.error('Local OIDC refused startup; check dev mode, secrets and loopback port.');process.exitCode=1})
}
