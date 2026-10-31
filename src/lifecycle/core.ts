/**
 * Asset OS Phase 2 domain prototype. Not a legal register, financial ledger,
 * transaction processor or independently authoritative Kernel service.
 * All commands update the same browser-local RegistryState snapshot.
 */
import type { RegistryState, AssetRecord, Lifecycle, ActivityEntry } from '../registry/core'

export type AcquisitionMethod = 'PURCHASE'|'TRANSFER'|'GIFT'|'INHERITANCE'|'CREATION'|'EXCHANGE'|'INVESTMENT'|'OTHER'
export type CostComponent = 'purchase'|'taxes'|'fees'|'installation'|'improvements'|'other'
export type AcquisitionCost = Record<CostComponent,number>
export type AcquisitionInput = {
  assetId:string
  method:AcquisitionMethod
  acquiredOn:string
  counterparty:string
  reference:string
  notes:string
  costs:AcquisitionCost
}
export type AcquisitionRecord = AcquisitionInput & {
  id:string;currency:string;costBasis:number;recordedAt:string
}
export type OwnershipDimension='ECONOMIC'|'BENEFICIAL'|'LEGAL'|'CONTROL'
export type OwnershipInterest = {
  id:string;assetId:string;partyRef:string;partyLabel:string;dimension:OwnershipDimension;
  percentage:number|null;effectiveFrom:string;effectiveTo:string|null;createdAt:string;
  source:'ASSIGNMENT'|'TRANSFER'
}
export type OwnershipChange = {
  id:string;assetId:string;type:'ASSIGNMENT'|'TRANSFER';dimension:OwnershipDimension;
  fromPartyRef:string|null;toPartyRef:string;percentage:number|null;effectiveOn:string;createdAt:string;
  note:string
}
export type DispositionType='SALE'|'TRANSFER'|'DONATION'|'WRITE_OFF'|'DESTRUCTION'|'TRADE'|'OTHER'
export type DispositionInput={assetId:string;type:DispositionType;date:string;proceeds:number;costs:number;counterparty:string;reason:string;confirm:string}
export type DispositionRecord = Omit<DispositionInput,'confirm'> & {
  id:string;currency:string;netProceeds:number;costBasis:number|null;estimatedGain:number|null;recordedAt:string
}
export type LifecycleTransition={id:string;assetId:string;from:Lifecycle;to:Lifecycle;reason:string;at:string}
export type LifecycleData={
  acquisitions:AcquisitionRecord[]
  interests:OwnershipInterest[]
  ownershipChanges:OwnershipChange[]
  dispositions:DispositionRecord[]
  transitions:LifecycleTransition[]
}

export const ACQUISITION_METHODS:AcquisitionMethod[]=['PURCHASE','TRANSFER','GIFT','INHERITANCE','CREATION','EXCHANGE','INVESTMENT','OTHER']
export const DISPOSITION_TYPES:DispositionType[]=['SALE','TRANSFER','DONATION','WRITE_OFF','DESTRUCTION','TRADE','OTHER']
export const OWNERSHIP_DIMENSIONS:OwnershipDimension[]=['ECONOMIC','BENEFICIAL','LEGAL','CONTROL']
export const EMPTY_COSTS:AcquisitionCost={purchase:0,taxes:0,fees:0,installation:0,improvements:0,other:0}
export const LIFECYCLE_STATES:Lifecycle[]=['PLANNED','ACQUISITION_PENDING','ACQUIRED','ACTIVE','SUSPENDED','DISPOSED','ARCHIVED']
export const ALLOWED_TRANSITIONS:Record<Lifecycle,Lifecycle[]>={
  PLANNED:['ACQUISITION_PENDING'],
  ACQUISITION_PENDING:['ACQUIRED'],
  ACQUIRED:['ACTIVE','DISPOSED'],
  ACTIVE:['SUSPENDED','DISPOSED'],
  SUSPENDED:['ACTIVE','DISPOSED'],
  DISPOSED:['ARCHIVED'],
  ARCHIVED:[],
}
export const emptyLifecycleData=():LifecycleData=>({
  acquisitions:[],interests:[],ownershipChanges:[],dispositions:[],transitions:[]
})
export function validLifecycleData(value:unknown):value is LifecycleData {
  if(!value||typeof value!=='object')return false
  const v=value as Partial<LifecycleData>
  return Array.isArray(v.acquisitions)&&Array.isArray(v.interests)&&Array.isArray(v.ownershipChanges)&&Array.isArray(v.dispositions)&&Array.isArray(v.transitions)
}
const today=(at:string)=>at.slice(0,10)
const newId=()=>globalThis.crypto?.randomUUID?.()||'proto-'+Math.random().toString(36).slice(2)+'-'+Date.now()
function dayValid(s:string):boolean {if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s}
function assertDay(s:string,at:string){if(!dayValid(s)||s>today(at))throw Error('Choose a valid effective date that is not in the future.')}
function assertAmount(v:number,label:string,allowZero=true){
 if(!Number.isFinite(v)||v<0||(!allowZero&&v===0)||v>1e14||Math.round(v*100)!==v*100&&Math.abs(Math.round(v*100)-v*100)>1e-6)throw Error(label+' must be a valid non-negative amount with at most two decimals.')
}
const cents=(v:number)=>Math.round(v*100)
const sumMoney=(values:number[])=>values.reduce((sum,v)=>sum+cents(v),0)/100
function assetById(state:RegistryState,id:string):AssetRecord{
 const asset=state.records.find(a=>a.id===id)
 if(!asset)throw Error('The selected asset no longer exists.')
 return asset
}
function safeNote(s:string,max=400):string{
 if(typeof s!=='string'||s.length>max)throw Error('Text exceeds the allowed length.')
 return s.trim()
}
function event(state:RegistryState,asset:AssetRecord,eventName:ActivityEntry['event'],details:string,at:string):ActivityEntry[]{
 return [{id:newId(),assetId:asset.id,assetName:asset.name,event:eventName,details,at},...state.activity].slice(0,500)
}
function changeState(state:RegistryState,asset:AssetRecord,next:Lifecycle,reason:string,at:string):RegistryState{
 if(!ALLOWED_TRANSITIONS[asset.lifecycle].includes(next))throw Error('Transition from '+asset.lifecycle+' to '+next+' is not allowed.')
 const transition:LifecycleTransition={id:newId(),assetId:asset.id,from:asset.lifecycle,to:next,reason,at}
 return {
  ...state,
  records:state.records.map(a=>a.id===asset.id?{...a,lifecycle:next,updatedAt:at}:a),
  phase2:{...state.phase2,transitions:[transition,...state.phase2.transitions]},
  activity:event(state,asset,'LIFECYCLE_CHANGED',asset.lifecycle+' → '+next+': '+reason,at),
 }
}
export function beginAcquisition(state:RegistryState,assetId:string,at=new Date().toISOString()):RegistryState {
 const asset=assetById(state,assetId)
 if(state.phase2.acquisitions.some(a=>a.assetId===assetId))throw Error('An acquisition is already recorded.')
 return changeState(state,asset,'ACQUISITION_PENDING','Acquisition process initiated',at)
}
export function costBasis(costs:AcquisitionCost):number {
 for(const [key,value] of Object.entries(costs)){assertAmount(value,key)}
 return sumMoney(Object.values(costs))
}
export function completeAcquisition(state:RegistryState,input:AcquisitionInput,at=new Date().toISOString()):RegistryState {
 const asset=assetById(state,input.assetId)
 if(asset.lifecycle!=='ACQUISITION_PENDING')throw Error('Start acquisition before recording it.')
 if(state.phase2.acquisitions.some(a=>a.assetId===asset.id))throw Error('Only one initial acquisition is permitted.')
 if(!ACQUISITION_METHODS.includes(input.method))throw Error('Select a valid acquisition method.')
 assertDay(input.acquiredOn,at)
 const costs=Object.fromEntries(Object.keys(EMPTY_COSTS).map(key=>[key,input.costs[key as CostComponent]])) as AcquisitionCost
 const basis=costBasis(costs)
 if(input.method==='PURCHASE'&&costs.purchase<=0)throw Error('A purchase requires a purchase amount greater than zero.')
 const record:AcquisitionRecord={...input,costs,reference:safeNote(input.reference,100),counterparty:safeNote(input.counterparty,120),notes:safeNote(input.notes,600),id:newId(),currency:asset.currency,costBasis:basis,recordedAt:at}
 const changed=changeState(state,asset,'ACQUIRED','Acquisition recorded locally',at)
 return {...changed,
  records:changed.records.map(a=>a.id===asset.id?{...a,acquiredOn:input.acquiredOn}:a),
  phase2:{...changed.phase2,acquisitions:[record,...changed.phase2.acquisitions]},
  activity:event(changed,asset,'ACQUIRED','Acquisition: '+input.method+', cost basis '+basis+' '+asset.currency,at),
 }
}
export function lifecycleAction(state:RegistryState,assetId:string,command:'ACTIVATE'|'SUSPEND'|'REACTIVATE'|'ARCHIVE',reason:string,at=new Date().toISOString()):RegistryState{
 const asset=assetById(state,assetId)
 const moves:{[key in typeof command]:{from:Lifecycle;to:Lifecycle}}={
  ACTIVATE:{from:'ACQUIRED',to:'ACTIVE'},
  SUSPEND:{from:'ACTIVE',to:'SUSPENDED'},
  REACTIVATE:{from:'SUSPENDED',to:'ACTIVE'},
  ARCHIVE:{from:'DISPOSED',to:'ARCHIVED'}
 }
 const move=moves[command]
 if(asset.lifecycle!==move.from)throw Error('Action '+command+' is not allowed while asset is '+asset.lifecycle+'.')
 if(command==='ARCHIVE'&&!state.phase2.dispositions.some(d=>d.assetId===assetId))throw Error('A disposal record must exist before archival.')
 return changeState(state,asset,move.to,safeNote(reason)||command.toLowerCase(),at)
}
export function activeInterests(state:RegistryState,assetId:string,at=new Date().toISOString(),dimension?:OwnershipDimension):OwnershipInterest[] {
 const d=at.slice(0,10)
 return state.phase2.interests.filter(i=>i.assetId===assetId&&(!dimension||i.dimension===dimension)&&i.effectiveFrom<=d&&(!i.effectiveTo||i.effectiveTo>d))
}
export function ownershipTotal(state:RegistryState,assetId:string,dimension:OwnershipDimension,at=new Date().toISOString()):number{
 return activeInterests(state,assetId,at,dimension).reduce((s,i)=>s+(i.percentage||0),0)
}
export type AssignmentInput={
 assetId:string;partyRef:string;partyLabel:string;dimension:OwnershipDimension;
 percentage:number|null;effectiveFrom:string;note:string
}
export function assignOwnership(state:RegistryState,input:AssignmentInput,at=new Date().toISOString()):RegistryState{
 const asset=assetById(state,input.assetId)
 if(!['ACQUIRED','ACTIVE','SUSPENDED'].includes(asset.lifecycle))throw Error('Ownership can only be recorded for acquired, active or suspended assets.')
 if(!OWNERSHIP_DIMENSIONS.includes(input.dimension))throw Error('Invalid ownership dimension.')
 assertDay(input.effectiveFrom,at)
 const ref=safeNote(input.partyRef,90), label=safeNote(input.partyLabel,120)
 if(!ref||!label)throw Error('Party reference and display name are required.')
 if(state.phase2.interests.some(i=>i.assetId===asset.id&&i.dimension===input.dimension&&i.partyRef===ref&&(!i.effectiveTo||i.effectiveTo>input.effectiveFrom)))throw Error('An overlapping ownership interest for this party and dimension already exists.')
 const dimensional=input.dimension==='ECONOMIC'||input.dimension==='BENEFICIAL'
 if(dimensional){
  if(input.percentage===null||!Number.isFinite(input.percentage)||input.percentage<=0||input.percentage>100||Math.abs(input.percentage*100-Math.round(input.percentage*100))>1e-6)throw Error('Economic and beneficial ownership require a share between 0.01% and 100%.')
  // Restrict retroactive conflicting allocations to keep the prototype's simple timeline coherent.
  if(state.phase2.interests.some(i=>i.assetId===asset.id&&i.dimension===input.dimension&&i.effectiveFrom>input.effectiveFrom))throw Error('Cannot backdate before a newer interest in this dimension.')
  if(ownershipTotal(state,asset.id,input.dimension,at)+(input.percentage||0)>100+1e-8)throw Error('Recorded '+input.dimension.toLowerCase()+' shares cannot exceed 100%.')
 } else if(input.percentage!==null) throw Error('Legal and control roles are non-percentage rights in this prototype.')
 const interest:OwnershipInterest={id:newId(),assetId:asset.id,partyRef:ref,partyLabel:label,dimension:input.dimension,
  percentage:dimensional?input.percentage:null,effectiveFrom:input.effectiveFrom,effectiveTo:null,createdAt:at,source:'ASSIGNMENT'}
 const change:OwnershipChange={id:newId(),assetId:asset.id,type:'ASSIGNMENT',dimension:input.dimension,
  fromPartyRef:null,toPartyRef:ref,percentage:interest.percentage,effectiveOn:input.effectiveFrom,createdAt:at,note:safeNote(input.note)}
 return {...state,phase2:{...state.phase2,interests:[interest,...state.phase2.interests],ownershipChanges:[change,...state.phase2.ownershipChanges]},
  records:state.records.map(a=>a.id===asset.id?{...a,updatedAt:at}:a),
  activity:event(state,asset,'OWNERSHIP_CHANGED','Recorded '+input.dimension+' right for '+label,at)}
}
export type TransferInput={assetId:string;sourceInterestId:string;partyRef:string;partyLabel:string;percentage:number;effectiveOn:string;note:string}
export function transferOwnership(state:RegistryState,input:TransferInput,at=new Date().toISOString()):RegistryState{
 const asset=assetById(state,input.assetId)
 if(!['ACQUIRED','ACTIVE','SUSPENDED'].includes(asset.lifecycle))throw Error('Transfer is not available in this lifecycle state.')
 assertDay(input.effectiveOn,at)
 const source=state.phase2.interests.find(i=>i.id===input.sourceInterestId&&i.assetId===asset.id)
 if(!source||!['ECONOMIC','BENEFICIAL'].includes(source.dimension)||!activeInterests(state,asset.id,at).some(i=>i.id===source.id))throw Error('Select an active economic or beneficial interest.')
 if(input.effectiveOn<source.effectiveFrom)throw Error('Transfer cannot predate the existing interest.')
 if(state.phase2.interests.some(i=>i.assetId===asset.id&&i.dimension===source.dimension&&i.effectiveFrom>input.effectiveOn))throw Error('Cannot backdate before a newer interest in this dimension.')
 const targetRef=safeNote(input.partyRef,90),targetLabel=safeNote(input.partyLabel,120)
 if(!targetRef||!targetLabel||targetRef===source.partyRef)throw Error('Choose a different receiving party with a reference and name.')
 if(activeInterests(state,asset.id,at,source.dimension).some(i=>i.partyRef===targetRef))
  throw Error('Receiving party already has an active interest in this dimension; consolidate through an explicit ownership reconciliation.')
 const pct=input.percentage
 if(!Number.isFinite(pct)||pct<=0||pct>(source.percentage||0)||Math.abs(pct*100-Math.round(pct*100))>1e-6)throw Error('Transfer share must be positive and cannot exceed the source interest.')
 const remaining=Math.round(((source.percentage||0)-pct)*100)/100
 const target:OwnershipInterest={...source,id:newId(),partyRef:targetRef,partyLabel:targetLabel,percentage:pct,
  effectiveFrom:input.effectiveOn,effectiveTo:null,createdAt:at,source:'TRANSFER'}
 const retained:OwnershipInterest|null=remaining>0?{...source,id:newId(),percentage:remaining,effectiveFrom:input.effectiveOn,effectiveTo:null,createdAt:at,source:'TRANSFER'}:null
 const updated=state.phase2.interests.map(i=>i.id===source.id?{...i,effectiveTo:input.effectiveOn}:i)
 const interests=[target,...(retained?[retained]:[]),...updated]
 const change:OwnershipChange={id:newId(),assetId:asset.id,type:'TRANSFER',dimension:source.dimension,
  fromPartyRef:source.partyRef,toPartyRef:targetRef,percentage:pct,effectiveOn:input.effectiveOn,createdAt:at,note:safeNote(input.note)}
 return {...state,phase2:{...state.phase2,interests,ownershipChanges:[change,...state.phase2.ownershipChanges]},
  records:state.records.map(a=>a.id===asset.id?{...a,updatedAt:at}:a),
  activity:event(state,asset,'OWNERSHIP_CHANGED','Transferred '+pct+'% '+source.dimension+' share from '+source.partyLabel+' to '+targetLabel,at)}
}
export function disposeAsset(state:RegistryState,input:DispositionInput,at=new Date().toISOString()):RegistryState{
 const asset=assetById(state,input.assetId)
 if(!['ACQUIRED','ACTIVE','SUSPENDED'].includes(asset.lifecycle))throw Error('Only acquired, active or suspended assets can be disposed.')
 if(state.phase2.dispositions.some(d=>d.assetId===asset.id))throw Error('This asset already has a disposal record.')
 if(!DISPOSITION_TYPES.includes(input.type))throw Error('Choose a valid disposal method.')
 assertDay(input.date,at)
 if(asset.acquiredOn&&input.date<asset.acquiredOn)throw Error('Disposal cannot predate acquisition.')
 assertAmount(input.proceeds,'Proceeds')
 assertAmount(input.costs,'Transaction costs')
 if(input.type==='SALE'&&input.proceeds===0)throw Error('Sale requires positive proceeds.')
 if(input.type!=='SALE'&&input.type!=='TRADE'&&input.type!=='OTHER'&&input.proceeds!==0)throw Error('Only sales, trades and other disposals may record proceeds.')
 if(input.confirm!=='DISPOSE')throw Error('Type DISPOSE to acknowledge this irreversible local state transition.')
 const counterparty=safeNote(input.counterparty,120),reason=safeNote(input.reason,500)
 if(!reason)throw Error('Explain why the asset is being disposed.')
 if(input.type==='SALE'&&!counterparty)throw Error('Provide a non-sensitive counterparty label for a sale.')
 const basis=state.phase2.acquisitions.find(r=>r.assetId===asset.id)?.costBasis??null
 const net=sumMoney([input.proceeds,-input.costs])
 const record:DispositionRecord={id:newId(),assetId:asset.id,type:input.type,date:input.date,proceeds:input.proceeds,costs:input.costs,counterparty,reason,
  currency:asset.currency,netProceeds:net,costBasis:basis,estimatedGain:basis===null?null:sumMoney([net,-basis]),recordedAt:at}
 const changed=changeState(state,asset,'DISPOSED','Disposition: '+record.type,at)
 return {...changed,phase2:{...changed.phase2,dispositions:[record,...changed.phase2.dispositions]},
  activity:event(changed,asset,'DISPOSED',record.type+' recorded. Proceeds '+net+' '+asset.currency+'. Not a posted transaction.',at)}
}
export function transitionHistory(state:RegistryState,assetId:string):LifecycleTransition[]{
 return state.phase2.transitions.filter(t=>t.assetId===assetId).sort((a,b)=>b.at.localeCompare(a.at))
}
export function acquisitionFor(state:RegistryState,assetId:string):AcquisitionRecord|undefined {
 return state.phase2.acquisitions.find(a=>a.assetId===assetId)
}
export function dispositionFor(state:RegistryState,assetId:string):DispositionRecord|undefined {
 return state.phase2.dispositions.find(a=>a.assetId===assetId)
}
export function shareBreakdown(state:RegistryState,assetId:string,at=new Date().toISOString()):Array<{dimension:OwnershipDimension;allocated:number|null;unallocated:number|null;count:number}>{
 return OWNERSHIP_DIMENSIONS.map(d=>({dimension:d,
  allocated:d==='ECONOMIC'||d==='BENEFICIAL'?ownershipTotal(state,assetId,d,at):null,
  unallocated:d==='ECONOMIC'||d==='BENEFICIAL'?Math.max(0,100-ownershipTotal(state,assetId,d,at)):null,
  count:activeInterests(state,assetId,at,d).length}))
}
