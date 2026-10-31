import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
 initialRegistry, loadRegistry, saveRegistry, createAsset, updateAsset, STORE_KEY
} from '../src/registry/core.ts'
import {
 beginAcquisition, completeAcquisition, disposeAsset, EMPTY_COSTS
} from '../src/lifecycle/core.ts'
import {
 recordValuation, acceptValuation, latestAccepted, valuationsFor, createFacility,
 observeBalance, latestBalance, outstandingForAsset, indicativeEquity, recordFlow,
 flowsFor, flowSummary, cashTimeline, roiSnapshot, attachReference, referenceFor,
 reconciliationSummary, FLOW_TYPES, emptyFinanceData
} from '../src/economics/core.ts'
import { screens } from '../src/inventory.ts'

const AT='2026-10-31T12:00:00Z'
function input(record){const {id,number,createdAt,updatedAt,origin,...fields}=record;void id;void number;void createdAt;void updatedAt;void origin;return structuredClone(fields)}
function freshAcquired(){
 let s=initialRegistry()
 s=createAsset(s,{...input(s.records[0]),name:'New testing unit',lifecycle:'PLANNED',operational:'IDLE',acquiredOn:'',value:1000,equity:800},AT)
 const id=s.records[0].id
 s=beginAcquisition(s,id,AT)
 s=completeAcquisition(s,{assetId:id,method:'PURCHASE',acquiredOn:'2026-10-01',
  counterparty:'Example seller',reference:'SAMPLE-ACQ',notes:'Test',costs:{...EMPTY_COSTS,purchase:900,taxes:40,fees:10}},AT)
 return {s,id}
}
function facility(state,assetId){
 return createFacility(state,{assetId,financierLabel:'Sample lender',principal:600,interestRatePct:12.5,startOn:'2026-10-02',
  maturesOn:'2027-10-02',frequency:'MONTHLY',reference:'TEST-LOAN',notes:''},AT)
}
function flow(state,assetId,type,amount,category,occurredOn='2026-10-15'){
 return recordFlow(state,{assetId,type,category,amount,occurredOn,counterpartyLabel:'Sample party',notes:'Local test only'},AT)
}
test('Phase 3 routes remain available as Phase 6 is implemented',()=>{
 assert.equal(screens.length,60)
 assert.deepEqual(screens.slice(20,30).map(s=>s.id),[21,22,23,24,25,26,27,28,29,30])
 assert.equal(screens.filter(s=>s.status==='implemented').length,60)
 assert.equal(screens.filter(s=>s.status==='planned').length,0)
 const ui=readFileSync(new URL('../src/economics/EconomicsExperience.tsx',import.meta.url),'utf8')
 for(const path of ['valuations','valuations/new','valuation-history','financing','income-expenses','cash-flow','economics','reconciliation'])assert.ok(ui.includes("'"+path+"'"))
})
test('Phase 1 v1 and Phase 2 v2 snapshots migrate without discarding assets or histories',()=>{
 const source=initialRegistry()
 const older1={...source,version:1}
 delete older1.phase2;delete older1.phase3;delete older1.phase4;delete older1.phase5;delete older1.phase6
 const v1=loadRegistry({getItem:()=>JSON.stringify(older1)})
 assert.equal(v1.version,6)
 assert.equal(v1.records.length,5)
 assert.deepEqual(v1.phase3,emptyFinanceData())
 const old2={...source,version:2}
 delete old2.phase3;delete old2.phase4;delete old2.phase5;delete old2.phase6
 const v2=loadRegistry({getItem:()=>JSON.stringify(old2)})
 assert.equal(v2.version,6)
 assert.equal(v2.records[0].id,source.records[0].id)
 assert.deepEqual(v2.phase2,source.phase2)
 const save=new Map()
 assert.equal(saveRegistry(v2,{setItem:(key,value)=>save.set(key,value)}),true)
 assert.equal(JSON.parse(save.get(STORE_KEY)).version,6)
 assert.ok(loadRegistry({getItem:()=>JSON.stringify({...source,phase3:[]})}).phase3.valuations.length===0)
})
test('original synthetic assets contain no invented valuations, finance records or transactions',()=>{
 const s=initialRegistry()
 assert.deepEqual(s.phase3,emptyFinanceData())
 assert.equal(latestAccepted(s,'sample-property'),undefined)
 assert.equal(outstandingForAsset(s,'sample-vehicle'),null)
 assert.equal(reconciliationSummary(s).verified,0)
})
test('valuation creates draft; does not change current registry value before review',()=>{
 const s=initialRegistry(),oldValue=s.records[0].value
 const d=recordValuation(s,{assetId:s.records[0].id,date:'2026-10-10',amount:14000000,
 method:'MARKET_COMPARABLES',source:'Example comparables',confidence:'MEDIUM',notes:'Local draft'},AT)
 assert.equal(d.phase3.valuations.length,1)
 assert.equal(d.phase3.valuations[0].status,'DRAFT')
 assert.equal(d.records[0].value,oldValue)
 assert.equal(s.phase3.valuations.length,0)
 assert.equal(d.activity[0].event,'VALUATION_RECORDED')
})
test('local acceptance changes current value, preserves provenance and protects generic edits',()=>{
 const s=initialRegistry(),asset=s.records[0]
 const draft=recordValuation(s,{assetId:asset.id,date:'2026-10-10',amount:13500000,
 method:'APPRAISAL',source:'Unverified appraisal',confidence:'HIGH',notes:''},AT)
 const accepted=acceptValuation(draft,draft.phase3.valuations[0].id,AT)
 assert.equal(accepted.records[0].value,13500000)
 assert.equal(accepted.records[0].valuationAsOf,'2026-10-10')
 assert.equal(latestAccepted(accepted,asset.id).status,'ACCEPTED')
 assert.equal(accepted.activity[0].event,'VALUATION_ACCEPTED')
 assert.throws(()=>updateAsset(accepted,asset.id,{...input(accepted.records[0]),value:9000},AT),/controlled by the valuation/)
 assert.throws(()=>acceptValuation(accepted,accepted.phase3.valuations[0].id,AT),/draft/)
})
test('new accepted valuation supersedes old while keeping a read-only historic entry',()=>{
 const s=initialRegistry(),id=s.records[0].id
 const first=recordValuation(s,{assetId:id,date:'2026-10-05',amount:12000000,method:'MANUAL_ESTIMATE',source:'First',confidence:'LOW',notes:''},AT)
 const one=acceptValuation(first,first.phase3.valuations[0].id,AT)
 const draft=recordValuation(one,{assetId:id,date:'2026-10-15',amount:13800000,method:'APPRAISAL',source:'Second',confidence:'MEDIUM',notes:''},AT)
 const two=acceptValuation(draft,draft.phase3.valuations[0].id,AT)
 assert.equal(two.phase3.valuations.length,2)
 assert.equal(two.phase3.valuations.filter(v=>v.status==='ACCEPTED').length,1)
 assert.equal(two.phase3.valuations.filter(v=>v.status==='SUPERSEDED').length,1)
 assert.equal(latestAccepted(two,id).amount,13800000)
 assert.equal(valuationsFor(two,id).length,2)
 assert.ok(two.phase3.valuations[0].supersedesId)
})
test('draft validation rejects fictitious or invalid evidence',()=>{
 const s=initialRegistry(),id=s.records[0].id
 const base={assetId:id,date:'2026-10-10',amount:100,method:'APPRAISAL',source:'Sample report',confidence:'LOW',notes:''}
 assert.throws(()=>recordValuation(s,{...base,amount:-1},AT),/amount/)
 assert.throws(()=>recordValuation(s,{...base,date:'2026-11-01'},AT),/date/)
 assert.throws(()=>recordValuation(s,{...base,source:' '},AT),/Source/)
 assert.throws(()=>recordValuation(s,{...base,method:'BAD'},AT),/method/)
 const draft=recordValuation(s,base,AT)
 const one=acceptValuation(draft,draft.phase3.valuations[0].id,AT)
 assert.equal(one.records[0].value,100)
})
test('financing principal is not treated as outstanding balance or payment',()=>{
 const {s,id}=freshAcquired()
 const next=facility(s,id)
 assert.equal(next.phase3.facilities[0].principal,600)
 assert.equal(outstandingForAsset(next,id),null)
 assert.equal(indicativeEquity(next,id).method,'UNKNOWN')
 assert.equal(next.phase3.flows.length,0)
})
test('recorded debt may exceed principal and multiple facilities sum observed balances',()=>{
 const {s,id}=freshAcquired()
 let next=facility(s,id)
 const f1=next.phase3.facilities[0]
 next=observeBalance(next,{facilityId:f1.id,observedOn:'2026-10-20',balance:675,sourceLabel:'Example statement',notes:''},AT)
 assert.equal(latestBalance(next,f1.id).balance,675)
 assert.equal(outstandingForAsset(next,id),675)
 assert.equal(indicativeEquity(next,id).amount,325)
 next=createFacility(next,{assetId:id,financierLabel:'Second sample',principal:300,interestRatePct:0,startOn:'2026-10-03',
  maturesOn:null,frequency:'OTHER',reference:'',notes:''},AT)
 assert.equal(outstandingForAsset(next,id),null)
 next=observeBalance(next,{facilityId:next.phase3.facilities[0].id,observedOn:'2026-10-25',balance:305,sourceLabel:'Example',notes:''},AT)
 assert.equal(outstandingForAsset(next,id),980)
 assert.equal(indicativeEquity(next,id).amount,20)
 assert.throws(()=>observeBalance(next,{facilityId:f1.id,observedOn:'2026-10-01',balance:1,sourceLabel:'Past',notes:''},AT),/predates/)
})
test('interest and balance snapshots validate dates and terms',()=>{
 const {s,id}=freshAcquired()
 assert.throws(()=>createFacility(s,{assetId:id,financierLabel:'L',principal:10,interestRatePct:1010,startOn:'2026-10-02',maturesOn:null,frequency:'MONTHLY',reference:'',notes:''},AT),/Interest rate/)
 assert.throws(()=>createFacility(s,{assetId:id,financierLabel:'L',principal:10,interestRatePct:0,startOn:'2026-10-02',maturesOn:'2026-10-01',frequency:'MONTHLY',reference:'',notes:''},AT),/Maturity/)
 const active=facility(s,id),f=active.phase3.facilities[0]
 assert.throws(()=>observeBalance(active,{facilityId:f.id,observedOn:'2026-10-20',balance:-2,sourceLabel:'Lender',notes:''},AT),/balance/)
})
test('cash movement types are classified and aggregate in the same currency without double counting',()=>{
 const {s,id}=freshAcquired()
 let next=flow(s,id,'INCOME',210,'Rental')
 next=flow(next,id,'EXPENSE',35,'Repairs')
 next=flow(next,id,'CAPEX',25,'Upgrade')
 next=flow(next,id,'FINANCING_INFLOW',500,'New borrowing')
 next=flow(next,id,'FINANCING_OUTFLOW',100,'Loan repayment')
 const totals=flowSummary(flowsFor(next,id),'KES')
 assert.deepEqual({income:totals.INCOME,expense:totals.EXPENSE,capex:totals.CAPEX,op:totals.operatingNet,free:totals.freeCash,total:totals.totalNet},
  {income:210,expense:35,capex:25,op:175,free:150,total:550})
 assert.equal(cashTimeline(flowsFor(next,id),'KES').length,1)
 assert.equal(next.phase3.flows.length,5)
 assert.equal(FLOW_TYPES.length,5)
})
test('cash summary is currency-scoped and filters by reporting date',()=>{
 let s=initialRegistry()
 const id=s.records[0].id
 s=flow(s,id,'INCOME',1000,'Rental','2026-09-15')
 s=flow(s,id,'INCOME',500,'Rental','2026-10-15')
 const summary=flowSummary(flowsFor(s),'KES','2026-10-01','2026-10-31')
 assert.equal(summary.INCOME,500)
 assert.equal(summary.count,1)
 let other=initialRegistry()
 other=createAsset(other,{...input(other.records[0]),name:'USD asset',lifecycle:'PLANNED',currency:'USD',acquiredOn:''},AT)
 const foreign=other.records[0].id
 other=beginAcquisition(other,foreign,AT)
 other=completeAcquisition(other,{assetId:foreign,method:'PURCHASE',acquiredOn:'2026-10-01',counterparty:'Test',reference:'',notes:'',costs:{...EMPTY_COSTS,purchase:100}},AT)
 other=flow(other,foreign,'INCOME',30,'Rental')
 const mix={...s,phase3:{...s.phase3,flows:[...s.phase3.flows,...other.phase3.flows]}}
 assert.equal(flowSummary(flowsFor(mix),'KES').INCOME,1500)
 assert.equal(flowSummary(flowsFor(mix),'USD').INCOME,30)
})
test('flow validation rejects wrong categories, zero values and pre-acquisition entries',()=>{
 const {s,id}=freshAcquired()
 const base={assetId:id,type:'INCOME',category:'Rental',amount:100,occurredOn:'2026-10-15',counterpartyLabel:'',notes:''}
 assert.throws(()=>recordFlow(s,{...base,type:'EXPENSE'},AT),/Invalid flow category/)
 assert.throws(()=>recordFlow(s,{...base,amount:0},AT),/positive amount/)
 assert.throws(()=>recordFlow(s,{...base,occurredOn:'2026-09-01'},AT),/precede/)
})
test('ROI is unavailable without a recorded acquisition basis and excludes financing movements',()=>{
 let s=initialRegistry(),id=s.records[0].id
 s=flow(s,id,'INCOME',100,'Rental')
 assert.equal(roiSnapshot(s,id).operatingReturn,null)
 const {s:start,id:assetId}=freshAcquired()
 let next=flow(start,assetId,'INCOME',200,'Rental')
 next=flow(next,assetId,'EXPENSE',10,'Repairs')
 next=flow(next,assetId,'FINANCING_INFLOW',1000,'New borrowing')
 assert.equal(roiSnapshot(next,assetId).basis,950)
 assert.equal(roiSnapshot(next,assetId).operatingReturn,20)
 assert.equal(roiSnapshot(next,assetId).capitalReturn,5.26)
})
test('reference attachment is not a verified reconciliation and cannot double-attach',()=>{
 const {s,id}=freshAcquired()
 const withFlow=flow(s,id,'INCOME',100,'Rental')
 const f=withFlow.phase3.flows[0]
 assert.equal(referenceFor(withFlow,f.id),undefined)
 const linked=attachReference(withFlow,{flowId:f.id,system:'FINANCE_OS',reference:'EXT-001',note:'Sample'},AT)
 assert.equal(referenceFor(linked,f.id).reference,'EXT-001')
 assert.deepEqual(reconciliationSummary(linked),{total:1,attached:1,unreferenced:0,verified:0})
 assert.throws(()=>attachReference(linked,{flowId:f.id,system:'BANK',reference:'SECOND',note:''},AT),/already has a reference/)
 assert.equal(linked.activity[0].event,'RECONCILIATION_LINKED')
})
test('disposed assets cannot receive new valuation, loan or cash movement',()=>{
 const {s,id}=freshAcquired()
 const disposed=disposeAsset(s,{assetId:id,type:'DONATION',date:'2026-10-20',proceeds:0,costs:0,counterparty:'',reason:'Gift',confirm:'DISPOSE'},AT)
 assert.throws(()=>recordValuation(disposed,{assetId:id,date:'2026-10-10',amount:100,method:'APPRAISAL',source:'S',confidence:'HIGH',notes:''},AT),/requires/)
 assert.throws(()=>createFacility(disposed,{assetId:id,financierLabel:'L',principal:100,interestRatePct:10,startOn:'2026-10-10',maturesOn:null,frequency:'MONTHLY',reference:'',notes:''},AT),/requires/)
 assert.throws(()=>flow(disposed,id,'INCOME',100,'Rental'),/requires/)
})
test('all monetary records remain local and no fake posted Finance OS ledger is created',()=>{
 const {s,id}=freshAcquired()
 let next=facility(s,id)
 next=flow(next,id,'INCOME',10,'Rental')
 const f=next.phase3.flows[0]
 next=attachReference(next,{flowId:f.id,system:'FINANCE_OS',reference:'test-001',note:''},AT)
 assert.equal(next.phase3.flows.length,1)
 assert.equal(next.phase3.references.length,1)
 assert.ok(!('ledger' in next))
 assert.ok(!('postedPayments' in next))
 assert.equal(reconciliationSummary(next).verified,0)
})
