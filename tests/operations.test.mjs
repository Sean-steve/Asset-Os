import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {initialRegistry,loadRegistry,saveRegistry,createAsset,updateAsset,STORE_KEY} from '../src/registry/core.ts'
import {beginAcquisition,completeAcquisition,disposeAsset,EMPTY_COSTS} from '../src/lifecycle/core.ts'
import {recordValuation} from '../src/economics/core.ts'
import {
 emptyOperationalData, createPlan,addInterval,nextMaintenanceDue,setPlanState,
 createJob,updateJob,recordPolicy,policyState,cancelPolicy,recordReading,latestReading,
 utilizationSeries,addEvidence,moveLocation,addRelation,operationalEvents,eventUrgency,
 METRICS,DOCUMENT_KINDS,RELATION_TYPES
} from '../src/operations/core.ts'
import {screens} from '../src/inventory.ts'

const NOW='2026-10-31T12:00:00Z'
const withoutGenerated=a=>{const {id,number,createdAt,updatedAt,origin,...input}=a;void id;void number;void createdAt;void updatedAt;void origin;return structuredClone(input)}
function acquired(){
 const before=initialRegistry()
 const next=createAsset(before,{...withoutGenerated(before.records[0]),name:'Locally acquired unit',lifecycle:'PLANNED',acquiredOn:'',value:1200,equity:1200,location:'Test storage'},NOW)
 const id=next.records[0].id
 const pending=beginAcquisition(next,id,NOW)
 const ready=completeAcquisition(pending,{assetId:id,method:'PURCHASE',acquiredOn:'2026-10-01',counterparty:'Example',reference:'',notes:'',costs:{...EMPTY_COSTS,purchase:1000}},NOW)
 return {state:ready,id}
}
const basicPlan=(assetId)=>({assetId,title:'Inspection',description:'Manual plan',interval:1,unit:'MONTHS',nextDue:'2026-10-30'})
const basicJob=(assetId,planId=null)=>({assetId,planId,title:'Inspection work',scheduledFor:'2026-10-30',providerLabel:'Example',notes:''})
const basicPolicy=(assetId)=>({assetId,insurerLabel:'Sample insurer',policyReference:'SAMPLE-POL-01',policyType:'Comprehensive',
 startOn:'2026-10-01',endOn:'2026-11-01',coverageAmount:1500,premiumAmount:60,notes:'Demo metadata'})
const reading=(assetId,metric='ODOMETER_KM',value=100,observedOn='2026-10-10')=>({assetId,metric,observedOn,value,sourceLabel:'Manual example',notes:''})
test('Screens 31–40 are all in the canonical inventory and 40/60 are implemented',()=>{
 assert.equal(screens.length,60)
 assert.deepEqual(screens.slice(30,40).map(x=>x.id),[31,32,33,34,35,36,37,38,39,40])
 assert.equal(screens.filter(x=>x.status==='implemented').length,60)
 assert.equal(screens.filter(x=>x.status==='planned').length,0)
 const ui=readFileSync(new URL('../src/operations/OperationsExperience.tsx',import.meta.url),'utf8')
 for(const r of ['maintenance','maintenance/plans','maintenance/jobs','insurance','insurance/new','insurance/policies/','utilization','evidence','locations','operations-calendar'])
  assert.ok(ui.includes("'"+r),r)
})
test('v1/v2/v3 snapshots preserve assets, acquisition, finance history through version 6',()=>{
 const {state,id}=acquired()
 const finance=recordValuation(state,{assetId:id,date:'2026-10-10',amount:1000,method:'MANUAL_ESTIMATE',source:'Example',confidence:'LOW',notes:''},NOW)
 for(const version of [1,2,3]){
  const old=structuredClone(finance);old.version=version
  if(version<6)delete old.phase6
  if(version<5)delete old.phase5;delete old.phase6
  if(version<4)delete old.phase4
  if(version<3)delete old.phase3
  if(version<2)delete old.phase2
  const loaded=loadRegistry({getItem:key=>{assert.equal(key,STORE_KEY);return JSON.stringify(old)}})
  assert.equal(loaded.version,6)
  assert.equal(loaded.records[0].id,id)
  assert.deepEqual(loaded.phase4,emptyOperationalData())
  if(version>=2)assert.equal(loaded.phase2.acquisitions.length,1)
  if(version>=3)assert.equal(loaded.phase3.valuations.length,1)
  const m=new Map()
  assert.equal(saveRegistry(loaded,{setItem:(k,v)=>m.set(k,v)}),true)
  assert.equal(JSON.parse(m.get(STORE_KEY)).version,6)
 }
})
test('Initial sample workspace does not contain fabricated service, coverage, telemetry or documents',()=>{
 const state=initialRegistry()
 assert.deepEqual(state.phase4,emptyOperationalData())
 assert.equal(operationalEvents(state).length,0)
})
test('Plan has real due date; invalid recurrence inputs fail',()=>{
 const {state,id}=acquired()
 const withPlan=createPlan(state,basicPlan(id),NOW)
 assert.equal(withPlan.phase4.plans.length,1)
 assert.equal(withPlan.phase4.plans[0].status,'ACTIVE')
 assert.equal(state.phase4.plans.length,0)
 assert.equal(withPlan.activity[0].event,'MAINTENANCE_PLAN_CREATED')
 assert.throws(()=>createPlan(state,{...basicPlan(id),nextDue:'2026-02-31'},NOW),/valid calendar/)
 assert.throws(()=>createPlan(state,{...basicPlan(id),interval:0},NOW),/Interval/)
 assert.throws(()=>createPlan(state,{...basicPlan(id),unit:'INVALID'},NOW),/Invalid interval/)
})
test('Monthly cadence handles end-of-month correctly and advances beyond completion',()=>{
 assert.equal(addInterval('2026-01-31',1,'MONTHS'),'2026-02-28')
 assert.equal(addInterval('2028-01-31',1,'MONTHS'),'2028-02-29')
 assert.equal(addInterval('2026-10-30',1,'DAYS'),'2026-10-31')
 assert.equal(addInterval('2026-10-30',1,'WEEKS'),'2026-11-06')
 const {state,id}=acquired()
 const withPlan=createPlan(state,basicPlan(id),NOW)
 assert.equal(nextMaintenanceDue(withPlan.phase4.plans[0],'2026-12-02'),'2026-12-30')
})
test('Maintenance plan pause/resume controls due signal and rejects double transition',()=>{
 const {state,id}=acquired(),active=createPlan(state,basicPlan(id),NOW)
 const pid=active.phase4.plans[0].id
 const paused=setPlanState(active,pid,'PAUSED',NOW)
 assert.equal(paused.phase4.plans[0].status,'PAUSED')
 assert.equal(operationalEvents(paused).filter(x=>x.kind==='MAINTENANCE_DUE').length,0)
 assert.throws(()=>setPlanState(paused,pid,'PAUSED',NOW),/already/)
 const resumed=setPlanState(paused,pid,'ACTIVE',NOW)
 assert.equal(operationalEvents(resumed).filter(x=>x.kind==='MAINTENANCE_DUE').length,1)
})
test('Scheduled work order progresses to completed, recording cost without payment and updating plan',()=>{
 const {state,id}=acquired()
 const withPlan=createPlan(state,basicPlan(id),NOW)
 const pid=withPlan.phase4.plans[0].id
 const withJob=createJob(withPlan,basicJob(id,pid),NOW)
 assert.equal(withJob.phase4.jobs[0].status,'SCHEDULED')
 const started=updateJob(withJob,withJob.phase4.jobs[0].id,'START',undefined,NOW)
 assert.equal(started.phase4.jobs[0].status,'IN_PROGRESS')
 const completed=updateJob(started,started.phase4.jobs[0].id,'COMPLETE',{date:'2026-10-31',cost:123.45,notes:'Inspected'},NOW)
 assert.equal(completed.phase4.jobs[0].status,'COMPLETED')
 assert.equal(completed.phase4.jobs[0].recordedCost,123.45)
 assert.equal(completed.phase4.plans[0].lastCompletedOn,'2026-10-31')
 assert.equal(completed.phase4.plans[0].nextDue,'2026-11-30')
 assert.equal(completed.phase3.flows.length,0)
 assert.equal(completed.activity[0].event,'SERVICE_JOB_COMPLETED')
 assert.throws(()=>updateJob(completed,completed.phase4.jobs[0].id,'COMPLETE',{date:'2026-10-31',cost:0,notes:''},NOW),/cannot be changed/)
})
test('Cancellation is terminal, jobs cannot use paused or wrong-asset plans',()=>{
 const {state,id}=acquired()
 const withPlan=createPlan(state,basicPlan(id),NOW)
 const pid=withPlan.phase4.plans[0].id
 const paused=setPlanState(withPlan,pid,'PAUSED',NOW)
 assert.throws(()=>createJob(paused,basicJob(id,pid),NOW),/active maintenance plan/)
 const withJob=createJob(withPlan,basicJob(id),NOW)
 const cancelled=updateJob(withJob,withJob.phase4.jobs[0].id,'CANCEL',undefined,NOW)
 assert.equal(cancelled.phase4.jobs[0].status,'CANCELLED')
 assert.throws(()=>updateJob(cancelled,cancelled.phase4.jobs[0].id,'START',undefined,NOW),/cannot be changed/)
})
test('Insurance policy coverage is date-scoped but unverified, and expires on entered date',()=>{
 const {state,id}=acquired()
 const withPolicy=recordPolicy(state,basicPolicy(id),null,NOW),p=withPolicy.phase4.policies[0]
 assert.equal(policyState(p,'2026-09-01'),'UPCOMING')
 assert.equal(policyState(p,'2026-10-01'),'ACTIVE')
 assert.equal(policyState(p,'2026-11-01'),'ACTIVE')
 assert.equal(policyState(p,'2026-11-02'),'EXPIRED')
 assert.equal(p.currency,'KES')
 assert.equal(withPolicy.phase3.flows.length,0)
 assert.throws(()=>recordPolicy(withPolicy,basicPolicy(id),null,NOW),/already uses/)
})
test('Renewal retains old policy, never executes payment, and cancellation is explicit',()=>{
 const {state,id}=acquired()
 const old=recordPolicy(state,basicPolicy(id),null,NOW),pid=old.phase4.policies[0].id
 const renewed=recordPolicy(old,{...basicPolicy(id),policyReference:'RENEWAL-002',startOn:'2026-11-01',endOn:'2027-11-01'},pid,NOW)
 assert.equal(renewed.phase4.policies.length,2)
 assert.equal(renewed.phase4.policies.find(x=>x.id===pid).status,'SUPERSEDED')
 assert.equal(renewed.phase4.policies[0].replacesId,pid)
 assert.equal(renewed.phase3.flows.length,0)
 assert.throws(()=>recordPolicy(renewed,{...basicPolicy(id),policyReference:'REV-3'},pid,NOW),/current, matching policy/)
 const cancelled=cancelPolicy(renewed,renewed.phase4.policies[0].id,NOW)
 assert.equal(cancelled.phase4.policies[0].status,'CANCELLED')
 assert.throws(()=>cancelPolicy(cancelled,cancelled.phase4.policies[0].id,NOW),/current policy/)
})
test('Utilization captures real manual cumulative readings and delta, no synthetic telemetry',()=>{
 const {state,id}=acquired()
 const first=recordReading(state,reading(id),NOW)
 const second=recordReading(first,reading(id,'ODOMETER_KM',108.5,'2026-10-21'),NOW)
 assert.equal(latestReading(second,id,'ODOMETER_KM').value,108.5)
 assert.deepEqual(utilizationSeries(second,id,'ODOMETER_KM').map(r=>r.delta),[null,8.5])
 assert.equal(second.phase4.readings.length,2)
 assert.equal(METRICS.length,4)
 assert.throws(()=>recordReading(second,reading(id,'ODOMETER_KM',100,'2026-10-22'),NOW),/cannot decrease/)
 assert.throws(()=>recordReading(second,reading(id,'ODOMETER_KM',200,'2026-10-19'),NOW),/backdated/)
 assert.throws(()=>recordReading(second,reading(id,'USE_COUNT',2.5,'2026-10-19'),NOW),/whole number/)
})
test('Evidence references store metadata only, validate dates and reject embedded file/URL payloads',()=>{
 const {state,id}=acquired()
 const entry={assetId:id,kind:'COMPLIANCE',title:'Inspection certificate',reference:'SAMPLE-CERT-01',issuedOn:'2026-10-10',
  expiresOn:'2026-12-30',notes:'Non-sensitive metadata'}
 const withDoc=addEvidence(state,entry,NOW)
 assert.equal(withDoc.phase4.documents.length,1)
 assert.equal(withDoc.phase4.documents[0].reference,'SAMPLE-CERT-01')
 assert.equal(DOCUMENT_KINDS.length,6)
 assert.ok(!('blob' in withDoc.phase4.documents[0]))
 assert.throws(()=>addEvidence(state,{...entry,reference:'https://example.com/private.pdf'},NOW),/Do not store URLs/)
 assert.throws(()=>addEvidence(state,{...entry,issuedOn:'2026-12-01',expiresOn:'2026-11-01'},NOW),/future/)
 assert.throws(()=>addEvidence(state,{...entry,expiresOn:'2026-09-30'},NOW),/Expiry cannot precede/)
})
test('Location changes update the registry only via dedicated operation and preserve history',()=>{
 const {state,id}=acquired()
 const moved=moveLocation(state,{assetId:id,toLabel:'Nairobi workshop',effectiveOn:'2026-10-15',reason:'Service'},NOW)
 assert.equal(moved.records[0].location,'Nairobi workshop')
 assert.equal(moved.phase4.locations[0].fromLabel,'Test storage')
 assert.equal(moved.phase4.locations[0].toLabel,'Nairobi workshop')
 assert.equal(state.records[0].location,'Test storage')
 assert.equal(moved.activity[0].event,'LOCATION_CHANGED')
 assert.throws(()=>updateAsset(moved,id,{...withoutGenerated(moved.records[0]),location:'Private vault'},NOW),/location change workflow/)
 assert.throws(()=>moveLocation(moved,{assetId:id,toLabel:'Test storage',effectiveOn:'2026-10-10',reason:''},NOW),/backdate/)
})
test('Relations enforce distinct entities, directed acyclic component and dependency graphs',()=>{
 const {state,id}=acquired()
 let second=createAsset(state,{...withoutGenerated(state.records[0]),name:'Second asset',lifecycle:'PLANNED',acquiredOn:''},NOW)
 const id2=second.records[0].id
 second=completeAcquisition(beginAcquisition(second,id2,NOW),{assetId:id2,method:'GIFT',acquiredOn:'2026-10-01',
  counterparty:'Example',reference:'',notes:'',costs:{...EMPTY_COSTS}},NOW)
 const linked=addRelation(second,{assetId:id,relatedAssetId:id2,type:'COMPONENT_OF',note:'Part'},NOW)
 assert.equal(linked.phase4.relations.length,1)
 assert.equal(RELATION_TYPES.length,4)
 assert.throws(()=>addRelation(linked,{assetId:id2,relatedAssetId:id,type:'COMPONENT_OF',note:'Cycle'},NOW),/dependency cycle/)
 assert.throws(()=>addRelation(linked,{assetId:id,relatedAssetId:id2,type:'COMPONENT_OF',note:''},NOW),/already exists/)
 assert.throws(()=>addRelation(linked,{assetId:id,relatedAssetId:id,type:'ASSOCIATED_WITH',note:''},NOW),/itself/)
})
test('Operational calendar derives only entered future and overdue records; empty baseline stays empty',()=>{
 const {state,id}=acquired()
 let next=createPlan(state,basicPlan(id),NOW)
 next=createJob(next,basicJob(id),NOW)
 next=recordPolicy(next,basicPolicy(id),null,NOW)
 next=addEvidence(next,{assetId:id,kind:'COMPLIANCE',title:'Permit',reference:'PERMIT-DEMO',issuedOn:null,expiresOn:'2026-11-12',notes:''},NOW)
 const events=operationalEvents(next)
 assert.equal(events.length,4)
 assert.deepEqual(events.map(e=>e.kind).sort(),['MAINTENANCE_DUE','SERVICE_SCHEDULED','POLICY_EXPIRY','EVIDENCE_EXPIRY'].sort())
 assert.equal(events[0].date,'2026-10-30')
 assert.equal(eventUrgency('2026-10-30','2026-10-31'),'OVERDUE')
 assert.equal(eventUrgency('2026-10-31','2026-10-31'),'TODAY')
 assert.equal(eventUrgency('2026-11-01','2026-10-31'),'UPCOMING')
})
test('Disposed assets reject new operational commands and records remain viewable',()=>{
 const {state,id}=acquired()
 const withPlan=createPlan(state,basicPlan(id),NOW)
 const disposed=disposeAsset(withPlan,{assetId:id,type:'DONATION',date:'2026-10-25',proceeds:0,costs:0,counterparty:'',reason:'Test',confirm:'DISPOSE'},NOW)
 assert.equal(disposed.phase4.plans.length,1)
 assert.throws(()=>createPlan(disposed,basicPlan(id),NOW),/require/)
 assert.throws(()=>recordReading(disposed,reading(id),NOW),/require/)
 assert.throws(()=>moveLocation(disposed,{assetId:id,toLabel:'A',effectiveOn:'2026-10-20',reason:''},NOW),/require/)
})
test('No operational command silently writes Finance OS, identity, payment or device data',()=>{
 const {state,id}=acquired()
 let result=createPlan(state,basicPlan(id),NOW)
 result=createJob(result,basicJob(id),NOW)
 result=recordPolicy(result,basicPolicy(id),null,NOW)
 result=recordReading(result,reading(id),NOW)
 assert.equal(result.phase3.flows.length,0)
 assert.equal(result.phase3.references.length,0)
 assert.ok(!('bankPayments' in result))
 assert.ok(!('kernelCalendar' in result))
 assert.ok(!('deviceTelemetry' in result))
})
