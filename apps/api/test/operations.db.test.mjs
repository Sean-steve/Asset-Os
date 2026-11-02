import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import {randomUUID} from 'node:crypto'
import {createServer} from 'node:http'
import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {generateKeyPair,exportJWK,SignJWT} from 'jose'
import {buildApp} from '../dist/app.js'
import {createOidcVerifier} from '../dist/identity.js'
import {provisionFirstOwner} from '../dist/bootstrap.js'
import {withTenantTransaction} from '../dist/database.js'

if(!process.env.DATABASE_URL||!process.env.MIGRATION_DATABASE_URL)
 throw Error('B4 real PostgreSQL test requires migration and runtime DB connections.')
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:8})
const suffix=()=>randomUUID().slice(0,8)
const today=new Date().toISOString().slice(0,10)
let app,server,privateKey,issuer,audience,tenantA,tenantB,aToken,bToken,viewerToken
let assetA,assetB,assetOther,planned
const headers=(token=aToken,tenant=tenantA)=>({authorization:'Bearer '+token,'x-tenant-id':tenant})
const inject=(method,url,{token=aToken,tenant=tenantA,extra={},payload}={})=>
 app.inject({method,url,headers:{...headers(token,tenant),...extra},...(payload?{payload}:{})})
const route=id=>'/v1/assets/'+id
const read=async(id,path='',opts={})=>inject('GET',route(id)+path,opts)
const write=async(id,path,payload,{token=aToken,tenant=tenantA,version,key=randomUUID()}={})=>{
 const current=version??(await read(id,'',{token,tenant})).json().recordVersion
 return inject('POST',route(id)+path,{token,tenant,
  extra:{'if-match':'"'+current+'"','idempotency-key':key},payload})
}
const setupAsset=async(name,{token=aToken,tenant=tenantA,acquire=true}={})=>{
 const create=await inject('POST','/v1/assets',{token,tenant,
  extra:{'idempotency-key':randomUUID()},payload:{
   name,category:'Vehicles',currency:'KES',registryValue:'300000.00',valueAsOf:'2026-10-30',
   description:'B4 certified fixture'
  }})
 assert.equal(create.statusCode,201,create.body)
 const id=create.json().id
 if(acquire){
  const begin=await write(id,'/lifecycle-actions',{action:'START_ACQUISITION',reason:'B4 fixture'},{token,tenant})
  assert.equal(begin.statusCode,200,begin.body)
  const acquired=await write(id,'/acquisitions',{method:'PURCHASE',effectiveOn:'2026-10-30',
   counterpartyLabel:'Internal fixture',costs:{purchase:'100000.00'}},{token,tenant})
  assert.equal(acquired.statusCode,201,acquired.body)
 }
 return id
}
async function ownerStatement(tenant,sql,args){
 const client=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL})
 await client.connect()
 try{
  await client.query('BEGIN')
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenant])
  const result=await client.query(sql,args)
  await client.query('COMMIT')
  return result
 }catch(e){await client.query('ROLLBACK');throw e}
 finally{await client.end()}
}
before(async()=>{
 const pair=await generateKeyPair('RS256')
 privateKey=pair.privateKey
 const jwk={...await exportJWK(pair.publicKey),kid:'asset-b4-test-key',use:'sig',alg:'RS256'}
 server=createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({keys:[jwk]}))})
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 const port=server.address().port
 issuer='http://127.0.0.1:'+port+'/realm';audience='asset-os-api'
 const env={...process.env,NODE_ENV:'test',OIDC_ALLOW_TEST_LOOPBACK:'true',OIDC_ISSUER:issuer,
  OIDC_AUDIENCE:audience,OIDC_JWKS_URL:'http://127.0.0.1:'+port+'/keys'}
 const sign=subject=>new SignJWT({scope:'asset:read asset:write'})
  .setProtectedHeader({alg:'RS256',kid:'asset-b4-test-key'}).setIssuer(issuer).setAudience(audience)
  .setSubject(subject).setIssuedAt().setExpirationTime('15m').sign(privateKey)
 aToken=await sign('b4-owner-a-'+suffix());bToken=await sign('b4-owner-b-'+suffix())
 viewerToken=await sign('b4-viewer-'+suffix())
 const dir=await mkdtemp(path.join(tmpdir(),'asset-os-b4-'))
 try{
  const aPath=path.join(dir,'a.jwt'),bPath=path.join(dir,'b.jwt')
  await writeFile(aPath,aToken,{mode:0o600});await writeFile(bPath,bToken,{mode:0o600})
  await chmod(aPath,0o600);await chmod(bPath,0o600)
  tenantA=(await provisionFirstOwner({slug:'b4-a-'+suffix(),name:'B4 tenant A',tokenFile:aPath,confirm:true},env)).tenantId
  tenantB=(await provisionFirstOwner({slug:'b4-b-'+suffix(),name:'B4 tenant B',tokenFile:bPath,confirm:true},env)).tenantId
 }finally{await rm(dir,{recursive:true,force:true})}
 const viewerId=randomUUID()
 await ownerStatement(tenantA,
  "INSERT INTO asset_os.identity_bindings(id,tenant_id,issuer,external_subject,binding_state,verified_at) VALUES($1,$2,$3,$4,'VERIFIED',clock_timestamp())",
  [viewerId,tenantA,issuer,'b4-viewer-id-placeholder'])
 // Create a signed token for the same verified external subject, never user-supplied header authority.
 viewerToken=await sign('b4-viewer-id-placeholder')
 await ownerStatement(tenantA,
  "INSERT INTO asset_os.tenant_memberships(tenant_id,identity_id,role,state) VALUES($1,$2,'VIEWER','ACTIVE')",[tenantA,viewerId])
 app=buildApp(pool,createOidcVerifier(env))
 planned=await setupAsset('B4 unacquired baseline',{acquire:false})
 assetA=await setupAsset('B4 owned vehicle A')
 assetB=await setupAsset('B4 owned vehicle B')
 assetOther=await setupAsset('B4 foreign tenant vehicle',{token:bToken,tenant:tenantB})
})
after(async()=>{
 if(app)await app.close();else await pool.end()
 if(server)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))
})
test('B4 OIDC membership, RLS and lifecycle fail closed',async()=>{
 const metadata=(await inject('GET','/v1/meta')).json()
 assert.equal(metadata.phase,'B4')
 assert.ok(metadata.capabilities.includes('unverified_insurance_policy_history'))
 assert.equal((await inject('GET',route(assetA)+'/operations',{token:bToken,tenant:tenantA})).statusCode,403)
 assert.equal((await inject('GET',route(assetA)+'/operations',{token:bToken,tenant:tenantB})).statusCode,404)
 assert.equal((await inject('GET',route(assetA)+'/operations',{token:'invalid'})).statusCode,401)
 const summary=await read(assetA,'/operations')
 assert.equal(summary.statusCode,200,summary.body)
 assert.equal(summary.json().maintenance.plans,0)
 assert.equal(summary.json().insurance.coverageVerified,false)
 const body={title:'Plan without acquisition',intervalValue:1,intervalUnit:'MONTHS',nextDue:'2026-11-15'}
 assert.equal((await write(planned,'/maintenance-plans',body)).statusCode,409)
 assert.equal((await write(assetA,'/maintenance-plans',body,{token:viewerToken})).statusCode,403)
 assert.equal((await inject('POST',route(assetA)+'/maintenance-plans',{
  extra:{'idempotency-key':randomUUID()},payload:body})).statusCode,428)
 assert.equal((await inject('POST',route(assetA)+'/maintenance-plans',{
  extra:{'if-match':'"4"'},payload:body})).statusCode,428)
})
let planId,jobId,policyId,readingId
test('B4 plan versions, idempotent replay, status changes and pagination persist in PostgreSQL',async()=>{
 const p={title:'Engine check',description:'Operator entered',intervalValue:1,intervalUnit:'MONTHS',nextDue:'2026-11-01'}
 const original=(await read(assetA)).json().recordVersion,key=randomUUID()
 const created=await write(assetA,'/maintenance-plans',p,{version:original,key})
 assert.equal(created.statusCode,201,created.body)
 planId=created.json().plan.id
 const replay=await write(assetA,'/maintenance-plans',p,{version:original,key})
 assert.equal(replay.statusCode,201,replay.body)
 assert.equal(replay.headers['idempotent-replayed'],'true')
 assert.equal(replay.json().plan.id,planId)
 assert.equal((await write(assetA,'/maintenance-plans',{...p,title:'changed'},{version:original,key})).statusCode,409)
 assert.equal((await write(assetA,'/maintenance-plans',p,{version:original})).statusCode,412)
 const second=await write(assetA,'/maintenance-plans',{...p,title:'Cabin inspection',nextDue:'2026-11-20'})
 assert.equal(second.statusCode,201,second.body)
 const page=await read(assetA,'/maintenance-plans?limit=1')
 assert.equal(page.json().items.length,1)
 assert.ok(page.json().nextCursor)
 const page2=await read(assetA,'/maintenance-plans?limit=1&cursor='+encodeURIComponent(page.json().nextCursor))
 assert.equal(page2.json().items.length,1)
 assert.notEqual(page.json().items[0].id,page2.json().items[0].id)
 assert.equal((await read(assetA,'/maintenance-plans?cursor=invalid')).statusCode,400)
 assert.equal((await write(assetA,'/maintenance-plans/'+planId+'/actions',{action:'PAUSE'})).statusCode,200)
 assert.equal((await write(assetA,'/maintenance-plans/'+planId+'/actions',{action:'PAUSE'})).statusCode,409)
 assert.equal((await write(assetA,'/maintenance-plans/'+planId+'/actions',{action:'RESUME'})).statusCode,200)
})
test('B4 service scheduling/status/completion updates plan only; never posts payments',async()=>{
 const bad=await write(assetA,'/service-jobs',{title:'Forged dispatch',scheduledFor:'2026-11-01',providerDispatched:true})
 assert.equal(bad.statusCode,400)
 const create=await write(assetA,'/service-jobs',{title:'Service check',planId,scheduledFor:'2026-11-01',providerLabel:'Local mechanic'})
 assert.equal(create.statusCode,201,create.body);jobId=create.json().job.id
 assert.equal(create.json().job.status,'SCHEDULED')
 const begin=await write(assetA,'/service-jobs/'+jobId+'/actions',{action:'START'})
 assert.equal(begin.statusCode,200,begin.body)
 assert.equal((await write(assetA,'/service-jobs/'+jobId+'/actions',{action:'START'})).statusCode,409)
 assert.equal((await write(assetA,'/service-jobs/'+jobId+'/actions',{action:'COMPLETE',completedOn:'2026-10-31',recordedCost:'150.00'})).statusCode,422)
 const done=await write(assetA,'/service-jobs/'+jobId+'/actions',{action:'COMPLETE',completedOn:'2026-11-01',recordedCost:'150.25',completionNotes:'Owner recorded'})
 assert.equal(done.statusCode,200,done.body)
 assert.equal(done.json().job.financePosted,false)
 assert.equal((await write(assetA,'/service-jobs/'+jobId+'/actions',{action:'CANCEL'})).statusCode,409)
 const plans=(await read(assetA,'/maintenance-plans')).json().items
 assert.equal(plans.find(p=>p.id===planId).lastCompletedOn,'2026-11-01')
 assert.equal(plans.find(p=>p.id===planId).nextDue,'2026-12-01')
 const rows=(await read(assetA,'/service-jobs')).json().items
 assert.equal(rows.find(x=>x.id===jobId).recordedCost,'150.25')
 const cal=(await read(assetA,'/operations-calendar')).json()
 assert.equal(cal.notificationDelivered,false)
 assert.equal(cal.calendarSynced,false)
})
test('B4 insurance replacement, cancellation and chronological integrity are internal only',async()=>{
 const body={insurerLabel:'Recorded provider',policyReference:'TEST-COVER-NOT-VERIFIED',policyType:'Motor',
  startOn:'2026-10-30',endOn:'2027-10-30',coverageAmount:'200000.00',premiumAmount:'1500.25'}
 const first=await write(assetA,'/insurance-policies',body)
 assert.equal(first.statusCode,201,first.body);policyId=first.json().policy.id
 assert.equal(first.json().policy.verified,false)
 assert.equal(first.json().policy.premiumPaid,false)
 assert.equal((await write(assetA,'/insurance-policies',{...body,coverageVerified:true})).statusCode,400)
 assert.equal((await write(assetB,'/insurance-policies',{...body,replacesId:policyId})).statusCode,404)
 const replaces=await write(assetA,'/insurance-policies',{...body,policyReference:'SECOND',replacesId:policyId})
 assert.equal(replaces.statusCode,201,replaces.body)
 const currentId=replaces.json().policy.id
 let policies=(await read(assetA,'/insurance-policies')).json().items
 assert.equal(policies.find(p=>p.id===policyId).status,'SUPERSEDED')
 assert.equal(policies.find(p=>p.id===currentId).status,'RECORDED')
 assert.equal((await write(assetA,'/insurance-policies',{...body,replacesId:policyId})).statusCode,409)
 assert.equal((await write(assetA,'/insurance-policies/'+currentId+'/actions',{action:'CANCEL'})).statusCode,200)
 policies=(await read(assetA,'/insurance-policies')).json().items
 assert.equal(policies.find(p=>p.id===currentId).status,'CANCELLED')
})
test('B4 utilization is dated, increasing, tenant-bound; evidence and location remain unverified',async()=>{
 const first=await write(assetA,'/utilization-readings',{metric:'ODOMETER_KM',observedOn:'2026-10-31',reading:'1000.25',sourceLabel:'Owner'})
 assert.equal(first.statusCode,201,first.body);readingId=first.json().reading.id
 assert.equal((await write(assetA,'/utilization-readings',{metric:'ODOMETER_KM',observedOn:'2026-10-31',reading:'1000.26',sourceLabel:'Owner'})).statusCode,409)
 assert.equal((await write(assetA,'/utilization-readings',{metric:'ODOMETER_KM',observedOn:'2026-11-01',reading:'999.99',sourceLabel:'Owner'})).statusCode,409)
 assert.equal((await write(assetA,'/utilization-readings',{metric:'USE_COUNT',observedOn:'2026-11-01',reading:'2.5',sourceLabel:'Operator'})).statusCode,400)
 assert.equal((await write(assetA,'/utilization-readings',{metric:'ODOMETER_KM',observedOn:'2026-11-01',reading:'1001.50',sourceLabel:'Owner'})).statusCode,201)
 const evidence=await write(assetA,'/evidence-references',{kind:'INSURANCE',title:'Copy retained offline',reference:'CABINET-A-9',issuedOn:'2026-10-31'})
 assert.equal(evidence.statusCode,201,evidence.body)
 assert.equal(evidence.json().evidence.documentUploaded,false)
 assert.equal((await write(assetA,'/evidence-references',{kind:'INSURANCE',title:'Incorrect',reference:'CABINET-A-9',verified:true})).statusCode,400)
 const moved=await write(assetA,'/location-events',{toLabel:'Owner garage',effectiveOn:'2026-11-01',reason:'Stored'})
 assert.equal(moved.statusCode,201,moved.body)
 assert.equal(moved.json().location.liveTracking,false)
 assert.equal((await write(assetA,'/location-events',{toLabel:'Old location',effectiveOn:'2026-10-31'})).statusCode,409)
 const summary=(await read(assetA,'/operations')).json()
 assert.equal(summary.utilization.latest.find(r=>r.metric==='ODOMETER_KM').reading,'1001.50')
 assert.equal(summary.evidence.verified,false)
 assert.equal(summary.location.toLabel,'Owner garage')
})
test('B4 dependency graph cannot cross tenants, self-reference, or create cycles',async()=>{
 const relation=await write(assetA,'/asset-relationships',{relatedAssetId:assetB,type:'DEPENDS_ON',note:'Test relationship'})
 assert.equal(relation.statusCode,201,relation.body)
 assert.equal(relation.json().relation.verified,false)
 assert.equal((await write(assetB,'/asset-relationships',{relatedAssetId:assetA,type:'DEPENDS_ON'})).statusCode,409)
 assert.equal((await write(assetA,'/asset-relationships',{relatedAssetId:assetB,type:'DEPENDS_ON'})).statusCode,409)
 assert.equal((await write(assetA,'/asset-relationships',{relatedAssetId:assetA,type:'ASSOCIATED_WITH'})).statusCode,422)
 assert.equal((await write(assetA,'/asset-relationships',{relatedAssetId:assetOther,type:'ASSOCIATED_WITH'})).statusCode,404)
 const foreign=await read(assetA,'/asset-relationships',{token:bToken,tenant:tenantB})
 assert.equal(foreign.statusCode,404)
 const dbRows=await withTenantTransaction(pool,tenantB,async c=>(await c.query('SELECT id FROM asset_os.asset_relationships WHERE asset_id=$1',[assetA])).rows)
 assert.deepEqual(dbRows,[])
})
test('B4 privilege restrictions, audit/outbox, RLS and historical read-only after disposal',async()=>{
 const state=await withTenantTransaction(pool,tenantA,async c=>{
  const audit=await c.query("SELECT event_kind,detail FROM asset_os.audit_events WHERE tenant_id=$1 AND event_kind='SERVICE_JOB_STATUS_CHANGED'",[tenantA])
  const outbox=await c.query("SELECT type,delivery_state,payload FROM asset_os.outbox_events WHERE tenant_id=$1 AND type='asset.service.job.status.changed.v1'",[tenantA])
  return {audit:audit.rows,outbox:outbox.rows}
 })
 assert.ok(state.audit.length>=2)
 assert.ok(state.outbox.length>=2)
 assert.ok(state.outbox.every(e=>e.delivery_state==='PENDING'&&Object.keys(e.payload).every(k=>['assetId','recordId','recordVersion'].includes(k))))
 await assert.rejects(()=>withTenantTransaction(pool,tenantA,async c=>
  c.query("UPDATE asset_os.utilization_readings SET reading='0' WHERE id=$1",[readingId])),/permission denied/)
 await assert.rejects(()=>withTenantTransaction(pool,tenantA,async c=>
  c.query('DELETE FROM asset_os.insurance_policies WHERE id=$1',[policyId])),/permission denied/)
 const dispose=await write(assetA,'/disposition',{kind:'SALE',effectiveOn:'2026-11-01',proceeds:'100.00',costs:'0.00',reason:'B4 read-only closure',confirm:'DISPOSE'})
 assert.equal(dispose.statusCode,201,dispose.body)
 assert.equal((await write(assetA,'/maintenance-plans',{title:'Forbidden post-disposal',intervalValue:1,intervalUnit:'MONTHS',nextDue:'2026-11-30'})).statusCode,409)
 assert.equal((await read(assetA,'/service-jobs')).statusCode,200)
 assert.equal((await read(assetA,'/operations')).statusCode,200)
})
