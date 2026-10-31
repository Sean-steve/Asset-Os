import {type AuthState,type ServerAsset,serverRequest} from './identity'

export type LifecycleState='PLANNED'|'ACQUISITION_PENDING'|'ACQUIRED'|'ACTIVE'|'SUSPENDED'|'DISPOSED'|'ARCHIVED'
export type OwnershipDimension='ECONOMIC'|'BENEFICIAL'|'LEGAL'|'CONTROL'
export type OwnershipInterest={
 id:string;partyRef:string;partyLabel:string;dimension:OwnershipDimension;
 percentage:string|null;effectiveFrom:string;effectiveTo:string|null;
 source:'ASSIGNMENT'|'TRANSFER';recordedAt:string
}
export type LifecycleEvent={id:string;from:LifecycleState;to:LifecycleState;reason:string;occurredAt:string}
export type OwnershipEvent={
 id:string;kind:'ASSIGNMENT'|'TRANSFER';dimension:OwnershipDimension;
 fromPartyRef:string|null;toPartyRef:string;percentage:string|null;effectiveOn:string;
 note:string;recordedAt:string
}
export type Acquisition={
 id:string;method:string;effectiveOn:string;counterpartyLabel:string;
 evidenceReference:string;notes:string;currency:string;costBasis:string;
 costs:Record<CostKey,string>;recordedAt:string
}
export type Disposition={
 id:string;kind:string;effectiveOn:string;proceeds:string;costs:string;
 netProceeds:string;costBasis:string|null;estimatedGain:string|null;
 currency:string;counterpartyLabel:string;reason:string;recordedAt:string
}
export type LifecycleSnapshot={
 asset:ServerAsset;transitions:LifecycleEvent[];acquisition:Acquisition|null;
 ownershipInterests:OwnershipInterest[];ownershipChanges:OwnershipEvent[];
 disposition:Disposition|null
}
export type LifecycleAction='START_ACQUISITION'|'ACTIVATE'|'SUSPEND'|'REACTIVATE'|'ARCHIVE'
export type CostKey='purchase'|'taxes'|'fees'|'installation'|'improvements'|'other'
export const COST_KEYS:CostKey[]=['purchase','taxes','fees','installation','improvements','other']
export const OWNERSHIP_DIMENSIONS:OwnershipDimension[]=['ECONOMIC','BENEFICIAL','LEGAL','CONTROL']
export const ACQUISITION_METHODS=['PURCHASE','TRANSFER','GIFT','INHERITANCE','CREATION','EXCHANGE','INVESTMENT','OTHER'] as const
export const DISPOSITION_KINDS=['SALE','TRANSFER','DONATION','WRITE_OFF','DESTRUCTION','TRADE','OTHER'] as const
export type DomainRoute='lifecycle-actions'|'acquisitions'|'ownership-interests'|'ownership-transfers'|'disposition'
export type DomainResponse={
 asset:ServerAsset;action?:LifecycleAction;acquisition?:Acquisition;
 interest?:OwnershipInterest;transfer?:{id:string;remainingPercentage:string;percentage:string};
 disposition?:Disposition
}

export const allowedAction=(lifecycle:string):LifecycleAction|null=>{
 const mapping:Record<string,LifecycleAction>={
  PLANNED:'START_ACQUISITION',ACQUIRED:'ACTIVATE',ACTIVE:'SUSPEND',
  SUSPENDED:'REACTIVATE',DISPOSED:'ARCHIVE'
 }
 return mapping[lifecycle]||null
}
export const isActiveOwnership=(interest:OwnershipInterest)=>interest.effectiveTo===null
export const editable=(auth:AuthState)=>auth.membership?.role==='WORKSPACE_OWNER'||auth.membership?.role==='OPERATIONS'
export const toCents=(raw:string)=>{
 if(!/^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/.test(raw))throw Error('Enter a positive or zero exact decimal with no more than two fractional digits.')
 const [whole,part='']=raw.split('.')
 return BigInt(whole)*100n+BigInt(part.padEnd(2,'0'))
}
export const asMoney=(amount:bigint)=>{
 const a=amount<0n?-amount:amount
 return (amount<0n?'-':'')+(a/100n)+'.'+String(a%100n).padStart(2,'0')
}
export function sharesByDimension(interests:OwnershipInterest[],dimension:OwnershipDimension){
 return asMoney(interests.filter(x=>x.dimension===dimension&&isActiveOwnership(x))
  .reduce((sum,x)=>sum+(x.percentage?toCents(x.percentage):0n),0n))
}
export function costBasis(costs:Record<CostKey,string>){
 return asMoney(COST_KEYS.reduce((sum,key)=>sum+toCents(costs[key]||'0'),0n))
}
export async function getLifecycle(state:AuthState,id:string):Promise<LifecycleSnapshot>{
 return serverRequest<LifecycleSnapshot>(state,'/v1/assets/'+encodeURIComponent(id)+'/lifecycle')
}
export async function postDomainCommand(
 state:AuthState,snapshot:LifecycleSnapshot,route:DomainRoute,payload:unknown,idempotencyKey:string
):Promise<DomainResponse>{
 return serverRequest<DomainResponse>(state,
  '/v1/assets/'+encodeURIComponent(snapshot.asset.id)+'/'+route,{
   method:'POST',headers:{
    'If-Match':'"'+snapshot.asset.recordVersion+'"',
    'Idempotency-Key':idempotencyKey
   },body:JSON.stringify(payload)
  })
}
export const defaultCosts=():Record<CostKey,string>=>({
 purchase:'0',taxes:'0',fees:'0',installation:'0',improvements:'0',other:'0'
})
export const todayIso=()=>new Date().toISOString().slice(0,10)
