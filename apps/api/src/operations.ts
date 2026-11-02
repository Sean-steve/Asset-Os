import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import type {TenantSqlClient} from './database.js'
import {ApiFault,type VerifiedMembership} from './identity.js'
import {getAsset,requestFingerprint} from './registry.js'
import {asCents} from './lifecycle.js'
import {
 EvidenceRecord,IdempotencyKey,IfMatchVersion,IsoDate,JobAction,JobCreate,
 LocationRecord,PlanAction,PlanCreate,PolicyAction,PolicyRecord,
 ReadingRecord,RelationRecord,Uuid
} from './contracts.js'

// B4 is evidence and scheduling authority only: no external dispatch, insurer
// verification, telematics or Finance OS accounting. All writes share one
// verified membership + tenant RLS transaction with asset version and audit.
type Lock={id:string;tenant_id:string;currency:string;lifecycle:string;record_version:number;acquired_on:string|null;location_label:string}
type Result={status:number;recordId:string;event:string;audit:string;field:string;value:Record<string,unknown>}
type Command={status:number;body:{asset:Awaited<ReturnType<typeof getAsset>>;[key:string]:unknown};replayed:boolean}
const eligible=['ACQUIRED','ACTIVE','SUSPENDED']
const uid=()=>randomUUID()
const dateValue=(value:unknown)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10)
const fail=(status:number,code:string,message:string):never=>{throw new ApiFault(status,code,message)}
const validId=(value:string)=>{if(!Uuid.safeParse(value).success)fail(400,'INVALID_ID','Expected a UUID.');return value}
const today=()=>new Date().toISOString().slice(0,10)
const parse=<T>(schema:z.ZodType<T>,input:unknown):T=>{
 const result=schema.safeParse(input)
 if(!result.success)throw new ApiFault(400,'INVALID_REQUEST','Request does not match the B4 domain contract.')
 return result.data
}
export function assertDay(value:string,{future=false}: {future?:boolean}={}){
 if(!IsoDate.safeParse(value).success||( !future&&value>today()))
  fail(422,'INVALID_OPERATIONAL_DATE','Date must be valid'+(future?'':', and may not be in the future')+'.')
}
function checkDate(value:string,asset:Lock,future=false){
 assertDay(value,{future})
 if(asset.acquired_on&&value<asset.acquired_on)
  fail(422,'BEFORE_ACQUISITION','Operational record cannot predate asset acquisition.')
}
export function advanceDue(date:string,interval:number,unit:'DAYS'|'WEEKS'|'MONTHS'){
 assertDay(date,{future:true})
 if(!Number.isInteger(interval)||interval<1||interval>365)throw Error('Invalid interval')
 const [year,month,day]=date.split('-').map(Number)
 if(unit==='MONTHS'){
  const first=new Date(Date.UTC(year,month-1+interval,1))
  const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate()
  first.setUTCDate(Math.min(day,last))
  return first.toISOString().slice(0,10)
 }
 const start=new Date(Date.UTC(year,month-1,day))
 start.setUTCDate(start.getUTCDate()+interval*(unit==='WEEKS'?7:1))
 return start.toISOString().slice(0,10)
}
function versions(match:string|undefined,key:string|undefined){
 if(!match)throw new ApiFault(428,'IF_MATCH_REQUIRED','Provide the current strong asset ETag.')
 if(!IfMatchVersion.safeParse(match).success)fail(400,'INVALID_IF_MATCH','Expected a strong numeric asset ETag.')
 if(!IdempotencyKey.safeParse(key).success)fail(428,'IDEMPOTENCY_KEY_REQUIRED','Provide a valid Idempotency-Key.')
 return {version:Number(match.slice(1,-1)),key:key as string}
}
async function lock(client:TenantSqlClient,tenantId:string,assetId:string,version:number){
 const rows=await client.query(
  "SELECT id,tenant_id,currency,lifecycle,record_version,to_char(acquired_on,'YYYY-MM-DD') AS acquired_on,location_label FROM asset_os.assets WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
  [tenantId,assetId])
 const asset=rows.rows[0] as Lock|undefined
 if(!asset)throw new ApiFault(404,'ASSET_NOT_FOUND','Asset not found in this tenant.')
 if(asset.record_version!==version)fail(412,'RECORD_VERSION_CONFLICT','Asset changed. Reload the current version.')
 if(!eligible.includes(asset.lifecycle))fail(409,'ASSET_NOT_OPERATIONALLY_ACTIVE','Operational writes require acquired, active or suspended assets.')
 return asset
}
async function run(
 client:TenantSqlClient,member:VerifiedMembership,assetId:string,operation:string,
 input:unknown,match:string|undefined,keyHeader:string|undefined,requestId:string,
 action:(asset:Lock)=>Promise<Result>
):Promise<Command>{
 validId(assetId)
 const {version,key}=versions(match,keyHeader)
 const name='operations.'+operation+':'+assetId
 const hash=requestFingerprint({name,version,input})
 const reserved=await client.query(
  "INSERT INTO asset_os.idempotency_keys(tenant_id,operation,idempotency_key,request_hash,expires_at) VALUES($1,$2,$3,$4,clock_timestamp()+interval '24 hours') ON CONFLICT (tenant_id,operation,idempotency_key) DO NOTHING RETURNING id",
  [member.tenantId,name,key,hash])
 if(!reserved.rowCount){
  const existing=(await client.query(
   'SELECT request_hash,response_code,response_body FROM asset_os.idempotency_keys WHERE tenant_id=$1 AND operation=$2 AND idempotency_key=$3 FOR UPDATE',
   [member.tenantId,name,key])).rows[0] as {request_hash:string;response_code:number|null;response_body:Command['body']|null}|undefined
  if(!existing)throw new ApiFault(409,'IDEMPOTENCY_UNAVAILABLE','Original write was unavailable.')
  if(existing.request_hash!==hash)fail(409,'IDEMPOTENCY_KEY_CONFLICT','Key was used with different request data.')
  if(!existing.response_code||!existing.response_body)throw new ApiFault(409,'IDEMPOTENCY_IN_PROGRESS','Original write was not committed.')
  return {status:existing.response_code,body:existing.response_body,replayed:true}
 }
 const asset=await lock(client,member.tenantId,assetId,version)
 const result=await action(asset)
 const updated=await client.query(
  'UPDATE asset_os.assets SET record_version=record_version+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND record_version=$3 RETURNING record_version',
  [member.tenantId,assetId,version])
 if(!updated.rowCount)fail(412,'RECORD_VERSION_CONFLICT','Concurrent update. Reload the asset.')
 const v=(updated.rows[0] as {record_version:number}).record_version
 await client.query(
  'INSERT INTO asset_os.audit_events(tenant_id,actor_binding_id,request_id,event_kind,subject_kind,subject_id,detail) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',
  [member.tenantId,member.identityId,requestId,result.audit,'ASSET',assetId,JSON.stringify({recordId:result.recordId,recordVersion:v})])
 await client.query(
  'INSERT INTO asset_os.outbox_events(event_id,tenant_id,type,schema_version,aggregate_kind,aggregate_id,payload,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)',
  [uid(),member.tenantId,result.event,1,'ASSET',assetId,JSON.stringify({assetId,recordId:result.recordId,recordVersion:v}),requestId])
 const updatedAsset=await getAsset(client,member.tenantId,assetId)
 const body={asset:updatedAsset,[result.field]:result.value}
 await client.query(
  'UPDATE asset_os.idempotency_keys SET response_code=$4,response_body=$5::jsonb WHERE tenant_id=$1 AND operation=$2 AND idempotency_key=$3',
  [member.tenantId,name,key,result.status,JSON.stringify(body)])
 return {status:result.status,body,replayed:false}
}
const outcome=(status:number,id:string,event:string,audit:string,field:string,value:Record<string,unknown>):Result=>
 ({status,recordId:id,event:'asset.'+event+'.v1',audit,field,value})
const readOne=async(client:TenantSqlClient,tenant:string,table:string,assetId:string,id:string)=>{
 validId(id)
 const r=await client.query('SELECT * FROM asset_os.'+table+' WHERE tenant_id=$1 AND asset_id=$2 AND id=$3 FOR UPDATE',
  [tenant,assetId,id])
 if(!r.rows.length)fail(404,'OPERATION_RECORD_NOT_FOUND','Record not found for this tenant asset.')
 return r.rows[0] as Record<string,unknown>
}
export async function recordPlan(client:TenantSqlClient,m:VerifiedMembership,id:string,input:unknown,match:string|undefined,key:string|undefined,requestId:string){
 const d=parse(PlanCreate,input)
 assertDay(d.nextDue,{future:true})
 return run(client,m,id,'maintenance.create',d,match,key,requestId,async asset=>{
  // A due date may be future; a historical due date cannot predate acquisition.
  checkDate(d.nextDue,asset,true)
  const recordId=uid()
  await client.query(
   'INSERT INTO asset_os.maintenance_plans(id,tenant_id,asset_id,title,description,interval_value,interval_unit,next_due) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
   [recordId,m.tenantId,id,d.title,d.description,d.intervalValue,d.intervalUnit,d.nextDue])
  return outcome(201,recordId,'maintenance.plan.recorded','MAINTENANCE_PLAN_RECORDED','plan',
   {id:recordId,assetId:id,...d,status:'ACTIVE',lastCompletedOn:null,sourceAuthority:'USER_ENTRY'})
 })
}
export async function planAction(client:TenantSqlClient,m:VerifiedMembership,id:string,planId:string,input:unknown,match:string|undefined,key:string|undefined,requestId:string){
 const d=parse(PlanAction,input)
 return run(client,m,id,'maintenance.action:'+validId(planId),d,match,key,requestId,async()=>{
  const p=await readOne(client,m.tenantId,'maintenance_plans',id,planId)
  const target=d.action==='PAUSE'?'PAUSED':'ACTIVE'
  if(p.status===target)fail(409,'PLAN_ALREADY_IN_STATE','Plan already has that status.')
  await client.query('UPDATE asset_os.maintenance_plans SET status=$4 WHERE tenant_id=$1 AND asset_id=$2 AND id=$3',
   [m.tenantId,id,planId,target])
  return outcome(200,planId,'maintenance.plan.status.changed','MAINTENANCE_PLAN_STATUS_CHANGED','plan',
   {id:planId,status:target})
 })
}
export async function recordJob(client:TenantSqlClient,m:VerifiedMembership,id:string,input:unknown,match:string|undefined,key:string|undefined,requestId:string){
 const d=parse(JobCreate,input)
 assertDay(d.scheduledFor,{future:true})
 return run(client,m,id,'service.schedule',d,match,key,requestId,async asset=>{
  checkDate(d.scheduledFor,asset,true)
  if(d.planId){const plan=await readOne(client,m.tenantId,'maintenance_plans',id,d.planId)
   if(plan.status!=='ACTIVE')fail(409,'PLAN_PAUSED','A linked service job requires an active maintenance plan.')
  }
  const recordId=uid()
  await client.query(
   'INSERT INTO asset_os.service_jobs(id,tenant_id,asset_id,plan_id,title,scheduled_for,provider_label,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
   [recordId,m.tenantId,id,d.planId,d.title,d.scheduledFor,d.providerLabel,d.notes])
  return outcome(201,recordId,'service.job.scheduled','SERVICE_JOB_SCHEDULED','job',
   {id:recordId,assetId:id,...d,status:'SCHEDULED',completionNotes:'',completedOn:null,recordedCost:null})
 })
}
export async function jobAction(client:TenantSqlClient,m:VerifiedMembership,id:string,jobId:string,input:unknown,match:string|undefined,key:string|undefined,requestId:string){
 const d=parse(JobAction,input)
 return run(client,m,id,'service.action:'+validId(jobId),d,match,key,requestId,async asset=>{
  const job=await readOne(client,m.tenantId,'service_jobs',id,jobId)
  const status=String(job.status)
  if(status==='COMPLETED'||status==='CANCELLED')fail(409,'SERVICE_JOB_TERMINAL','Completed/cancelled jobs cannot change.')
  if(d.action==='START'&&status!=='SCHEDULED')fail(409,'SERVICE_JOB_STATE_CONFLICT','Only scheduled jobs may start.')
  let next:string
  if(d.action==='START')next='IN_PROGRESS'
  else if(d.action==='CANCEL')next='CANCELLED'
  else {
   checkDate(d.completedOn,asset)
   if(d.completedOn<dateValue(job.scheduled_for))fail(422,'COMPLETION_BEFORE_SCHEDULE','Completion cannot precede scheduled date.')
   next='COMPLETED'
  }
  const completedOn=d.action==='COMPLETE'?d.completedOn:null
  const cost=d.action==='COMPLETE'?d.recordedCost:null
  const notes=d.action==='COMPLETE'?d.completionNotes:''
  await client.query(
   'UPDATE asset_os.service_jobs SET status=$4,completed_on=$5,recorded_cost=$6,completion_notes=$7 WHERE tenant_id=$1 AND asset_id=$2 AND id=$3',
   [m.tenantId,id,jobId,next,completedOn,cost,notes])
  if(next==='COMPLETED'&&job.plan_id){
   const plan=await readOne(client,m.tenantId,'maintenance_plans',id,String(job.plan_id))
   if(plan.status==='ACTIVE'){
    const due=advanceDue(completedOn as string,Number(plan.interval_value),String(plan.interval_unit) as 'DAYS'|'WEEKS'|'MONTHS')
    await client.query('UPDATE asset_os.maintenance_plans SET last_completed_on=$4,next_due=$5 WHERE tenant_id=$1 AND asset_id=$2 AND id=$3',
     [m.tenantId,id,job.plan_id,completedOn,due])
   }
  }
  return outcome(200,jobId,'service.job.status.changed','SERVICE_JOB_STATUS_CHANGED','job',
   {id:jobId,status:next,completedOn,recordedCost:cost,completionNotes:notes,
    financePosted:false,providerDispatched:false})
 })
}
export async function recordPolicy(client:TenantSqlClient,m:VerifiedMembership,id:string,input:unknown,match:string|undefined,key:string|undefined,requestId:string){
 const d=parse(PolicyRecord,input)
 assertDay(d.startOn,{future:true});assertDay(d.endOn,{future:true})
 if(d.endOn<=d.startOn)fail(422,'INVALID_POLICY_PERIOD','End date cannot precede start date.')
 return run(client,m,id,'insurance.record',d,match,key,requestId,async asset=>{
  checkDate(d.startOn,asset,true)
  if(d.policyReference){
   const duplicate=await client.query("SELECT id FROM asset_os.insurance_policies WHERE tenant_id=$1 AND asset_id=$2 AND status='RECORDED' AND lower(trim(policy_reference))=lower(trim($3)) AND id<>COALESCE($4::uuid,'00000000-0000-0000-0000-000000000000')",[m.tenantId,id,d.policyReference,d.replacesId])
   if(duplicate.rowCount)fail(409,'POLICY_REFERENCE_EXISTS','A recorded current policy already uses that reference.')
  }
  if(d.replacesId){
   const previous=await readOne(client,m.tenantId,'insurance_policies',id,d.replacesId)
   if(previous.status!=='RECORDED')fail(409,'POLICY_NOT_CURRENT','Only a currently recorded policy can be superseded.')
   if(d.startOn<dateValue(previous.start_on))fail(422,'POLICY_DATE_REGRESSION','Replacement cannot predate original policy start.')
   await client.query(
    "UPDATE asset_os.insurance_policies SET status='SUPERSEDED' WHERE tenant_id=$1 AND asset_id=$2 AND id=$3",
    [m.tenantId,id,d.replacesId])
  }
  const recordId=uid()
  await client.query(
   'INSERT INTO asset_os.insurance_policies(id,tenant_id,asset_id,insurer_label,policy_reference,policy_type,start_on,end_on,coverage_amount,premium_amount,currency,notes,replaces_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
   [recordId,m.tenantId,id,d.insurerLabel,d.policyReference,d.policyType,d.startOn,d.endOn,
    d.coverageAmount,d.premiumAmount,asset.currency,d.notes,d.replacesId])
  return outcome(201,recordId,'insurance.policy.recorded','INSURANCE_POLICY_RECORDED','policy',
   {id:recordId,assetId:id,currency:asset.currency,...d,status:'RECORDED',
    verified:false,premiumPaid:false,underwriterConnected:false})
 })
}
export async function policyAction(client:TenantSqlClient,m:VerifiedMembership,id:string,policyId:string,input:unknown,match:string|undefined,key:string|undefined,requestId:string){
 const d=parse(PolicyAction,input)
 return run(client,m,id,'insurance.action:'+validId(policyId),d,match,key,requestId,async()=>{
  const policy=await readOne(client,m.tenantId,'insurance_policies',id,policyId)
  if(policy.status!=='RECORDED')fail(409,'POLICY_ALREADY_REVIEWED','Only a recorded policy may be cancelled.')
  await client.query("UPDATE asset_os.insurance_policies SET status='CANCELLED' WHERE tenant_id=$1 AND asset_id=$2 AND id=$3",
   [m.tenantId,id,policyId])
  return outcome(200,policyId,'insurance.policy.cancelled','INSURANCE_POLICY_CANCELLED','policy',
   {id:policyId,status:'CANCELLED',verified:false})
 })
}
export async function recordReading(client:TenantSqlClient,m:VerifiedMembership,id:string,input:unknown,match:string|undefined,key:string|undefined,requestId:string){
 const d=parse(ReadingRecord,input);assertDay(d.observedOn)
 return run(client,m,id,'utilization.observe',d,match,key,requestId,async asset=>{
  checkDate(d.observedOn,asset)
  const previous=(await client.query(
   "SELECT to_char(observed_on,'YYYY-MM-DD') AS date,reading::text AS amount FROM asset_os.utilization_readings WHERE tenant_id=$1 AND asset_id=$2 AND metric=$3 ORDER BY observed_on DESC LIMIT 1",
   [m.tenantId,id,d.metric])).rows[0] as {date:string;amount:string}|undefined
  if(previous&&(d.observedOn<=previous.date||asCents(d.reading)<asCents(previous.amount)))
   fail(409,'NONMONOTONIC_READING','Cumulative reading must have a later date and nondecreasing value.')
  const recordId=uid()
  await client.query('INSERT INTO asset_os.utilization_readings(id,tenant_id,asset_id,metric,observed_on,reading,source_label,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
   [recordId,m.tenantId,id,d.metric,d.observedOn,d.reading,d.sourceLabel,d.notes])
  return outcome(201,recordId,'utilization.reading.recorded','UTILIZATION_READING_RECORDED','reading',
   {id:recordId,assetId:id,...d,sourceAuthority:'USER_ENTRY'})
 })
}
export async function recordEvidence(client:TenantSqlClient,m:VerifiedMembership,id:string,input:unknown,match:string|undefined,key:string|undefined,requestId:string){
 const d=parse(EvidenceRecord,input)
 if(/https?:\/\/|data:|base64,|-----BEGIN/i.test(d.reference))fail(422,'UNSAFE_EVIDENCE_REFERENCE','Use an opaque reference label, not a URL, document or encoded secret.')
 if(d.issuedOn)assertDay(d.issuedOn)
 if(d.expiresOn)assertDay(d.expiresOn,{future:true})
 if(d.issuedOn&&d.expiresOn&&d.expiresOn<d.issuedOn)fail(422,'INVALID_EVIDENCE_PERIOD','Expiry cannot precede issue date.')
 return run(client,m,id,'evidence.reference',d,match,key,requestId,async asset=>{
  if(d.issuedOn)checkDate(d.issuedOn,asset)
  const recordId=uid()
  await client.query('INSERT INTO asset_os.document_references(id,tenant_id,asset_id,kind,title,opaque_reference,issued_on,expires_on,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
   [recordId,m.tenantId,id,d.kind,d.title,d.reference,d.issuedOn,d.expiresOn,d.notes])
  return outcome(201,recordId,'evidence.reference.recorded','EVIDENCE_REFERENCE_RECORDED','evidence',
   {id:recordId,assetId:id,...d,verified:false,documentUploaded:false})
 })
}
export async function recordLocation(client:TenantSqlClient,m:VerifiedMembership,id:string,input:unknown,match:string|undefined,key:string|undefined,requestId:string){
 const d=parse(LocationRecord,input);assertDay(d.effectiveOn)
 return run(client,m,id,'location.label',d,match,key,requestId,async asset=>{
  checkDate(d.effectiveOn,asset)
  const previous=(await client.query(
   "SELECT to_label,to_char(effective_on,'YYYY-MM-DD') AS date FROM asset_os.location_events WHERE tenant_id=$1 AND asset_id=$2 ORDER BY effective_on DESC,id DESC LIMIT 1",
   [m.tenantId,id])).rows[0] as {to_label:string;date:string}|undefined
  if(previous&&d.effectiveOn<previous.date)fail(409,'LOCATION_DATE_REGRESSION','Location history dates cannot regress.')
  const fromLabel=previous?.to_label||asset.location_label
  if(d.toLabel===fromLabel)fail(409,'LOCATION_UNCHANGED','New location label must differ from current label.')
  const recordId=uid()
  await client.query(
   'INSERT INTO asset_os.location_events(id,tenant_id,asset_id,from_label,to_label,effective_on,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',
   [recordId,m.tenantId,id,fromLabel,d.toLabel,d.effectiveOn,d.reason])
  await client.query('UPDATE asset_os.assets SET location_label=$3 WHERE tenant_id=$1 AND id=$2',[m.tenantId,id,d.toLabel])
  return outcome(201,recordId,'location.label.recorded','LOCATION_LABEL_RECORDED','location',
   {id:recordId,assetId:id,fromLabel,...d,liveTracking:false})
 })
}
export async function recordRelation(client:TenantSqlClient,m:VerifiedMembership,id:string,input:unknown,match:string|undefined,key:string|undefined,requestId:string){
 const d=parse(RelationRecord,input)
 if(id===d.relatedAssetId)fail(422,'SELF_RELATION_NOT_ALLOWED','Cannot link asset to itself.')
 return run(client,m,id,'relation.link',d,match,key,requestId,async()=>{
  // Serialize graph writes per tenant to make cycle checks race-safe.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('asset-os-relations:' || $1))",[m.tenantId])
  const target=await getAsset(client,m.tenantId,d.relatedAssetId)
  if(target.tenantId!==m.tenantId)fail(404,'RELATED_ASSET_NOT_FOUND','Related asset not in tenant.')
  if(!eligible.includes(target.lifecycle))fail(409,'RELATED_ASSET_INACTIVE','Related asset must be acquired, active or suspended.')
  if(['COMPONENT_OF','DEPENDS_ON'].includes(d.type)){
   const cycle=await client.query(
    'WITH RECURSIVE walk(id) AS (SELECT related_asset_id FROM asset_os.asset_relationships WHERE tenant_id=$1 AND asset_id=$2 AND relation=$3 UNION SELECT a.related_asset_id FROM asset_os.asset_relationships a JOIN walk w ON a.asset_id=w.id WHERE a.tenant_id=$1 AND a.relation=$3) SELECT 1 FROM walk WHERE id=$4 LIMIT 1',
    [m.tenantId,d.relatedAssetId,d.type,id])
   if(cycle.rowCount)fail(409,'ASSET_RELATION_CYCLE','Dependency or component relationship would create a cycle.')
  }
  const exists=await client.query(
   'SELECT id FROM asset_os.asset_relationships WHERE tenant_id=$1 AND asset_id=$2 AND related_asset_id=$3 AND relation=$4',
   [m.tenantId,id,d.relatedAssetId,d.type])
  if(exists.rowCount)fail(409,'RELATION_EXISTS','The same relationship has already been recorded.')
  const recordId=uid()
  await client.query('INSERT INTO asset_os.asset_relationships(id,tenant_id,asset_id,related_asset_id,relation,note) VALUES($1,$2,$3,$4,$5,$6)',
   [recordId,m.tenantId,id,d.relatedAssetId,d.type,d.note])
  return outcome(201,recordId,'relationship.recorded','ASSET_RELATIONSHIP_RECORDED','relation',
   {id:recordId,assetId:id,...d,verified:false})
 })
}

const entries={
 'maintenance-plans':{table:'maintenance_plans',sort:'created_at',
  columns:'id,title,description,interval_value AS "intervalValue",interval_unit AS "intervalUnit",to_char(next_due,\'YYYY-MM-DD\') AS "nextDue",status,to_char(last_completed_on,\'YYYY-MM-DD\') AS "lastCompletedOn",created_at AS "recordedAt"'},
 'service-jobs':{table:'service_jobs',sort:'recorded_at',
  columns:'id,plan_id AS "planId",title,to_char(scheduled_for,\'YYYY-MM-DD\') AS "scheduledFor",provider_label AS "providerLabel",status,notes,to_char(completed_on,\'YYYY-MM-DD\') AS "completedOn",recorded_cost::text AS "recordedCost",completion_notes AS "completionNotes",recorded_at AS "recordedAt"'},
 'insurance-policies':{table:'insurance_policies',sort:'recorded_at',
  columns:'id,insurer_label AS "insurerLabel",policy_reference AS "policyReference",policy_type AS "policyType",to_char(start_on,\'YYYY-MM-DD\') AS "startOn",to_char(end_on,\'YYYY-MM-DD\') AS "endOn",coverage_amount::text AS "coverageAmount",premium_amount::text AS "premiumAmount",currency,notes,status,replaces_id AS "replacesId",recorded_at AS "recordedAt"'},
 'utilization-readings':{table:'utilization_readings',sort:'recorded_at',
  columns:'id,metric,to_char(observed_on,\'YYYY-MM-DD\') AS "observedOn",reading::text,source_label AS "sourceLabel",notes,recorded_at AS "recordedAt"'},
 'evidence-references':{table:'document_references',sort:'recorded_at',
  columns:'id,kind,title,opaque_reference AS "reference",to_char(issued_on,\'YYYY-MM-DD\') AS "issuedOn",to_char(expires_on,\'YYYY-MM-DD\') AS "expiresOn",notes,recorded_at AS "recordedAt"'},
 'location-events':{table:'location_events',sort:'recorded_at',
  columns:'id,from_label AS "fromLabel",to_label AS "toLabel",to_char(effective_on,\'YYYY-MM-DD\') AS "effectiveOn",reason,recorded_at AS "recordedAt"'},
 'asset-relationships':{table:'asset_relationships',sort:'recorded_at',
  columns:'id,related_asset_id AS "relatedAssetId",relation AS type,note,recorded_at AS "recordedAt"'}
} as const
export type OperationsListKind=keyof typeof entries
export async function listOperations(client:TenantSqlClient,tenantId:string,assetId:string,kind:OperationsListKind,query:unknown){
 await getAsset(client,tenantId,assetId)
 const args=parse(z.object({limit:z.coerce.number().int().min(1).max(100).default(30),cursor:z.string().max(512).optional()}).strict(),query)
 const meta=entries[kind]
 const values:unknown[]=[tenantId,assetId]
 let filter='tenant_id=$1 AND asset_id=$2'
 if(args.cursor){
  let cursor:{timestamp:string;id:string}|null=null
  try{
   cursor=z.object({timestamp:z.iso.datetime({offset:true}),id:Uuid}).strict()
    .parse(JSON.parse(Buffer.from(args.cursor,'base64url').toString('utf8')))
  }catch{throw new ApiFault(400,'INVALID_CURSOR','Invalid operations pagination cursor.')}
  if(!cursor)throw new ApiFault(400,'INVALID_CURSOR','Invalid operations pagination cursor.')
  values.push(cursor.timestamp,cursor.id)
  filter+=' AND ('+meta.sort+',id)<($3::timestamptz,$4::uuid)'
 }
 values.push(args.limit+1)
 // Table, sort and select are constants, never supplied by the client.
 const rows=(await client.query('SELECT '+meta.columns+' FROM asset_os.'+meta.table+' WHERE '+filter+
  ' ORDER BY '+meta.sort+' DESC,id DESC LIMIT $'+values.length,values)).rows as Array<{id:string;recordedAt:string}>
 const chosen=rows.slice(0,args.limit),last=chosen.at(-1)
 const nextCursor=rows.length>args.limit&&last?
  Buffer.from(JSON.stringify({timestamp:new Date(last.recordedAt).toISOString(),id:last.id})).toString('base64url'):null
 return {items:chosen,nextCursor,limit:args.limit,sourceAuthority:'USER_ENTERED_UNVERIFIED'}
}
export async function operationsSummary(client:TenantSqlClient,tenantId:string,assetId:string){
 const asset=await getAsset(client,tenantId,assetId)
 const [plans,jobs,policies,readings,location,docs,relations]=await Promise.all([
  client.query("SELECT count(*)::integer AS total,count(*) FILTER (WHERE status='ACTIVE')::integer AS active,min(next_due) FILTER (WHERE status='ACTIVE') AS next_due FROM asset_os.maintenance_plans WHERE tenant_id=$1 AND asset_id=$2",[tenantId,assetId]),
  client.query("SELECT count(*)::integer AS total,count(*) FILTER (WHERE status IN ('SCHEDULED','IN_PROGRESS'))::integer AS open FROM asset_os.service_jobs WHERE tenant_id=$1 AND asset_id=$2",[tenantId,assetId]),
  client.query("SELECT count(*)::integer AS total,count(*) FILTER (WHERE status='RECORDED' AND start_on<=CURRENT_DATE AND end_on>=CURRENT_DATE)::integer AS current,count(*) FILTER (WHERE status='RECORDED' AND end_on<CURRENT_DATE)::integer AS expired,min(end_on) FILTER (WHERE status='RECORDED' AND end_on>=CURRENT_DATE) AS next_expiry FROM asset_os.insurance_policies WHERE tenant_id=$1 AND asset_id=$2",[tenantId,assetId]),
  client.query("SELECT DISTINCT ON (metric) metric,reading::text AS reading,to_char(observed_on,'YYYY-MM-DD') AS \"observedOn\" FROM asset_os.utilization_readings WHERE tenant_id=$1 AND asset_id=$2 ORDER BY metric,observed_on DESC,id DESC",[tenantId,assetId]),
  client.query("SELECT to_label AS \"toLabel\",to_char(effective_on,'YYYY-MM-DD') AS \"effectiveOn\" FROM asset_os.location_events WHERE tenant_id=$1 AND asset_id=$2 ORDER BY effective_on DESC,id DESC LIMIT 1",[tenantId,assetId]),
  client.query('SELECT count(*)::integer AS total FROM asset_os.document_references WHERE tenant_id=$1 AND asset_id=$2',[tenantId,assetId]),
  client.query('SELECT count(*)::integer AS total FROM asset_os.asset_relationships WHERE tenant_id=$1 AND asset_id=$2',[tenantId,assetId])
 ])
 const p=plans.rows[0],j=jobs.rows[0],ins=policies.rows[0]
 const asDay=(d:unknown)=>d instanceof Date?d.toISOString().slice(0,10):d?String(d).slice(0,10):null
 return {
  assetId,recordVersion:asset.recordVersion,lifecycle:asset.lifecycle,currency:asset.currency,
  maintenance:{plans:p.total,activePlans:p.active,nextDue:asDay(p.next_due),jobs:j.total,openJobs:j.open},
  insurance:{recordCount:ins.total,recordedDateActive:ins.current,expiredDate:ins.expired,nextExpiry:asDay(ins.next_expiry),
   coverageVerified:false,insurerConnected:false},
  utilization:{latest:readings.rows,sourceAuthority:'USER_ENTRY'},
  location:location.rows[0]||{toLabel:asset.locationLabel||null,effectiveOn:null},
  evidence:{count:docs.rows[0].total,verified:false},
  relationships:{count:relations.rows[0].total,verified:false},
  interpretation:'Recorded operator evidence only. Plans are not dispatched, policies not insurer-verified, and costs not posted to Finance OS.'
 }
}
export async function operationsCalendar(client:TenantSqlClient,tenantId:string,assetId:string){
 await getAsset(client,tenantId,assetId)
 const rows=await client.query(
  "SELECT 'MAINTENANCE_DUE' AS kind,id,to_char(next_due,'YYYY-MM-DD') AS \"dueOn\",title AS label FROM asset_os.maintenance_plans WHERE tenant_id=$1 AND asset_id=$2 AND status='ACTIVE' UNION ALL SELECT 'SERVICE_SCHEDULED' AS kind,id,to_char(scheduled_for,'YYYY-MM-DD') AS \"dueOn\",title AS label FROM asset_os.service_jobs WHERE tenant_id=$1 AND asset_id=$2 AND status IN ('SCHEDULED','IN_PROGRESS') UNION ALL SELECT 'POLICY_EXPIRY' AS kind,id,to_char(end_on,'YYYY-MM-DD') AS \"dueOn\",insurer_label AS label FROM asset_os.insurance_policies WHERE tenant_id=$1 AND asset_id=$2 AND status='RECORDED' UNION ALL SELECT 'EVIDENCE_EXPIRY' AS kind,id,to_char(expires_on,'YYYY-MM-DD') AS \"dueOn\",title AS label FROM asset_os.document_references WHERE tenant_id=$1 AND asset_id=$2 AND expires_on IS NOT NULL ORDER BY \"dueOn\" ASC,id ASC LIMIT 100",
  [tenantId,assetId])
 return {assetId,items:rows.rows,limit:100,notificationDelivered:false,calendarSynced:false,
  note:'Local planning projections only. No external calendar, alerts or dispatch.'}
}
