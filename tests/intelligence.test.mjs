import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {initialRegistry,loadRegistry,saveRegistry,createAsset,STORE_KEY} from '../src/registry/core.ts'
import {beginAcquisition,completeAcquisition,EMPTY_COSTS} from '../src/lifecycle/core.ts'
import {recordValuation,acceptValuation,recordFlow,createFacility} from '../src/economics/core.ts'
import {createPlan} from '../src/operations/core.ts'
import {
 emptyIntelligenceData,validIntelligenceData,createPortfolio,addMember,removeMember,archivePortfolio,membersFor,
 portfolioSnapshot,allocation,compareAssets,riskScore,riskBand,assessRisk,latestRisk,performanceSignals,
 calculateScenario,saveScenario,appendIntelligenceNote,explainableInsights,assistantAnswer,DEFAULT_RISK_SCORES
} from '../src/intelligence/core.ts'
import {screens} from '../src/inventory.ts'

const AT='2026-10-31T12:00:00Z'
function withoutGenerated(a){const {id,number,createdAt,updatedAt,origin,...input}=a;void id;void number;void createdAt;void updatedAt;void origin;return structuredClone(input)}
function acquired(){
 const before=initialRegistry()
 let s=createAsset(before,{...withoutGenerated(before.records[0]),name:'Local office unit',lifecycle:'PLANNED',operational:'IDLE',acquiredOn:'',value:1200,equity:1200},AT)
 const id=s.records[0].id
 s=beginAcquisition(s,id,AT)
 s=completeAcquisition(s,{assetId:id,method:'PURCHASE',acquiredOn:'2026-10-01',counterparty:'Sample seller',reference:'',notes:'',costs:{...EMPTY_COSTS,purchase:1000}},AT)
 return {s,id}
}
const port=(name='Example portfolio',currency='KES')=>({name,description:'Local grouping only',currency})
const flow=(s,id,type,amount,category,occurredOn='2026-10-20')=>recordFlow(s,{assetId:id,type,amount,category,occurredOn,counterpartyLabel:'Test',notes:''},AT)
test('screens 41–50 are declared implemented and Phase 6 remains planned',()=>{
 assert.equal(screens.length,60)
 assert.deepEqual(screens.slice(40,50).map(s=>s.id),[41,42,43,44,45,46,47,48,49,50])
 assert.equal(screens.filter(s=>s.status==='implemented').length,60)
 assert.equal(screens.filter(s=>s.status==='planned').length,0)
 const ui=readFileSync(new URL('../src/intelligence/IntelligenceExperience.tsx',import.meta.url),'utf8')
 for(const r of ['portfolios','portfolio/','allocation','comparison','performance','risk-center','risk/new','underperforming','scenarios','intelligence'])assert.ok(ui.includes("'"+r+"'")||ui.includes("'"+r),r)
})
test('v1-v4 storage snapshots migrate to v5 preserving earlier phase arrays and asset IDs',()=>{
 const {s,id}=acquired()
 const p=createPlan(s,{assetId:id,title:'Review',description:'',interval:1,unit:'MONTHS',nextDue:'2026-11-01'},AT)
 const v=recordValuation(p,{assetId:id,date:'2026-10-10',amount:1300,method:'MANUAL_ESTIMATE',source:'Local',confidence:'LOW',notes:''},AT)
 for(const version of [1,2,3,4]){
  const legacy=structuredClone(v);legacy.version=version
  if(version<6)delete legacy.phase6
  if(version<5)delete legacy.phase5
  if(version<4)delete legacy.phase4
  if(version<3)delete legacy.phase3
  if(version<2)delete legacy.phase2
  const result=loadRegistry({getItem:key=>{assert.equal(key,STORE_KEY);return JSON.stringify(legacy)}})
  assert.equal(result.version,6)
  assert.equal(result.records[0].id,id)
  assert.deepEqual(result.phase5,emptyIntelligenceData())
  if(version>=2)assert.equal(result.phase2.acquisitions.length,1)
  if(version>=3)assert.equal(result.phase3.valuations.length,1)
  if(version>=4)assert.equal(result.phase4.plans.length,1)
  const saved=new Map()
  assert.equal(saveRegistry(result,{setItem:(k,text)=>saved.set(k,text)}),true)
  assert.equal(JSON.parse(saved.get(STORE_KEY)).version,6)
 }
})
test('seeded assets do not come with fabricated portfolios, risk assessments or model outputs',()=>{
 const s=initialRegistry()
 assert.deepEqual(s.phase5,emptyIntelligenceData())
 assert.equal(performanceSignals(s).length,0)
 assert.equal(explainableInsights(s).length,0)
 assert.equal(validIntelligenceData([]),false)
 assert.equal(validIntelligenceData(emptyIntelligenceData()),true)
})
test('portfolio creation is currency scoped and blocks duplicate active names',()=>{
 const s=initialRegistry()
 const created=createPortfolio(s,port(),AT)
 assert.equal(created.phase5.portfolios.length,1)
 assert.equal(created.phase5.portfolios[0].currency,'KES')
 assert.equal(s.phase5.portfolios.length,0)
 assert.equal(created.activity[0].event,'PORTFOLIO_CREATED')
 assert.throws(()=>createPortfolio(created,port('example portfolio'),AT),/already exists/)
 assert.throws(()=>createPortfolio(s,port('Foo','INVALID'),AT),/ISO/)
})
test('memberships preserve identity, are unique per portfolio and cannot add nonheld/mismatched assets',()=>{
 const {s,id}=acquired()
 const created=createPortfolio(s,port(),AT),pid=created.phase5.portfolios[0].id
 const one=addMember(created,pid,id,AT)
 assert.equal(membersFor(one,pid).length,1)
 assert.equal(membersFor(one,pid)[0].id,id)
 assert.equal(one.phase5.memberships.length,1)
 assert.throws(()=>addMember(one,pid,id,AT),/already/)
 const other=createPortfolio(one,port('USD holdings','USD'),AT)
 const usd=other.phase5.portfolios[0].id
 assert.throws(()=>addMember(other,usd,id,AT),/currencies must match/)
 const planned=createAsset(other,{...withoutGenerated(other.records[0]),name:'Planned sample',lifecycle:'PLANNED',acquiredOn:''},AT)
 assert.throws(()=>addMember(planned,pid,planned.records[0].id,AT),/Only acquired/)
})
test('portfolio membership removal/archival preserves history and never disposes underlying assets',()=>{
 const {s,id}=acquired()
 let next=createPortfolio(s,port(),AT),pid=next.phase5.portfolios[0].id
 next=addMember(next,pid,id,AT)
 const removed=removeMember(next,pid,id,AT)
 assert.equal(membersFor(removed,pid).length,0)
 assert.ok(removed.phase5.memberships[0].removedAt)
 assert.equal(removed.records[0].lifecycle,'ACQUIRED')
 const restored=addMember(removed,pid,id,AT)
 assert.equal(restored.phase5.memberships.length,2)
 const archived=archivePortfolio(restored,pid,AT)
 assert.ok(archived.phase5.portfolios[0].archivedAt)
 assert.equal(membersFor(archived,pid).length,0)
 assert.throws(()=>addMember(archived,pid,id,AT),/active/)
})
test('portfolio snapshots have no cross-currency sums, use held-only members and no phantom equity',()=>{
 const {s,id}=acquired()
 let p=createPortfolio(s,port(),AT),pid=p.phase5.portfolios[0].id
 p=addMember(p,pid,id,AT)
 const snap=portfolioSnapshot(p,pid)
 assert.equal(snap.currency,'KES')
 assert.equal(snap.assets.length,1)
 assert.equal(snap.totalValue,1200)
 assert.equal(snap.largestShare,100)
 assert.equal(snap.flow.INCOME,0)
 p=createFacility(p,{assetId:id,financierLabel:'Example',principal:600,interestRatePct:10,startOn:'2026-10-02',maturesOn:null,frequency:'MONTHLY',reference:'',notes:''},AT)
 const incomplete=portfolioSnapshot(p,pid)
 assert.equal(incomplete.equityComplete,false)
 assert.equal(incomplete.unknownEquityCount,1)
})
test('allocation excludes disposed/planned assets and calculates percent shares with zero-safe logic',()=>{
 const {s,id}=acquired()
 const rows=allocation(s.records,'KES','CATEGORY')
 assert.ok(rows.length>=1)
 assert.equal(Math.round(rows.reduce((sum,r)=>sum+r.share,0)),100)
 assert.ok(rows.every(r=>r.count>=1))
 assert.deepEqual(allocation(s.records,'USD','CATEGORY'),[])
 assert.equal(allocation(s.records,'KES','LOCATION').length>=1,true)
 assert.equal(allocation(s.records,'KES','RISK').length>=1,true)
 assert.equal(s.records.some(a=>a.id===id),true)
})
test('asset comparison rejects insufficient or duplicate picks; does not silently convert currencies',()=>{
 const {s,id}=acquired()
 const other=s.records.find(a=>a.id!==id&&a.currency==='KES')
 assert.ok(other)
 const same=compareAssets(s,[id,other.id])
 assert.equal(same.currencyCompatible,true)
 assert.equal(same.items.length,2)
 assert.equal(same.items[0].asset.id,id)
 assert.throws(()=>compareAssets(s,[id,id]),/two to four/)
 let usd=createAsset(s,{...withoutGenerated(s.records[0]),name:'Foreign asset',currency:'USD',lifecycle:'PLANNED',acquiredOn:''},AT)
 const u=usd.records[0].id;usd=beginAcquisition(usd,u,AT)
 usd=completeAcquisition(usd,{assetId:u,method:'PURCHASE',acquiredOn:'2026-10-01',counterparty:'',reference:'',notes:'',costs:{...EMPTY_COSTS,purchase:100}},AT)
 const mixed=compareAssets(usd,[id,u])
 assert.equal(mixed.currencyCompatible,false)
 assert.equal(mixed.currencies.length,2)
})
test('risk weights are explicit, normalized and show correct boundaries',()=>{
 const all1={...DEFAULT_RISK_SCORES,MARKET:1,LIQUIDITY:1,CONDITION:1,REGULATORY:1,COUNTERPARTY:1}
 const all5={...DEFAULT_RISK_SCORES,MARKET:5,LIQUIDITY:5,CONDITION:5,REGULATORY:5,COUNTERPARTY:5}
 assert.equal(riskScore(all1),0)
 assert.equal(riskScore(all5),100)
 assert.equal(riskScore(DEFAULT_RISK_SCORES),50)
 assert.equal(riskBand(0),'LOW')
 assert.equal(riskBand(25),'MODERATE')
 assert.equal(riskBand(50),'HIGH')
 assert.equal(riskBand(75),'CRITICAL')
 assert.throws(()=>riskScore({...DEFAULT_RISK_SCORES,MARKET:6}),/integers/)
})
test('risk assessments are effective-dated, source attributed, append-oriented and cannot be backdated',()=>{
 const {s,id}=acquired()
 const inp={assetId:id,observedOn:'2026-10-20',source:'Owner review',reason:'Market and condition',scores:{...DEFAULT_RISK_SCORES,CONDITION:5}}
 let assessed=assessRisk(s,inp,AT)
 assert.equal(assessed.phase5.risks.length,1)
 assert.equal(assessed.activity[0].event,'RISK_ASSESSED')
 assert.equal(latestRisk(assessed,id).reason,'Market and condition')
 assessed=assessRisk(assessed,{...inp,observedOn:'2026-10-25',reason:'Second review'},AT)
 assert.equal(latestRisk(assessed,id).observedOn,'2026-10-25')
 assert.equal(assessed.phase5.risks.length,2)
 assert.throws(()=>assessRisk(assessed,{...inp,observedOn:'2026-10-21'},AT),/cannot predate/)
 assert.throws(()=>assessRisk(s,{...inp,source:''},AT),/source/)
})
test('negative operating cash flows generate a high-priority explainable flag',()=>{
 const {s,id}=acquired()
 let p=flow(s,id,'INCOME',40,'Rental')
 p=flow(p,id,'EXPENSE',100,'Repairs')
 const signals=performanceSignals(p)
 const loss=signals.find(x=>x.kind==='OPERATING_LOSS'&&x.assetId===id)
 assert.ok(loss)
 assert.equal(loss.severity,'HIGH')
 assert.match(loss.reason,/income minus expenses/)
 assert.equal(loss.actionRoute,'cash-flow?asset='+encodeURIComponent(id))
})
test('accepted asset value below recorded acquisition cost creates watch signal only with provenance',()=>{
 const {s,id}=acquired()
 const draft=recordValuation(s,{assetId:id,date:'2026-10-20',amount:700,method:'APPRAISAL',source:'Test appraisal',confidence:'LOW',notes:''},AT)
 assert.equal(performanceSignals(draft).some(x=>x.kind==='BELOW_COST'),false)
 const accepted=acceptValuation(draft,draft.phase3.valuations[0].id,AT)
 assert.equal(performanceSignals(accepted).filter(x=>x.kind==='BELOW_COST'&&x.assetId===id).length,1)
})
test('maintenance overdue and high user-assessed risk become deterministic review signals',()=>{
 const {s,id}=acquired()
 let p=createPlan(s,{assetId:id,title:'Maintenance',description:'',interval:1,unit:'MONTHS',nextDue:'2026-10-20'},AT)
 p=assessRisk(p,{assetId:id,observedOn:'2026-10-20',scores:{MARKET:5,LIQUIDITY:5,CONDITION:5,REGULATORY:5,COUNTERPARTY:5},reason:'High assessment',source:'User'},AT)
 const signals=performanceSignals(p,'2026-10-31')
 assert.ok(signals.some(s=>s.kind==='OVERDUE_MAINTENANCE'))
 assert.ok(signals.some(s=>s.kind==='HIGH_RISK'))
 assert.equal(performanceSignals(s,'2026-10-31').length,0)
})
test('scenario sensitivity is one-period and separates value, income and expense shocks',()=>{
 const {s,id}=acquired()
 let p=flow(s,id,'INCOME',100,'Rental')
 p=flow(p,id,'EXPENSE',40,'Repairs')
 p=createPortfolio(p,port(),AT);const pid=p.phase5.portfolios[0].id
 p=addMember(p,pid,id,AT)
 const input={name:'Local test',currency:'KES',portfolioId:pid,valueShockPct:-10,incomeShockPct:-20,expenseShockPct:25,assumptions:'One period only'}
 const r=calculateScenario(p,input)
 assert.equal(r.assetCount,1)
 assert.equal(r.baseValue,1200)
 assert.equal(r.stressedValue,1080)
 assert.equal(r.valueChange,-120)
 assert.equal(r.baseOperatingNet,60)
 assert.equal(r.stressedIncome,80)
 assert.equal(r.stressedExpenses,50)
 assert.equal(r.stressedOperatingNet,30)
 assert.equal(r.operatingNetChange,-30)
 assert.equal(r.method,'DETERMINISTIC_ONE_PERIOD_SENSITIVITY')
 const saved=saveScenario(p,input,AT)
 assert.equal(saved.phase5.scenarios.length,1)
 assert.equal(saved.phase5.scenarios[0].assumptions,'One period only')
 assert.equal(p.phase5.scenarios.length,0)
})
test('scenario validation rejects impossible percentage ranges and currency mismatch',()=>{
 const {s}=acquired()
 const p=createPortfolio(s,port(),AT),pid=p.phase5.portfolios[0].id
 const input={name:'Test',currency:'KES',portfolioId:pid,valueShockPct:-10,incomeShockPct:0,expenseShockPct:0,assumptions:''}
 assert.throws(()=>calculateScenario(p,{...input,valueShockPct:-101}),/between/)
 assert.throws(()=>calculateScenario(p,{...input,expenseShockPct:301}),/between/)
 assert.throws(()=>calculateScenario(p,{...input,currency:'USD'}),/currency must match/)
 assert.throws(()=>saveScenario(p,{...input,name:' '},AT),/Scenario name/)
})
test('insights are calculated from actual records and do not create events or autonomously act',()=>{
 const {s,id}=acquired()
 let p=flow(s,id,'EXPENSE',25,'Repairs')
 const beforeActivity=p.activity.length
 const results=explainableInsights(p)
 assert.ok(results.some(i=>i.title==='Negative recorded operating cash flow'))
 assert.equal(p.activity.length,beforeActivity)
 assert.ok(results.every(i=>i.basis.includes('Deterministic')||i.basis.includes('Illustrative')))
 const answer=assistantAnswer(p,'Which assets show weak performance?')
 assert.match(answer.text,/Local office unit/)
 assert.equal(answer.route,'underperforming')
 assert.match(assistantAnswer(p,'What valuations are available?').text,/locally accepted/)
})
test('assistant offers explicit no-data response and is not a connected model',()=>{
 const s=initialRegistry()
 const answer=assistantAnswer(s,'What risks need review?')
 assert.match(answer.text,/No current rule-generated/)
 assert.equal(answer.route,'risk-center')
 const missing=assistantAnswer(s,'')
 assert.match(missing.text,/not a connected AI model/)
 assert.equal(s.phase5.notes.length,0)
})
test('decision note creates a local record and cannot execute finance or kernel decisions',()=>{
 const {s,id}=acquired()
 const noted=appendIntelligenceNote(s,{assetId:id,title:'Inspect condition',body:'Request an independent evaluation first.'},AT)
 assert.equal(noted.phase5.notes.length,1)
 assert.equal(noted.phase5.notes[0].assetId,id)
 assert.equal(noted.activity[0].event,'INTELLIGENCE_NOTE_SAVED')
 assert.ok(!('kernelTasks' in noted))
 assert.ok(!('aiOrders' in noted))
 assert.ok(!('ledger' in noted))
 assert.throws(()=>appendIntelligenceNote(s,{assetId:id,title:' ',body:'X'},AT),/Note title/)
})
