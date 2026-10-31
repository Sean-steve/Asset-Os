/**
 * Asset OS Phase 5 — portfolio projections, explainable risk and scenario previews.
 * No AI model, forecasting service, Wealth OS decision or financial ledger is connected.
 * Historical values are never synthesized and currencies are never converted implicitly.
 */
import type { RegistryState, AssetRecord, ActivityEntry } from '../registry/core.ts'
import { indicativeEquity, flowsFor, flowSummary, roiSnapshot, latestAccepted } from '../economics/core.ts'
import { operationalEvents } from '../operations/core.ts'

export type Portfolio={id:string;name:string;description:string;currency:string;createdAt:string;archivedAt:string|null}
export type PortfolioMembership={id:string;portfolioId:string;assetId:string;addedAt:string;removedAt:string|null}
export type RiskDimension='MARKET'|'LIQUIDITY'|'CONDITION'|'REGULATORY'|'COUNTERPARTY'
export type RiskScores=Record<RiskDimension,1|2|3|4|5>
export type RiskAssessment={
 id:string;assetId:string;observedOn:string;scores:RiskScores;reason:string;source:string;recordedAt:string
}
export type StressScenario={
 id:string;name:string;portfolioId:string|null;currency:string;valueShockPct:number;
 incomeShockPct:number;expenseShockPct:number;assumptions:string;createdAt:string
}
export type IntelligenceNote={id:string;assetId:string|null;title:string;body:string;recordedAt:string}
export type IntelligenceData={
 portfolios:Portfolio[];memberships:PortfolioMembership[];risks:RiskAssessment[];
 scenarios:StressScenario[];notes:IntelligenceNote[]
}
export const emptyIntelligenceData=():IntelligenceData=>({portfolios:[],memberships:[],risks:[],scenarios:[],notes:[]})
export const validIntelligenceData=(raw:unknown):raw is IntelligenceData=>{
 if(!raw||typeof raw!=='object')return false
 const p=raw as Partial<IntelligenceData>
 return Array.isArray(p.portfolios)&&Array.isArray(p.memberships)&&Array.isArray(p.risks)&&Array.isArray(p.scenarios)&&Array.isArray(p.notes)
}
export const RISK_DIMENSIONS:RiskDimension[]=['MARKET','LIQUIDITY','CONDITION','REGULATORY','COUNTERPARTY']
export const DEFAULT_RISK_SCORES:RiskScores={MARKET:3,LIQUIDITY:3,CONDITION:3,REGULATORY:3,COUNTERPARTY:3}
export const RISK_WEIGHTS:Record<RiskDimension,number>={MARKET:.30,LIQUIDITY:.25,CONDITION:.20,REGULATORY:.15,COUNTERPARTY:.10}
const now=()=>new Date().toISOString()
const uid=()=>globalThis.crypto?.randomUUID?.()||'local-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)
const round=(v:number)=>Math.round(v*100)/100
const cents=(items:number[])=>items.reduce((s,n)=>s+Math.round(n*100),0)/100
const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(new Date(v+'T00:00:00Z').getTime())&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v
function requireDate(v:string,at:string){if(!validDate(v)||v>at.slice(0,10))throw Error('Enter an existing date that is not in the future.')}
function label(v:string,name:string,max=150,mandatory=true){
 if(typeof v!=='string'||v.length>max||(mandatory&&!v.trim()))throw Error(name+' must '+(mandatory?'be entered':'stay within '+max+' characters')+'.')
 return v.trim()
}
const assetOf=(s:RegistryState,id:string)=>{
 const a=s.records.find(a=>a.id===id)
 if(!a)throw Error('Asset not found.')
 return a
}
export const held=(a:AssetRecord)=>['ACQUIRED','ACTIVE','SUSPENDED'].includes(a.lifecycle)
function activity(s:RegistryState,a:AssetRecord|undefined,event:ActivityEntry['event'],details:string,at:string){
 return [{id:uid(),assetId:a?.id||'',assetName:a?.name||'Portfolio',event,details,at},...s.activity].slice(0,500)
}
export type PortfolioInput={name:string;description:string;currency:string}
export function createPortfolio(state:RegistryState,input:PortfolioInput,at=now()):RegistryState{
 const name=label(input.name,'Portfolio name',120),description=label(input.description,'Description',500,false)
 if(!/^[A-Z]{3}$/.test(input.currency))throw Error('Choose an ISO currency.')
 if(state.phase5.portfolios.some(p=>!p.archivedAt&&p.name.toLowerCase()===name.toLowerCase()))throw Error('An active portfolio with this name already exists.')
 const portfolio:Portfolio={id:uid(),name,description,currency:input.currency,createdAt:at,archivedAt:null}
 return {...state,phase5:{...state.phase5,portfolios:[portfolio,...state.phase5.portfolios]},
  activity:activity(state,undefined,'PORTFOLIO_CREATED','Local portfolio '+name+' created.',at)}
}
export function archivePortfolio(state:RegistryState,id:string,at=now()):RegistryState{
 const p=state.phase5.portfolios.find(p=>p.id===id)
 if(!p||p.archivedAt)throw Error('Choose an active portfolio.')
 return {...state,phase5:{...state.phase5,
  portfolios:state.phase5.portfolios.map(x=>x.id===id?{...x,archivedAt:at}:x),
  memberships:state.phase5.memberships.map(m=>m.portfolioId===id&&m.removedAt===null?{...m,removedAt:at}:m)
 },activity:activity(state,undefined,'PORTFOLIO_CHANGED','Portfolio archived; memberships preserved in history.',at)}
}
export function membersFor(s:RegistryState,portfolioId:string):AssetRecord[]{
 const p=s.phase5.portfolios.find(p=>p.id===portfolioId)
 if(!p)return []
 const ids=new Set(s.phase5.memberships.filter(m=>m.portfolioId===portfolioId&&m.removedAt===null).map(m=>m.assetId))
 return s.records.filter(a=>ids.has(a.id))
}
export function addMember(state:RegistryState,portfolioId:string,assetId:string,at=now()):RegistryState{
 const p=state.phase5.portfolios.find(p=>p.id===portfolioId)
 if(!p||p.archivedAt)throw Error('Portfolio must be active.')
 const a=assetOf(state,assetId)
 if(!held(a))throw Error('Only acquired, active and suspended assets may join portfolios.')
 if(p.currency!==a.currency)throw Error('Portfolio and asset currencies must match. No FX conversion is available.')
 if(state.phase5.memberships.some(m=>m.portfolioId===portfolioId&&m.assetId===assetId&&m.removedAt===null))throw Error('Asset is already in this portfolio.')
 const membership:PortfolioMembership={id:uid(),portfolioId,assetId,addedAt:at,removedAt:null}
 return {...state,phase5:{...state.phase5,memberships:[membership,...state.phase5.memberships]},
  activity:activity(state,a,'PORTFOLIO_MEMBERSHIP_CHANGED','Asset added to '+p.name+'; no transfer of ownership.',at)}
}
export function removeMember(state:RegistryState,portfolioId:string,assetId:string,at=now()):RegistryState{
 const membership=state.phase5.memberships.find(m=>m.portfolioId===portfolioId&&m.assetId===assetId&&m.removedAt===null)
 if(!membership)throw Error('Active portfolio membership not found.')
 const a=assetOf(state,assetId)
 return {...state,phase5:{...state.phase5,memberships:state.phase5.memberships.map(m=>m.id===membership.id?{...m,removedAt:at}:m)},
  activity:activity(state,a,'PORTFOLIO_MEMBERSHIP_CHANGED','Asset removed from a portfolio; historical membership preserved.',at)}
}
export function portfolioSnapshot(state:RegistryState,id:string){
 const portfolio=state.phase5.portfolios.find(p=>p.id===id)
 if(!portfolio)throw Error('Portfolio not found.')
 const assets=membersFor(state,id).filter(held)
 const totalValue=cents(assets.map(a=>a.value))
 const unknown=assets.filter(a=>indicativeEquity(state,a.id).method==='UNKNOWN')
 const knownEquity=cents(assets.filter(a=>!unknown.includes(a)).map(a=>indicativeEquity(state,a.id).amount))
 const flow=flowSummary(assets.flatMap(a=>flowsFor(state,a.id)),portfolio.currency)
 const largest=assets.length?Math.max(...assets.map(a=>a.value)):0
 return {portfolio,currency:portfolio.currency,assets,totalValue,knownEquity,
  equityComplete:unknown.length===0,unknownEquityCount:unknown.length,flow,
  largestShare:totalValue>0?round(largest/totalValue*100):null}
}
export type AllocationGroup='CATEGORY'|'LOCATION'|'LIFECYCLE'|'RISK'
export function allocation(assets:AssetRecord[],currency:string,group:AllocationGroup){
 const by=new Map<string,{label:string;count:number;value:number}>()
 const selected=assets.filter(a=>held(a)&&a.currency===currency)
 for(const a of selected){
  const key=group==='CATEGORY'?a.category:group==='LOCATION'?(a.location||'Not recorded'):group==='LIFECYCLE'?a.lifecycle:(a.risk||'UNASSESSED')
  const entry=by.get(key)||{label:key,count:0,value:0}
  entry.count+=1;entry.value=round(entry.value+a.value);by.set(key,entry)
 }
 const total=cents(selected.map(a=>a.value))
 return [...by.values()].map(row=>({...row,share:total>0?round(row.value/total*100):0}))
  .sort((a,b)=>b.value-a.value||a.label.localeCompare(b.label))
}
export function compareAssets(state:RegistryState,ids:string[]){
 const unique=[...new Set(ids)]
 if(unique.length<2||unique.length>4)throw Error('Choose two to four distinct assets to compare.')
 const assets=unique.map(id=>assetOf(state,id))
 const currencies=[...new Set(assets.map(a=>a.currency))]
 return {assets,currencyCompatible:currencies.length===1,currencies,
  items:assets.map(a=>{const roi=roiSnapshot(state,a.id),e=indicativeEquity(state,a.id)
   return {asset:a,equity:e.method==='UNKNOWN'?null:e.amount,equitySource:e.method,
    acquisitionBasis:roi.basis,operatingReturnPct:roi.operatingReturn,capitalReturnPct:roi.capitalReturn,
    acceptedValuation:latestAccepted(state,a.id)?.date||null}
  })}
}
export function latestRisk(state:RegistryState,id:string):RiskAssessment|undefined{
 return state.phase5.risks.filter(r=>r.assetId===id).sort((a,b)=>b.observedOn.localeCompare(a.observedOn)||b.recordedAt.localeCompare(a.recordedAt))[0]
}
export function riskScore(scores:RiskScores):number{
 for(const k of RISK_DIMENSIONS)if(!Number.isInteger(scores[k])||scores[k]<1||scores[k]>5)throw Error('Risk dimensions must be integers from one to five.')
 return round(RISK_DIMENSIONS.reduce((s,k)=>s+((scores[k]-1)/4)*RISK_WEIGHTS[k]*100,0))
}
export function riskBand(score:number):'LOW'|'MODERATE'|'HIGH'|'CRITICAL'{
 return score<25?'LOW':score<50?'MODERATE':score<75?'HIGH':'CRITICAL'
}
export type RiskInput={assetId:string;observedOn:string;scores:RiskScores;reason:string;source:string}
export function assessRisk(state:RegistryState,input:RiskInput,at=now()):RegistryState{
 const a=assetOf(state,input.assetId)
 if(!held(a))throw Error('Risk assessment requires a currently held asset.')
 requireDate(input.observedOn,at)
 const previous=latestRisk(state,a.id)
 if(previous&&input.observedOn<previous.observedOn)throw Error('A new risk assessment cannot predate the latest one.')
 riskScore(input.scores)
 const entry:RiskAssessment={id:uid(),assetId:a.id,observedOn:input.observedOn,scores:{...input.scores},
  reason:label(input.reason,'Risk rationale',600),source:label(input.source,'Assessment source',120),recordedAt:at}
 return {...state,phase5:{...state.phase5,risks:[entry,...state.phase5.risks]},
  activity:activity(state,a,'RISK_ASSESSED','Unverified risk assessment recorded with explainable dimensions.',at)}
}
export type SignalSeverity='INFO'|'WATCH'|'HIGH'
export type PerformanceSignal={id:string;assetId:string;severity:SignalSeverity;kind:string;title:string;reason:string;actionRoute:string}
export function performanceSignals(state:RegistryState,asOf=now().slice(0,10)):PerformanceSignal[]{
 const signals:PerformanceSignal[]=[]
 const push=(id:string,kind:string,severity:SignalSeverity,title:string,reason:string,route:string)=>
  signals.push({id:kind+'-'+id,assetId:id,kind,severity,title,reason,actionRoute:route})
 for(const a of state.records.filter(held)){
  const flow=flowSummary(flowsFor(state,a.id),a.currency)
  if(flow.count>0&&flow.operatingNet<0)push(a.id,'OPERATING_LOSS','HIGH','Negative recorded operating cash flow',
   'Recorded income minus expenses equals '+flow.operatingNet+' '+a.currency+'. Financing flows excluded.','cash-flow?asset='+encodeURIComponent(a.id))
  const acquisition=state.phase2.acquisitions.find(x=>x.assetId===a.id)
  const reviewed=latestAccepted(state,a.id)
  if(acquisition&&reviewed&&reviewed.amount<acquisition.costBasis)push(a.id,'BELOW_COST','WATCH','Accepted value below recorded acquisition cost',
   'Local reviewed valuation '+reviewed.amount+' '+a.currency+' is below acquisition cost '+acquisition.costBasis+' '+a.currency+'.','valuation-history?asset='+encodeURIComponent(a.id))
  if(reviewed){
   const age=Math.floor((new Date(asOf+'T00:00:00Z').getTime()-new Date(reviewed.date+'T00:00:00Z').getTime())/86400000)
   if(age>365)push(a.id,'STALE_VALUATION','WATCH','Locally accepted valuation is over one year old',
    'Most recent accepted effective date is '+reviewed.date+' ('+age+' days ago).','valuation-history?asset='+encodeURIComponent(a.id))
  }
  const risk=latestRisk(state,a.id)
  if(risk&&riskScore(risk.scores)>=75)push(a.id,'HIGH_RISK','HIGH','High self-reported risk assessment',
   'Weighted score '+riskScore(risk.scores)+' / 100 was provided by the user. Not independently validated.','risk/'+encodeURIComponent(a.id))
  const dues=operationalEvents(state).filter(e=>e.assetId===a.id&&e.kind==='MAINTENANCE_DUE'&&e.date<asOf)
  if(dues.length)push(a.id,'OVERDUE_MAINTENANCE','WATCH','Recorded maintenance overdue',
   dues.length+' active maintenance plan due date(s) are earlier than '+asOf+'.','maintenance/plans')
 }
 return signals.sort((x,y)=>(x.severity==='HIGH'?0:x.severity==='WATCH'?1:2)-(y.severity==='HIGH'?0:y.severity==='WATCH'?1:2)||x.title.localeCompare(y.title))
}
export type ScenarioInput={name:string;portfolioId:string|null;currency:string;valueShockPct:number;incomeShockPct:number;expenseShockPct:number;assumptions:string}
export function calculateScenario(state:RegistryState,input:ScenarioInput){
 if(!/^[A-Z]{3}$/.test(input.currency))throw Error('Choose an ISO currency for the scenario.')
 for(const [n,v] of [['Value',input.valueShockPct],['Income',input.incomeShockPct],['Expense',input.expenseShockPct]] as const){
  if(!Number.isFinite(v)||v< -100||v>300||Math.abs(Math.round(v*100)-v*100)>1e-5)throw Error(n+' shock must be between -100% and +300%, with up to two decimal places.')
 }
 if(input.portfolioId){
  const p=state.phase5.portfolios.find(p=>p.id===input.portfolioId&&!p.archivedAt)
  if(!p)throw Error('Choose an active portfolio.')
  if(p.currency!==input.currency)throw Error('Scenario currency must match the portfolio.')
 }
 const assets=input.portfolioId?membersFor(state,input.portfolioId).filter(held):state.records.filter(a=>held(a)&&a.currency===input.currency)
 const total=cents(assets.map(a=>a.value))
 const flow=flowSummary(assets.flatMap(a=>flowsFor(state,a.id)),input.currency)
 const stressedValue=round(total*(1+input.valueShockPct/100))
 const stressedIncome=round(flow.INCOME*(1+input.incomeShockPct/100))
 const stressedExpenses=round(flow.EXPENSE*(1+input.expenseShockPct/100))
 return {assets,assetCount:assets.length,currency:input.currency,
  baseValue:total,stressedValue,valueChange:round(stressedValue-total),
  baseOperatingNet:flow.operatingNet,stressedOperatingNet:round(stressedIncome-stressedExpenses),
  operatingNetChange:round(stressedIncome-stressedExpenses-flow.operatingNet),
  baseIncome:flow.INCOME,baseExpenses:flow.EXPENSE,stressedIncome,stressedExpenses,
  observationCount:flow.count,method:'DETERMINISTIC_ONE_PERIOD_SENSITIVITY' as const}
}
export function saveScenario(state:RegistryState,input:ScenarioInput,at=now()):RegistryState{
 label(input.name,'Scenario name',120);label(input.assumptions,'Assumptions',500,false)
 calculateScenario(state,input)
 const scenario:StressScenario={...input,name:input.name.trim(),assumptions:input.assumptions.trim(),id:uid(),createdAt:at}
 return {...state,phase5:{...state.phase5,scenarios:[scenario,...state.phase5.scenarios]},
  activity:activity(state,undefined,'SCENARIO_SAVED','Local sensitivity assumptions saved, not a financial forecast.',at)}
}
export function appendIntelligenceNote(state:RegistryState,input:{assetId:string|null;title:string;body:string},at=now()):RegistryState{
 const a=input.assetId?assetOf(state,input.assetId):undefined
 const note:IntelligenceNote={id:uid(),assetId:input.assetId,title:label(input.title,'Note title',120),body:label(input.body,'Note text',1000),recordedAt:at}
 return {...state,phase5:{...state.phase5,notes:[note,...state.phase5.notes]},
  activity:activity(state,a,'INTELLIGENCE_NOTE_SAVED','Local, user-approved intelligence note saved; no action executed.',at)}
}
export type Insight={id:string;title:string;detail:string;severity:SignalSeverity;assetId:string|null;route:string;basis:string}
export function explainableInsights(state:RegistryState):Insight[]{
 const signals=performanceSignals(state)
 const insights:Insight[]=signals.map(s=>({id:s.id,title:s.title,detail:s.reason,severity:s.severity,
  assetId:s.assetId,route:s.actionRoute,basis:'Deterministic rule from browser-entered records'}))
 for(const p of state.phase5.portfolios.filter(p=>!p.archivedAt)){
  const s=portfolioSnapshot(state,p.id)
  if(s.largestShare!==null&&s.largestShare>=60&&s.assets.length>=2)insights.push({
   id:'CONCENTRATION-'+p.id,title:'Concentration in '+p.name,detail:'Largest asset accounts for '+s.largestShare+'% of this '+p.currency+' portfolio, above the illustrative 60% review threshold.',
   severity:'WATCH',assetId:null,route:'portfolio/'+encodeURIComponent(p.id),basis:'Illustrative concentration threshold; not investment advice'
  })
 }
 return insights
}
export function assistantAnswer(state:RegistryState,question:string):{text:string;route:string;source:string}{
 const q=question.toLowerCase().trim()
 if(!q)return {text:'Ask about your portfolio, risk, returns or valuations. This is a rules-based explainer, not a connected AI model.',route:'portfolios',source:'Guided help'}
 if(/risk|expos|concentrat/.test(q)){
  const insights=explainableInsights(state).filter(i=>/risk|concentrat|maintenance/i.test(i.title+i.detail))
  return {text:insights.length?insights.slice(0,3).map(i=>i.title+': '+i.detail).join('\n'):'No current rule-generated risk or concentration signals. This does not establish that assets are safe; most risks need an explicit assessment.',
   route:'risk-center',source:'Local assessments, portfolio concentration and operational dates'}
 }
 if(/perform|return|profit|loss|underperform/.test(q)){
  const loss=performanceSignals(state).filter(s=>s.kind==='OPERATING_LOSS'||s.kind==='BELOW_COST')
  return {text:loss.length?loss.slice(0,3).map(s=>assetOf(state,s.assetId).name+': '+s.reason).join('\n'):'No qualifying loss indicators from available records. Missing histories and cost basis cannot be interpreted as positive returns.',
   route:'underperforming',source:'Entered income, expenses, cost basis and reviewed valuations'}
 }
 if(/scenario|forecast|if |shock|stress/.test(q))return {text:'Scenario analysis applies one-time percentage shocks to current recorded asset values, and separately shocks income and expenses for the same observed period. It does not estimate probabilities, future prices or economic forecasts.',
  route:'scenarios',source:'Transparent one-period sensitivity formulas'}
 if(/valu|worth|equity/.test(q)){
  const count=state.records.filter(a=>held(a)&&latestAccepted(state,a.id)).length
  return {text:count+' currently held asset(s) have a locally accepted valuation. Other registry values are unverified starting estimates. Indicative equity may remain unknown if financing balance observations are incomplete.',
   route:'valuations',source:'Local valuation acceptance flags and observed debt'}
 }
 if(/portfolio|allocat|asset/.test(q))return {text:state.phase5.portfolios.filter(p=>!p.archivedAt).length+' portfolio(s) recorded. Create a same-currency portfolio, add held assets, then inspect category/location concentration. An asset may belong to multiple portfolios; do not add portfolio totals together.',
  route:'portfolios',source:'Local portfolio membership records'}
 return {text:'I can explain current portfolio allocation, risk flags, operating performance, valuations and sensitivity scenarios from recorded browser data. I cannot access accounts or give personalized buy/sell instructions.',
  route:'performance',source:'Static rules; no AI model or live data connection'}
}
