/**
 * Asset OS Phase 4 — browser-local maintenance, protection and operations.
 * All observations, reminders and references are unverified; no work orders
 * are dispatched, no insurance is purchased, no payment is posted and the
 * Personal Kernel calendar is not modified.
 */
import type { RegistryState, AssetRecord, ActivityEntry } from '../registry/core'

export type PlanInterval='DAYS'|'WEEKS'|'MONTHS'
export type PlanStatus='ACTIVE'|'PAUSED'
export type MaintenancePlan={
 id:string;assetId:string;title:string;description:string;interval:number;unit:PlanInterval;
 nextDue:string;status:PlanStatus;createdAt:string;lastCompletedOn:string|null
}
export type ServiceStatus='SCHEDULED'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED'
export type ServiceJob={
 id:string;assetId:string;planId:string|null;title:string;scheduledFor:string;
 providerLabel:string;status:ServiceStatus;notes:string;recordedAt:string;
 completedOn:string|null;recordedCost:number|null;completionNotes:string
}
export type PolicyStatus='RECORDED'|'SUPERSEDED'|'CANCELLED'
export type InsurancePolicy={
 id:string;assetId:string;insurerLabel:string;policyReference:string;policyType:string;
 startOn:string;endOn:string;coverageAmount:number;premiumAmount:number|null;currency:string;
 notes:string;status:PolicyStatus;replacesId:string|null;recordedAt:string
}
export type UtilizationMetric='ODOMETER_KM'|'HOURS_TOTAL'|'USE_COUNT'|'OCCUPIED_DAYS'
export type UtilizationReading={
 id:string;assetId:string;metric:UtilizationMetric;observedOn:string;value:number;
 sourceLabel:string;notes:string;recordedAt:string
}
export type EvidenceKind='INSURANCE'|'MAINTENANCE'|'OWNERSHIP'|'COMPLIANCE'|'VALUATION'|'OTHER'
export type EvidenceReference={
 id:string;assetId:string;kind:EvidenceKind;title:string;reference:string;
 issuedOn:string|null;expiresOn:string|null;notes:string;recordedAt:string
}
export type LocationChange={
 id:string;assetId:string;fromLabel:string;toLabel:string;effectiveOn:string;
 reason:string;recordedAt:string
}
export type RelationType='ASSOCIATED_WITH'|'COMPONENT_OF'|'DEPENDS_ON'|'LOCATED_WITH'
export type AssetRelation={
 id:string;assetId:string;relatedAssetId:string;type:RelationType;note:string;recordedAt:string
}
export type OperationalData={
 plans:MaintenancePlan[];jobs:ServiceJob[];policies:InsurancePolicy[];
 readings:UtilizationReading[];documents:EvidenceReference[];
 locations:LocationChange[];relations:AssetRelation[]
}
export const emptyOperationalData=():OperationalData=>({
 plans:[],jobs:[],policies:[],readings:[],documents:[],locations:[],relations:[]
})
export function validOperationalData(value:unknown):value is OperationalData{
 if(!value||typeof value!=='object')return false
 const v=value as Partial<OperationalData>
 return Array.isArray(v.plans)&&Array.isArray(v.jobs)&&Array.isArray(v.policies)&&
  Array.isArray(v.readings)&&Array.isArray(v.documents)&&Array.isArray(v.locations)&&Array.isArray(v.relations)
}
export const METRICS:UtilizationMetric[]=['ODOMETER_KM','HOURS_TOTAL','USE_COUNT','OCCUPIED_DAYS']
export const DOCUMENT_KINDS:EvidenceKind[]=['INSURANCE','MAINTENANCE','OWNERSHIP','COMPLIANCE','VALUATION','OTHER']
export const RELATION_TYPES:RelationType[]=['ASSOCIATED_WITH','COMPONENT_OF','DEPENDS_ON','LOCATED_WITH']
const uid=()=>globalThis.crypto?.randomUUID?.()||'local-'+Date.now()+'-'+Math.random().toString(36).slice(2)
const utcNow=()=>new Date().toISOString()
const iso=(s:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s}
function date(value:string,label:string){if(!iso(value))throw Error(label+' must be a valid calendar date.')}
function pastDate(value:string,label:string,at:string){date(value,label);if(value>at.slice(0,10))throw Error(label+' cannot be in the future.')}
function amount(v:number,label:string,allowZero=true){if(!Number.isFinite(v)||v<0||(!allowZero&&v===0)||v>1e14||Math.abs(Math.round(v*100)-v*100)>1e-6)throw Error(label+' must be a valid '+(allowZero?'non-negative':'positive')+' amount with up to two decimals.')}
function string(value:string,label:string,max=160,required=false){
 if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error(label+' must be '+(required?'provided':'within length limits')+'.')
 return value.trim()
}
const assetOf=(state:RegistryState,id:string)=>{
 const asset=state.records.find(a=>a.id===id)
 if(!asset)throw Error('Asset does not exist in this workspace.')
 return asset
}
function usable(asset:AssetRecord){
 if(!['ACQUIRED','ACTIVE','SUSPENDED'].includes(asset.lifecycle))throw Error('Operational changes require an acquired, active or suspended asset.')
}
function history(state:RegistryState,asset:AssetRecord,event:ActivityEntry['event'],details:string,at:string){
 return [{id:uid(),assetId:asset.id,assetName:asset.name,event,details,at},...state.activity].slice(0,500)
}
function touched(state:RegistryState,id:string,at:string){
 return state.records.map(a=>a.id===id?{...a,updatedAt:at}:a)
}
export function addInterval(dateValue:string,interval:number,unit:PlanInterval){
 date(dateValue,'Recurrence base')
 if(!Number.isInteger(interval)||interval<1||interval>365)throw Error('Frequency must be an integer from 1 to 365.')
 const year=Number(dateValue.slice(0,4)),month=Number(dateValue.slice(5,7)),day=Number(dateValue.slice(8,10))
 const start=new Date(Date.UTC(year,month-1,day))
 if(unit==='DAYS')start.setUTCDate(start.getUTCDate()+interval)
 else if(unit==='WEEKS')start.setUTCDate(start.getUTCDate()+interval*7)
 else if(unit==='MONTHS'){
  const shifted=new Date(Date.UTC(year,month-1+interval,1))
  const lastDay=new Date(Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth()+1,0)).getUTCDate()
  shifted.setUTCDate(Math.min(day,lastDay))
  return shifted.toISOString().slice(0,10)
 }else throw Error('Invalid recurrence unit.')
 return start.toISOString().slice(0,10)
}
export function nextMaintenanceDue(plan:MaintenancePlan,completedOn:string){
 date(completedOn,'Completion date')
 let next=plan.nextDue
 for(let i=0;i<5000&&next<=completedOn;i++)next=addInterval(next,plan.interval,plan.unit)
 if(next<=completedOn)throw Error('Maintenance recurrence exceeds safe calculation bounds.')
 return next
}
export type PlanInput=Pick<MaintenancePlan,'assetId'|'title'|'description'|'interval'|'unit'|'nextDue'>
export function createPlan(state:RegistryState,input:PlanInput,at=utcNow()):RegistryState{
 const asset=assetOf(state,input.assetId);usable(asset)
 date(input.nextDue,'Next due date')
 if(!Number.isInteger(input.interval)||input.interval<1||input.interval>365)throw Error('Interval must be a whole number from 1 to 365.')
 if(!(['DAYS','WEEKS','MONTHS'] as string[]).includes(input.unit))throw Error('Invalid interval unit.')
 const plan:MaintenancePlan={...input,title:string(input.title,'Plan title',120,true),description:string(input.description,'Description',500),
  id:uid(),createdAt:at,status:'ACTIVE',lastCompletedOn:null}
 return {...state,phase4:{...state.phase4,plans:[plan,...state.phase4.plans]},records:touched(state,asset.id,at),
  activity:history(state,asset,'MAINTENANCE_PLAN_CREATED','Recurring maintenance schedule recorded locally.',at)}
}
export function setPlanState(state:RegistryState,id:string,status:PlanStatus,at=utcNow()):RegistryState{
 const plan=state.phase4.plans.find(p=>p.id===id)
 if(!plan||!['ACTIVE','PAUSED'].includes(status))throw Error('Maintenance plan or target status is invalid.')
 const asset=assetOf(state,plan.assetId);usable(asset)
 if(plan.status===status)throw Error('Maintenance plan is already '+status+'.')
 return {...state,phase4:{...state.phase4,plans:state.phase4.plans.map(p=>p.id===id?{...p,status}:p)},
  activity:history(state,asset,'MAINTENANCE_PLAN_CHANGED','Plan '+status.toLowerCase()+'.',at)}
}
export type JobInput=Pick<ServiceJob,'assetId'|'planId'|'title'|'scheduledFor'|'providerLabel'|'notes'>
export function createJob(state:RegistryState,input:JobInput,at=utcNow()):RegistryState{
 const asset=assetOf(state,input.assetId);usable(asset)
 date(input.scheduledFor,'Scheduled date')
 if(input.planId){
  const plan=state.phase4.plans.find(p=>p.id===input.planId&&p.assetId===asset.id)
  if(!plan||plan.status!=='ACTIVE')throw Error('Choose an active maintenance plan belonging to this asset.')
 }
 const job:ServiceJob={...input,id:uid(),title:string(input.title,'Work title',120,true),
  providerLabel:string(input.providerLabel,'Provider',120),notes:string(input.notes,'Notes',500),
  status:'SCHEDULED',recordedAt:at,completedOn:null,recordedCost:null,completionNotes:''}
 return {...state,phase4:{...state.phase4,jobs:[job,...state.phase4.jobs]},records:touched(state,asset.id,at),
  activity:history(state,asset,'SERVICE_JOB_CREATED','Service job recorded for '+input.scheduledFor+'. No dispatch made.',at)}
}
export function updateJob(state:RegistryState,id:string,action:'START'|'CANCEL'|'COMPLETE',data?:{date:string;cost:number;notes:string},at=utcNow()):RegistryState{
 const job=state.phase4.jobs.find(j=>j.id===id)
 if(!job)throw Error('Service job not found.')
 const asset=assetOf(state,job.assetId);usable(asset)
 if(['COMPLETED','CANCELLED'].includes(job.status))throw Error('Completed and cancelled jobs cannot be changed.')
 if(action==='START'&&job.status!=='SCHEDULED')throw Error('Job has already started.')
 if(action==='CANCEL'&&!['SCHEDULED','IN_PROGRESS'].includes(job.status))throw Error('Job cannot be cancelled.')
 if(action==='COMPLETE'){
  if(!data)throw Error('Completion date, cost and notes are required.')
  pastDate(data.date,'Completion date',at);amount(data.cost,'Recorded service cost')
  string(data.notes,'Completion notes',500)
  const newJob:ServiceJob={...job,status:'COMPLETED',completedOn:data.date,recordedCost:data.cost,completionNotes:data.notes.trim()}
  const oldPlan=job.planId?state.phase4.plans.find(p=>p.id===job.planId):undefined
  const plans=oldPlan&&oldPlan.status==='ACTIVE'?state.phase4.plans.map(p=>p.id===oldPlan.id?
   {...p,lastCompletedOn:data.date,nextDue:nextMaintenanceDue(p,data.date)}:p):state.phase4.plans
  return {...state,phase4:{...state.phase4,jobs:state.phase4.jobs.map(j=>j.id===id?newJob:j),plans},
   records:touched(state,asset.id,at),
   activity:history(state,asset,'SERVICE_JOB_COMPLETED','Service completed; recorded cost is not an expense posting.',at)}
 }
 const next=action==='START'?'IN_PROGRESS':'CANCELLED'
 return {...state,phase4:{...state.phase4,jobs:state.phase4.jobs.map(j=>j.id===id?{...j,status:next}:j)},
  activity:history(state,asset,'SERVICE_JOB_CHANGED','Service job '+next.toLowerCase().replace('_',' ')+'.',at)}
}
export type PolicyInput=Pick<InsurancePolicy,'assetId'|'insurerLabel'|'policyReference'|'policyType'|'startOn'|'endOn'|'coverageAmount'|'premiumAmount'|'notes'>
export function recordPolicy(state:RegistryState,input:PolicyInput,replacesId:string|null=null,at=utcNow()):RegistryState{
 const asset=assetOf(state,input.assetId);usable(asset)
 date(input.startOn,'Policy start');date(input.endOn,'Policy end')
 if(input.endOn<=input.startOn)throw Error('Coverage expiry must be after the start date.')
 amount(input.coverageAmount,'Coverage');if(input.premiumAmount!==null)amount(input.premiumAmount,'Premium')
 let old:InsurancePolicy|undefined
 if(replacesId){
  old=state.phase4.policies.find(p=>p.id===replacesId)
  if(!old||old.assetId!==asset.id||old.status!=='RECORDED')throw Error('Choose a current, matching policy to renew.')
  if(input.startOn<old.startOn)throw Error('Renewal cannot begin before the policy being renewed.')
 } else if(state.phase4.policies.some(p=>p.assetId===asset.id&&p.policyReference.trim().toLowerCase()===input.policyReference.trim().toLowerCase()&&p.status==='RECORDED'))
  throw Error('An active recorded policy already uses this reference.')
 const policy:InsurancePolicy={...input,id:uid(),currency:asset.currency,insurerLabel:string(input.insurerLabel,'Insurer',120,true),
  policyReference:string(input.policyReference,'Policy reference',120,true),
  policyType:string(input.policyType,'Policy type',100,true),notes:string(input.notes,'Notes',500),
  status:'RECORDED',replacesId,recordedAt:at}
 const policies=state.phase4.policies.map(p=>p.id===replacesId?{...p,status:'SUPERSEDED' as const}:p)
 return {...state,phase4:{...state.phase4,policies:[policy,...policies]},records:touched(state,asset.id,at),
  activity:history(state,asset,'INSURANCE_RECORDED',replacesId?'Renewal recorded locally; old coverage retained in history.':'Insurance coverage reference recorded; unverified.',at)}
}
export function cancelPolicy(state:RegistryState,id:string,at=utcNow()):RegistryState{
 const policy=state.phase4.policies.find(p=>p.id===id)
 if(!policy||policy.status!=='RECORDED')throw Error('Choose a current policy to cancel.')
 const a=assetOf(state,policy.assetId);usable(a)
 return {...state,phase4:{...state.phase4,policies:state.phase4.policies.map(p=>p.id===id?{...p,status:'CANCELLED' as const}:p)},
  activity:history(state,a,'INSURANCE_CHANGED','Policy reference cancelled locally; issuer not notified.',at)}
}
export function policyState(policy:InsurancePolicy,asOf:string):'UPCOMING'|'ACTIVE'|'EXPIRED'|'CANCELLED'|'SUPERSEDED'{
 if(policy.status==='CANCELLED')return 'CANCELLED'
 if(policy.status==='SUPERSEDED')return 'SUPERSEDED'
 if(asOf<policy.startOn)return 'UPCOMING'
 return asOf>policy.endOn?'EXPIRED':'ACTIVE'
}
export type ReadingInput=Pick<UtilizationReading,'assetId'|'metric'|'observedOn'|'value'|'sourceLabel'|'notes'>
export function recordReading(state:RegistryState,input:ReadingInput,at=utcNow()):RegistryState{
 const asset=assetOf(state,input.assetId);usable(asset)
 if(!METRICS.includes(input.metric))throw Error('Invalid utilization metric.')
 pastDate(input.observedOn,'Observation date',at)
 if(asset.acquiredOn&&input.observedOn<asset.acquiredOn)throw Error('Observation cannot predate acquisition.')
 amount(input.value,'Reading value')
 if(['USE_COUNT','OCCUPIED_DAYS'].includes(input.metric)&&!Number.isInteger(input.value))throw Error('This reading type requires a whole number.')
 const prev=latestReading(state,asset.id,input.metric)
 if(prev&&input.observedOn<prev.observedOn)throw Error('Observation cannot be backdated before a later reading.')
 if(prev&&input.value<prev.value)throw Error('Cumulative readings cannot decrease.')
 const reading:UtilizationReading={...input,id:uid(),sourceLabel:string(input.sourceLabel,'Reading source',120,true),
  notes:string(input.notes,'Notes',400),recordedAt:at}
 return {...state,phase4:{...state.phase4,readings:[reading,...state.phase4.readings]},records:touched(state,asset.id,at),
  activity:history(state,asset,'UTILIZATION_RECORDED',input.metric+' reading recorded manually. No telemetry connection.',at)}
}
export function latestReading(state:RegistryState,assetId:string,metric:UtilizationMetric){
 return state.phase4.readings.filter(r=>r.assetId===assetId&&r.metric===metric)
  .sort((a,b)=>b.observedOn.localeCompare(a.observedOn)||b.recordedAt.localeCompare(a.recordedAt))[0]
}
export function utilizationSeries(state:RegistryState,assetId:string,metric:UtilizationMetric){
 const rows=state.phase4.readings.filter(r=>r.assetId===assetId&&r.metric===metric)
  .sort((a,b)=>a.observedOn.localeCompare(b.observedOn)||a.recordedAt.localeCompare(b.recordedAt))
 return rows.map((reading,index)=>({...reading,delta:index===0?null:Math.round((reading.value-rows[index-1].value)*100)/100}))
}
export type EvidenceInput=Pick<EvidenceReference,'assetId'|'kind'|'title'|'reference'|'issuedOn'|'expiresOn'|'notes'>
export function addEvidence(state:RegistryState,input:EvidenceInput,at=utcNow()):RegistryState{
 const asset=assetOf(state,input.assetId);usable(asset)
 if(!DOCUMENT_KINDS.includes(input.kind))throw Error('Invalid evidence category.')
 if(input.issuedOn)pastDate(input.issuedOn,'Issue date',at)
 if(input.expiresOn)date(input.expiresOn,'Expiry')
 if(input.issuedOn&&input.expiresOn&&input.expiresOn<input.issuedOn)throw Error('Expiry cannot precede issuance.')
 const doc:EvidenceReference={...input,id:uid(),title:string(input.title,'Evidence title',120,true),
  reference:string(input.reference,'Evidence reference',160,true),notes:string(input.notes,'Notes',400),recordedAt:at}
 if(/https?:\/\/|data:|base64,/i.test(doc.reference))throw Error('Do not store URLs, encoded files or secrets; use a non-sensitive reference only.')
 return {...state,phase4:{...state.phase4,documents:[doc,...state.phase4.documents]},records:touched(state,asset.id,at),
  activity:history(state,asset,'EVIDENCE_REFERENCED','Evidence metadata referenced; no document file uploaded.',at)}
}
export type LocationInput=Pick<LocationChange,'assetId'|'toLabel'|'effectiveOn'|'reason'>
export function moveLocation(state:RegistryState,input:LocationInput,at=utcNow()):RegistryState{
 const asset=assetOf(state,input.assetId);usable(asset)
 pastDate(input.effectiveOn,'Move effective date',at)
 const previous=state.phase4.locations.filter(l=>l.assetId===asset.id).sort((a,b)=>b.effectiveOn.localeCompare(a.effectiveOn))[0]
 if(previous&&input.effectiveOn<previous.effectiveOn)throw Error('Cannot backdate a move before the latest recorded location.')
 const destination=string(input.toLabel,'Destination',150,true)
 if(asset.location.trim().toLowerCase()===destination.toLowerCase())throw Error('Asset is already at that location.')
 const change:LocationChange={id:uid(),assetId:asset.id,fromLabel:asset.location,toLabel:destination,
  effectiveOn:input.effectiveOn,reason:string(input.reason,'Move reason',400),recordedAt:at}
 return {...state,records:state.records.map(a=>a.id===asset.id?{...a,location:destination,updatedAt:at}:a),
  phase4:{...state.phase4,locations:[change,...state.phase4.locations]},
  activity:history(state,asset,'LOCATION_CHANGED','Location changed to '+destination+' (manually recorded).',at)}
}
export type RelationInput=Pick<AssetRelation,'assetId'|'relatedAssetId'|'type'|'note'>
function reaches(relations:AssetRelation[],start:string,target:string,type:RelationType,visited=new Set<string>()):boolean{
 if(start===target)return true
 if(visited.has(start))return false
 visited.add(start)
 return relations.some(r=>r.type===type&&r.assetId===start&&reaches(relations,r.relatedAssetId,target,type,visited))
}
export function addRelation(state:RegistryState,input:RelationInput,at=utcNow()):RegistryState{
 const asset=assetOf(state,input.assetId),related=assetOf(state,input.relatedAssetId)
 usable(asset);usable(related)
 if(asset.id===related.id)throw Error('An asset cannot relate to itself.')
 if(!RELATION_TYPES.includes(input.type))throw Error('Invalid asset relationship.')
 if(state.phase4.relations.some(r=>r.assetId===asset.id&&r.relatedAssetId===related.id&&r.type===input.type))throw Error('This relationship already exists.')
 if(['COMPONENT_OF','DEPENDS_ON'].includes(input.type)&&reaches(state.phase4.relations,related.id,asset.id,input.type))
  throw Error('This relation would create a dependency cycle.')
 const relation:AssetRelation={...input,id:uid(),note:string(input.note,'Relation note',400),recordedAt:at}
 return {...state,phase4:{...state.phase4,relations:[relation,...state.phase4.relations]},
  activity:history(state,asset,'ASSET_RELATED','Linked to '+related.name+' as '+input.type+' in browser preview.',at)}
}
export type CalendarEvent={
 id:string;assetId:string;date:string;kind:'MAINTENANCE_DUE'|'SERVICE_SCHEDULED'|'POLICY_EXPIRY'|'EVIDENCE_EXPIRY';
 title:string;sourceId:string
}
export function operationalEvents(state:RegistryState):CalendarEvent[]{
 const events:CalendarEvent[]=[]
 const eligible=(assetId:string)=>state.records.some(a=>a.id===assetId&&['ACQUIRED','ACTIVE','SUSPENDED'].includes(a.lifecycle))
 for(const p of state.phase4.plans.filter(x=>x.status==='ACTIVE'&&eligible(x.assetId)))events.push({id:'plan-'+p.id,assetId:p.assetId,date:p.nextDue,kind:'MAINTENANCE_DUE',title:p.title,sourceId:p.id})
 for(const j of state.phase4.jobs.filter(x=>(x.status==='SCHEDULED'||x.status==='IN_PROGRESS')&&eligible(x.assetId)))events.push({id:'job-'+j.id,assetId:j.assetId,date:j.scheduledFor,kind:'SERVICE_SCHEDULED',title:j.title,sourceId:j.id})
 for(const p of state.phase4.policies.filter(x=>x.status==='RECORDED'&&eligible(x.assetId)))events.push({id:'policy-'+p.id,assetId:p.assetId,date:p.endOn,kind:'POLICY_EXPIRY',title:p.policyType+' expiry',sourceId:p.id})
 for(const d of state.phase4.documents.filter(x=>x.expiresOn&&eligible(x.assetId)))events.push({id:'doc-'+d.id,assetId:d.assetId,date:d.expiresOn!,kind:'EVIDENCE_EXPIRY',title:d.title+' expiry',sourceId:d.id})
 return events.sort((a,b)=>a.date.localeCompare(b.date)||a.kind.localeCompare(b.kind))
}
export function eventUrgency(dateValue:string,asOf:string):'OVERDUE'|'TODAY'|'UPCOMING'{
 return dateValue<asOf?'OVERDUE':dateValue===asOf?'TODAY':'UPCOMING'
}
