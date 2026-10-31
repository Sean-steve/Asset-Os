import fastify from 'fastify'
import {allowedBrowserOrigins,EXPOSE_HEADERS,METHODS,REQUEST_HEADERS,preflightAllowed} from './cors.js'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import type {Pool} from 'pg'
import {checkReadiness,type TenantSqlClient} from './database.js'
import {
 API_VERSION,CONTRACT_VERSION,B3_CAPABILITIES,identityNotConfigured
} from './contracts.js'
import {
 ApiFault,authenticate,requireMembership,requireRole,selectTenant,
 type VerifiedMembership,type OidcVerifier
} from './identity.js'
import {withTenantTransaction} from './database.js'
import {createAsset,getAsset,listAssets,updateAsset,etag} from './registry.js'
import {startOrTransition,acquire,assignInterest,transferInterest,dispose,lifecycleSnapshot,listDomainHistory} from './lifecycle.js'
import type {FastifyReply} from 'fastify'
import {recordValuation,acceptValuation,recordFacility,observeBalance,recordCashFlow,recordReconciliationReference,listEvidence,listFacilities,listReferences,economicsSummary} from './economics.js'

type PoolPort=Pick<Pool,'query'|'end'> & Partial<Pick<Pool,'connect'>>
const openapi=JSON.parse(readFileSync(new URL('../openapi/openapi.json',import.meta.url),'utf8')) as object
function header(value:string|string[]|undefined):string|undefined{
 return typeof value==='string'?value:undefined
}

export function buildApp(pool:PoolPort,verifier:OidcVerifier|null=null){
 const trustedOrigins=allowedBrowserOrigins(process.env)
 const app=fastify({
  logger:{redact:{paths:['req.headers.authorization','req.headers.cookie','res.headers.set-cookie'],censor:'[REDACTED]'}},
  bodyLimit:512*1024,trustProxy:false,requestIdHeader:false
 })
 app.addHook('onRequest',async(request,reply)=>{
  const origin=typeof request.headers.origin==='string'?request.headers.origin:undefined
  if(origin){
   if(!trustedOrigins.has(origin))return reply.code(403).send({error:{code:'ORIGIN_NOT_ALLOWED',message:'Browser origin is not authorized.',requestId:request.id}})
   reply.header('Vary','Origin')
   reply.header('Access-Control-Allow-Origin',origin)
   reply.header('Access-Control-Expose-Headers',EXPOSE_HEADERS)
  }
  if(request.method==='OPTIONS'){
   if(!origin||!preflightAllowed(request.headers['access-control-request-headers'])||
      !['GET','POST','PATCH','OPTIONS'].includes(request.headers['access-control-request-method']||'')){
    return reply.code(403).send({error:{code:'CORS_PREFLIGHT_DENIED',message:'Browser preflight not allowed.',requestId:request.id}})
   }
   reply.header('Access-Control-Allow-Methods',METHODS)
   reply.header('Access-Control-Allow-Headers',REQUEST_HEADERS.join(', '))
   reply.header('Access-Control-Max-Age','600')
   return reply.code(204).send()
  }
 })
 app.addHook('onSend',async(_req,reply,payload)=>{
  reply.header('Cache-Control','no-store')
  reply.header('X-Content-Type-Options','nosniff')
  reply.header('Referrer-Policy','no-referrer')
  reply.header('X-Frame-Options','DENY')
  return payload
 })
 app.get('/health/live',async()=>({status:'ok',service:'asset-os-api',phase:'B3'}))
 app.get('/health/ready',async(_request,reply)=>{
  try{if(await checkReadiness(pool))return {status:'ready',database:'reachable',schema:'b3'}}
  catch{/* redact details including connection strings */}
  return reply.code(503).send({status:'unready',database:'unavailable'})
 })
 app.get('/v1/meta',async()=>({
  apiVersion:API_VERSION,contractVersion:CONTRACT_VERSION,phase:'B3',
  runtimeDomainAccess:verifier?'OIDC_CONFIGURED_MEMBERSHIP_REQUIRED':'IDENTITY_NOT_CONFIGURED',
  frontendConnection:'NOT_CONNECTED',capabilities:B3_CAPABILITIES
 }))
 app.get('/v1/openapi.json',async()=>openapi)

 async function authorized<T>(req:{headers:Record<string,string|string[]|undefined>},capability:'read'|'write',
  handler:(client:TenantSqlClient,member:VerifiedMembership,requestId:string)=>Promise<T>):Promise<T>{
  if(!verifier)throw new ApiFault(503,'IDENTITY_NOT_CONFIGURED',
   'Authenticated Asset OS access requires a configured Personal Kernel/OIDC issuer.')
  const principal=await authenticate(header(req.headers.authorization),verifier)
  const tenantId=selectTenant(header(req.headers['x-tenant-id']))
  if(!pool.connect)throw new ApiFault(503,'DATABASE_NOT_READY','Backend database is not configured.')
  const requestId=randomUUID()
  return withTenantTransaction(pool as Pick<Pool,'connect'>,tenantId,async client=>{
   const membership=await requireMembership(client,tenantId,principal)
   requireRole(membership,capability)
   return handler(client,membership,requestId)
  })
 }
 app.get('/v1/me',async req=>{
  return authorized(req,'read',async(_client,member)=>({
   tenantId:member.tenantId,identityId:member.identityId,role:member.role,
   issuer:member.issuer,authenticated:true
  }))
 })
 app.get('/v1/assets',async req=>{
  return authorized(req,'read',async(client,member)=>listAssets(client,member.tenantId,req.query))
 })
 app.get('/v1/assets/:assetId',async(req,reply)=>{
  const asset=await authorized(req,'read',async(client,member)=>
   getAsset(client,member.tenantId,(req.params as {assetId:string}).assetId))
  reply.header('ETag',etag(asset.recordVersion))
  return asset
 })
 app.post('/v1/assets',async(req,reply)=>{
  const command=await authorized(req,'write',async(client,member,requestId)=>
   createAsset(client,member,req.body,header(req.headers['idempotency-key']),requestId))
  reply.code(command.status).header('ETag',etag(command.body.recordVersion))
  if(command.replayed)reply.header('Idempotent-Replayed','true')
  return command.body
 })
 app.patch('/v1/assets/:assetId',async(req,reply)=>{
  const command=await authorized(req,'write',async(client,member,requestId)=>
   updateAsset(client,member,(req.params as {assetId:string}).assetId,req.body,
    header(req.headers['if-match']),header(req.headers['idempotency-key']),requestId))
  reply.code(command.status).header('ETag',etag(command.body.recordVersion))
  if(command.replayed)reply.header('Idempotent-Replayed','true')
  return command.body
 })
 // All B2 writes run under the same verified OIDC member and tenant-scoped
 // DB transaction as B1 registry commands; no direct lifecycle PATCH bypass.
 function commandResponse(reply:FastifyReply,
  result:{status:number;body:{asset:{recordVersion:number}};replayed:boolean}){
  reply.code(result.status).header('ETag',etag(result.body.asset.recordVersion))
  if(result.replayed)reply.header('Idempotent-Replayed','true')
  return result.body
 }
 function b2Headers(req:{headers:Record<string,string|string[]|undefined>}){
  return {ifMatch:header(req.headers['if-match']),key:header(req.headers['idempotency-key'])}
 }
 app.get('/v1/assets/:assetId/lifecycle',async req=>
  authorized(req,'read',async(client,member)=>lifecycleSnapshot(client,member.tenantId,(req.params as {assetId:string}).assetId)))
 app.get('/v1/assets/:assetId/acquisitions',async req=>
  authorized(req,'read',async(client,member)=>(await lifecycleSnapshot(client,member.tenantId,(req.params as {assetId:string}).assetId)).acquisition))
 app.get('/v1/assets/:assetId/cost-basis',async req=>
  authorized(req,'read',async(client,member)=>{
   const s=await lifecycleSnapshot(client,member.tenantId,(req.params as {assetId:string}).assetId)
   return {assetId:s.asset.id,currency:s.asset.currency,acquisitionId:s.acquisition?.id||null,
    costs:s.acquisition?.costs||null,costBasis:s.acquisition?.costBasis||null}
  }))
 app.get('/v1/assets/:assetId/ownership-interests',async req=>
  authorized(req,'read',async(client,member)=>(await lifecycleSnapshot(client,member.tenantId,(req.params as {assetId:string}).assetId)).ownershipInterests))
 app.get('/v1/assets/:assetId/ownership-events',async req=>
  authorized(req,'read',async(client,member)=>(await lifecycleSnapshot(client,member.tenantId,(req.params as {assetId:string}).assetId)).ownershipChanges))
 app.get('/v1/assets/:assetId/disposition',async req=>
  authorized(req,'read',async(client,member)=>(await lifecycleSnapshot(client,member.tenantId,(req.params as {assetId:string}).assetId)).disposition))
 app.get('/v1/acquisitions',async req=>
  authorized(req,'read',async(client,member)=>listDomainHistory(client,member.tenantId,'acquisitions',req.query)))
 app.get('/v1/dispositions',async req=>
  authorized(req,'read',async(client,member)=>listDomainHistory(client,member.tenantId,'dispositions',req.query)))
 app.post('/v1/assets/:assetId/lifecycle-actions',async(req,reply)=>{
  const h=b2Headers(req)
  const result=await authorized(req,'write',async(client,member,requestId)=>
   startOrTransition(client,member,(req.params as {assetId:string}).assetId,req.body,h.ifMatch,h.key,requestId))
  return commandResponse(reply,result)
 })
 app.post('/v1/assets/:assetId/acquisitions',async(req,reply)=>{
  const h=b2Headers(req)
  const result=await authorized(req,'write',async(client,member,requestId)=>
   acquire(client,member,(req.params as {assetId:string}).assetId,req.body,h.ifMatch,h.key,requestId))
  return commandResponse(reply,result)
 })
 app.post('/v1/assets/:assetId/ownership-interests',async(req,reply)=>{
  const h=b2Headers(req)
  const result=await authorized(req,'write',async(client,member,requestId)=>
   assignInterest(client,member,(req.params as {assetId:string}).assetId,req.body,h.ifMatch,h.key,requestId))
  return commandResponse(reply,result)
 })
 app.post('/v1/assets/:assetId/ownership-transfers',async(req,reply)=>{
  const h=b2Headers(req)
  const result=await authorized(req,'write',async(client,member,requestId)=>
   transferInterest(client,member,(req.params as {assetId:string}).assetId,req.body,h.ifMatch,h.key,requestId))
  return commandResponse(reply,result)
 })
 app.post('/v1/assets/:assetId/disposition',async(req,reply)=>{
  const h=b2Headers(req)
  const result=await authorized(req,'write',async(client,member,requestId)=>
   dispose(client,member,(req.params as {assetId:string}).assetId,req.body,h.ifMatch,h.key,requestId))
  return commandResponse(reply,result)
 })
 // B3 executes in the SAME verified membership / FORCE RLS transaction as
 // the registry and B2 lifecycle; no caller-supplied authority headers.
 function assetId(req:{params:unknown}){return (req.params as {assetId:string}).assetId}
 function b3Command(reply:FastifyReply,
  result:{status:number;body:{asset:{recordVersion:number}};replayed:boolean}){
  return commandResponse(reply,result)
 }
 app.get('/v1/assets/:assetId/economics',async req=>
  authorized(req,'read',async(client,member)=>economicsSummary(client,member.tenantId,assetId(req))))
 app.get('/v1/assets/:assetId/valuations',async req=>
  authorized(req,'read',async(client,member)=>listEvidence(client,member.tenantId,assetId(req),'valuations',req.query)))
 app.post('/v1/assets/:assetId/valuations',async(req,reply)=>{
  const h=b2Headers(req)
  const out=await authorized(req,'write',async(client,member,id)=>
   recordValuation(client,member,assetId(req),req.body,h.ifMatch,h.key,id))
  return b3Command(reply,out)
 })
 app.post('/v1/assets/:assetId/valuations/:valuationId/accept',async(req,reply)=>{
  const h=b2Headers(req)
  const out=await authorized(req,'write',async(client,member,id)=>
   acceptValuation(client,member,assetId(req),(req.params as {valuationId:string}).valuationId,req.body,h.ifMatch,h.key,id))
  return b3Command(reply,out)
 })
 app.get('/v1/assets/:assetId/financing',async req=>
  authorized(req,'read',async(client,member)=>listFacilities(client,member.tenantId,assetId(req))))
 app.post('/v1/assets/:assetId/financing',async(req,reply)=>{
  const h=b2Headers(req)
  const out=await authorized(req,'write',async(client,member,id)=>
   recordFacility(client,member,assetId(req),req.body,h.ifMatch,h.key,id))
  return b3Command(reply,out)
 })
 app.get('/v1/assets/:assetId/financing/:facilityId/balances',async req=>
  authorized(req,'read',async(client,member)=>listEvidence(client,member.tenantId,assetId(req),'balances',
   req.query,(req.params as {facilityId:string}).facilityId)))
 app.post('/v1/assets/:assetId/financing/:facilityId/balances',async(req,reply)=>{
  const h=b2Headers(req)
  const out=await authorized(req,'write',async(client,member,id)=>
   observeBalance(client,member,assetId(req),(req.params as {facilityId:string}).facilityId,req.body,h.ifMatch,h.key,id))
  return b3Command(reply,out)
 })
 app.get('/v1/assets/:assetId/cash-flows',async req=>
  authorized(req,'read',async(client,member)=>listEvidence(client,member.tenantId,assetId(req),'cash-flows',req.query)))
 app.post('/v1/assets/:assetId/cash-flows',async(req,reply)=>{
  const h=b2Headers(req)
  const out=await authorized(req,'write',async(client,member,id)=>
   recordCashFlow(client,member,assetId(req),req.body,h.ifMatch,h.key,id))
  return b3Command(reply,out)
 })
 app.get('/v1/assets/:assetId/reconciliation-references',async req=>
  authorized(req,'read',async(client,member)=>listReferences(client,member.tenantId,assetId(req))))
 app.post('/v1/assets/:assetId/reconciliation-references',async(req,reply)=>{
  const h=b2Headers(req)
  const out=await authorized(req,'write',async(client,member,id)=>
   recordReconciliationReference(client,member,assetId(req),req.body,h.ifMatch,h.key,id))
  return b3Command(reply,out)
 })
 // Future B4 operational services, portfolio execution and external integrations remain blocked.


 app.all('/v1/*',async(request,reply)=>
  reply.code(503).send(identityNotConfigured(request.id)))
 app.setNotFoundHandler(async(request,reply)=>
  reply.code(404).send({error:{code:'NOT_FOUND',message:'Unknown API route.',requestId:request.id}}))
 app.setErrorHandler(async(error,request,reply)=>{
  if(error instanceof ApiFault){
   return reply.code(error.status).send({error:{code:error.code,message:error.message,requestId:request.id}})
  }
  // Do not return database errors, query text, token claims or connection details.
  request.log.error({code:'DOMAIN_OPERATION_FAILED',type:error.name},'Unexpected domain operation failure')
  return reply.code(500).send({error:{
   code:'INTERNAL_ERROR',message:'Request failed.',requestId:request.id
  }})
 })
 app.addHook('onClose',async()=>{await pool.end()})
 return app
}
