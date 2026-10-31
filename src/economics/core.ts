/**
 * Asset OS Phase 3 — strictly browser-local, non-authoritative economic records.
 * Finance OS remains the source of truth for payments, banking and accounting.
 * No FX conversion, posted ledger, bank verification or tax calculation occurs.
 */
import type { RegistryState, AssetRecord, ActivityEntry } from '../registry/core'

export type ValuationMethod='MARKET_COMPARABLES'|'INCOME_APPROACH'|'COST_APPROACH'|'BROKER_STATEMENT'|'APPRAISAL'|'MANUAL_ESTIMATE'
export type ValuationConfidence='LOW'|'MEDIUM'|'HIGH'
export type ValuationStatus='DRAFT'|'ACCEPTED'|'SUPERSEDED'
export type AssetValuation={
  id:string;assetId:string;date:string;amount:number;currency:string;
  method:ValuationMethod;source:string;confidence:ValuationConfidence;notes:string;
  status:ValuationStatus;recordedAt:string;acceptedAt:string|null;supersedesId:string|null
}
export type FinancingFacility={
  id:string;assetId:string;financierLabel:string;principal:number;currency:string;
  interestRatePct:number;startOn:string;maturesOn:string|null;frequency:'MONTHLY'|'QUARTERLY'|'ANNUALLY'|'OTHER';
  reference:string;notes:string;recordedAt:string
}
export type BalanceObservation={
  id:string;facilityId:string;assetId:string;observedOn:string;balance:number;
  currency:string;sourceLabel:string;notes:string;recordedAt:string
}
export type FlowType='INCOME'|'EXPENSE'|'CAPEX'|'FINANCING_INFLOW'|'FINANCING_OUTFLOW'
export type AssetFlow={
  id:string;assetId:string;type:FlowType;category:string;amount:number;currency:string;
  occurredOn:string;counterpartyLabel:string;notes:string;recordedAt:string
}
export type ReconciliationReference={
  id:string;flowId:string;assetId:string;system:'FINANCE_OS'|'BANK'|'OTHER';
  reference:string;note:string;recordedAt:string
}
export type FinanceData={
  valuations:AssetValuation[]
  facilities:FinancingFacility[]
  balances:BalanceObservation[]
  flows:AssetFlow[]
  references:ReconciliationReference[]
}
export const emptyFinanceData=():FinanceData=>({valuations:[],facilities:[],balances:[],flows:[],references:[]})
export function validFinanceData(value:unknown):value is FinanceData{
  if(!value||typeof value!=='object')return false
  const p=value as Partial<FinanceData>
  return Array.isArray(p.valuations)&&Array.isArray(p.facilities)&&Array.isArray(p.balances)&&Array.isArray(p.flows)&&Array.isArray(p.references)
}
export const VALUATION_METHODS:ValuationMethod[]=['MARKET_COMPARABLES','INCOME_APPROACH','COST_APPROACH','BROKER_STATEMENT','APPRAISAL','MANUAL_ESTIMATE']
export const FLOW_TYPES:FlowType[]=['INCOME','EXPENSE','CAPEX','FINANCING_INFLOW','FINANCING_OUTFLOW']
export const FLOW_CATEGORIES:Record<FlowType,string[]>={
  INCOME:['Rental','Interest','Dividend','Service revenue','Royalty','Other income'],
  EXPENSE:['Repairs','Insurance','Operating costs','Utilities','Fees','Other expense'],
  CAPEX:['Upgrade','Improvement','Replacement','Other capital outlay'],
  FINANCING_INFLOW:['New borrowing','Refinancing proceeds','Other financing inflow'],
  FINANCING_OUTFLOW:['Loan repayment','Finance fees','Other financing outflow'],
}
const now=()=>new Date().toISOString()
const uuid=()=>globalThis.crypto?.randomUUID?.()||'local-'+Date.now()+'-'+Math.random().toString(36).slice(2)
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T
function dateOK(s:string):boolean{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false
 const d=new Date(s+'T00:00:00Z')
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s
}
function checkDate(value:string,asAt:string){if(!dateOK(value)||value>asAt.slice(0,10))throw Error('Choose a valid date that is not in the future.')}
function checkAmount(value:number,name:string,positive=false){
 if(!Number.isFinite(value)||value<0||(positive&&value===0)||value>1e14||Math.abs(Math.round(value*100)-value*100)>1e-6)
  throw Error(name+' must be '+(positive?'a positive':'a non-negative')+' amount with up to two decimals.')
}
function checkRate(value:number){if(!Number.isFinite(value)||value<0||value>1000||Math.abs(Math.round(value*100)-value*100)>1e-6)throw Error('Interest rate must be between 0 and 1,000%.')}
function textField(value:string,name:string,max=160,required=false):string{
 if(typeof value!=='string'||value.length>max||required&&!value.trim())throw Error(name+' must be '+(required?'provided':'within '+max+' characters')+'.')
 return value.trim()
}
function getAsset(state:RegistryState,id:string):AssetRecord{
 const a=state.records.find(r=>r.id===id)
 if(!a)throw Error('Asset not found.')
 return a
}
function allowedLive(asset:AssetRecord,operation:string){
 if(!['ACQUIRED','ACTIVE','SUSPENDED'].includes(asset.lifecycle))throw Error(operation+' requires an acquired, active or suspended asset.')
}
function activity(state:RegistryState,asset:AssetRecord,type:ActivityEntry['event'],details:string,at:string):ActivityEntry[]{
 return [{id:uuid(),assetId:asset.id,assetName:asset.name,event:type,details,at},...state.activity].slice(0,500)
}
function round(value:number){return Math.round(value*100)/100}
const amountTotal=(n:number[])=>n.reduce((sum,x)=>sum+Math.round(x*100),0)/100

export type ValuationInput=Pick<AssetValuation,'assetId'|'date'|'amount'|'method'|'source'|'confidence'|'notes'>
export function recordValuation(state:RegistryState,input:ValuationInput,at=now()):RegistryState{
 const a=getAsset(state,input.assetId)
 allowedLive(a,'Valuation')
 checkDate(input.date,at);checkAmount(input.amount,'Valuation',true)
 if(!VALUATION_METHODS.includes(input.method))throw Error('Invalid valuation method.')
 if(!(['LOW','MEDIUM','HIGH'] as string[]).includes(input.confidence))throw Error('Invalid valuation confidence.')
 const source=textField(input.source,'Source',140,true),notes=textField(input.notes,'Notes',500)
 const valuation:AssetValuation={id:uuid(),assetId:a.id,date:input.date,amount:input.amount,currency:a.currency,
  method:input.method,source,confidence:input.confidence,notes,status:'DRAFT',
  recordedAt:at,acceptedAt:null,supersedesId:null}
 return {...state,phase3:{...state.phase3,valuations:[valuation,...state.phase3.valuations]},
  activity:activity(state,a,'VALUATION_RECORDED','Draft valuation '+input.amount+' '+a.currency+' entered. Not accepted.',at)}
}
export function latestAccepted(state:RegistryState,assetId:string):AssetValuation|undefined{
 return state.phase3.valuations.filter(v=>v.assetId===assetId&&v.status==='ACCEPTED')
  .sort((a,b)=>b.date.localeCompare(a.date)||b.recordedAt.localeCompare(a.recordedAt))[0]
}
export function acceptValuation(state:RegistryState,id:string,at=now()):RegistryState{
 const valuation=state.phase3.valuations.find(v=>v.id===id)
 if(!valuation||valuation.status!=='DRAFT')throw Error('Select a draft valuation.')
 const asset=getAsset(state,valuation.assetId)
 allowedLive(asset,'Valuation acceptance')
 const existing=latestAccepted(state,asset.id)
 if(existing&&valuation.date<existing.date)throw Error('Cannot accept a valuation older than the current accepted valuation.')
 const updated=state.phase3.valuations.map(v=>v.id===id?{...v,status:'ACCEPTED' as const,acceptedAt:at,supersedesId:existing?.id||null}:existing&&v.id===existing.id?{...v,status:'SUPERSEDED' as const}:v)
 return {...state,phase3:{...state.phase3,valuations:updated},
  records:state.records.map(a=>a.id===asset.id?{...a,value:valuation.amount,valuationAsOf:valuation.date,updatedAt:at}:a),
  activity:activity(state,asset,'VALUATION_ACCEPTED','Locally accepted valuation '+valuation.amount+' '+asset.currency+'; prior valuation retained.',at)}
}
export function valuationsFor(state:RegistryState,assetId:string):AssetValuation[]{
 return state.phase3.valuations.filter(v=>v.assetId===assetId).sort((a,b)=>b.date.localeCompare(a.date)||b.recordedAt.localeCompare(a.recordedAt))
}
export type FinancingInput=Pick<FinancingFacility,'assetId'|'financierLabel'|'principal'|'interestRatePct'|'startOn'|'maturesOn'|'frequency'|'reference'|'notes'>
export function createFacility(state:RegistryState,input:FinancingInput,at=now()):RegistryState{
 const a=getAsset(state,input.assetId);allowedLive(a,'Financing')
 checkAmount(input.principal,'Principal',true);checkRate(input.interestRatePct)
 checkDate(input.startOn,at)
 if(input.maturesOn&&(!dateOK(input.maturesOn)||input.maturesOn<input.startOn))throw Error('Maturity must be on or after the start date.')
 if(!['MONTHLY','QUARTERLY','ANNUALLY','OTHER'].includes(input.frequency))throw Error('Invalid repayment frequency.')
 const record:FinancingFacility={...clone(input),id:uuid(),currency:a.currency,financierLabel:textField(input.financierLabel,'Financier',130,true),
  reference:textField(input.reference,'Reference',120),notes:textField(input.notes,'Notes',500),recordedAt:at}
 return {...state,phase3:{...state.phase3,facilities:[record,...state.phase3.facilities]},
  activity:activity(state,a,'FINANCING_RECORDED','Facility '+record.id+' recorded; no balance or payment verified.',at)}
}
export type BalanceInput=Pick<BalanceObservation,'facilityId'|'observedOn'|'balance'|'sourceLabel'|'notes'>
export function observeBalance(state:RegistryState,input:BalanceInput,at=now()):RegistryState{
 const facility=state.phase3.facilities.find(f=>f.id===input.facilityId)
 if(!facility)throw Error('Financing facility not found.')
 const a=getAsset(state,facility.assetId);allowedLive(a,'Balance observation')
 checkDate(input.observedOn,at);if(input.observedOn<facility.startOn)throw Error('Balance observation predates the financing start.')
 checkAmount(input.balance,'Outstanding balance')
 const current=latestBalance(state,facility.id)
 if(current&&input.observedOn<current.observedOn)throw Error('New balance observations cannot predate the latest recorded snapshot.')
 const record:BalanceObservation={...input,id:uuid(),assetId:a.id,currency:facility.currency,
  sourceLabel:textField(input.sourceLabel,'Source',130,true),notes:textField(input.notes,'Notes',400),recordedAt:at}
 return {...state,phase3:{...state.phase3,balances:[record,...state.phase3.balances]},
  activity:activity(state,a,'BALANCE_RECORDED','Outstanding balance manually recorded; not lender verified.',at)}
}
export function latestBalance(state:RegistryState,facilityId:string):BalanceObservation|undefined{
 return state.phase3.balances.filter(v=>v.facilityId===facilityId).sort((a,b)=>b.observedOn.localeCompare(a.observedOn)||b.recordedAt.localeCompare(a.recordedAt))[0]
}
export function outstandingForAsset(state:RegistryState,assetId:string):number|null{
 const facilities=state.phase3.facilities.filter(f=>f.assetId===assetId)
 if(!facilities.length)return null
 const latest=facilities.map(f=>latestBalance(state,f.id))
 if(latest.some(v=>v===undefined))return null
 return amountTotal(latest.map(v=>v!.balance))
}
export function indicativeEquity(state:RegistryState,assetId:string):{amount:number;method:'OBSERVED_DEBT'|'REGISTRY_MANUAL'|'UNKNOWN'}{
 const asset=getAsset(state,assetId)
 const debt=outstandingForAsset(state,assetId)
 if(debt!==null)return {amount:round(asset.value-debt),method:'OBSERVED_DEBT'}
 if(state.phase3.facilities.some(f=>f.assetId===assetId))return {amount:asset.equity,method:'UNKNOWN'}
 return {amount:asset.equity,method:'REGISTRY_MANUAL'}
}
export type CashFlowInput=Pick<AssetFlow,'assetId'|'type'|'category'|'amount'|'occurredOn'|'counterpartyLabel'|'notes'>
export function recordFlow(state:RegistryState,input:CashFlowInput,at=now()):RegistryState{
 const a=getAsset(state,input.assetId);allowedLive(a,'Cash-flow entry')
 if(!FLOW_TYPES.includes(input.type))throw Error('Unsupported cash-flow type.')
 if(!FLOW_CATEGORIES[input.type].includes(input.category))throw Error('Invalid flow category for selected type.')
 checkAmount(input.amount,'Flow amount',true);checkDate(input.occurredOn,at)
 if(a.acquiredOn&&input.occurredOn<a.acquiredOn)throw Error('Cash-flow date cannot precede the acquisition date.')
 const record:AssetFlow={...input,id:uuid(),currency:a.currency,
  counterpartyLabel:textField(input.counterpartyLabel,'Counterparty',120),
  notes:textField(input.notes,'Notes',500),recordedAt:at}
 return {...state,phase3:{...state.phase3,flows:[record,...state.phase3.flows]},
  activity:activity(state,a,'CASH_FLOW_RECORDED',input.type+' '+input.amount+' '+a.currency+' manually entered. Unreconciled.',at)}
}
export function flowsFor(state:RegistryState,assetId?:string):AssetFlow[]{
 return state.phase3.flows.filter(f=>!assetId||f.assetId===assetId).sort((a,b)=>b.occurredOn.localeCompare(a.occurredOn)||b.recordedAt.localeCompare(a.recordedAt))
}
export function flowSummary(flows:AssetFlow[],currency:string,from?:string,to?:string){
 const f=flows.filter(x=>x.currency===currency&&(!from||x.occurredOn>=from)&&(!to||x.occurredOn<=to))
 const sums=Object.fromEntries(FLOW_TYPES.map(t=>[t,amountTotal(f.filter(x=>x.type===t).map(x=>x.amount))])) as Record<FlowType,number>
 const operatingNet=round(sums.INCOME-sums.EXPENSE)
 const freeCash=round(operatingNet-sums.CAPEX)
 const totalNet=round(freeCash+sums.FINANCING_INFLOW-sums.FINANCING_OUTFLOW)
 return {...sums,operatingNet,freeCash,totalNet,count:f.length}
}
export function cashTimeline(flows:AssetFlow[],currency:string,from?:string,to?:string){
 const filtered=flows.filter(x=>x.currency===currency&&(!from||x.occurredOn>=from)&&(!to||x.occurredOn<=to))
 const groups=[...new Set(filtered.map(f=>f.occurredOn.slice(0,7)))].sort()
 return groups.map(month=>({month,...flowSummary(filtered.filter(f=>f.occurredOn.startsWith(month)),currency)}))
}
export function roiSnapshot(state:RegistryState,assetId:string,from?:string,to?:string){
 const asset=getAsset(state,assetId)
 const flows=flowSummary(flowsFor(state,assetId),asset.currency,from,to)
 const acquisition=state.phase2.acquisitions.find(a=>a.assetId===assetId)
 const basis=acquisition?.costBasis??null
 // Operating cash-on-cost proxy ONLY; excludes financing inflows/outflows, and excludes valuation gain.
 const operatingReturn=basis!==null&&basis>0?round(flows.operatingNet/basis*100):null
 const capitalReturn=basis!==null&&basis>0?round((asset.value-basis)/basis*100):null
 return {assetId,currency:asset.currency,basis,operatingReturn,capitalReturn,operatingNet:flows.operatingNet,
  income:flows.INCOME,expenses:flows.EXPENSE,latestValue:asset.value,method:'UNVERIFIED_BROWSER_PREVIEW' as const}
}
export type ReferenceInput=Pick<ReconciliationReference,'flowId'|'system'|'reference'|'note'>
export function attachReference(state:RegistryState,input:ReferenceInput,at=now()):RegistryState{
 const f=state.phase3.flows.find(x=>x.id===input.flowId)
 if(!f)throw Error('Cash flow not found.')
 if(!['FINANCE_OS','BANK','OTHER'].includes(input.system))throw Error('Invalid reference system.')
 const reference=textField(input.reference,'External reference',140,true),note=textField(input.note,'Note',400)
 if(state.phase3.references.some(x=>x.flowId===f.id))throw Error('This flow already has a reference. A verified match is not supported in the frontend.')
 const record:ReconciliationReference={id:uuid(),assetId:f.assetId,flowId:f.id,system:input.system,reference,note,recordedAt:at}
 const a=getAsset(state,f.assetId)
 return {...state,phase3:{...state.phase3,references:[record,...state.phase3.references]},
  activity:activity(state,a,'RECONCILIATION_LINKED','External reference attached. No independent finance verification.',at)}
}
export function referenceFor(state:RegistryState,flowId:string):ReconciliationReference|undefined{
 return state.phase3.references.find(r=>r.flowId===flowId)
}
export function reconciliationSummary(state:RegistryState){
 const total=state.phase3.flows.length
 const attached=state.phase3.flows.filter(f=>referenceFor(state,f.id)).length
 return {total,attached,unreferenced:total-attached,verified:0}
}
