import fastify from 'fastify'
import {readFileSync} from 'node:fs'
import type {Pool} from 'pg'
import {checkReadiness} from './database.js'
import {API_VERSION,CONTRACT_VERSION,FOUNDATION_ONLY_CAPABILITIES,identityNotConfigured} from './contracts.js'

type PoolPort=Pick<Pool,'query'|'end'>
const openapi=JSON.parse(readFileSync(new URL('../openapi/openapi.json',import.meta.url),'utf8')) as object

export function buildApp(pool:PoolPort){
 const app=fastify({
  logger:{redact:{paths:['req.headers.authorization','req.headers.cookie','res.headers.set-cookie'],censor:'[REDACTED]'}},
  bodyLimit:1024*1024,
  trustProxy:false,
  requestIdHeader:false
 })
 app.addHook('onSend',async(_req,reply,payload)=>{
  reply.header('Cache-Control','no-store')
  reply.header('X-Content-Type-Options','nosniff')
  reply.header('Referrer-Policy','no-referrer')
  reply.header('X-Frame-Options','DENY')
  return payload
 })
 app.get('/health/live',async()=>({status:'ok',service:'asset-os-api',phase:'B0'}))
 app.get('/health/ready',async(_request,reply)=>{
  try{
   if(await checkReadiness(pool))return {status:'ready',database:'reachable',schema:'b0'}
  }catch{/* do not leak connection strings, table names or credentials */}
  return reply.code(503).send({status:'unready',database:'unavailable'})
 })
 app.get('/v1/meta',async()=>({
  apiVersion:API_VERSION,contractVersion:CONTRACT_VERSION,phase:'B0',
  runtimeDomainAccess:'IDENTITY_NOT_CONFIGURED',
  frontendConnection:'NOT_CONNECTED',
  capabilities:FOUNDATION_ONLY_CAPABILITIES
 }))
 app.get('/v1/openapi.json',async()=>openapi)
 // Explicit fail-closed boundary. Phase B0 has no issuer/JWKS, no actor binding
 // or authorization. Headers claiming subject or tenant NEVER turn on CRUD.
 app.all('/v1/*',async(request,reply)=>
  reply.code(503).send(identityNotConfigured(request.id)))
 app.setNotFoundHandler(async(request,reply)=>
  reply.code(404).send({error:{code:'NOT_FOUND',message:'Unknown API route.',requestId:request.id}}))
 app.setErrorHandler(async(error,request,reply)=>{
  request.log.error({error},'API request failed')
  return reply.code(500).send({error:{code:'INTERNAL_ERROR',message:'Request failed.',requestId:request.id}})
 })
 app.addHook('onClose',async()=>{await pool.end()})
 return app
}
