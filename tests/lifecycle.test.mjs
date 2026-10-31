import test from 'node:test'
import assert from 'node:assert/strict'
import {
  initialRegistry, loadRegistry, saveRegistry, sumInCurrency, STORE_KEY, createAsset, updateAsset
} from '../src/registry/core.ts'
import {
  ACQUISITION_METHODS, ALLOWED_TRANSITIONS, OWNERSHIP_DIMENSIONS, EMPTY_COSTS,
  acquisitionFor, activeInterests, assignOwnership, beginAcquisition, completeAcquisition,
  costBasis, disposeAsset, dispositionFor, lifecycleAction, ownershipTotal,
  shareBreakdown, transferOwnership, transitionHistory
} from '../src/lifecycle/core.ts'
import { screens } from '../src/inventory.ts'
import { readFileSync } from 'node:fs'

const AT='2026-10-31T12:00:00Z'
const input=(record)=>{const {id,number,createdAt,updatedAt,origin,...value}=record;void id;void number;void createdAt;void updatedAt;void origin;return structuredClone(value)}
function planned(){
 const origin=initialRegistry()
 return createAsset(origin,{...input(origin.records[0]),name:'New local investment',lifecycle:'PLANNED',operational:'IDLE',acquiredOn:'',value:1000,equity:1000},AT)
}
function acquired(){
 const s=planned(),id=s.records[0].id
 const start=beginAcquisition(s,id,AT)
 return completeAcquisition(start,{assetId:id,method:'PURCHASE',acquiredOn:'2026-10-15',
  counterparty:'Example party',reference:'EX-100',notes:'Local testing only',
  costs:{purchase:900,taxes:30,fees:10,installation:10,improvements:0,other:5}},AT)
}
const checkError=(fn,pattern)=>assert.throws(fn,pattern)

test('Phase 2 routes remain intact after Phase 3 adds new screens',()=>{
 assert.equal(screens.length,60)
 assert.deepEqual(screens.slice(10,20).map(s=>s.id),[11,12,13,14,15,16,17,18,19,20])
 assert.equal(screens.filter(s=>s.status==='implemented').length,50)
 assert.equal(screens.filter(s=>s.status==='planned').length,10)
 const ui=readFileSync(new URL('../src/lifecycle/LifecycleExperience.tsx',import.meta.url),'utf8')
 for(const route of ['acquisitions','acquisitions/new','cost-basis','lifecycle','ownership','ownership/manage','dispose','dispositions']) assert.ok(ui.includes("'"+route+"'"),route)
})
test('old Phase 1 local snapshot migrates to Phase 2 without changing asset identity',()=>{
 const s=initialRegistry()
 const old={...s,version:1};delete old.phase2;delete old.phase3;delete old.phase4;delete old.phase5
 const raw=JSON.stringify(old)
 const storage={getItem:(key)=>{assert.equal(key,STORE_KEY);return raw}}
 const loaded=loadRegistry(storage)
 assert.equal(loaded.version,5)
 assert.equal(loaded.records.length,5)
 assert.equal(loaded.records[0].id,s.records[0].id)
 assert.deepEqual(loaded.phase2.acquisitions,[])
 assert.deepEqual(loaded.phase2.interests,[])
 assert.deepEqual(loaded.phase2.dispositions,[])
 const entries=new Map()
 assert.ok(saveRegistry(loaded,{setItem:(key,value)=>entries.set(key,value)}))
 assert.equal(JSON.parse(entries.get(STORE_KEY)).version,5)
})
test('sample active assets have no fabricated acquisition or ownership record',()=>{
 const s=initialRegistry()
 assert.equal(s.phase2.acquisitions.length,0)
 assert.equal(s.phase2.interests.length,0)
 assert.equal(s.phase2.dispositions.length,0)
 assert.equal(acquisitionFor(s,s.records[0].id),undefined)
 checkError(()=>beginAcquisition(s,s.records[0].id,AT),/not allowed/)
})
test('new assets start planned, invalid direct active creation fails',()=>{
 const s=initialRegistry()
 checkError(()=>createAsset(s,input(s.records[0]),AT),/PLANNED/)
 assert.equal(planned().records[0].lifecycle,'PLANNED')
})
test('begin acquisition is idempotently guarded and preserves a transition',()=>{
 const s=planned(),id=s.records[0].id
 const started=beginAcquisition(s,id,AT)
 assert.equal(started.records[0].lifecycle,'ACQUISITION_PENDING')
 assert.equal(started.phase2.transitions[0].from,'PLANNED')
 assert.equal(started.phase2.transitions[0].to,'ACQUISITION_PENDING')
 assert.equal(started.phase2.acquisitions.length,0)
 assert.equal(started.activity[0].event,'LIFECYCLE_CHANGED')
 checkError(()=>beginAcquisition(started,id,AT),/not allowed/)
})
test('cost basis is precise at cents and rejects invalid amounts',()=>{
 assert.equal(costBasis({purchase:100.15,taxes:2.1,fees:0.7,installation:0,improvements:5.05,other:0}),108)
 checkError(()=>costBasis({...EMPTY_COSTS,fees:-1}),/valid non-negative/)
 checkError(()=>costBasis({...EMPTY_COSTS,taxes:Infinity}),/valid non-negative/)
 checkError(()=>costBasis({...EMPTY_COSTS,fees:10.123}),/valid non-negative/)
})
test('recording acquisition requires pending state and a valid method/date/purchase cost',()=>{
 const s=planned(),id=s.records[0].id
 const blank={assetId:id,method:'PURCHASE',acquiredOn:'2026-10-15',counterparty:'',reference:'',notes:'',costs:{...EMPTY_COSTS,purchase:100}}
 checkError(()=>completeAcquisition(s,blank,AT),/Start acquisition/)
 const p=beginAcquisition(s,id,AT)
 checkError(()=>completeAcquisition(p,{...blank,costs:EMPTY_COSTS},AT),/purchase amount/)
 checkError(()=>completeAcquisition(p,{...blank,acquiredOn:'2026-02-31'},AT),/valid effective date/)
 checkError(()=>completeAcquisition(p,{...blank,acquiredOn:'2027-01-01'},AT),/future/)
 checkError(()=>completeAcquisition(p,{...blank,method:'INVALID'},AT),/valid acquisition method/)
})
test('complete acquisition records cost basis, date, transition and activity in one new snapshot',()=>{
 const s=acquired(),record=s.phase2.acquisitions[0],id=s.records[0].id
 assert.equal(record.assetId,id)
 assert.equal(record.costBasis,955)
 assert.equal(record.currency,'KES')
 assert.equal(s.records[0].lifecycle,'ACQUIRED')
 assert.equal(s.records[0].acquiredOn,'2026-10-15')
 assert.deepEqual(s.phase2.transitions.slice(0,2).map(t=>t.to),['ACQUIRED','ACQUISITION_PENDING'])
 assert.equal(s.activity[0].event,'ACQUIRED')
 assert.equal(s.activity[1].event,'LIFECYCLE_CHANGED')
 checkError(()=>completeAcquisition(s,{...record},AT),/Start acquisition/)
 assert.equal(s.records[0].origin,'local')
})
test('after acquisition, registry edits cannot change controlled acquisition dates or lifecycle',()=>{
 const s=acquired(),a=s.records[0]
 checkError(()=>updateAsset(s,a.id,{...input(a),acquiredOn:'2026-10-16'},AT),/locked/)
 checkError(()=>updateAsset(s,a.id,{...input(a),lifecycle:'ACTIVE'},AT),/dedicated domain/)
})
test('legal transitions permit activate/suspend/reactivate but not illegal shortcuts',()=>{
 const s=acquired(),id=s.records[0].id
 const active=lifecycleAction(s,id,'ACTIVATE','Ready for use',AT)
 assert.equal(active.records[0].lifecycle,'ACTIVE')
 const suspended=lifecycleAction(active,id,'SUSPEND','Under review',AT)
 assert.equal(suspended.records[0].lifecycle,'SUSPENDED')
 const reactivated=lifecycleAction(suspended,id,'REACTIVATE','Ready',AT)
 assert.equal(reactivated.records[0].lifecycle,'ACTIVE')
 assert.equal(transitionHistory(reactivated,id).length,5)
 checkError(()=>lifecycleAction(active,id,'ACTIVATE','',AT),/not allowed/)
 assert.deepEqual(ALLOWED_TRANSITIONS.ARCHIVED,[])
})
test('ownership assigns economic and beneficial percentages separately and respects 100 cap',()=>{
 const s=acquired(),id=s.records[0].id
 const first=assignOwnership(s,{assetId:id,dimension:'ECONOMIC',percentage:70,partyRef:'party-a',partyLabel:'Example A',effectiveFrom:'2026-10-16',note:'first'},AT)
 const second=assignOwnership(first,{assetId:id,dimension:'ECONOMIC',percentage:25,partyRef:'party-b',partyLabel:'Example B',effectiveFrom:'2026-10-16',note:''},AT)
 const third=assignOwnership(second,{assetId:id,dimension:'BENEFICIAL',percentage:100,partyRef:'benefit-a',partyLabel:'Beneficiary',effectiveFrom:'2026-10-16',note:''},AT)
 assert.equal(ownershipTotal(third,id,'ECONOMIC',AT),95)
 assert.equal(ownershipTotal(third,id,'BENEFICIAL',AT),100)
 assert.equal(shareBreakdown(third,id)[0].unallocated,5)
 assert.equal(third.phase2.ownershipChanges.length,3)
 checkError(()=>assignOwnership(third,{assetId:id,dimension:'ECONOMIC',percentage:6,partyRef:'party-c',partyLabel:'Too much',effectiveFrom:'2026-10-16',note:''},AT),/exceed 100/)
 checkError(()=>assignOwnership(third,{assetId:id,dimension:'ECONOMIC',percentage:1,partyRef:'party-a',partyLabel:'Duplicate',effectiveFrom:'2026-10-16',note:''},AT),/overlapping/)
})
test('legal and control rights use non-additive, non-percentage references',()=>{
 const s=acquired(),id=s.records[0].id
 const legal=assignOwnership(s,{assetId:id,dimension:'LEGAL',percentage:null,partyRef:'legal-ref',partyLabel:'Example titleholder',effectiveFrom:'2026-10-16',note:''},AT)
 const control=assignOwnership(legal,{assetId:id,dimension:'CONTROL',percentage:null,partyRef:'manager-ref',partyLabel:'Example manager',effectiveFrom:'2026-10-16',note:''},AT)
 assert.equal(activeInterests(control,id,AT).length,2)
 assert.equal(shareBreakdown(control,id).find(x=>x.dimension==='LEGAL').allocated,null)
 checkError(()=>assignOwnership(control,{assetId:id,dimension:'LEGAL',percentage:100,partyRef:'other',partyLabel:'Other',effectiveFrom:'2026-10-16',note:''},AT),/non-percentage/)
 assert.deepEqual(OWNERSHIP_DIMENSIONS,['ECONOMIC','BENEFICIAL','LEGAL','CONTROL'])
})
test('partial transfer preserves prior effective-dated ownership allocation',()=>{
 const s=acquired(),id=s.records[0].id
 const assigned=assignOwnership(s,{assetId:id,dimension:'ECONOMIC',percentage:80,partyRef:'source',partyLabel:'Source',effectiveFrom:'2026-10-16',note:''},AT)
 const original=activeInterests(assigned,id,AT)[0]
 const transferred=transferOwnership(assigned,{assetId:id,sourceInterestId:original.id,partyRef:'target',partyLabel:'Target',percentage:30,effectiveOn:'2026-10-28',note:'partial'},AT)
 assert.equal(ownershipTotal(transferred,id,'ECONOMIC',AT),80)
 assert.deepEqual(activeInterests(transferred,id,AT,'ECONOMIC').map(i=>i.percentage).sort((a,b)=>a-b),[30,50])
 assert.equal(ownershipTotal(transferred,id,'ECONOMIC','2026-10-20T12:00:00Z'),80)
 assert.equal(activeInterests(transferred,id,'2026-10-20T12:00:00Z').length,1)
 assert.equal(transferred.phase2.ownershipChanges[0].fromPartyRef,'source')
 assert.equal(transferred.phase2.ownershipChanges[0].toPartyRef,'target')
 checkError(()=>transferOwnership(transferred,{assetId:id,sourceInterestId:original.id,partyRef:'third',partyLabel:'Third',percentage:5,effectiveOn:'2026-10-31',note:''},AT),/Select an active/)
})
test('transfer cannot exceed source share or transfer to self',()=>{
 const s=acquired(),id=s.records[0].id
 const assigned=assignOwnership(s,{assetId:id,dimension:'ECONOMIC',percentage:70,partyRef:'origin',partyLabel:'Origin',effectiveFrom:'2026-10-16',note:''},AT)
 const sourceInterestId=activeInterests(assigned,id,AT)[0].id
 const transfer={assetId:id,sourceInterestId,partyRef:'new',partyLabel:'New',percentage:71,effectiveOn:'2026-10-28',note:''}
 checkError(()=>transferOwnership(assigned,transfer,AT),/exceed the source/)
 checkError(()=>transferOwnership(assigned,{...transfer,percentage:30,partyRef:'origin'},AT),/different receiving party/)
})
test('transfer rejects overlapping rights when receiving party already holds the same ownership dimension',()=>{
 const s=acquired(),id=s.records[0].id
 const a=assignOwnership(s,{assetId:id,dimension:'ECONOMIC',percentage:50,partyRef:'holder-a',partyLabel:'A',effectiveFrom:'2026-10-16',note:''},AT)
 const b=assignOwnership(a,{assetId:id,dimension:'ECONOMIC',percentage:40,partyRef:'holder-b',partyLabel:'B',effectiveFrom:'2026-10-16',note:''},AT)
 const source=activeInterests(b,id,AT,'ECONOMIC').find(i=>i.partyRef==='holder-a')
 checkError(()=>transferOwnership(b,{assetId:id,sourceInterestId:source.id,partyRef:'holder-b',partyLabel:'B',percentage:10,effectiveOn:'2026-10-30',note:''},AT),/already has an active interest/)
 assert.equal(ownershipTotal(b,id,'ECONOMIC',AT),90)
})
test('disposal requires explicit typed confirmation and valid allowed lifecycle',()=>{
 const s=acquired(),id=s.records[0].id
 const input={assetId:id,type:'SALE',date:'2026-10-30',proceeds:1200,costs:45,counterparty:'Example buyer',reason:'Reallocate capital',confirm:'DISPOSE'}
 checkError(()=>disposeAsset(s,{...input,confirm:'NO'},AT),/Type DISPOSE/)
 checkError(()=>disposeAsset(s,{...input,date:'2026-10-14'},AT),/predate acquisition/)
 checkError(()=>disposeAsset(s,{...input,proceeds:0},AT),/positive proceeds/)
 checkError(()=>disposeAsset(s,{...input,type:'DONATION'},AT),/Only sales/)
})
test('disposal preserves historical cost basis, economic snapshot, asset record and equity exclusion',()=>{
 const s=acquired(),id=s.records[0].id
 const disposed=disposeAsset(s,{assetId:id,type:'SALE',date:'2026-10-30',proceeds:1200,costs:45,counterparty:'Example buyer',reason:'Reallocate capital',confirm:'DISPOSE'},AT)
 assert.equal(disposed.records[0].lifecycle,'DISPOSED')
 assert.equal(disposed.records[0].id,id)
 assert.equal(disposed.phase2.acquisitions.length,1)
 assert.equal(disposed.phase2.dispositions.length,1)
 assert.equal(dispositionFor(disposed,id).costBasis,955)
 assert.equal(dispositionFor(disposed,id).netProceeds,1155)
 assert.equal(dispositionFor(disposed,id).estimatedGain,200)
 assert.equal(sumInCurrency(disposed.records,'value','KES'),24850000)
 checkError(()=>disposeAsset(disposed,{assetId:id,type:'SALE',date:'2026-10-30',proceeds:1,costs:0,counterparty:'Test',reason:'Again',confirm:'DISPOSE'},AT),/Only acquired/)
 checkError(()=>lifecycleAction(disposed,id,'REACTIVATE','Not allowed',AT),/not allowed/)
})
test('archiving is only available for an asset with an actual disposition record',()=>{
 const acquiredState=acquired(),id=acquiredState.records[0].id
 checkError(()=>lifecycleAction(acquiredState,id,'ARCHIVE','',AT),/not allowed/)
 const disposed=disposeAsset(acquiredState,{assetId:id,type:'DONATION',date:'2026-10-30',proceeds:0,costs:0,counterparty:'',reason:'Donation',confirm:'DISPOSE'},AT)
 const archived=lifecycleAction(disposed,id,'ARCHIVE','Preserve record',AT)
 assert.equal(archived.records[0].lifecycle,'ARCHIVED')
 assert.equal(archived.phase2.dispositions.length,1)
 checkError(()=>lifecycleAction(archived,id,'ACTIVATE','',AT),/not allowed/)
})
test('asset lifecycle and ownership changes do not invent Finance OS ledger events',()=>{
 const s=acquired(),id=s.records[0].id
 const newOwner=assignOwnership(s,{assetId:id,dimension:'ECONOMIC',percentage:100,partyRef:'demo',partyLabel:'Demo person',effectiveFrom:'2026-10-16',note:''},AT)
 const d=disposeAsset(newOwner,{assetId:id,type:'SALE',date:'2026-10-30',proceeds:1200,costs:0,counterparty:'Test buyer',reason:'Sale',confirm:'DISPOSE'},AT)
 assert.equal(d.phase2.acquisitions.length,1)
 assert.equal(d.phase2.ownershipChanges.length,1)
 assert.equal(d.phase2.dispositions.length,1)
 assert.ok(!('ledger' in d))
 assert.ok(!('financeTransactions' in d))
})
