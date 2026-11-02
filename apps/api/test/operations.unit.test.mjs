import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PlanCreate,PlanAction,JobCreate,JobAction,PolicyRecord,PolicyAction,ReadingRecord,EvidenceRecord,LocationRecord,RelationRecord,B4_CAPABILITIES,CONTRACT_VERSION} from '../dist/contracts.js'
import {advanceDue,assertDay} from '../dist/operations.js'

test('B4 maintenance recurrence handles end-of-month and leap year dates',()=>{
 assert.equal(advanceDue('2026-01-31',1,'MONTHS'),'2026-02-28')
 assert.equal(advanceDue('2024-01-31',1,'MONTHS'),'2024-02-29')
 assert.equal(advanceDue('2026-10-31',1,'DAYS'),'2026-11-01')
 assert.equal(advanceDue('2026-10-31',2,'WEEKS'),'2026-11-14')
 assert.throws(()=>assertDay('2099-01-01'),/future/)
})
test('B4 rejects status spoofing, float money, and invalid plan/job transitions',()=>{
 const p={title:'Inspect engine',intervalValue:3,intervalUnit:'MONTHS',nextDue:'2026-12-01'}
 assert.equal(PlanCreate.safeParse(p).success,true)
 assert.equal(PlanCreate.safeParse({...p,status:'COMPLETED'}).success,false)
 assert.equal(PlanCreate.safeParse({...p,intervalValue:366}).success,false)
 assert.equal(PlanAction.safeParse({action:'RESUME'}).success,true)
 assert.equal(PlanAction.safeParse({action:'DELETE'}).success,false)
 const job={title:'Wheel alignment',scheduledFor:'2026-12-01'}
 assert.equal(JobCreate.safeParse(job).success,true)
 assert.equal(JobCreate.safeParse({...job,providerDispatched:true}).success,false)
 assert.equal(JobAction.safeParse({action:'COMPLETE',completedOn:'2026-11-01',recordedCost:'120.50'}).success,true)
 assert.equal(JobAction.safeParse({action:'COMPLETE',completedOn:'2026-11-01',recordedCost:120.50}).success,false)
 assert.equal(JobAction.safeParse({action:'START',recordedCost:'50.00'}).success,false)
})
test('B4 policy and utilization are user observations, not verified cover or telematics',()=>{
 const policy={insurerLabel:'Recorded insurer',policyType:'Vehicle',startOn:'2026-10-30',endOn:'2027-10-30',coverageAmount:'500000.00'}
 assert.equal(PolicyRecord.safeParse(policy).success,true)
 assert.equal(PolicyRecord.safeParse({...policy,coverageVerified:true}).success,false)
 assert.equal(PolicyRecord.safeParse({...policy,premiumAmount:5000}).success,false)
 assert.equal(PolicyAction.safeParse({action:'CANCEL'}).success,true)
 assert.equal(ReadingRecord.safeParse({metric:'ODOMETER_KM',observedOn:'2026-11-01',reading:'2134.25',sourceLabel:'Owner'}).success,true)
 assert.equal(ReadingRecord.safeParse({metric:'USE_COUNT',observedOn:'2026-11-01',reading:'2.25',sourceLabel:'Owner'}).success,false)
 assert.equal(ReadingRecord.safeParse({metric:'ODOMETER_KM',observedOn:'2026-11-01',reading:'10.00',sourceLabel:'Owner',telematicsVerified:true}).success,false)
})
test('B4 evidence, location and asset links reject unauthorized claim fields',()=>{
 assert.equal(EvidenceRecord.safeParse({kind:'INSURANCE',title:'Policy note',reference:'opaque-abc'}).success,true)
 assert.equal(EvidenceRecord.safeParse({kind:'INSURANCE',title:'Policy note',reference:'opaque-abc',verified:true}).success,false)
 assert.equal(LocationRecord.safeParse({toLabel:'Garage A',effectiveOn:'2026-11-01'}).success,true)
 assert.equal(LocationRecord.safeParse({toLabel:'Garage A',effectiveOn:'2026-11-01',gps:[-1,36]}).success,false)
 assert.equal(RelationRecord.safeParse({relatedAssetId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',type:'DEPENDS_ON'}).success,true)
 assert.equal(RelationRecord.safeParse({relatedAssetId:'invalid',type:'COMPONENT_OF'}).success,false)
})
test('B4 OpenAPI documents protected implemented routes and pending-only events',()=>{
 const o=JSON.parse(readFileSync(new URL('../openapi/openapi.json',import.meta.url),'utf8'))
 const ev=JSON.parse(readFileSync(new URL('../openapi/events.json',import.meta.url),'utf8'))
 assert.equal(o.info.version,'0.5.0-b4')
 assert.equal(CONTRACT_VERSION,'2026-11-02.b4')
 for(const name of ['maintenance-plans','service-jobs','insurance-policies','utilization-readings','evidence-references','location-events','asset-relationships']){
  const path=o.paths['/v1/assets/{assetId}/'+name]
  assert.equal(path.get['x-runtime-status'],'IMPLEMENTED_B4')
  assert.equal(path.post['x-runtime-status'],'IMPLEMENTED_B4')
  assert.deepEqual(path.post.security,[{KernelBearer:[]}])
  assert.ok(path.post.parameters.some(x=>x.name==='If-Match'&&x.required))
  assert.ok(path.post.parameters.some(x=>x.name==='Idempotency-Key'&&x.required))
 }
 for(const name of ['maintenance-plans/{planId}/actions','service-jobs/{jobId}/actions','insurance-policies/{policyId}/actions'])
  assert.equal(o.paths['/v1/assets/{assetId}/'+name].post['x-runtime-status'],'IMPLEMENTED_B4')
 for(const path of ['/v1/assets/{assetId}/operations','/v1/assets/{assetId}/operations-calendar'])
  assert.equal(o.paths[path].get['x-runtime-status'],'IMPLEMENTED_B4')
 assert.equal(ev.transport,'NOT_CONFIGURED')
 assert.ok(ev.allowedEmissions.some(e=>e.type==='asset.service.job.status.changed.v1'))
 assert.ok(!ev.allowedEmissions.some(e=>e.type==='asset.maintenance.due.v1'))
 assert.ok(B4_CAPABILITIES.includes('tenant_scoped_asset_links'))
})
