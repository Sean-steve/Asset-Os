import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import type {TenantSqlClient} from './database.js'
import {ApiFault,type VerifiedMembership} from './identity.js'
import {getAsset,requestFingerprint} from './registry.js'
import {asCents,money} from './lifecycle.js'
import {
 BalanceObserve,FacilityCreate,FlowObserve,IdempotencyKey,IfMatchVersion,
 IsoDate,ReferenceCreate,Uuid,ValuationAccept,ValuationCreate
} from './contracts.js'

type AssetLock={id:string;lifecycle:string;currency:string;record_version:number;acquired_on:string|null}
type Outcome={status:number;event:string;audit:string;recordId:string;result:Record<string,unknown>}
type CommandResult={status:number;body:Record<string,unknown>&{asset:Awaited<ReturnType<typeof getAsset>>};replayed:boolean}
const uuid=()=>randomUUID()
const B3_ELIGIBLE=['ACQUIRED','ACTIVE','SUSPENDED']
const validId=(id:string)=>{if(!Uuid.safeParse(id).success)throw new ApiFault(400,'INVALID_ID','Resource ID must be a UUID.');return id}
const parse=<T>(schema:z.ZodType<T>,input:unknown):T=>{
 const v=schema.safeParse(input)
 if(!v.success)throw new ApiFault(400,'INVALID_REQUEST','Request does not match the B3 domain contract.')
 return v.data
}
export function requireEffectiveDay(date:string){
 if(!IsoDate.safeParse(date).success||date>new Date().toISOString().slice(0,10))
  throw new ApiFault(422,'INVALID_EFFECTIVE_DATE','Observation date must be valid and not in the future.')
}
function confirmDate(date:string,asset:AssetLock){
 requireEffectiveDay(date)
 if(asset.acquired_on&&date<asset.acquired_on)
  throw new ApiFault(422,'BEFORE_ACQUISITION','Financial observation cannot predate asset acquisition.')
}
function requirePositive(value:string){
 if(asCents(value)<=0n)throw new ApiFault(422,'POSITIVE_AMOUNT_REQUIRED','A positive decimal amount is required.')
}
function amountSafe(value:bigint){
 if(value>=10n**20n||value<=-(10n**20n))throw new ApiFault(422,'AMOUNT_OUT_OF_RANGE','Derived amount exceeds supported range.')
 return money(value)
}
function requireReady(asset:AssetLock){
 if(!B3_ELIGIBLE.includes(asset.lifecycle))
  throw new ApiFault(409,'ASSET_NOT_ECONOMICALLY_ACTIVE','Financial observations require acquired, active or suspended asset status.')
}
function ifMatch(value:string|undefined){
 if(!value)throw new ApiFault(428,'IF_MATCH_REQUIRED','Provide If-Match with current strong asset ETag.')
 if(!IfMatchVersion.safeParse(value).success)throw new ApiFault(400,'INVALID_IF_MATCH','Invalid strong asset version.')
 return Number(value.slice(1,-1))
}
function commandKey(value:string|undefined){
 if(!IdempotencyKey.safeParse(value).success)throw new ApiFault(428,'IDEMPOTENCY_KEY_REQUIRED','Provide a valid Idempotency-Key.')
 return value as string
}
async function begin(client:TenantSqlClient,tenantId:string,operation:string,key:string,hash:string){
 const inserted=await client.query(
  "INSERT INTO asset_os.idempotency_keys(tenant_id,operation,idempotency_key,request_hash,expires_at) VALUES($1,$2,$3,$4,clock_timestamp()+interval '24 hours') ON CONFLICT (tenant_id,operation,idempotency_key) DO NOTHING RETURNING id",
  [tenantId,operation,key,hash])
 if(inserted.rowCount===1)return {replay:false as const}
 const existing=await client.query(
  'SELECT request_hash,response_code,response_body FROM asset_os.idempotency_keys WHERE tenant_id=$1 AND operation=$2 AND idempotency_key=$3 FOR UPDATE',
  [tenantId,operation,key])
 const row=existing.rows[0] as {request_hash:string;response_code:number|null;response_body:CommandResult['body']|null}|undefined
 if(!row)throw new ApiFault(409,'IDEMPOTENCY_UNAVAILABLE','Original operation is unavailable.')
 if(row.request_hash!==hash)throw new ApiFault(409,'IDEMPOTENCY_KEY_CONFLICT','Key already used with a different request.')
 if(row.response_code===null||!row.response_body)throw new ApiFault(409,'IDEMPOTENCY_IN_PROGRESS','Original operation not yet completed.')
 return {replay:true as const,status:row.response_code,body:row.response_body}
}
async function lockAsset(client:TenantSqlClient,tenantId:string,assetId:string,version:number):Promise<AssetLock>{
 const result=await client.query(
  "SELECT id,lifecycle,currency,record_version,CASE WHEN acquired_on IS NULL THEN NULL ELSE to_char(acquired_on,'YYYY-MM-DD') END AS acquired_on FROM asset_os.assets WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
  [tenantId,assetId])
 const row=result.rows[0] as AssetLock|undefined
 if(!row)throw new ApiFault(404,'ASSET_NOT_FOUND','Asset not found in this tenant.')
 if(row.record_version!==version)throw new ApiFault(412,'RECORD_VERSION_CONFLICT','Asset has changed; refresh the ETag.')
 requireReady(row)
 return row
}
async function execute(
 client:TenantSqlClient,member:VerifiedMembership,assetId:string,
 command:string,input:unknown,match:string|undefined,keyHeader:string|undefined,requestId:string,
 action:(asset:AssetLock)=>Promise<Outcome>
):Promise<CommandResult>{
 validId(assetId)
 const version=ifMatch(match),key=commandKey(keyHeader)
 const operation='economics.'+command+':'+assetId
 const hash=requestFingerprint({operation,version,input})
 const prior=await begin(client,member.tenantId,operation,key,hash)
 if(prior.replay)return {status:prior.status,body:prior.body,replayed:true}
 const locked=await lockAsset(client,member.tenantId,assetId,version)
 const out=await action(locked)
 const updated=await client.query(
  'UPDATE asset_os.assets SET record_version=record_version+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND record_version=$3 RETURNING record_version',
  [member.tenantId,assetId,version])
 if(updated.rowCount!==1)throw new ApiFault(412,'RECORD_VERSION_CONFLICT','Concurrent update; reload the asset.')
 const newVersion=(updated.rows[0] as {record_version:number}).record_version
 await client.query(
  'INSERT INTO asset_os.audit_events(tenant_id,actor_binding_id,request_id,event_kind,subject_kind,subject_id,detail) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',
  [member.tenantId,member.identityId,requestId,out.audit,'ASSET',assetId,
   JSON.stringify({recordVersion:newVersion,recordId:out.recordId})])
 await client.query(
  'INSERT INTO asset_os.outbox_events(event_id,tenant_id,type,schema_version,aggregate_kind,aggregate_id,payload,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)',
  [uuid(),member.tenantId,out.event,1,'ASSET',assetId,
   JSON.stringify({assetId,recordId:out.recordId,recordVersion:newVersion}),requestId])
 const asset=await getAsset(client,member.tenantId,assetId)
 const body={asset,...out.result}
 await client.query(
  'UPDATE asset_os.idempotency_keys SET response_code=$4,response_body=$5::jsonb WHERE tenant_id=$1 AND operation=$2 AND idempotency_key=$3',
  [member.tenantId,operation,key,out.status,JSON.stringify(body)])
 return {status:out.status,body,replayed:false}
}

export async function recordValuation(
 client:TenantSqlClient,member:VerifiedMembership,assetId:string,input:unknown,
 match:string|undefined,key:string|undefined,requestId:string
){
 const data=parse(ValuationCreate,input)
 requireEffectiveDay(data.effectiveOn)
 return execute(client,member,assetId,'valuation.draft',data,match,key,requestId,async asset=>{
  confirmDate(data.effectiveOn,asset)
  const id=uuid()
  await client.query(
   "INSERT INTO asset_os.valuations(id,tenant_id,asset_id,effective_on,amount,currency,method,confidence,source_label,notes,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'DRAFT')",
   [id,member.tenantId,assetId,data.effectiveOn,data.amount,asset.currency,data.method,data.confidence,data.sourceLabel,data.notes])
  return {status:201,recordId:id,event:'asset.valuation.recorded.v1',audit:'VALUATION_DRAFT_RECORDED',
   result:{valuation:{id,assetId,currency:asset.currency,...data,status:'DRAFT',acceptedAt:null}}}
 })
}
export async function acceptValuation(
 client:TenantSqlClient,member:VerifiedMembership,assetId:string,valuationId:string,input:unknown,
 match:string|undefined,key:string|undefined,requestId:string
){
 validId(valuationId)
 const data=parse(ValuationAccept,input)
 return execute(client,member,assetId,'valuation.accept:'+valuationId,data,match,key,requestId,async asset=>{
  const target=(await client.query(
   "SELECT id,status,to_char(effective_on,'YYYY-MM-DD') AS effective_on,amount::text AS amount,currency FROM asset_os.valuations WHERE tenant_id=$1 AND asset_id=$2 AND id=$3",
   [member.tenantId,assetId,valuationId])).rows[0] as
   {id:string;status:string;effective_on:string;amount:string;currency:string}|undefined
  if(!target)throw new ApiFault(404,'VALUATION_NOT_FOUND','Valuation not found for this asset.')
  if(target.status!=='DRAFT')throw new ApiFault(409,'VALUATION_ALREADY_REVIEWED','Only draft valuations may be accepted.')
  if(target.currency!==asset.currency)throw new ApiFault(409,'CURRENCY_MISMATCH','Valuation currency does not match asset currency.')
  const prior=(await client.query(
   "SELECT id,to_char(effective_on,'YYYY-MM-DD') AS effective_on FROM asset_os.valuations WHERE tenant_id=$1 AND asset_id=$2 AND status='ACCEPTED' FOR UPDATE",
   [member.tenantId,assetId])).rows[0] as {id:string;effective_on:string}|undefined
  if(prior&&target.effective_on<prior.effective_on)
   throw new ApiFault(409,'VALUATION_DATE_REGRESSION','Cannot supersede an accepted valuation with an earlier date.')
  if(prior)await client.query(
   "UPDATE asset_os.valuations SET status='SUPERSEDED' WHERE tenant_id=$1 AND asset_id=$2 AND id=$3 AND status='ACCEPTED'",
   [member.tenantId,assetId,prior.id])
  await client.query(
   "UPDATE asset_os.valuations SET status='ACCEPTED',accepted_at=clock_timestamp() WHERE tenant_id=$1 AND asset_id=$2 AND id=$3 AND status='DRAFT'",
   [member.tenantId,assetId,valuationId])
  return {status:200,recordId:valuationId,event:'asset.valuation.accepted.v1',audit:'VALUATION_ACCEPTED',
   result:{valuation:{id:valuationId,status:'ACCEPTED',currency:asset.currency,
    amount:target.amount,effectiveOn:target.effective_on,
    supersedesId:prior?.id||null,reviewNote:data.note,sourceAuthority:'USER_REVIEWED_NOT_EXTERNALLY_VERIFIED'}}}
 })
}
export async function recordFacility(
 client:TenantSqlClient,member:VerifiedMembership,assetId:string,input:unknown,
 match:string|undefined,key:string|undefined,requestId:string
){
 const data=parse(FacilityCreate,input)
 requireEffectiveDay(data.startedOn)
 if(data.maturesOn&&data.maturesOn<data.startedOn)
  throw new ApiFault(422,'INVALID_MATURITY','Maturity cannot precede facility start.')
 requirePositive(data.originalPrincipal)
 return execute(client,member,assetId,'financing.facility',data,match,key,requestId,async asset=>{
  confirmDate(data.startedOn,asset)
  const id=uuid()
  await client.query(
   'INSERT INTO asset_os.financing_facilities(id,tenant_id,asset_id,financier_label,original_principal,currency,interest_rate_pct,started_on,matures_on,frequency,reference,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
   [id,member.tenantId,assetId,data.financierLabel,data.originalPrincipal,asset.currency,
    data.interestRatePct,data.startedOn,data.maturesOn,data.frequency,data.reference,data.notes])
  return {status:201,recordId:id,event:'asset.financing.recorded.v1',audit:'FINANCING_FACILITY_RECORDED',
   result:{facility:{id,assetId,currency:asset.currency,...data,sourceAuthority:'USER_ENTRY'}}}
 })
}
export async function observeBalance(
 client:TenantSqlClient,member:VerifiedMembership,assetId:string,facilityId:string,input:unknown,
 match:string|undefined,key:string|undefined,requestId:string
){
 validId(facilityId)
 const data=parse(BalanceObserve,input)
 requireEffectiveDay(data.observedOn)
 return execute(client,member,assetId,'financing.balance:'+facilityId,data,match,key,requestId,async asset=>{
  confirmDate(data.observedOn,asset)
  const f=(await client.query(
   "SELECT id,currency,to_char(started_on,'YYYY-MM-DD') AS started_on FROM asset_os.financing_facilities WHERE tenant_id=$1 AND asset_id=$2 AND id=$3",
   [member.tenantId,assetId,facilityId])).rows[0] as {id:string;currency:string;started_on:string}|undefined
  if(!f)throw new ApiFault(404,'FACILITY_NOT_FOUND','Facility not found for this tenant asset.')
  if(f.currency!==asset.currency)throw new ApiFault(409,'CURRENCY_MISMATCH','Asset and facility currencies do not match.')
  if(data.observedOn<f.started_on)
   throw new ApiFault(422,'BALANCE_PREDATES_FACILITY','Observation cannot predate financing agreement.')
  const previous=(await client.query(
   "SELECT to_char(observed_on,'YYYY-MM-DD') AS observed_on FROM asset_os.financing_balances WHERE tenant_id=$1 AND facility_id=$2 ORDER BY observed_on DESC LIMIT 1",
   [member.tenantId,facilityId])).rows[0] as {observed_on:string}|undefined
  if(previous&&data.observedOn<=previous.observed_on)
   throw new ApiFault(409,'BALANCE_OBSERVATION_OUT_OF_ORDER','Balance date must follow last recorded balance date.')
  const id=uuid()
  await client.query(
   'INSERT INTO asset_os.financing_balances(id,tenant_id,facility_id,observed_on,outstanding,source_label,notes) VALUES($1,$2,$3,$4,$5,$6,$7)',
   [id,member.tenantId,facilityId,data.observedOn,data.outstanding,data.sourceLabel,data.notes])
  return {status:201,recordId:id,event:'asset.financing.balance.observed.v1',audit:'FINANCING_BALANCE_OBSERVED',
   result:{balance:{id,facilityId,assetId,currency:asset.currency,...data,sourceAuthority:'USER_ENTRY'}}}
 })
}
export async function recordCashFlow(
 client:TenantSqlClient,member:VerifiedMembership,assetId:string,input:unknown,
 match:string|undefined,key:string|undefined,requestId:string
){
 const data=parse(FlowObserve,input)
 requireEffectiveDay(data.occurredOn)
 requirePositive(data.amount)
 return execute(client,member,assetId,'cashflow.observe',data,match,key,requestId,async asset=>{
  confirmDate(data.occurredOn,asset)
  const id=uuid()
  await client.query(
   "INSERT INTO asset_os.cash_flow_observations(id,tenant_id,asset_id,kind,category,amount,currency,occurred_on,counterparty_label,notes,source_authority,source_event_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'USER_ENTRY',NULL)",
   [id,member.tenantId,assetId,data.kind,data.category,data.amount,asset.currency,
    data.occurredOn,data.counterpartyLabel,data.notes])
  return {status:201,recordId:id,event:'asset.cashflow.observed.v1',audit:'CASH_FLOW_OBSERVATION_RECORDED',
   result:{observation:{id,assetId,currency:asset.currency,...data,sourceAuthority:'USER_ENTRY',
    financePosted:false,reconciled:false}}}
 })
}
export async function recordReconciliationReference(
 client:TenantSqlClient,member:VerifiedMembership,assetId:string,input:unknown,
 match:string|undefined,key:string|undefined,requestId:string
){
 const data=parse(ReferenceCreate,input)
 return execute(client,member,assetId,'reference.record',data,match,key,requestId,async()=>{
  const flow=(await client.query(
   "SELECT id,source_authority FROM asset_os.cash_flow_observations WHERE tenant_id=$1 AND asset_id=$2 AND id=$3",
   [member.tenantId,assetId,data.flowId])).rows[0] as {id:string;source_authority:string}|undefined
  if(!flow)throw new ApiFault(404,'FLOW_NOT_FOUND','Cash flow observation does not belong to this tenant asset.')
  if(flow.source_authority!=='USER_ENTRY')throw new ApiFault(409,'FINANCE_PROJECTION_READ_ONLY','Only user-entered observations support manual references.')
  const exists=await client.query(
   'SELECT id FROM asset_os.reconciliation_references WHERE tenant_id=$1 AND flow_id=$2 AND system=$3 AND external_reference=$4',
   [member.tenantId,data.flowId,data.system,data.externalReference])
  if(exists.rowCount)throw new ApiFault(409,'REFERENCE_EXISTS','This reference label was already recorded.')
  const id=uuid()
  await client.query(
   'INSERT INTO asset_os.reconciliation_references(id,tenant_id,flow_id,system,external_reference,note) VALUES($1,$2,$3,$4,$5,$6)',
   [id,member.tenantId,data.flowId,data.system,data.externalReference,data.note])
  return {status:201,recordId:id,event:'asset.finance.reference.recorded.v1',audit:'FINANCE_REFERENCE_RECORDED',
   result:{reference:{id,assetId,...data,verified:false,ledgerPosted:false}}}
 })
}
type Cursor={sort:string;id:string}
function parseQuery(input:unknown){
 return parse(z.object({limit:z.coerce.number().int().min(1).max(100).default(30),
  cursor:z.string().max(512).optional()}).strict(),input)
}
function decodeCursor(encoded:string):Cursor{
 try{
  const v=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8')) as unknown
  return z.object({sort:z.string().min(1).max(80),id:Uuid}).strict().parse(v)
 }catch{throw new ApiFault(400,'INVALID_CURSOR','History pagination cursor is invalid.')}
}
async function existsAsset(client:TenantSqlClient,tenantId:string,assetId:string){
 validId(assetId)
 await getAsset(client,tenantId,assetId)
}
const history:Record<'valuations'|'cash-flows'|'balances',{table:string;sort:string;select:string;extra:string}>={
 valuations:{
  table:'asset_os.valuations',sort:'recorded_at',
  select:"id,to_char(effective_on,'YYYY-MM-DD') AS \"effectiveOn\",amount::text,currency,method,confidence,source_label AS \"sourceLabel\",notes,status,accepted_at AS \"acceptedAt\",recorded_at AS \"recordedAt\"",
  extra:'asset_id=$2'
 },
 'cash-flows':{
  table:'asset_os.cash_flow_observations',sort:'occurred_on',
  select:"id,kind,category,amount::text,currency,to_char(occurred_on,'YYYY-MM-DD') AS \"occurredOn\",counterparty_label AS \"counterpartyLabel\",notes,source_authority AS \"sourceAuthority\",source_event_id AS \"sourceEventId\",recorded_at AS \"recordedAt\"",
  extra:'asset_id=$2'
 },
 balances:{
  table:'asset_os.financing_balances',sort:'observed_on',
  select:"id,to_char(observed_on,'YYYY-MM-DD') AS \"observedOn\",outstanding::text,source_label AS \"sourceLabel\",notes,recorded_at AS \"recordedAt\"",
  extra:'facility_id=$2'
 }
}
export async function listEvidence(client:TenantSqlClient,tenantId:string,assetId:string,
 kind:'valuations'|'cash-flows'|'balances',query:unknown,facilityId?:string){
 await existsAsset(client,tenantId,assetId)
 if(kind==='balances'){
  if(!facilityId)throw new ApiFault(400,'FACILITY_REQUIRED','Select a facility.')
  validId(facilityId)
  const match=await client.query(
   'SELECT id FROM asset_os.financing_facilities WHERE tenant_id=$1 AND asset_id=$2 AND id=$3',
   [tenantId,assetId,facilityId])
  if(!match.rowCount)throw new ApiFault(404,'FACILITY_NOT_FOUND','Facility not found for this asset.')
 }
 const args=parseQuery(query),meta=history[kind]
 const params:unknown[]=[tenantId,kind==='balances'?facilityId:assetId]
 let where='tenant_id=$1 AND '+meta.extra
 if(args.cursor){
  const cursor=decodeCursor(args.cursor)
  params.push(cursor.sort,cursor.id)
  const cast=meta.sort==='recorded_at'?'timestamptz':'date'
  where+=' AND ('+meta.sort+',id)<($3::'+cast+',$4::uuid)'
 }
 params.push(args.limit+1)
 // All table/column identifiers above are hard-coded, not request-derived.
 const result=await client.query('SELECT '+meta.select+' FROM '+meta.table+' WHERE '+where+
  ' ORDER BY '+meta.sort+' DESC,id DESC LIMIT $'+params.length,params)
 const rows=result.rows as Array<{id:string;[key:string]:unknown}>
 const chosen=rows.slice(0,args.limit)
 const last=chosen.at(-1)
 const sort=meta.sort==='recorded_at'?'recordedAt':meta.sort==='occurred_on'?'occurredOn':'observedOn'
 const cursorValue=last?.[sort]
 const nextCursor=rows.length>args.limit&&last&&cursorValue?
  Buffer.from(JSON.stringify({sort:meta.sort==='recorded_at'?
   new Date(cursorValue as string).toISOString():String(cursorValue),id:last.id})).toString('base64url'):null
 return {items:chosen,nextCursor,limit:args.limit}
}
export async function listFacilities(client:TenantSqlClient,tenantId:string,assetId:string){
 await existsAsset(client,tenantId,assetId)
 const rows=await client.query(
  "SELECT f.id,f.financier_label AS \"financierLabel\",f.original_principal::text AS \"originalPrincipal\",f.currency,f.interest_rate_pct::text AS \"interestRatePct\",to_char(f.started_on,'YYYY-MM-DD') AS \"startedOn\",CASE WHEN f.matures_on IS NULL THEN NULL ELSE to_char(f.matures_on,'YYYY-MM-DD') END AS \"maturesOn\",f.frequency,f.reference,f.notes,f.recorded_at AS \"recordedAt\",b.id AS \"balanceId\",to_char(b.observed_on,'YYYY-MM-DD') AS \"balanceObservedOn\",b.outstanding::text AS \"latestOutstanding\",b.source_label AS \"balanceSourceLabel\" FROM asset_os.financing_facilities f LEFT JOIN LATERAL (SELECT id,observed_on,outstanding,source_label FROM asset_os.financing_balances WHERE tenant_id=f.tenant_id AND facility_id=f.id ORDER BY observed_on DESC,id DESC LIMIT 1) b ON TRUE WHERE f.tenant_id=$1 AND f.asset_id=$2 ORDER BY f.recorded_at DESC,f.id DESC",
  [tenantId,assetId])
 return {items:rows.rows,sourceAuthority:'USER_ENTERED_UNVERIFIED',note:'Unknown balances remain null, never assumed zero.'}
}
export async function listReferences(client:TenantSqlClient,tenantId:string,assetId:string){
 await existsAsset(client,tenantId,assetId)
 const rows=await client.query(
  'SELECT r.id,r.flow_id AS "flowId",r.system,r.external_reference AS "externalReference",r.note,r.recorded_at AS "recordedAt" FROM asset_os.reconciliation_references r JOIN asset_os.cash_flow_observations f ON f.tenant_id=r.tenant_id AND f.id=r.flow_id WHERE r.tenant_id=$1 AND f.asset_id=$2 ORDER BY r.recorded_at DESC,r.id DESC',
  [tenantId,assetId])
 return {items:rows.rows.map(r=>({...r,verified:false,ledgerPosted:false})),sourceAuthority:'UNVERIFIED_REFERENCE_ONLY'}
}
export function ratioPercent(numerator:bigint,denominator:bigint):string|null{
 if(denominator<=0n)return null
 const negative=numerator<0n
 const value=(negative?-numerator:numerator)*10000n/denominator
 return (negative?'-':'')+(value/100n).toString()+'.'+(value%100n).toString().padStart(2,'0')
}
export async function economicsSummary(client:TenantSqlClient,tenantId:string,assetId:string){
 const asset=await getAsset(client,tenantId,assetId)
 const [accepted,cost,fin,flows]=await Promise.all([
  client.query(
   "SELECT id,amount::text AS amount,to_char(effective_on,'YYYY-MM-DD') AS \"effectiveOn\",method,confidence,source_label AS \"sourceLabel\" FROM asset_os.valuations WHERE tenant_id=$1 AND asset_id=$2 AND status='ACCEPTED' ORDER BY accepted_at DESC LIMIT 1",
   [tenantId,assetId]),
  client.query(
   'SELECT COUNT(c.id)::integer AS components,COALESCE(SUM(c.amount),0)::text AS basis FROM asset_os.acquisitions a JOIN asset_os.acquisition_costs c ON c.tenant_id=a.tenant_id AND c.acquisition_id=a.id WHERE a.tenant_id=$1 AND a.asset_id=$2',
   [tenantId,assetId]),
  client.query(
   "SELECT f.id,b.outstanding::text AS outstanding,to_char(b.observed_on,'YYYY-MM-DD') AS \"observedOn\" FROM asset_os.financing_facilities f LEFT JOIN LATERAL (SELECT outstanding,observed_on FROM asset_os.financing_balances WHERE tenant_id=f.tenant_id AND facility_id=f.id ORDER BY observed_on DESC,id DESC LIMIT 1) b ON TRUE WHERE f.tenant_id=$1 AND f.asset_id=$2",
   [tenantId,assetId]),
  client.query(
   'SELECT kind,COALESCE(SUM(amount),0)::text AS total,COUNT(*)::integer AS observations FROM asset_os.cash_flow_observations WHERE tenant_id=$1 AND asset_id=$2 AND source_authority=$3 GROUP BY kind',
   [tenantId,assetId,'USER_ENTRY'])
 ])
 const current=accepted.rows[0] as {id:string;amount:string;effectiveOn:string;method:string;confidence:string;sourceLabel:string}|undefined
 const estimate=current?.amount??asset.registryValue
 const basis=Number(cost.rows[0].components)>0?String(cost.rows[0].basis):null
 const facilities=fin.rows as Array<{id:string;outstanding:string|null;observedOn:string|null}>
 const unknown=facilities.filter(f=>f.outstanding===null).length
 const debt=unknown?null:amountSafe(facilities.reduce((acc,f)=>acc+asCents(f.outstanding||'0'),0n))
 const equity=estimate!==null&&debt!==null?
  amountSafe(asCents(estimate)-asCents(debt)):null
 const totals=Object.fromEntries(['INCOME','EXPENSE','CAPEX','FINANCING_INFLOW','FINANCING_OUTFLOW'].map(kind=>[kind,'0.00'])) as Record<string,string>
 for(const r of flows.rows as Array<{kind:string;total:string}>)totals[r.kind]=r.total
 const operating=amountSafe(asCents(totals.INCOME)-asCents(totals.EXPENSE)-asCents(totals.CAPEX))
 const indicativeChange=estimate!==null&&basis!==null?amountSafe(asCents(estimate)-asCents(basis)):null
 return {
  assetId,currency:asset.currency,lifecycle:asset.lifecycle,recordVersion:asset.recordVersion,
  selectedValue:estimate,
  valueSource:current?'ACCEPTED_INTERNAL_VALUATION':estimate!==null?'UNVERIFIED_REGISTRY_ENTRY':'NONE',
  acceptedValuation:current||null,originalCostBasis:basis,
  financing:{facilityCount:facilities.length,missingBalanceCount:unknown,
   debtBalance:debt,sourceAuthority:'USER_ENTERED_SNAPSHOTS',asOf:facilities.length?
    facilities.map(f=>f.observedOn).filter((d):d is string=>Boolean(d)).sort().at(0)||null:null},
  indicativeEquity:equity,
  observedCashFlow:{totals,operatingNet:operating,includesFinancingInNet:false,
   sourceAuthority:'USER_ENTRIES_NOT_FINANCE_OS'},
  indicativeValueChange:indicativeChange,
  indicativeChangePercent:indicativeChange!==null&&basis!==null?
   ratioPercent(asCents(indicativeChange),asCents(basis)):null,
  interpretation:'Informational snapshots only. Missing balances block equity; no ledger, payment, external appraisal or tax authority.'
 }
}
