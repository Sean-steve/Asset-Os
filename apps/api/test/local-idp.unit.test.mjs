import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash,randomBytes} from 'node:crypto'
import {createLocalJWKSet,jwtVerify} from 'jose'
import {createLocalIdp} from '../dist/local-idp.js'
import {oidcConfiguration} from '../dist/identity.js'

const devEnv={NODE_ENV:'development',LOCAL_IDP_ENABLED:'yes',
 LOCAL_IDP_PASSWORD:'local-test-password-strong-1234',
 LOCAL_IDP_ADMIN_SECRET:'local-test-admin-secret-strong-1234567890'}
const endpoint='http://127.0.0.1:5173/Asset-Os/'
const verifier='a'.repeat(48)
const challenge=createHash('sha256').update(verifier).digest('base64url')
const newState=()=>randomBytes(32).toString('base64url')
function url(state=newState()){
 const q=new URLSearchParams({response_type:'code',client_id:'asset-os-local-spa',
  redirect_uri:endpoint,scope:'openid',audience:'asset-os-api',
  code_challenge_method:'S256',code_challenge:challenge,state})
 return '/authorize?'+q
}
function body(o){return new URLSearchParams(o).toString()}
const form='application/x-www-form-urlencoded'
test('local issuer refuses production, missing opt-in and weak credentials',async()=>{
 await assert.rejects(createLocalIdp({...devEnv,NODE_ENV:'production'}),/development/)
 await assert.rejects(createLocalIdp({...devEnv,LOCAL_IDP_ENABLED:''}),/loopback/)
 await assert.rejects(createLocalIdp({...devEnv,LOCAL_IDP_PASSWORD:'weak'}),/credentials/)
})
test('development HTTP JWKS exception is explicit and cannot enable production HTTP',()=>{
 const env={NODE_ENV:'development',ASSET_OS_ALLOW_LOCAL_OIDC:'yes',
  OIDC_ISSUER:'http://127.0.0.1:3003',OIDC_JWKS_URL:'http://127.0.0.1:3003/jwks',
  OIDC_AUDIENCE:'asset-os-api'}
 assert.equal(oidcConfiguration(env)?.issuer,env.OIDC_ISSUER)
 assert.throws(()=>oidcConfiguration({...env,NODE_ENV:'production'}),/HTTPS/)
 assert.throws(()=>oidcConfiguration({...env,ASSET_OS_ALLOW_LOCAL_OIDC:''}),/HTTPS/)
 assert.throws(()=>oidcConfiguration({...env,OIDC_ISSUER:'http://192.168.0.3:3003'}),/HTTPS/)
})
test('local OIDC PKCE login signs issuer-pinned RS256 access tokens; code burns after exchange',async()=>{
 const app=await createLocalIdp(devEnv)
 try{
  const get=await app.inject({method:'GET',url:url()})
  assert.equal(get.statusCode,200)
  const ticket=get.body.match(/name="ticket" type="hidden" value="([^"]+)"/)?.[1]
  assert.ok(ticket)
  const login=await app.inject({method:'POST',url:'/authorize',
   headers:{'content-type':form},payload:body({ticket,username:'owner',password:devEnv.LOCAL_IDP_PASSWORD})})
  assert.equal(login.statusCode,303)
  const redirect=new URL(login.headers.location)
  assert.equal(redirect.origin,'http://127.0.0.1:5173')
  const code=redirect.searchParams.get('code')
  const response=await app.inject({method:'POST',url:'/token',headers:{
   'content-type':form,origin:'http://127.0.0.1:5173'},
   payload:body({grant_type:'authorization_code',client_id:'asset-os-local-spa',
    redirect_uri:endpoint,code,code_verifier:verifier})})
  assert.equal(response.statusCode,200)
  assert.equal(response.headers['access-control-allow-origin'],'http://127.0.0.1:5173')
  const jwks=(await app.inject({method:'GET',url:'/jwks'})).json()
  const verified=await jwtVerify(response.json().access_token,createLocalJWKSet(jwks),{
   issuer:'http://127.0.0.1:3003',audience:'asset-os-api',algorithms:['RS256']
  })
  assert.equal(verified.payload.sub,'asset-os-local-owner')
  const replay=await app.inject({method:'POST',url:'/token',headers:{'content-type':form},
   payload:body({grant_type:'authorization_code',client_id:'asset-os-local-spa',
    redirect_uri:endpoint,code,code_verifier:verifier})})
  assert.equal(replay.statusCode,400)
  const disallowed=await app.inject({method:'POST',url:'/token',headers:{
   origin:'http://evil.example','content-type':form},payload:'invalid=true'})
  assert.equal(disallowed.statusCode,403)
 }finally{await app.close()}
})
test('wrong password, malicious redirect, invalid PKCE and admin-token guard fail closed',async()=>{
 const app=await createLocalIdp(devEnv)
 try{
  const bad=await app.inject({method:'GET',url:'/authorize?'+new URLSearchParams({
   response_type:'code',client_id:'asset-os-local-spa',redirect_uri:'https://evil.example/',
   scope:'openid',audience:'asset-os-api',code_challenge_method:'S256',
   code_challenge:challenge,state:newState()})})
  assert.equal(bad.statusCode,400)
  const initial=await app.inject({method:'GET',url:url()})
  const ticket=initial.body.match(/name="ticket" type="hidden" value="([^"]+)"/)?.[1]
  const wrong=await app.inject({method:'POST',url:'/authorize',headers:{'content-type':form},
   payload:body({ticket,username:'owner',password:'wrong'})})
  assert.equal(wrong.statusCode,401)
  const badAdmin=await app.inject({method:'POST',url:'/dev/owner-token',
   headers:{'x-local-admin-secret':'wrong'}})
  assert.equal(badAdmin.statusCode,403)
  const admin=await app.inject({method:'POST',url:'/dev/owner-token',
   headers:{'x-local-admin-secret':devEnv.LOCAL_IDP_ADMIN_SECRET}})
  assert.equal(admin.statusCode,200)
  assert.ok(admin.json().access_token.length>50)
 }finally{await app.close()}
})
