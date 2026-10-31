import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import type {TenantSqlClient} from './database.js'
import {ApiFault,type VerifiedMembership} from './identity.js'
import {getAsset,requestFingerprint} from './registry.js'
import {
 AcquireRequest,CostComponents,DispositionRequest,IdempotencyKey,IfMatchVersion,IsoDate,
 LifecycleCommand,OwnershipAssignment,OwnershipTransfer,Uuid
} from './contracts.js'

type Lifecycle='PLANNED'|'ACQUISITION_PENDING'|'ACQUIRED'|'ACTIVE'|'SUSPENDED'|'DISPOSED'|'ARCHIVED'
type Lock={id:string;lifecycle:Lifecycle;currency:string;record_version:number;acquired_on:string|null}
type Change={
 event:string;audit:string;next?:Lifecycle;acquiredOn?:string;reason:string;
 recordId?:string;response:Record<string,unknown>;status:number
}
type Mutation={status:number;body:{asset:Awaited<ReturnType<typeof getAsset>>}&Record<string,unknown>;replayed:boolean}
const allowed:Record<Lifecycle,Lifecycle[]>={
 PLANNED:['ACQUISITION_PENDING'],ACQUISITION_PENDING:['ACQUIRED'],
 ACQUIRED:['ACTIVE','DISPOSED'],ACTIVE:['SUSPENDED','DISPOSED'],
 SUSPENDED:['ACTIVE','DISPOSED'],DISPOSED:['ARCHIVED'],ARCHIVED:[]
}
const maxCents=10n**20n-1n
export function asCents(decimal:string):bigint{
 if(!/^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/.test(decimal))throw new ApiFault(400,'INVALID_DECIMAL','Provide a nonnegative exact decimal string.')
 const [major,minor='']=decimal.split('.')
 return BigInt(major)*100n+BigInt(minor.padEnd(2,'0'))
}
export function money(cents:bigint):string{
 const neg=cents<0n
 const absolute=neg?-cents:cents
 return (neg?'-':'')+(absolute/100n).toString()+'.'+(absolute%100n).toString().padStart(2,'0')
}
function ensureMoneyRange(cents:bigint){
 if(cents>maxCents||cents< -maxCents)throw new ApiFault(422,'AMOUNT_OUT_OF_RANGE','Money calculation exceeds the supported decimal range.')
}
function validDay(day:string){
 const parsed=IsoDate.safeParse(day)
 if(!parsed.success||day>new Date().toISOString().slice(0,10))throw new ApiFault(422,'INVALID_EFFECTIVE_DATE','Effective date must be valid and not in the future.')
}
function requireVersion(value:string|undefined):number{
 if(!value)throw new ApiFault(428,'IF_MATCH_REQUIRED','Supply the asset strong ETag using If-Match.')
 if(!IfMatchVersion.safeParse(value).success)throw new ApiFault(400,'INVALID_IF_MATCH','If-Match must be a quoted positive asset version.')
 return Number(value.slice(1,-1))
}
function requireKey(value:string|undefined):string{
 const parsed=IdempotencyKey.safeParse(value)
 if(!parsed.success)throw new ApiFault(428,'IDEMPOTENCY_KEY_REQUIRED','Supply a valid Idempotency-Key header.')
 return parsed.data
}
function requireAssetId(id:string):string{
 if(!Uuid.safeParse(id).success)throw new ApiFault(400,'INVALID_ASSET_ID','Asset ID must be a UUID.')
 return id
}
function parse<T>(schema:z.ZodType<T>,input:unknown):T{
 const res=schema.safeParse(input)
 if(!res.success)throw new ApiFault(400,'INVALID_REQUEST','Request does not match the lifecycle API contract.')
 return res.data
}
export function permittedTransition(from:Lifecycle,to:Lifecycle){
 return allowed[from].includes(to)
}
export function ensureState(lock:Lock,states:Lifecycle[]){
 if(!states.includes(lock.lifecycle))throw new ApiFault(409,'INVALID_LIFECYCLE_STATE','Action not permitted in the asset current lifecycle state.')
}
function ownershipState(lock:Lock){ensureState(lock,['ACQUIRED','ACTIVE','SUSPENDED'])}
function ensureAfterAcquisition(lock:Lock,date:string){
 validDay(date)
 if(lock.acquired_on&&date<lock.acquired_on)
  throw new ApiFault(422,'OWNERSHIP_PREDATES_ACQUISITION','Interest effective date cannot predate asset acquisition.')
}
function percentCents(value:string):bigint{
 const n=asCents(value)
 if(n<=0n||n>10000n)throw new ApiFault(422,'INVALID_OWNERSHIP_SHARE','Share must be between 0.01% and 100.00%.')
 return n
}
async function reserve(client:TenantSqlClient,tenantId:string,op:string,key:string,hash:string){
 const inserted=await client.query(
  "INSERT INTO asset_os.idempotency_keys(tenant_id,operation,idempotency_key,request_hash,expires_at) VALUES($1,$2,$3,$4,clock_timestamp()+interval '24 hours') ON CONFLICT (tenant_id,operation,idempotency_key) DO NOTHING RETURNING id",
  [tenantId,op,key,hash])
 if(inserted.rowCount===1)return {replayed:false as const}
 const found=await client.query(
  'SELECT request_hash,response_code,response_body FROM asset_os.idempotency_keys WHERE tenant_id=$1 AND operation=$2 AND idempotency_key=$3 FOR UPDATE',
  [tenantId,op,key])
 const v=found.rows[0] as {request_hash:string;response_code:number|null;response_body:Mutation['body']|null}|undefined
 if(!v)throw new ApiFault(409,'IDEMPOTENCY_UNAVAILABLE','Original command is unavailable.')
 if(v.request_hash!==hash)throw new ApiFault(409,'IDEMPOTENCY_KEY_CONFLICT','Key already belongs to another request.')
 if(!v.response_body||!v.response_code)throw new ApiFault(409,'IDEMPOTENCY_IN_PROGRESS','Original command is incomplete.')
 return {replayed:true as const,status:v.response_code,body:v.response_body}
}
async function lockAsset(client:TenantSqlClient,tenantId:string,assetId:string,version:number):Promise<Lock>{
 const result=await client.query(
  "SELECT id,lifecycle,currency,record_version,CASE WHEN acquired_on IS NULL THEN NULL ELSE to_char(acquired_on,'YYYY-MM-DD') END AS acquired_on FROM asset_os.assets WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
  [tenantId,assetId])
 const row=result.rows[0] as Lock|undefined
 if(!row)throw new ApiFault(404,'ASSET_NOT_FOUND','Asset is not accessible in this tenant.')
 if(row.record_version!==version)throw new ApiFault(412,'RECORD_VERSION_CONFLICT','The asset record was modified; refresh the ETag.')
 return row
}
async function doCommand(
 client:TenantSqlClient,member:VerifiedMembership,assetId:string,
 operation:string,body:unknown,ifMatch:string|undefined,keyHeader:string|undefined,requestId:string,
 work:(lock:Lock)=>Promise<Change>
):Promise<Mutation>{
 requireAssetId(assetId)
 const version=requireVersion(ifMatch),key=requireKey(keyHeader)
 const op='lifecycle.'+operation+':'+assetId
 const fingerprint=requestFingerprint({op,version,body})
 const past=await reserve(client,member.tenantId,op,key,fingerprint)
 if(past.replayed)return {status:past.status,body:past.body,replayed:true}
 const lock=await lockAsset(client,member.tenantId,assetId,version)
 const change=await work(lock)
 if(change.next&&!permittedTransition(lock.lifecycle,change.next))
  throw new ApiFault(409,'INVALID_LIFECYCLE_TRANSITION','The requested state transition is forbidden.')
 if(change.next){
  await client.query(
   'INSERT INTO asset_os.lifecycle_events(tenant_id,asset_id,from_state,to_state,reason) VALUES($1,$2,$3,$4,$5)',
   [member.tenantId,assetId,lock.lifecycle,change.next,change.reason])
 }
 const updated=await client.query(
  'UPDATE asset_os.assets SET lifecycle=COALESCE($4,lifecycle),acquired_on=COALESCE($5,acquired_on),record_version=record_version+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND record_version=$3 RETURNING record_version',
  [member.tenantId,assetId,version,change.next||null,change.acquiredOn||null])
 if(updated.rowCount!==1)throw new ApiFault(412,'RECORD_VERSION_CONFLICT','The asset record changed concurrently.')
 const newVersion=(updated.rows[0] as {record_version:number}).record_version
 const detail={recordVersion:newVersion,...(change.next?{from:lock.lifecycle,to:change.next}:{}),
  ...(change.recordId?{recordId:change.recordId}:{})}
 await client.query(
  'INSERT INTO asset_os.audit_events(tenant_id,actor_binding_id,request_id,event_kind,subject_kind,subject_id,detail) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',
  [member.tenantId,member.identityId,requestId,change.audit,'ASSET',assetId,JSON.stringify(detail)])
 await client.query(
  'INSERT INTO asset_os.outbox_events(event_id,tenant_id,type,schema_version,aggregate_kind,aggregate_id,payload,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)',
  [randomUUID(),member.tenantId,change.event,1,'ASSET',assetId,
   JSON.stringify({assetId,recordVersion:newVersion,...(change.recordId?{recordId:change.recordId}:{})}),requestId])
 const asset=await getAsset(client,member.tenantId,assetId)
 const response={asset,...change.response}
 await client.query(
  'UPDATE asset_os.idempotency_keys SET response_code=$4,response_body=$5::jsonb WHERE tenant_id=$1 AND operation=$2 AND idempotency_key=$3',
  [member.tenantId,op,key,change.status,JSON.stringify(response)])
 return {status:change.status,body:response,replayed:false}
}
export async function startOrTransition(
 client:TenantSqlClient,member:VerifiedMembership,assetId:string,input:unknown,
 ifMatch:string|undefined,idempotency:string|undefined,requestId:string
){
 const dto=parse(LifecycleCommand,input)
 return doCommand(client,member,assetId,'transition.'+dto.action,dto,ifMatch,idempotency,requestId,async lock=>{
  const movements:Record<typeof dto.action,{from:Lifecycle;to:Lifecycle}>={
   START_ACQUISITION:{from:'PLANNED',to:'ACQUISITION_PENDING'},
   ACTIVATE:{from:'ACQUIRED',to:'ACTIVE'},
   SUSPEND:{from:'ACTIVE',to:'SUSPENDED'},
   REACTIVATE:{from:'SUSPENDED',to:'ACTIVE'},
   ARCHIVE:{from:'DISPOSED',to:'ARCHIVED'}
  }
  const rule=movements[dto.action]
  if(lock.lifecycle!==rule.from)throw new ApiFault(409,'INVALID_LIFECYCLE_STATE','Action '+dto.action+' is not allowed in this state.')
  if(dto.action==='ARCHIVE'){
   const disposition=await client.query('SELECT id FROM asset_os.dispositions WHERE tenant_id=$1 AND asset_id=$2',[member.tenantId,assetId])
   if(!disposition.rowCount)throw new ApiFault(409,'DISPOSITION_REQUIRED','Record a disposition before archival.')
  }
  if(dto.action==='START_ACQUISITION'){
   const prior=await client.query('SELECT id FROM asset_os.acquisitions WHERE tenant_id=$1 AND asset_id=$2',[member.tenantId,assetId])
   if(prior.rowCount)throw new ApiFault(409,'ACQUISITION_ALREADY_EXISTS','Asset already has initial acquisition.')
  }
  return {event:'asset.lifecycle.changed.v1',audit:'LIFECYCLE_CHANGED',next:rule.to,reason:dto.reason,status:200,response:{action:dto.action}}
 })
}
export async function acquire(
 client:TenantSqlClient,member:VerifiedMembership,assetId:string,input:unknown,
 ifMatch:string|undefined,idempotency:string|undefined,requestId:string
){
 const dto=parse(AcquireRequest,input)
 validDay(dto.effectiveOn)
 const sums=CostComponents.map(k=>asCents(dto.costs[k]))
 const cost=sums.reduce((s,n)=>s+n,0n)
 ensureMoneyRange(cost)
 if(dto.method==='PURCHASE'&&asCents(dto.costs.purchase)===0n)
  throw new ApiFault(422,'PURCHASE_AMOUNT_REQUIRED','A purchase requires positive consideration.')
 return doCommand(client,member,assetId,'acquire',dto,ifMatch,idempotency,requestId,async lock=>{
  ensureState(lock,['ACQUISITION_PENDING'])
  const id=randomUUID()
  await client.query(
   'INSERT INTO asset_os.acquisitions(id,tenant_id,asset_id,method,effective_on,counterparty_label,evidence_reference,notes,currency) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
   [id,member.tenantId,assetId,dto.method,dto.effectiveOn,dto.counterpartyLabel,dto.evidenceReference,dto.notes,lock.currency])
  for(const component of CostComponents)await client.query(
   'INSERT INTO asset_os.acquisition_costs(tenant_id,acquisition_id,component,amount) VALUES($1,$2,$3,$4)',
   [member.tenantId,id,component,money(asCents(dto.costs[component]))])
  return {event:'asset.acquisition.recorded.v1',audit:'ACQUISITION_RECORDED',
   next:'ACQUIRED',acquiredOn:dto.effectiveOn,reason:'Acquisition evidence recorded',
   recordId:id,status:201,response:{
    acquisition:{id,assetId,method:dto.method,effectiveOn:dto.effectiveOn,currency:lock.currency,
     costs:Object.fromEntries(CostComponents.map(k=>[k,money(asCents(dto.costs[k]))])),
     costBasis:money(cost),counterpartyLabel:dto.counterpartyLabel,
     evidenceReference:dto.evidenceReference,notes:dto.notes}
   }}
 })
}
type Interest={id:string;party_ref:string;party_label:string;dimension:'ECONOMIC'|'BENEFICIAL'|'LEGAL'|'CONTROL';percentage:string|null;effective_from:string}
async function activeInterests(client:TenantSqlClient,tenantId:string,assetId:string,dimension?:string){
 const params:unknown[]=[tenantId,assetId]
 const where=dimension?' AND dimension=$3':''
 if(dimension)params.push(dimension)
 return (await client.query(
  "SELECT id,party_ref,party_label,dimension,percentage::text AS percentage,to_char(effective_from,'YYYY-MM-DD') AS effective_from FROM asset_os.ownership_interests WHERE tenant_id=$1 AND asset_id=$2 AND effective_to IS NULL"+where+
  ' ORDER BY effective_from,id',params)).rows as Interest[]
}
export async function assignInterest(
 client:TenantSqlClient,member:VerifiedMembership,assetId:string,input:unknown,
 ifMatch:string|undefined,idempotency:string|undefined,requestId:string
){
 const dto=parse(OwnershipAssignment,input)
 validDay(dto.effectiveOn)
 return doCommand(client,member,assetId,'ownership.assign',dto,ifMatch,idempotency,requestId,async lock=>{
  ownershipState(lock);ensureAfterAcquisition(lock,dto.effectiveOn)
  const current=await activeInterests(client,member.tenantId,assetId,dto.dimension)
  if(current.some(v=>v.party_ref===dto.partyRef))
   throw new ApiFault(409,'DUPLICATE_OWNERSHIP_INTEREST','An active interest for this party and dimension already exists.')
  if(current.some(v=>v.effective_from>dto.effectiveOn))
   throw new ApiFault(409,'OWNERSHIP_BACKDATE_CONFLICT','New interest cannot predate a newer active interest.')
  if(dto.percentage!==null){
   const assigned=current.reduce((sum,v)=>sum+asCents(v.percentage||'0'),0n)
   if(assigned+percentCents(dto.percentage)>10000n)
    throw new ApiFault(409,'OWNERSHIP_OVERALLOCATED','Active economic or beneficial shares cannot exceed 100%.')
  }
  const interestId=randomUUID(),eventId=randomUUID()
  await client.query(
   'INSERT INTO asset_os.ownership_interests(id,tenant_id,asset_id,party_ref,party_label,dimension,percentage,effective_from,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
   [interestId,member.tenantId,assetId,dto.partyRef,dto.partyLabel,dto.dimension,dto.percentage,dto.effectiveOn,'ASSIGNMENT'])
  await client.query(
   'INSERT INTO asset_os.ownership_events(id,tenant_id,asset_id,change_kind,dimension,from_party_ref,to_party_ref,percentage,effective_on,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
   [eventId,member.tenantId,assetId,'ASSIGNMENT',dto.dimension,null,dto.partyRef,dto.percentage,dto.effectiveOn,dto.note])
  return {event:'asset.ownership.recorded.v1',audit:'OWNERSHIP_ASSIGNED',recordId:interestId,status:201,reason:dto.note||'Ownership interest recorded',
   response:{interest:{id:interestId,assetId,partyRef:dto.partyRef,partyLabel:dto.partyLabel,dimension:dto.dimension,
    percentage:dto.percentage,effectiveFrom:dto.effectiveOn,effectiveTo:null,source:'ASSIGNMENT'},
    ownershipEventId:eventId}}
 })
}
export async function transferInterest(
 client:TenantSqlClient,member:VerifiedMembership,assetId:string,input:unknown,
 ifMatch:string|undefined,idempotency:string|undefined,requestId:string
){
 const dto=parse(OwnershipTransfer,input)
 validDay(dto.effectiveOn)
 const percent=percentCents(dto.percentage)
 return doCommand(client,member,assetId,'ownership.transfer',dto,ifMatch,idempotency,requestId,async lock=>{
  ownershipState(lock);ensureAfterAcquisition(lock,dto.effectiveOn)
  const rows=await client.query(
   "SELECT id,party_ref,party_label,dimension,percentage::text AS percentage,to_char(effective_from,'YYYY-MM-DD') AS effective_from FROM asset_os.ownership_interests WHERE tenant_id=$1 AND asset_id=$2 AND id=$3 AND effective_to IS NULL",
   [member.tenantId,assetId,dto.sourceInterestId])
  const source=rows.rows[0] as Interest|undefined
  if(!source||!['ECONOMIC','BENEFICIAL'].includes(source.dimension))
   throw new ApiFault(409,'TRANSFER_SOURCE_INACTIVE','Transfer requires a current percentage ownership interest.')
  if(dto.toPartyRef===source.party_ref)
   throw new ApiFault(422,'TRANSFER_SELF','Receiving party must be different from source.')
  if(dto.effectiveOn<source.effective_from)
   throw new ApiFault(422,'TRANSFER_BEFORE_INTEREST','Transfer cannot predate the source interest.')
  const active=await activeInterests(client,member.tenantId,assetId,source.dimension)
  if(active.some(v=>v.effective_from>dto.effectiveOn))
   throw new ApiFault(409,'OWNERSHIP_BACKDATE_CONFLICT','Transfer cannot predate a newer interest.')
  if(active.some(v=>v.party_ref===dto.toPartyRef))
   throw new ApiFault(409,'TARGET_INTEREST_EXISTS','Receiving party already has an active interest requiring reconciliation.')
  const original=asCents(source.percentage||'0')
  if(percent>original)throw new ApiFault(422,'TRANSFER_EXCEEDS_INTEREST','Transfer cannot exceed the source interest.')
  const remaining=original-percent,targetId=randomUUID(),retainedId=remaining?randomUUID():null,eventId=randomUUID()
  await client.query(
   'UPDATE asset_os.ownership_interests SET effective_to=$4 WHERE tenant_id=$1 AND asset_id=$2 AND id=$3 AND effective_to IS NULL',
   [member.tenantId,assetId,source.id,dto.effectiveOn])
  if(retainedId)await client.query(
   'INSERT INTO asset_os.ownership_interests(id,tenant_id,asset_id,party_ref,party_label,dimension,percentage,effective_from,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
   [retainedId,member.tenantId,assetId,source.party_ref,source.party_label,source.dimension,money(remaining),dto.effectiveOn,'TRANSFER'])
  await client.query(
   'INSERT INTO asset_os.ownership_interests(id,tenant_id,asset_id,party_ref,party_label,dimension,percentage,effective_from,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
   [targetId,member.tenantId,assetId,dto.toPartyRef,dto.toPartyLabel,source.dimension,money(percent),dto.effectiveOn,'TRANSFER'])
  await client.query(
   'INSERT INTO asset_os.ownership_events(id,tenant_id,asset_id,change_kind,dimension,from_party_ref,to_party_ref,percentage,effective_on,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
   [eventId,member.tenantId,assetId,'TRANSFER',source.dimension,source.party_ref,dto.toPartyRef,money(percent),dto.effectiveOn,dto.note])
  return {event:'asset.ownership.transferred.v1',audit:'OWNERSHIP_TRANSFERRED',recordId:eventId,
   reason:dto.note||'Ownership transfer recorded',status:201,response:{
    transfer:{id:eventId,assetId,dimension:source.dimension,sourceInterestId:source.id,
     toInterestId:targetId,retainedInterestId:retainedId,fromPartyRef:source.party_ref,toPartyRef:dto.toPartyRef,
     percentage:money(percent),effectiveOn:dto.effectiveOn,remainingPercentage:money(remaining)}
   }}
 })
}
export async function dispose(
 client:TenantSqlClient,member:VerifiedMembership,assetId:string,input:unknown,
 ifMatch:string|undefined,idempotency:string|undefined,requestId:string
){
 const dto=parse(DispositionRequest,input)
 validDay(dto.effectiveOn)
 const proceeds=asCents(dto.proceeds),costs=asCents(dto.costs)
 ensureMoneyRange(proceeds);ensureMoneyRange(costs)
 return doCommand(client,member,assetId,'dispose',dto,ifMatch,idempotency,requestId,async lock=>{
  ensureState(lock,['ACQUIRED','ACTIVE','SUSPENDED'])
  if(lock.acquired_on&&dto.effectiveOn<lock.acquired_on)
   throw new ApiFault(422,'DISPOSITION_BEFORE_ACQUISITION','Disposition cannot predate acquisition.')
  const cost=await client.query(
   'SELECT COALESCE(SUM(c.amount),0)::text AS cost_basis, count(c.id)::integer AS components FROM asset_os.acquisition_costs c JOIN asset_os.acquisitions a ON a.tenant_id=c.tenant_id AND a.id=c.acquisition_id WHERE a.tenant_id=$1 AND a.asset_id=$2',
   [member.tenantId,assetId])
  const basis=cost.rows[0]?.components>0?asCents(String(cost.rows[0].cost_basis)):null
  if(basis!==null)ensureMoneyRange(basis)
  ensureMoneyRange(proceeds-costs-(basis||0n))
  const id=randomUUID()
  await client.query(
   'INSERT INTO asset_os.dispositions(id,tenant_id,asset_id,kind,effective_on,proceeds,costs,currency,counterparty_label,reason,cost_basis_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
   [id,member.tenantId,assetId,dto.kind,dto.effectiveOn,money(proceeds),money(costs),lock.currency,
    dto.counterpartyLabel,dto.reason,basis===null?null:money(basis)])
  return {event:'asset.disposition.recorded.v1',audit:'ASSET_DISPOSED',next:'DISPOSED',reason:dto.reason,
   recordId:id,status:201,response:{disposition:{
    id,assetId,kind:dto.kind,effectiveOn:dto.effectiveOn,currency:lock.currency,
    proceeds:money(proceeds),costs:money(costs),netProceeds:money(proceeds-costs),
    costBasis:basis===null?null:money(basis),
    estimatedGain:basis===null?null:money(proceeds-costs-basis),
    reason:dto.reason,counterpartyLabel:dto.counterpartyLabel
   }}}
 })
}
export async function lifecycleSnapshot(client:TenantSqlClient,tenantId:string,assetId:string){
 const asset=await getAsset(client,tenantId,assetId)
 const [events,acquisitions,ownership,changes,dispositions]=await Promise.all([
  client.query('SELECT id,from_state AS "from",to_state AS "to",reason,occurred_at AS "occurredAt" FROM asset_os.lifecycle_events WHERE tenant_id=$1 AND asset_id=$2 ORDER BY occurred_at,id',[tenantId,assetId]),
  client.query("SELECT a.id,a.method,to_char(a.effective_on,'YYYY-MM-DD') AS \"effectiveOn\",a.counterparty_label AS \"counterpartyLabel\",a.evidence_reference AS \"evidenceReference\",a.currency,a.notes,a.recorded_at AS \"recordedAt\",COALESCE(sum(c.amount),0)::text AS \"costBasis\" FROM asset_os.acquisitions a LEFT JOIN asset_os.acquisition_costs c ON c.tenant_id=a.tenant_id AND c.acquisition_id=a.id WHERE a.tenant_id=$1 AND a.asset_id=$2 GROUP BY a.id,a.method,a.effective_on,a.counterparty_label,a.evidence_reference,a.currency,a.notes,a.recorded_at",[tenantId,assetId]),
  client.query("SELECT id,party_ref AS \"partyRef\",party_label AS \"partyLabel\",dimension,percentage::text,to_char(effective_from,'YYYY-MM-DD') AS \"effectiveFrom\",CASE WHEN effective_to IS NULL THEN NULL ELSE to_char(effective_to,'YYYY-MM-DD') END AS \"effectiveTo\",source,recorded_at AS \"recordedAt\" FROM asset_os.ownership_interests WHERE tenant_id=$1 AND asset_id=$2 ORDER BY recorded_at,id",[tenantId,assetId]),
  client.query("SELECT id,change_kind AS \"kind\",dimension,from_party_ref AS \"fromPartyRef\",to_party_ref AS \"toPartyRef\",percentage::text,to_char(effective_on,'YYYY-MM-DD') AS \"effectiveOn\",note,recorded_at AS \"recordedAt\" FROM asset_os.ownership_events WHERE tenant_id=$1 AND asset_id=$2 ORDER BY recorded_at,id",[tenantId,assetId]),
  client.query("SELECT id,kind,to_char(effective_on,'YYYY-MM-DD') AS \"effectiveOn\",proceeds::text,costs::text,currency,cost_basis_snapshot::text AS \"costBasis\",net_proceeds::text AS \"netProceeds\",estimated_gain::text AS \"estimatedGain\",reason,counterparty_label AS \"counterpartyLabel\",recorded_at AS \"recordedAt\" FROM asset_os.dispositions WHERE tenant_id=$1 AND asset_id=$2",[tenantId,assetId])
 ])
 const acquisition=acquisitions.rows[0]||null
 let costs:Record<string,string>|null=null
 if(acquisition){
  const rows=await client.query('SELECT component,amount::text AS amount FROM asset_os.acquisition_costs WHERE tenant_id=$1 AND acquisition_id=$2',[tenantId,acquisition.id])
  costs=Object.fromEntries(rows.rows.map((r:{component:string;amount:string})=>[r.component,r.amount]))
 }
 return {asset,transitions:events.rows,acquisition:acquisition?{...acquisition,costs}:null,
  ownershipInterests:ownership.rows,ownershipChanges:changes.rows,disposition:dispositions.rows[0]||null}
}
export async function listDomainHistory(client:TenantSqlClient,tenantId:string,kind:'acquisitions'|'dispositions'){
 // Stable server-scoped cursor pagination in B2: received cursor is a UUID of last record.
 const table=kind==='acquisitions'?'acquisitions':'dispositions'
 const rows=await client.query('SELECT id,asset_id AS "assetId",'+
   (kind==='acquisitions'?'method':'kind')+
   ',currency,to_char(effective_on,\'YYYY-MM-DD\') AS "effectiveOn",recorded_at AS "recordedAt" FROM asset_os.'+
   table+' WHERE tenant_id=$1 ORDER BY recorded_at DESC,id DESC LIMIT 101',[tenantId])
 return {items:rows.rows.slice(0,100),hasMore:rows.rows.length>100,
  note:rows.rows.length>100?'Only first 100 entries returned in B2; use per-asset history for older evidence.':undefined}
}
