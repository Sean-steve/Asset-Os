import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 ValuationCreate,ValuationAccept,FacilityCreate,BalanceObserve,FlowObserve,
 ReferenceCreate,B3_CAPABILITIES,CONTRACT_VERSION
} from '../dist/contracts.js'
import {ratioPercent,requireEffectiveDay} from '../dist/economics.js'
test('B3 money and percentage calculations remain exact, with guarded null denominator',()=>{
 assert.equal(ratioPercent(50000n,100000n),'50.00')
 assert.equal(ratioPercent(-7500n,100000n),'-7.50')
 assert.equal(ratioPercent(0n,0n),null)
 assert.equal(ratioPercent(1n,2n),'50.00')
 assert.throws(()=>requireEffectiveDay('2099-12-31'),/future/)
})
test('B3 valuation contracts reject client-assigned status and invalid inputs',()=>{
 const valid={effectiveOn:'2026-10-30',amount:'1450.25',method:'MANUAL_ESTIMATE',
  confidence:'LOW',sourceLabel:'Owner estimate'}
 assert.equal(ValuationCreate.safeParse(valid).success,true)
 assert.equal(ValuationCreate.safeParse({...valid,status:'ACCEPTED'}).success,false)
 assert.equal(ValuationCreate.safeParse({...valid,amount:1450.25}).success,false)
 assert.equal(ValuationCreate.safeParse({...valid,amount:'1e5'}).success,false)
 assert.equal(ValuationAccept.safeParse({note:'Reviewed',confirm:'ACCEPT_VALUATION'}).success,true)
 assert.equal(ValuationAccept.safeParse({note:'Reviewed',confirm:'yes'}).success,false)
})
test('B3 financing facilities and outstanding snapshots are unverified, amounts exact',()=>{
 const f={financierLabel:'Personal financing claim',originalPrincipal:'10000.00',interestRatePct:'3.7500',
  startedOn:'2026-10-30',frequency:'MONTHLY'}
 assert.equal(FacilityCreate.safeParse(f).success,true)
 assert.equal(FacilityCreate.safeParse({...f,originalPrincipal:-100}).success,false)
 assert.equal(FacilityCreate.safeParse({...f,interestRatePct:'1000.0001'}).success,false)
 assert.equal(FacilityCreate.safeParse({...f,interestRatePct:'1000'}).success,true)
 assert.equal(BalanceObserve.safeParse({observedOn:'2026-10-31',outstanding:'0',sourceLabel:'User'}).success,true)
 assert.equal(BalanceObserve.safeParse({observedOn:'2026-10-31',outstanding:'-2',sourceLabel:'User'}).success,false)
})
test('B3 user flow and reference DTOs reject forged authoritative source fields',()=>{
 const flow={kind:'INCOME',category:'Lease',amount:'200.50',occurredOn:'2026-10-30'}
 assert.equal(FlowObserve.safeParse(flow).success,true)
 assert.equal(FlowObserve.safeParse({...flow,sourceAuthority:'FINANCE_OS_PROJECTION'}).success,false)
 assert.equal(FlowObserve.safeParse({...flow,reconciled:true}).success,false)
 assert.equal(FlowObserve.safeParse({...flow,amount:200.5}).success,false)
 assert.equal(ReferenceCreate.safeParse({flowId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',system:'FINANCE_OS',externalReference:'unverified-abc'}).success,true)
 assert.equal(ReferenceCreate.safeParse({flowId:'not-uuid',system:'BANK',externalReference:'abc'}).success,false)
})
test('B3 versioned OpenAPI advertises only implemented protected commands',()=>{
 const o=JSON.parse(readFileSync(new URL('../openapi/openapi.json',import.meta.url),'utf8'))
 assert.equal(o.info.version,'0.4.0-b3')
 assert.equal(CONTRACT_VERSION,'2026-10-31.b3')
 const endpoints=[
 '/v1/assets/{assetId}/valuations',
 '/v1/assets/{assetId}/valuations/{valuationId}/accept',
 '/v1/assets/{assetId}/financing',
 '/v1/assets/{assetId}/financing/{facilityId}/balances',
 '/v1/assets/{assetId}/cash-flows',
 '/v1/assets/{assetId}/reconciliation-references'
 ]
 for(const path of endpoints){
  const route=o.paths[path].post
  assert.equal(route['x-runtime-status'],'IMPLEMENTED_B3')
  assert.ok(route.parameters.some(p=>p.name==='If-Match'&&p.required))
  assert.ok(route.parameters.some(p=>p.name==='Idempotency-Key'&&p.required))
  assert.deepEqual(route.security,[{KernelBearer:[]}])
 }
 assert.equal(o.paths['/v1/assets/{assetId}/economics'].get['x-runtime-status'],'IMPLEMENTED_B3')
 assert.ok(B3_CAPABILITIES.includes('valuation_draft_accept_supersede'))
 const events=JSON.parse(readFileSync(new URL('../openapi/events.json',import.meta.url),'utf8'))
 assert.equal(events.transport,'NOT_CONFIGURED')
 assert.ok(events.allowedEmissions.some(e=>e.type==='asset.financing.balance.observed.v1'))
 assert.ok(events.allowedEmissions.some(e=>e.type==='asset.valuation.accepted.v1'))
})
