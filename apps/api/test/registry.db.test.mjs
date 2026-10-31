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
 throw Error('Real PostgreSQL B1 certification requires runtime and owner database credentials.')
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:8})
let server,app,privateKey,issuer,audience,oidcEnv,tenantA,tenantB,identityA
let aToken,bToken,viewerToken,assetId,versionTag
const suffix=()=>randomUUID().slice(0,8)
const db=async(tenant,work)=>withTenantTransaction(pool,tenant,work)
const header=(token,tenant)=>({authorization:'Bearer '+token,'x-tenant-id':tenant})
const createHeaders=(token,tenant,key)=>({...header(token,tenant),'idempotency-key':key})
const sign=async(subject,options={})=>
 new SignJWT({scope:'asset:read asset:write'})
  .setProtectedHeader({alg:options.alg||'RS256',kid:'asset-b1-test-key'})
  .setIssuer(options.issuer||issuer).setAudience(options.audience||audience)
  .setSubject(subject).setIssuedAt()
  .setExpirationTime(options.expiry||'15m').sign(privateKey)
const inject=(method,url,{token=aToken,tenant=tenantA,headers={},payload}={})=>
 app.inject({method,url,headers:{...header(token,tenant),...headers},...(payload?{payload}:{})})
const createPayload=(name,override={})=>({
 name,category:'Vehicles',description:'Automated integration fixture',currency:'KES',
 registryValue:'1850000.00',valueAsOf:'2026-10-31',tags:['Fleet','Certified'],...override
})
const newAsset=async(name,key,token=aToken,tenant=tenantA,override={})=>
 inject('POST','/v1/assets',{token,tenant,headers:{'idempotency-key':key},payload:createPayload(name,override)})
async function ownerStatement(tenant,sql,args){
 const client=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL})
 await client.connect()
 try{
  await client.query('BEGIN')
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenant])
  const r=await client.query(sql,args)
  await client.query('COMMIT')
  return r
 }catch(e){await client.query('ROLLBACK');throw e}
 finally{await client.end()}
}
before(async()=>{
 const keys=await generateKeyPair('RS256'),publicKey=await exportJWK(keys.publicKey)
 privateKey=keys.privateKey
 const jwk={...publicKey,kid:'asset-b1-test-key',use:'sig',alg:'RS256'}
 server=createServer((_req,res)=>{
  res.setHeader('Content-Type','application/json')
  res.end(JSON.stringify({keys:[jwk]}))
 })
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 const address=server.address()
 issuer='http://127.0.0.1:'+address.port+'/realm'
 audience='asset-os-api'
 oidcEnv={...process.env,NODE_ENV:'test',OIDC_ALLOW_TEST_LOOPBACK:'true',
  OIDC_ISSUER:issuer,OIDC_AUDIENCE:audience,
  OIDC_JWKS_URL:'http://127.0.0.1:'+address.port+'/keys'}
 const verifier=createOidcVerifier(oidcEnv)
 app=buildApp(pool,verifier)
 aToken=await sign('owner-a-'+suffix())
 bToken=await sign('owner-b-'+suffix())
 const tokenDir=await mkdtemp(path.join(tmpdir(),'asset-os-b1-'))
 try{
  const aFile=path.join(tokenDir,'owner-a.jwt'),bFile=path.join(tokenDir,'owner-b.jwt')
  await writeFile(aFile,aToken,{mode:0o600});await chmod(aFile,0o600)
  await writeFile(bFile,bToken,{mode:0o600});await chmod(bFile,0o600)
  const a=await provisionFirstOwner({slug:'b1-a-'+suffix(),name:'Asset OS B1 tenant A',tokenFile:aFile,confirm:true},oidcEnv)
  const b=await provisionFirstOwner({slug:'b1-b-'+suffix(),name:'Asset OS B1 tenant B',tokenFile:bFile,confirm:true},oidcEnv)
  tenantA=a.tenantId;tenantB=b.tenantId;identityA=a.bindingId
 }finally{await rm(tokenDir,{recursive:true,force:true})}
 const subject='viewer-a-'+suffix()
 viewerToken=await sign(subject)
 const viewerId=randomUUID()
 await ownerStatement(tenantA,
  "INSERT INTO asset_os.identity_bindings(id,tenant_id,issuer,external_subject,binding_state,verified_at) VALUES($1,$2,$3,$4,'VERIFIED',clock_timestamp())",
  [viewerId,tenantA,issuer,subject])
 await ownerStatement(tenantA,
  "INSERT INTO asset_os.tenant_memberships(tenant_id,identity_id,role,state) VALUES($1,$2,'VIEWER','ACTIVE')",
  [tenantA,viewerId])
})
after(async()=>{
 if(app)await app.close()
 else await pool.end()
 if(server)await new Promise((r,j)=>server.close(e=>e?j(e):r()))
})
test('signed issuer/audience/expiration are enforced even when caller supplies valid tenant UUID',async()=>{
 const live=await app.inject('/health/live')
 assert.equal(live.statusCode,200)
 const meta=await app.inject('/v1/meta')
 assert.equal(meta.json().runtimeDomainAccess,'OIDC_CONFIGURED_MEMBERSHIP_REQUIRED')
 assert.equal((await inject('GET','/v1/me')).statusCode,200)
 assert.equal((await inject('GET','/v1/me',{token:bToken,tenant:tenantA})).statusCode,403)
 assert.equal((await inject('GET','/v1/me',{token:aToken,tenant:tenantB})).statusCode,403)
 assert.equal((await inject('GET','/v1/me',{token:await sign('other-'+suffix())})).statusCode,403)
 assert.equal((await inject('GET','/v1/me',{token:await sign('wrong-issuer',{issuer:issuer+'/bad'})})).statusCode,401)
 assert.equal((await inject('GET','/v1/me',{token:await sign('wrong-audience',{audience:'wrong-api'})})).statusCode,401)
 assert.equal((await inject('GET','/v1/me',{token:await sign('expired',{expiry:'-1h'})})).statusCode,401)
 assert.equal((await inject('GET','/v1/me',{token:'aaa.bbb.ccc'})).statusCode,401)
 assert.equal((await app.inject('/v1/me')).statusCode,401)
 assert.equal((await inject('GET','/v1/me',{tenant:'fake'})).statusCode,400)
})
test('verified owner creates asset with decimal string, traceability and idempotent replay',async()=>{
 const payload=createPayload('Verified fleet vehicle')
 const key='asset-create-'+suffix()
 const first=await inject('POST','/v1/assets',{headers:{'idempotency-key':key},payload})
 assert.equal(first.statusCode,201,first.body)
 const body=first.json();assetId=body.id;versionTag=first.headers.etag
 assert.match(assetId,/^[a-f0-9-]{36}$/i)
 assert.equal(versionTag,'"1"')
 assert.equal(body.recordVersion,1)
 assert.equal(body.registryValue,'1850000.00')
 assert.equal(body.lifecycle,'PLANNED')
 assert.deepEqual(body.tags,['Certified','Fleet'])
 assert.equal(body.createdAt.slice(0,4),'2026')
 assert.equal(body.ownerLabel,undefined)
 const repeat=await inject('POST','/v1/assets',{headers:{'idempotency-key':key},payload})
 assert.equal(repeat.statusCode,201)
 assert.equal(repeat.headers['idempotent-replayed'],'true')
 assert.equal(repeat.json().id,assetId)
 const conflict=await inject('POST','/v1/assets',{headers:{'idempotency-key':key},payload:{...payload,name:'Different entity'}})
 assert.equal(conflict.statusCode,409)
 assert.equal(conflict.json().error.code,'IDEMPOTENCY_KEY_CONFLICT')
 const missing=await inject('POST','/v1/assets',{payload})
 assert.equal(missing.statusCode,428)
 assert.equal((await db(tenantA,async c=>(await c.query('SELECT count(*)::int AS total FROM asset_os.assets WHERE id=$1',[assetId])).rows[0].total)),1)
 const audit=await db(tenantA,async c=>(await c.query('SELECT actor_binding_id,event_kind FROM asset_os.audit_events WHERE subject_id=$1',[assetId])).rows)
 assert.equal(audit.length,1)
 assert.equal(audit[0].actor_binding_id,identityA)
 assert.equal(audit[0].event_kind,'ASSET_REGISTERED')
 const outbox=await db(tenantA,async c=>(await c.query('SELECT type,delivery_state,payload FROM asset_os.outbox_events WHERE aggregate_id=$1',[assetId])).rows)
 assert.deepEqual(outbox.map(e=>e.type),['asset.registered.v1'])
 assert.equal(outbox[0].delivery_state,'PENDING')
 assert.equal(outbox[0].payload.assetId,assetId)
 assert.equal(outbox[0].payload.name,undefined)
})
test('tenant ownership is scoped and active VIEWER cannot mutate registry',async()=>{
 const victim=await inject('GET','/v1/assets/'+assetId,{token:bToken,tenant:tenantB})
 assert.equal(victim.statusCode,404)
 assert.equal((await inject('GET','/v1/assets',{token:bToken,tenant:tenantB})).json().items.length,0)
 const viewer=await inject('GET','/v1/assets',{token:viewerToken})
 assert.equal(viewer.statusCode,200)
 assert.ok(viewer.json().items.some(a=>a.id===assetId))
 const blocked=await inject('POST','/v1/assets',{token:viewerToken,
  headers:{'idempotency-key':'viewer-create-'+suffix()},payload:createPayload('Denied asset')})
 assert.equal(blocked.statusCode,403)
 assert.equal(blocked.json().error.code,'INSUFFICIENT_ROLE')
 assert.equal((await inject('PATCH','/v1/assets/'+assetId,{token:viewerToken,
  headers:{'if-match':'"1"','idempotency-key':'viewer-patch-'+suffix()},payload:{name:'Invalid'}})).statusCode,403)
})
test('cursor pagination is stable and list query cannot inject tenant filter or SQL',async()=>{
 const names=['Pagination A','Pagination B','Pagination C']
 for(const name of names)assert.equal((await newAsset(name,'page-'+suffix())).statusCode,201)
 const seen=new Set()
 let cursor=null
 do{
  const query=new URLSearchParams({limit:'2',...(cursor?{cursor}:{})})
  const response=await inject('GET','/v1/assets?'+query)
  assert.equal(response.statusCode,200,response.body)
  const list=response.json()
  assert.ok(list.items.length<=2)
  for(const asset of list.items){
   assert.equal(asset.tenantId,tenantA)
   assert.ok(!seen.has(asset.id))
   seen.add(asset.id)
  }
  cursor=list.nextCursor
 }while(cursor)
 assert.ok(seen.has(assetId))
 assert.equal((await inject('GET','/v1/assets?limit=1000')).statusCode,400)
 assert.equal((await inject('GET','/v1/assets?cursor=not-json')).statusCode,400)
 assert.equal((await inject('GET','/v1/assets?tenantId='+tenantB)).statusCode,400)
})
test('optimistic PATCH, strict editable fields, replay and atomic event history',async()=>{
 const key='asset-patch-'+suffix()
 const body={name:'Updated fleet vehicle',tags:['High Value','Fleet'],registryValue:'1880000.00',valueAsOf:'2026-10-31'}
 const first=await inject('PATCH','/v1/assets/'+assetId,{headers:{'if-match':versionTag,'idempotency-key':key},payload:body})
 assert.equal(first.statusCode,200,first.body)
 assert.equal(first.headers.etag,'"2"')
 assert.equal(first.json().recordVersion,2)
 assert.deepEqual(first.json().tags,['Fleet','High Value'])
 assert.equal(first.json().registryValue,'1880000.00')
 const replay=await inject('PATCH','/v1/assets/'+assetId,{headers:{'if-match':versionTag,'idempotency-key':key},payload:body})
 assert.equal(replay.statusCode,200)
 assert.equal(replay.headers['idempotent-replayed'],'true')
 const stale=await inject('PATCH','/v1/assets/'+assetId,{headers:{'if-match':versionTag,'idempotency-key':'asset-stale-'+suffix()},payload:{name:'Old version'}})
 assert.equal(stale.statusCode,412)
 const absent=await inject('PATCH','/v1/assets/'+assetId,{headers:{'idempotency-key':'asset-no-if-'+suffix()},payload:{name:'Should not write'}})
 assert.equal(absent.statusCode,428)
 const immutable=await inject('PATCH','/v1/assets/'+assetId,{headers:{'if-match':'"2"','idempotency-key':'asset-illegal-'+suffix()},payload:{currency:'USD'}})
 assert.equal(immutable.statusCode,400)
 const badTags=await inject('PATCH','/v1/assets/'+assetId,{headers:{'if-match':'"2"','idempotency-key':'asset-tags-'+suffix()},payload:{tags:['Dup','dup']}})
 assert.equal(badTags.statusCode,400)
 const badValuation=await inject('PATCH','/v1/assets/'+assetId,{headers:{'if-match':'"2"','idempotency-key':'asset-date-'+suffix()},payload:{registryValue:'1.00',valueAsOf:null}})
 assert.equal(badValuation.statusCode,422)
 const events=await db(tenantA,async c=>(await c.query('SELECT type,delivery_state FROM asset_os.outbox_events WHERE aggregate_id=$1',[assetId])).rows)
 assert.deepEqual(events.map(e=>e.type).sort(),['asset.registered.v1','asset.updated.v1'])
 assert.ok(events.every(e=>e.delivery_state==='PENDING'))
 assert.equal((await inject('GET','/v1/assets/'+assetId)).headers.etag,'"2"')
})
test('concurrent identical idempotency keys produce one record and no duplicate events',async()=>{
 const key='parallel-'+suffix(),payload=createPayload('Parallel secured asset')
 const [x,y]=await Promise.all([
 inject('POST','/v1/assets',{headers:{'idempotency-key':key},payload}),
 inject('POST','/v1/assets',{headers:{'idempotency-key':key},payload})
 ])
 assert.equal(x.statusCode,201,x.body)
 assert.equal(y.statusCode,201,y.body)
 assert.equal(x.json().id,y.json().id)
 const rows=await db(tenantA,async c=>(await c.query('SELECT id FROM asset_os.outbox_events WHERE aggregate_id=$1',[x.json().id])).rows)
 assert.equal(rows.length,1)
})
test('revoking membership immediately blocks existing signed token, including writes',async()=>{
 const revSubject='revoked-'+suffix()
 const token=await sign(revSubject),id=randomUUID()
 await ownerStatement(tenantA,
  "INSERT INTO asset_os.identity_bindings(id,tenant_id,issuer,external_subject,binding_state,verified_at) VALUES($1,$2,$3,$4,'VERIFIED',clock_timestamp())",
  [id,tenantA,issuer,revSubject])
 await ownerStatement(tenantA,
  "INSERT INTO asset_os.tenant_memberships(tenant_id,identity_id,role,state) VALUES($1,$2,'OPERATIONS','ACTIVE')",
  [tenantA,id])
 assert.equal((await inject('GET','/v1/me',{token})).statusCode,200)
 await ownerStatement(tenantA,
  "UPDATE asset_os.tenant_memberships SET state='REVOKED' WHERE tenant_id=$1 AND identity_id=$2",
  [tenantA,id])
 assert.equal((await inject('GET','/v1/me',{token})).statusCode,403)
 assert.equal((await inject('POST','/v1/assets',{token,
  headers:{'idempotency-key':'revoked-'+suffix()},payload:createPayload('Revoked write')})).statusCode,403)
})


/** B2 certification reuses the real RS256/JWKS fixture and verified tenants above. */
const lifecycleRoute=(id=assetId)=>'/v1/assets/'+id
async function lifecycleCommand(route,payload,{id=assetId,token=aToken,tenant=tenantA,key='b2-'+suffix(),version}={}){
 const v=version||((await inject('GET',lifecycleRoute(id),{token,tenant})).headers.etag)
 return inject('POST',lifecycleRoute(id)+route,{
  token,tenant,headers:{'if-match':v,'idempotency-key':key},payload})
}
const costFixture={purchase:'1200.25',taxes:'50.10',fees:'5.01',installation:'0',improvements:'9.64',other:'0'}
let interestA,interestB,ownershipEvent

test('B2 denies untrusted, VIEWER and cross-tenant lifecycle changes before writing history',async()=>{
 const before=await db(tenantA,async c=>(await c.query('SELECT count(*)::int AS n FROM asset_os.lifecycle_events WHERE asset_id=$1',[assetId])).rows[0].n)
 const r=await lifecycleCommand('/lifecycle-actions',{action:'START_ACQUISITION',reason:'Begin evidence review'},{token:viewerToken})
 assert.equal(r.statusCode,403,r.body)
 const b=await lifecycleCommand('/lifecycle-actions',{action:'START_ACQUISITION',reason:'Begin evidence review'},{token:bToken,tenant:tenantB,version:'"2"'})
 assert.equal(b.statusCode,404)
 const noKey=await inject('POST',lifecycleRoute()+'/lifecycle-actions',{headers:{'if-match':'"2"'},payload:{action:'START_ACQUISITION',reason:'Never committed'}})
 assert.equal(noKey.statusCode,428)
 const noVersion=await inject('POST',lifecycleRoute()+'/lifecycle-actions',{headers:{'idempotency-key':'missing-version-'+suffix()},payload:{action:'START_ACQUISITION',reason:'Never committed'}})
 assert.equal(noVersion.statusCode,428)
 const skipped=await lifecycleCommand('/lifecycle-actions',{action:'ACTIVATE',reason:'Skip initial acquisition'})
 assert.equal(skipped.statusCode,409)
 const misused=await lifecycleCommand('/ownership-interests',{dimension:'ECONOMIC',partyRef:'p1',partyLabel:'Unacquired party',percentage:'100',effectiveOn:'2026-10-30'})
 assert.equal(misused.statusCode,409)
 const after=await db(tenantA,async c=>(await c.query('SELECT count(*)::int AS n FROM asset_os.lifecycle_events WHERE asset_id=$1',[assetId])).rows[0].n)
 assert.equal(after,before)
})
test('B2 planned → pending → acquired is guarded, exactly idempotent and persists component cost basis',async()=>{
 const key='b2-begin-'+suffix()
 const body={action:'START_ACQUISITION',reason:'Purchase process opened'}
 const first=await lifecycleCommand('/lifecycle-actions',body,{key})
 assert.equal(first.statusCode,200,first.body)
 assert.equal(first.json().asset.lifecycle,'ACQUISITION_PENDING')
 assert.equal(first.headers.etag,'"3"')
 const repeat=await lifecycleCommand('/lifecycle-actions',body,{key,version:'"2"'})
 assert.equal(repeat.statusCode,200)
 assert.equal(repeat.headers['idempotent-replayed'],'true')
 assert.equal(repeat.json().asset.recordVersion,3)
 assert.equal((await lifecycleCommand('/lifecycle-actions',body,{key,version:'"3"'})).statusCode,409)
 const badDate=await lifecycleCommand('/acquisitions',{method:'PURCHASE',effectiveOn:'2099-01-01',costs:costFixture})
 assert.equal(badDate.statusCode,422)
 const noPurchase=await lifecycleCommand('/acquisitions',{method:'PURCHASE',effectiveOn:'2026-10-30',costs:{purchase:'0'}})
 assert.equal(noPurchase.statusCode,422)
 const badInput=await lifecycleCommand('/acquisitions',{method:'PURCHASE',effectiveOn:'2026-10-30',costs:costFixture,postedFinance:true})
 assert.equal(badInput.statusCode,400)
 const complete=await lifecycleCommand('/acquisitions',{
  method:'PURCHASE',effectiveOn:'2026-10-30',counterpartyLabel:'Fixture dealer',
  evidenceReference:'CERT-B2-ACQ-001',notes:'Unverified purchase reference',costs:costFixture
 })
 assert.equal(complete.statusCode,201,complete.body)
 assert.equal(complete.json().asset.lifecycle,'ACQUIRED')
 assert.equal(complete.json().asset.recordVersion,4)
 assert.equal(complete.json().acquisition.costBasis,'1265.00')
 assert.equal(complete.json().acquisition.currency,'KES')
 const snapshot=await inject('GET',lifecycleRoute()+'/lifecycle')
 assert.equal(snapshot.statusCode,200)
 assert.deepEqual(snapshot.json().transitions.map(t=>t.to),['ACQUISITION_PENDING','ACQUIRED'])
 assert.equal(snapshot.json().acquisition.costBasis,'1265.00')
 assert.equal(snapshot.json().acquisition.costs.purchase,'1200.25')
 const basis=await inject('GET',lifecycleRoute()+'/cost-basis')
 assert.equal(basis.statusCode,200)
 assert.equal(basis.json().costBasis,'1265.00')
 assert.equal(basis.json().currency,'KES')
 const stored=await db(tenantA,async c=>(await c.query('SELECT sum(amount)::text AS total,count(*)::int AS count FROM asset_os.acquisition_costs WHERE tenant_id=$1',[tenantA])).rows[0])
 assert.equal(stored.total,'1265.00')
 assert.equal(stored.count,6)
 assert.equal((await lifecycleCommand('/acquisitions',{method:'PURCHASE',effectiveOn:'2026-10-30',costs:costFixture})).statusCode,409)
})
test('B2 economic and beneficial percentage caps, legal/control references and immutable event history',async()=>{
 const assign=async(party,percentage,dimension='ECONOMIC',effectiveOn='2026-10-30')=>
  lifecycleCommand('/ownership-interests',{dimension,partyRef:party,partyLabel:'Display '+party,percentage,effectiveOn})
 const first=await assign('party-a','60.00')
 assert.equal(first.statusCode,201,first.body)
 interestA=first.json().interest.id
 const second=await assign('party-b','40.00')
 assert.equal(second.statusCode,201,second.body)
 interestB=second.json().interest.id
 const exceeded=await assign('party-c','0.01')
 assert.equal(exceeded.statusCode,409)
 assert.equal(exceeded.json().error.code,'OWNERSHIP_OVERALLOCATED')
 assert.equal((await assign('party-a','1.00')).statusCode,409)
 const legal=await assign('land-registry-ref',null,'LEGAL')
 assert.equal(legal.statusCode,201)
 const control=await assign('board-director',null,'CONTROL')
 assert.equal(control.statusCode,201)
 assert.equal((await assign('legal-with-share','5.00','LEGAL')).statusCode,400)
 const beneficial=await assign('beneficial-a','75.50','BENEFICIAL')
 assert.equal(beneficial.statusCode,201)
 assert.equal((await assign('beneficial-b','25.00','BENEFICIAL')).statusCode,409)
 const list=await inject('GET',lifecycleRoute()+'/ownership-interests')
 assert.equal(list.statusCode,200)
 assert.equal(list.json().filter(i=>i.dimension==='ECONOMIC'&&i.effectiveTo===null).length,2)
 assert.equal(list.json().filter(i=>i.dimension==='LEGAL')[0].percentage,null)
 const events=await inject('GET',lifecycleRoute()+'/ownership-events')
 assert.equal(events.statusCode,200)
 assert.equal(events.json().filter(e=>e.kind==='ASSIGNMENT').length,5)
})
test('B2 source share transfer conserves 100% with dated history, rejects overdraw, backdate and existing target',async()=>{
 const payload={sourceInterestId:interestA,toPartyRef:'party-c',toPartyLabel:'Display party-c',percentage:'20.00',effectiveOn:'2026-10-31',note:'Partial transfer'}
 const transfer=await lifecycleCommand('/ownership-transfers',payload)
 assert.equal(transfer.statusCode,201,transfer.body)
 const detail=transfer.json().transfer
 ownershipEvent=detail.id
 assert.equal(detail.remainingPercentage,'40.00')
 assert.equal(detail.percentage,'20.00')
 const snapshot=(await inject('GET',lifecycleRoute()+'/lifecycle')).json()
 const active=snapshot.ownershipInterests.filter(i=>i.dimension==='ECONOMIC'&&i.effectiveTo===null)
 assert.deepEqual(active.map(i=>i.percentage).sort(),['20.00','40.00','40.00'])
 const closed=snapshot.ownershipInterests.find(i=>i.id===interestA)
 assert.equal(closed.effectiveTo,'2026-10-31')
 assert.ok(snapshot.ownershipChanges.some(e=>e.id===ownershipEvent&&e.kind==='TRANSFER'))
 const overspend=await lifecycleCommand('/ownership-transfers',{...payload,sourceInterestId:interestB,percentage:'50.00',toPartyRef:'party-d'})
 assert.equal(overspend.statusCode,422)
 const recipientExisting=await lifecycleCommand('/ownership-transfers',{...payload,sourceInterestId:interestB,percentage:'5.00'})
 assert.equal(recipientExisting.statusCode,409)
 const stale=await lifecycleCommand('/ownership-transfers',{...payload,sourceInterestId:interestB,toPartyRef:'party-d',effectiveOn:'2026-10-30',percentage:'5.00'})
 assert.equal(stale.statusCode,409)
 const wrongTenant=await inject('GET',lifecycleRoute()+'/ownership-interests',{token:bToken,tenant:tenantB})
 assert.equal(wrongTenant.statusCode,404)
})
test('B2 activates, suspends, reactivates and blocks archival until disposal',async()=>{
 for(const [action,state] of [['ACTIVATE','ACTIVE'],['SUSPEND','SUSPENDED'],['REACTIVATE','ACTIVE']]){
  const r=await lifecycleCommand('/lifecycle-actions',{action,reason:'Owner-entered workflow test'})
  assert.equal(r.statusCode,200,r.body)
  assert.equal(r.json().asset.lifecycle,state)
 }
 const premature=await lifecycleCommand('/lifecycle-actions',{action:'ARCHIVE',reason:'No disposal yet'})
 assert.equal(premature.statusCode,409)
 const invalid=await lifecycleCommand('/lifecycle-actions',{action:'ACTIVATE',reason:'Already active'})
 assert.equal(invalid.statusCode,409)
})
test('B2 disposition records signed negative gains without Finance OS postings, then archival remains terminal',async()=>{
 const body={kind:'SALE',effectiveOn:'2026-10-31',proceeds:'1000.00',costs:'1200.01',
  counterpartyLabel:'User-entered counterparty',reason:'Disposed in recorded sale',confirm:'DISPOSE'}
 const wrong=await lifecycleCommand('/disposition',{...body,confirm:'YES'})
 assert.equal(wrong.statusCode,400)
 const readBefore=await inject('GET',lifecycleRoute()+'/disposition')
 assert.equal(readBefore.statusCode,200)
 assert.equal(readBefore.json(),null)
 const first=await lifecycleCommand('/disposition',body)
 assert.equal(first.statusCode,201,first.body)
 assert.equal(first.json().asset.lifecycle,'DISPOSED')
 assert.equal(first.json().disposition.costBasis,'1265.00')
 assert.equal(first.json().disposition.netProceeds,'-200.01')
 assert.equal(first.json().disposition.estimatedGain,'-1465.01')
 const disposition=await inject('GET',lifecycleRoute()+'/disposition')
 assert.equal(disposition.statusCode,200)
 assert.equal(disposition.json().netProceeds,'-200.01')
 const duplicate=await lifecycleCommand('/disposition',body)
 assert.equal(duplicate.statusCode,409)
 const archive=await lifecycleCommand('/lifecycle-actions',{action:'ARCHIVE',reason:'Historical record retained'})
 assert.equal(archive.statusCode,200)
 assert.equal(archive.json().asset.lifecycle,'ARCHIVED')
 assert.equal((await lifecycleCommand('/lifecycle-actions',{action:'ACTIVATE',reason:'No reopening'})).statusCode,409)
 assert.equal((await inject('PATCH',lifecycleRoute(),{headers:{'if-match':archive.headers.etag,'idempotency-key':'b2-edit-'+suffix()},payload:{name:'No edits post disposal'}})).statusCode,409)
 const audit=await db(tenantA,async c=>(await c.query('SELECT event_kind,actor_binding_id FROM asset_os.audit_events WHERE subject_id=$1 ORDER BY occurred_at,id',[assetId])).rows)
 assert.ok(audit.some(e=>e.event_kind==='ACQUISITION_RECORDED'))
 assert.ok(audit.some(e=>e.event_kind==='OWNERSHIP_TRANSFERRED'))
 assert.ok(audit.some(e=>e.event_kind==='ASSET_DISPOSED'))
 assert.ok(audit.every(e=>e.actor_binding_id===identityA))
 const outbox=await db(tenantA,async c=>(await c.query('SELECT type,delivery_state,payload FROM asset_os.outbox_events WHERE aggregate_id=$1',[assetId])).rows)
 assert.ok(outbox.some(e=>e.type==='asset.disposition.recorded.v1'))
 assert.ok(outbox.every(e=>e.delivery_state==='PENDING'))
 assert.ok(outbox.every(e=>Object.keys(e.payload).every(k=>['assetId','recordVersion','recordId'].includes(k))))
 const postings=await db(tenantA,async c=>(await c.query('SELECT count(*)::int AS n FROM asset_os.cash_flow_observations WHERE asset_id=$1',[assetId])).rows[0].n)
 assert.equal(postings,0)
 const list=(await inject('GET','/v1/dispositions')).json()
 assert.ok(list.items.some(d=>d.assetId===assetId))
 const acquired=(await inject('GET','/v1/acquisitions')).json()
 assert.ok(acquired.items.some(a=>a.assetId===assetId))
})
test('B2 idempotent concurrency and RLS prevent duplicate acquisition and cross-tenant related rows',async()=>{
 const fresh=await newAsset('Concurrent B2 acquisition','b2-fresh-'+suffix())
 assert.equal(fresh.statusCode,201)
 const id=fresh.json().id
 const pending=await lifecycleCommand('/lifecycle-actions',{action:'START_ACQUISITION',reason:'Concurrent acquisition gate'},{id})
 assert.equal(pending.statusCode,200)
 const key='b2-race-'+suffix()
 const payload={method:'PURCHASE',effectiveOn:'2026-10-31',costs:{purchase:'1.00'}}
 const opts={id,key,version:'"2"'}
 const [a,b]=await Promise.all([lifecycleCommand('/acquisitions',payload,opts),lifecycleCommand('/acquisitions',payload,opts)])
 assert.equal(a.statusCode,201,a.body)
 assert.equal(b.statusCode,201,b.body)
 assert.equal(a.json().acquisition.id,b.json().acquisition.id)
 assert.equal([a.headers['idempotent-replayed'],b.headers['idempotent-replayed']].filter(Boolean).length,1)
 const counts=await db(tenantA,async c=>(await c.query("SELECT count(*)::int AS n FROM asset_os.acquisitions WHERE asset_id=$1",[id])).rows[0].n)
 assert.equal(counts,1)
 const b2=await lifecycleCommand('/acquisitions',payload,{id,version:'"2"'})
 assert.equal(b2.statusCode,412)
 await assert.rejects(()=>db(tenantB,async c=>c.query('INSERT INTO asset_os.acquisitions(tenant_id,asset_id,method,effective_on,currency) VALUES($1,$2,$3,$4,$5)',[tenantB,id,'PURCHASE','2026-10-31','KES'])),/foreign key/)
 const observed=await db(tenantB,async c=>(await c.query('SELECT id FROM asset_os.acquisitions WHERE asset_id=$1',[id])).rows)
 assert.deepEqual(observed,[])
})
