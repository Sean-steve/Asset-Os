import {createHash,randomUUID} from 'node:crypto'
import {z} from 'zod'
import type {TenantSqlClient} from './database.js'
import {ApiFault,type VerifiedMembership} from './identity.js'
import {
 AssetListQuery,CreateAssetRequest,PatchAssetRequest,IdempotencyKey,IfMatchVersion,Uuid,
 type CreateAssetDto,type PatchAssetDto
} from './contracts.js'

const columns=[
 'a.id,a.tenant_id,a.asset_number,a.name,a.description,a.category,',
 'a.subcategory,a.lifecycle,a.operational_state,a.risk_label,a.currency,',
 'a.registry_value::text AS registry_value,',
 "CASE WHEN a.value_as_of IS NULL THEN NULL ELSE to_char(a.value_as_of,'YYYY-MM-DD') END AS value_as_of,",
 'a.location_label,a.custom_fields,a.record_version,a.created_at,a.updated_at,',
 "COALESCE((SELECT jsonb_agg(t.tag ORDER BY t.tag) FROM asset_os.asset_tags t",
 " WHERE t.tenant_id=a.tenant_id AND t.asset_id=a.id),'[]'::jsonb) AS tags"
].join(' ')
type AssetRow={
 id:string;tenant_id:string;asset_number:string;name:string;description:string;
 category:string;subcategory:string;lifecycle:string;operational_state:string;
 risk_label:string;currency:string;registry_value:string|null;value_as_of:string|null;
 location_label:string;custom_fields:Record<string,string>;record_version:number;
 created_at:Date;updated_at:Date;tags:string[]
}
type StoredIdempotency={request_hash:string;response_code:number|null;response_body:unknown}
export function assetDto(row:AssetRow){
 return {id:row.id,tenantId:row.tenant_id,assetNumber:row.asset_number,
  name:row.name,description:row.description,category:row.category,
  subcategory:row.subcategory,lifecycle:row.lifecycle,operationalState:row.operational_state,
  riskLabel:row.risk_label,currency:row.currency,registryValue:row.registry_value,
  valueAsOf:row.value_as_of,locationLabel:row.location_label,customFields:row.custom_fields,
  recordVersion:row.record_version,createdAt:new Date(row.created_at).toISOString(),
  updatedAt:new Date(row.updated_at).toISOString(),tags:row.tags
 }
}
const canonical=(input:unknown):string=>{
 if(Array.isArray(input))return '['+input.map(canonical).join(',')+']'
 if(input&&typeof input==='object')return '{'+Object.entries(input)
  .sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}'
 return JSON.stringify(input)??'null'
}
export function requestFingerprint(value:unknown){
 return createHash('sha256').update(canonical(value)).digest('hex')
}
export function normalizedTags(value:string[]){
 const clean=value.map(x=>x.trim())
 if(clean.some(x=>!x))throw new ApiFault(400,'INVALID_ASSET_TAG','Tags must not be empty.')
 if(new Set(clean.map(x=>x.toLocaleLowerCase('en'))).size!==clean.length)
  throw new ApiFault(400,'DUPLICATE_TAG','Tags must be unique (case-insensitive).')
 return clean.sort((a,b)=>a.localeCompare(b))
}
export function validateValuationDate(input:Pick<CreateAssetDto,'registryValue'|'valueAsOf'>){
 if(input.registryValue!==null&&input.valueAsOf===null)
  throw new ApiFault(422,'VALUE_DATE_REQUIRED','A recorded registry value requires a valuation effective date.')
}
function parseBody<T>(schema:z.ZodType<T>,value:unknown):T{
 const parsed=schema.safeParse(value)
 if(!parsed.success)throw new ApiFault(400,'INVALID_REQUEST','The provided asset input does not match the API contract.')
 return parsed.data
}
function parseIdempotency(value:string|undefined):string{
 const result=IdempotencyKey.safeParse(value)
 if(!result.success)throw new ApiFault(428,'IDEMPOTENCY_KEY_REQUIRED','Provide a valid Idempotency-Key header.')
 return result.data
}
function parseVersion(value:string|undefined):number{
 if(!value)throw new ApiFault(428,'IF_MATCH_REQUIRED','Supply the current strong ETag using If-Match.')
 if(!IfMatchVersion.safeParse(value).success)
  throw new ApiFault(400,'INVALID_IF_MATCH','If-Match must be a quoted positive record version.')
 return Number(value.slice(1,-1))
}
export function etag(version:number){return '"'+version+'"'}
async function fetchRow(client:TenantSqlClient,tenantId:string,assetId:string):Promise<AssetRow|null>{
 const result=await client.query('SELECT '+columns+' FROM asset_os.assets a WHERE a.tenant_id=$1 AND a.id=$2',[tenantId,assetId])
 return (result.rows[0] as AssetRow|undefined)||null
}
export async function getAsset(client:TenantSqlClient,tenantId:string,assetId:string){
 const parsed=Uuid.safeParse(assetId)
 if(!parsed.success)throw new ApiFault(400,'INVALID_ASSET_ID','Asset ID must be a UUID.')
 const result=await fetchRow(client,tenantId,assetId)
 if(!result)throw new ApiFault(404,'ASSET_NOT_FOUND','Asset not found in this tenant.')
 return assetDto(result)
}
type Cursor={createdAt:string;id:string}
export function parseCursor(raw:string):Cursor{
 try{
  const obj=JSON.parse(Buffer.from(raw,'base64url').toString('utf8')) as unknown
  return z.object({createdAt:z.iso.datetime({offset:true}),id:Uuid}).strict().parse(obj)
 }catch{throw new ApiFault(400,'INVALID_CURSOR','Pagination cursor is invalid.')}
}
export function makeCursor(row:AssetRow){
 return Buffer.from(JSON.stringify({createdAt:new Date(row.created_at).toISOString(),id:row.id})).toString('base64url')
}
export async function listAssets(client:TenantSqlClient,tenantId:string,query:unknown){
 const args=parseBody(AssetListQuery,query)
 const values:unknown[]=[tenantId]
 const clauses=['a.tenant_id=$1']
 if(args.currency){values.push(args.currency);clauses.push('a.currency=$'+values.length)}
 if(args.lifecycle){values.push(args.lifecycle);clauses.push('a.lifecycle=$'+values.length)}
 if(args.cursor){
  const cursor=parseCursor(args.cursor)
  values.push(cursor.createdAt,cursor.id)
  clauses.push('(a.created_at,a.id)<($'+(values.length-1)+'::timestamptz,$'+values.length+'::uuid)')
 }
 values.push(args.limit+1)
 const rows=(await client.query('SELECT '+columns+' FROM asset_os.assets a WHERE '+clauses.join(' AND ')+
  ' ORDER BY a.created_at DESC,a.id DESC LIMIT $'+values.length,values)).rows as AssetRow[]
 const page=rows.slice(0,args.limit)
 return {items:page.map(assetDto),nextCursor:rows.length>args.limit?makeCursor(page[page.length-1]):null,limit:args.limit}
}
async function reserveIdempotency(client:TenantSqlClient,tenantId:string,operation:string,key:string,hash:string){
 const inserted=await client.query(
  "INSERT INTO asset_os.idempotency_keys(tenant_id,operation,idempotency_key,request_hash,expires_at) VALUES($1,$2,$3,$4,clock_timestamp()+interval '24 hours') ON CONFLICT (tenant_id,operation,idempotency_key) DO NOTHING RETURNING id",
  [tenantId,operation,key,hash])
 if(inserted.rowCount===1)return {replay:false as const}
 const existing=(await client.query(
  'SELECT request_hash,response_code,response_body FROM asset_os.idempotency_keys WHERE tenant_id=$1 AND operation=$2 AND idempotency_key=$3 FOR UPDATE',
  [tenantId,operation,key])).rows[0] as StoredIdempotency|undefined
 if(!existing)throw new ApiFault(409,'IDEMPOTENCY_UNAVAILABLE','The idempotency record is unavailable.')
 if(existing.request_hash!==hash)throw new ApiFault(409,'IDEMPOTENCY_KEY_CONFLICT','This key was already used with a different request.')
 if(existing.response_code===null||!existing.response_body)throw new ApiFault(409,'IDEMPOTENCY_IN_PROGRESS','The prior request has not completed.')
 return {replay:true as const,status:existing.response_code,body:existing.response_body}
}
async function finalizeIdempotency(client:TenantSqlClient,tenantId:string,operation:string,key:string,status:number,response:unknown){
 await client.query(
  'UPDATE asset_os.idempotency_keys SET response_code=$4,response_body=$5::jsonb WHERE tenant_id=$1 AND operation=$2 AND idempotency_key=$3',
  [tenantId,operation,key,status,JSON.stringify(response)])
}
async function recordMutation(client:TenantSqlClient,member:VerifiedMembership,requestId:string,
 assetId:string,kind:'ASSET_REGISTERED'|'ASSET_UPDATED',version:number){
 await client.query(
  'INSERT INTO asset_os.audit_events(tenant_id,actor_binding_id,request_id,event_kind,subject_kind,subject_id,detail) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',
  [member.tenantId,member.identityId,requestId,kind,'ASSET',assetId,JSON.stringify({recordVersion:version})])
 await client.query(
  'INSERT INTO asset_os.outbox_events(event_id,tenant_id,type,schema_version,aggregate_kind,aggregate_id,payload,correlation_id,causation_id) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)',
  [randomUUID(),member.tenantId,kind==='ASSET_REGISTERED'?'asset.registered.v1':'asset.updated.v1',
  1,'ASSET',assetId,JSON.stringify({assetId,recordVersion:version}),requestId,null])
}
export type RegistryCommandResult={status:number;body:ReturnType<typeof assetDto>;replayed:boolean}
export async function createAsset(client:TenantSqlClient,member:VerifiedMembership,
 input:unknown,idempotency:string|undefined,requestId:string):Promise<RegistryCommandResult>{
 const dto=parseBody(CreateAssetRequest,input)
 validateValuationDate(dto)
 const tags=normalizedTags(dto.tags)
 const key=parseIdempotency(idempotency),op='assets.create'
 const fingerprint=requestFingerprint({operation:op,dto:{...dto,tags}})
 const locked=await reserveIdempotency(client,member.tenantId,op,key,fingerprint)
 if(locked.replay)return {status:locked.status,body:locked.body as RegistryCommandResult['body'],replayed:true}
 const assetId=randomUUID(),number='AST-'+assetId.replace(/-/g,'').slice(0,16).toUpperCase()
 await client.query(
  'INSERT INTO asset_os.assets(id,tenant_id,asset_number,name,description,category,subcategory,currency,registry_value,value_as_of,location_label,custom_fields,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)',
  [assetId,member.tenantId,number,dto.name,dto.description,dto.category,dto.subcategory,dto.currency,dto.registryValue,dto.valueAsOf,dto.locationLabel,JSON.stringify(dto.customFields),member.identityId])
 for(const tag of tags)await client.query(
  'INSERT INTO asset_os.asset_tags(tenant_id,asset_id,tag) VALUES($1,$2,$3)',
  [member.tenantId,assetId,tag])
 const row=await fetchRow(client,member.tenantId,assetId)
 if(!row)throw Error('Asset insert was not visible in the tenant transaction.')
 const body=assetDto(row)
 await recordMutation(client,member,requestId,assetId,'ASSET_REGISTERED',body.recordVersion)
 await finalizeIdempotency(client,member.tenantId,op,key,201,body)
 return {status:201,body,replayed:false}
}
const patchColumns:Record<Exclude<keyof PatchAssetDto,'tags'>,string>={
 name:'name',description:'description',category:'category',subcategory:'subcategory',
 registryValue:'registry_value',valueAsOf:'value_as_of',locationLabel:'location_label',
 customFields:'custom_fields'
}
export async function updateAsset(client:TenantSqlClient,member:VerifiedMembership,
 assetId:string,input:unknown,ifMatch:string|undefined,idempotency:string|undefined,requestId:string)
 :Promise<RegistryCommandResult>{
 if(!Uuid.safeParse(assetId).success)throw new ApiFault(400,'INVALID_ASSET_ID','Asset ID must be a UUID.')
 const dto=parseBody(PatchAssetRequest,input)
 const version=parseVersion(ifMatch),key=parseIdempotency(idempotency)
 const tags=dto.tags===undefined?undefined:normalizedTags(dto.tags)
 const operation='assets.patch:'+assetId
 const fingerprint=requestFingerprint({operation,version,dto:{...dto,...(tags?{tags}:{})}})
 const locked=await reserveIdempotency(client,member.tenantId,operation,key,fingerprint)
 if(locked.replay)return {status:locked.status,body:locked.body as RegistryCommandResult['body'],replayed:true}
 const prior=await fetchRow(client,member.tenantId,assetId)
 if(!prior)throw new ApiFault(404,'ASSET_NOT_FOUND','Asset not found in this tenant.')
 if(prior.record_version!==version)throw new ApiFault(412,'RECORD_VERSION_CONFLICT','This asset changed since the supplied ETag.')
 if(prior.lifecycle==='DISPOSED'||prior.lifecycle==='ARCHIVED')
  throw new ApiFault(409,'ASSET_READ_ONLY','Disposed or archived assets cannot be edited from the registry.')
 const nextValue=dto.registryValue===undefined?prior.registry_value:dto.registryValue
 const nextAsOf=dto.valueAsOf===undefined?prior.value_as_of:dto.valueAsOf
 validateValuationDate({registryValue:nextValue,valueAsOf:nextAsOf})
 const params:unknown[]=[member.tenantId,assetId,version]
 const assignments:string[]=[]
 for(const [key,value] of Object.entries(dto)){
  if(key==='tags')continue
  const column=patchColumns[key as keyof typeof patchColumns]
  if(!column)throw new ApiFault(400,'UNSUPPORTED_ASSET_FIELD','Field is not editable in the registry.')
  params.push(key==='customFields'?JSON.stringify(value):value)
  assignments.push(column+'=$'+params.length+(key==='customFields'?'::jsonb':''))
 }
 assignments.push('record_version=record_version+1','updated_at=clock_timestamp()')
 const change=await client.query(
  'UPDATE asset_os.assets SET '+assignments.join(',')+' WHERE tenant_id=$1 AND id=$2 AND record_version=$3 RETURNING id',
  params)
 if(change.rowCount!==1)throw new ApiFault(412,'RECORD_VERSION_CONFLICT','The asset was updated concurrently.')
 if(tags!==undefined){
  await client.query('DELETE FROM asset_os.asset_tags WHERE tenant_id=$1 AND asset_id=$2',[member.tenantId,assetId])
  for(const tag of tags)await client.query('INSERT INTO asset_os.asset_tags(tenant_id,asset_id,tag) VALUES($1,$2,$3)',
   [member.tenantId,assetId,tag])
 }
 const row=await fetchRow(client,member.tenantId,assetId)
 if(!row)throw Error('Updated asset disappeared from tenant transaction.')
 const body=assetDto(row)
 await recordMutation(client,member,requestId,assetId,'ASSET_UPDATED',body.recordVersion)
 await finalizeIdempotency(client,member.tenantId,operation,key,200,body)
 return {status:200,body,replayed:false}
}
