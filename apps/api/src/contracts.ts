import {z} from 'zod'
// B0 contracts are NOT an authorization mechanism. Money must be decimal strings.
export const Uuid=z.uuid()
export const Currency=z.string().regex(/^[A-Z]{3}$/)
export const DecimalMoney=z.string().regex(/^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/)
export const IsoDate=z.iso.date()
export const IdempotencyKey=z.string().min(8).max(128).regex(/^[A-Za-z0-9._~:-]+$/)
export const RequestContext=z.object({
 tenantId:Uuid,subjectId:Uuid,requestId:Uuid,scopes:z.array(z.string().max(100)).max(50)
}).strict()
export type TrustedRequestContext=z.infer<typeof RequestContext>
export const CreateAssetRequest=z.object({
 name:z.string().trim().min(1).max(160),
 description:z.string().max(1200).default(''),
 category:z.string().min(1).max(120),
 subcategory:z.string().max(120).default(''),
 currency:Currency,
 registryValue:DecimalMoney.nullable().default(null),
 valueAsOf:IsoDate.nullable().default(null),
 locationLabel:z.string().max(160).default(''),
 customFields:z.record(z.string().max(100),z.string().max(300)).default({}),
 tags:z.array(z.string().min(1).max(80)).max(40).default([])
}).strict()
export type CreateAssetDto=z.infer<typeof CreateAssetRequest>
export const CreatePortfolioRequest=z.object({
 name:z.string().trim().min(1).max(160),
 description:z.string().max(500).default(''),
 currency:Currency
}).strict()
export const AssetListQuery=z.object({
 limit:z.coerce.number().int().min(1).max(100).default(30),
 cursor:z.string().max(512).optional(),
 currency:Currency.optional(),
 lifecycle:z.enum(['PLANNED','ACQUISITION_PENDING','ACQUIRED','ACTIVE','SUSPENDED','DISPOSED','ARCHIVED']).optional()
}).strict()
export const AssetEventEnvelope=z.object({
 eventId:Uuid,tenantId:Uuid,correlationId:Uuid,causationId:Uuid.nullable(),
 schemaVersion:z.number().int().min(1),type:z.string().min(1).max(140),
 aggregateId:Uuid,aggregateKind:z.literal('ASSET'),
 occurredAt:z.iso.datetime({offset:true}),
 payload:z.record(z.string(),z.unknown())
}).strict()
export const ErrorResponse=z.object({error:z.object({
 code:z.string().min(1),message:z.string().min(1),requestId:z.string().min(1)
}).strict()}).strict()
export const API_VERSION='1'
export const CONTRACT_VERSION='2026-10-31.b2'
export const IDENTITY_NOT_CONFIGURED='IDENTITY_NOT_CONFIGURED'
export const FOUNDATION_ONLY_CAPABILITIES=[
 'health_liveness','health_readiness','openapi_contract','postgresql_migrations',
 'tenant_rls','transactional_outbox_schema','idempotency_schema'
] as const
// Caller-supplied x-tenant-id, x-subject-id, body or bearer-like strings are NEVER trusted in B0.
export function identityNotConfigured(requestId:string){
 return ErrorResponse.parse({error:{
  code:IDENTITY_NOT_CONFIGURED,
  message:'Authenticated Asset OS domain access is disabled until a verified Personal Kernel identity provider is configured.',
  requestId
 }})
}


// B1 write input: only explicitly allowlisted registry fields.
export const PatchAssetRequest=z.object({
  name:z.string().trim().min(1).max(160).optional(),
  description:z.string().max(1200).optional(),
  category:z.string().trim().min(1).max(120).optional(),
  subcategory:z.string().max(120).optional(),
  registryValue:DecimalMoney.nullable().optional(),
  valueAsOf:IsoDate.nullable().optional(),
  locationLabel:z.string().max(160).optional(),
  customFields:z.record(z.string().max(100),z.string().max(300)).optional(),
  tags:z.array(z.string().trim().min(1).max(80)).max(40).optional()
}).strict().refine(value=>Object.keys(value).length>0,{message:'At least one asset field is required'})
export type PatchAssetDto=z.infer<typeof PatchAssetRequest>
export const IfMatchVersion=z.string().regex(/^"[1-9]\d{0,8}"$/)
export const B1_CAPABILITIES=[
  ...FOUNDATION_ONLY_CAPABILITIES,
  'oidc_rs256_jwks_verification','tenant_membership_authorization',
  'asset_registry_create_read_update','idempotent_registry_commands',
  'optimistic_asset_versioning','transactional_registry_audit_outbox'
] as const


// B2 lifecycle facts: monetary amounts are exact nonnegative decimal strings.
export const AcquisitionMethod=z.enum(['PURCHASE','TRANSFER','GIFT','INHERITANCE','CREATION','EXCHANGE','INVESTMENT','OTHER'])
export const OwnershipDimension=z.enum(['ECONOMIC','BENEFICIAL','LEGAL','CONTROL'])
export const DispositionKind=z.enum(['SALE','TRANSFER','DONATION','WRITE_OFF','DESTRUCTION','TRADE','OTHER'])
export const CostComponents=['purchase','taxes','fees','installation','improvements','other'] as const
export const Costs=z.object({
 purchase:DecimalMoney.default('0'),taxes:DecimalMoney.default('0'),
 fees:DecimalMoney.default('0'),installation:DecimalMoney.default('0'),
 improvements:DecimalMoney.default('0'),other:DecimalMoney.default('0')
}).strict()
export const AcquireRequest=z.object({
 method:AcquisitionMethod,effectiveOn:IsoDate,
 counterpartyLabel:z.string().max(120).default(''),
 evidenceReference:z.string().max(140).default(''),
 notes:z.string().max(600).default(''),
 costs:Costs
}).strict()
export const LifecycleCommand=z.object({
 action:z.enum(['START_ACQUISITION','ACTIVATE','SUSPEND','REACTIVATE','ARCHIVE']),
 reason:z.string().trim().min(1).max(400)
}).strict()
export const OwnershipAssignment=z.object({
 dimension:OwnershipDimension,
 partyRef:z.string().trim().min(1).max(90),
 partyLabel:z.string().trim().min(1).max(120),
 percentage:DecimalMoney.nullable(),
 effectiveOn:IsoDate,
 note:z.string().max(400).default('')
}).strict().superRefine((v,ctx)=>{
 const p=v.percentage===null?null:Number(v.percentage)
 if(['ECONOMIC','BENEFICIAL'].includes(v.dimension) && (p===null||p<=0||p>100))
  ctx.addIssue({code:'custom',message:'Economic and beneficial interests require a percentage between 0.01 and 100.',path:['percentage']})
 if(['LEGAL','CONTROL'].includes(v.dimension) && p!==null)
  ctx.addIssue({code:'custom',message:'Legal and control interests are nonpercentage references.',path:['percentage']})
})
export const OwnershipTransfer=z.object({
 sourceInterestId:Uuid,
 toPartyRef:z.string().trim().min(1).max(90),
 toPartyLabel:z.string().trim().min(1).max(120),
 percentage:DecimalMoney,
 effectiveOn:IsoDate,
 note:z.string().max(400).default('')
}).strict()
export const DispositionRequest=z.object({
 kind:DispositionKind,effectiveOn:IsoDate,
 proceeds:DecimalMoney,costs:DecimalMoney,
 counterpartyLabel:z.string().max(120).default(''),
 reason:z.string().trim().min(1).max(400),
 confirm:z.literal('DISPOSE')
}).strict()
export const B2_CAPABILITIES=[
 ...B1_CAPABILITIES,
 'lifecycle_guarded_transitions','acquisition_cost_basis_recording',
 'ownership_dimension_assignments_and_transfers','disposition_and_archive_history',
 'versioned_idempotent_lifecycle_commands','atomic_audit_outbox_on_lifecycle_changes'
] as const
