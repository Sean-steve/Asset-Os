import test from 'node:test'
import assert from 'node:assert/strict'
import {allowedBrowserOrigins,preflightAllowed} from '../dist/cors.js'
import {buildApp} from '../dist/app.js'
test('CORS allowlist rejects wildcard, cross-origin and HTTP production URLs',()=>{
 assert.deepEqual([...allowedBrowserOrigins({})],[])
 assert.throws(()=>allowedBrowserOrigins({CORS_ALLOWED_ORIGINS:'*'}),/invalid|HTTPS/)
 assert.throws(()=>allowedBrowserOrigins({CORS_ALLOWED_ORIGINS:'http://evil.example',NODE_ENV:'production'}),/HTTPS/)
 assert.deepEqual([...allowedBrowserOrigins({CORS_ALLOWED_ORIGINS:'https://sean-steve.github.io',NODE_ENV:'production'})],['https://sean-steve.github.io'])
 assert.equal(preflightAllowed('Authorization, X-Tenant-Id, Idempotency-Key, If-Match, Content-Type'),true)
 assert.equal(preflightAllowed('X-Fake-Secret'),false)
})
test('CORS preflight requires exact trusted origin and known headers, no credentials or wildcard',async()=>{
 const original=process.env.CORS_ALLOWED_ORIGINS
 process.env.CORS_ALLOWED_ORIGINS='https://sean-steve.github.io'
 const pool={query:async()=>({rows:[{role:'asset_os_app',restricted:true,applied:4}]}),end:async()=>{}}
 const app=buildApp(pool)
 try{
  const legit=await app.inject({method:'OPTIONS',url:'/v1/assets',headers:{
   origin:'https://sean-steve.github.io','access-control-request-method':'POST',
   'access-control-request-headers':'authorization,idempotency-key,x-tenant-id,content-type'
  }})
  assert.equal(legit.statusCode,204)
  assert.equal(legit.headers['access-control-allow-origin'],'https://sean-steve.github.io')
  assert.ok(!String(legit.headers['access-control-allow-origin']).includes('*'))
  assert.equal(legit.headers['access-control-allow-credentials'],undefined)
  const rogue=await app.inject({method:'OPTIONS',url:'/v1/assets',headers:{origin:'https://evil.example','access-control-request-method':'POST'}})
  assert.equal(rogue.statusCode,403)
  const headers=await app.inject({method:'OPTIONS',url:'/v1/assets',headers:{origin:'https://sean-steve.github.io','access-control-request-method':'POST','access-control-request-headers':'x-rogue'}})
  assert.equal(headers.statusCode,403)
  const sameOrigin=await app.inject({method:'GET',url:'/health/live'})
  assert.equal(sameOrigin.statusCode,200)
 }finally{
  await app.close()
  if(original===undefined)delete process.env.CORS_ALLOWED_ORIGINS
  else process.env.CORS_ALLOWED_ORIGINS=original
 }
})
