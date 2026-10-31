import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 AcquireRequest,OwnershipAssignment,OwnershipTransfer,DispositionRequest,
 LifecycleCommand,B2_CAPABILITIES,CONTRACT_VERSION
} from '../dist/contracts.js'
import {asCents,money,permittedTransition} from '../dist/lifecycle.js'

test('exact-cent money never uses float; negative/overprecision/scientific forms rejected',()=>{
 assert.equal(asCents('0'),0n)
 assert.equal(asCents('1234.50'),123450n)
 assert.equal(money(asCents('1000000000.99')),'1000000000.99')
 assert.equal(money(-45n),'-0.45')
 for(const value of [-1,'-1.00','1.001','1e4','1.000','01.00']){
  assert.throws(()=>asCents(String(value)),/decimal string/)
 }
})
test('lifecycle state transitions forbid skipping acquisition and reopening disposed assets',()=>{
 assert.equal(permittedTransition('PLANNED','ACQUISITION_PENDING'),true)
 assert.equal(permittedTransition('PLANNED','ACTIVE'),false)
 assert.equal(permittedTransition('ACQUISITION_PENDING','ACQUIRED'),true)
 assert.equal(permittedTransition('ACTIVE','SUSPENDED'),true)
 assert.equal(permittedTransition('SUSPENDED','ACTIVE'),true)
 assert.equal(permittedTransition('DISPOSED','ARCHIVED'),true)
 assert.equal(permittedTransition('ARCHIVED','ACTIVE'),false)
 assert.equal(permittedTransition('DISPOSED','ACTIVE'),false)
})
test('lifecycle contracts reject fabricated direct authority and wrong money types',()=>{
 const base={method:'PURCHASE',effectiveOn:'2026-10-30',costs:{purchase:'150000.25',taxes:'123.45'}}
 assert.equal(AcquireRequest.safeParse(base).success,true)
 assert.equal(AcquireRequest.safeParse({...base,costs:{purchase:150000.25}}).success,false)
 assert.equal(AcquireRequest.safeParse({...base,postedPayment:true}).success,false)
 assert.equal(LifecycleCommand.safeParse({action:'ACTIVATE',reason:'Inspected and ready'}).success,true)
 assert.equal(LifecycleCommand.safeParse({action:'ACTIVE',reason:'Force'}).success,false)
 assert.equal(DispositionRequest.safeParse({kind:'SALE',effectiveOn:'2026-10-30',proceeds:'12.00',costs:'20.00',reason:'Sale confirmed',confirm:'DISPOSE'}).success,true)
 assert.equal(DispositionRequest.safeParse({kind:'SALE',effectiveOn:'2026-10-30',proceeds:'100',costs:'0',reason:'done',confirm:'DISPOSE',financePosted:true}).success,false)
 assert.equal(DispositionRequest.safeParse({kind:'SALE',effectiveOn:'2026-10-30',proceeds:'100',costs:'0',reason:'done',confirm:'yes'}).success,false)
})
test('ownership dimensions reject percentage in legal/control and require positive shares for economic/beneficial',()=>{
 const base={dimension:'ECONOMIC',partyRef:'person:1',partyLabel:'Party one',percentage:'25.25',effectiveOn:'2026-10-30'}
 assert.equal(OwnershipAssignment.safeParse(base).success,true)
 assert.equal(OwnershipAssignment.safeParse({...base,percentage:'0.00'}).success,false)
 assert.equal(OwnershipAssignment.safeParse({...base,percentage:'100.01'}).success,false)
 assert.equal(OwnershipAssignment.safeParse({...base,dimension:'LEGAL',percentage:null}).success,true)
 assert.equal(OwnershipAssignment.safeParse({...base,dimension:'CONTROL',percentage:'50.00'}).success,false)
 assert.equal(OwnershipTransfer.safeParse({sourceInterestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',toPartyRef:'person:2',toPartyLabel:'Party two',percentage:'10.00',effectiveOn:'2026-10-30'}).success,true)
 assert.equal(OwnershipTransfer.safeParse({sourceInterestId:'not-uuid',toPartyRef:'person:2',toPartyLabel:'Party two',percentage:'10.00',effectiveOn:'2026-10-30'}).success,false)
})
test('OpenAPI explicitly implements B2 command, read and ETag contracts but keeps finance/ops deferred',()=>{
 const openapi=JSON.parse(readFileSync(new URL('../openapi/openapi.json',import.meta.url),'utf8'))
 assert.equal(openapi.info.version,'0.3.0-b2')
 assert.ok(openapi.paths['/v1/assets/{assetId}/lifecycle-actions'].post.responses['200'])
 assert.ok(!openapi.paths['/v1/assets/{assetId}/lifecycle-actions'].post.responses['201'])
 assert.equal(openapi.paths['/v1/acquisitions'].get.responses['200'].content['application/json'].schema.$ref,'#/components/schemas/DomainHistoryPage')
 assert.equal(CONTRACT_VERSION,'2026-10-31.b2')
 assert.ok(B2_CAPABILITIES.includes('lifecycle_guarded_transitions'))
 for(const url of ['/v1/assets/{assetId}/lifecycle-actions','/v1/assets/{assetId}/acquisitions',
  '/v1/assets/{assetId}/ownership-interests','/v1/assets/{assetId}/ownership-transfers','/v1/assets/{assetId}/disposition']){
  const op=openapi.paths[url].post
  assert.equal(op['x-runtime-status'],'IMPLEMENTED_B2')
  assert.ok(op.parameters.some(p=>p.name==='If-Match'&&p.required))
  assert.ok(op.parameters.some(p=>p.name==='Idempotency-Key'&&p.required))
  assert.deepEqual(op.security,[{KernelBearer:[]}])
 }
 assert.equal(openapi.paths['/v1/assets/{assetId}/valuations'].post['x-runtime-status'],'NOT_IMPLEMENTED_IN_B0')
 const events=JSON.parse(readFileSync(new URL('../openapi/events.json',import.meta.url),'utf8'))
 assert.equal(events.transport,'NOT_CONFIGURED')
 assert.ok(events.allowedEmissions.some(e=>e.type==='asset.disposition.recorded.v1'))
})
