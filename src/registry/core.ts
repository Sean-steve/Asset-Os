/**
 * Asset OS Phase 1 — frontend-only registry domain.
 * This browser prototype is NOT the Asset OS authority, financial ledger or Kernel identity service.
 * All seed records are synthetic. Browser storage is not suitable for sensitive user data.
 */
export type Category = {
  name: string
  description: string
  subcategories: string[]
  icon: string
  detailFields: Array<{key: string; label: string; hint: string}>
  system: boolean
}
export type Lifecycle = 'PLANNED' | 'ACQUISITION_PENDING' | 'ACQUIRED' | 'ACTIVE' | 'SUSPENDED' | 'DISPOSED' | 'ARCHIVED'
export type Operational = 'OPERATIONAL' | 'IDLE' | 'MAINTENANCE' | 'DAMAGED' | 'INOPERABLE'
export type Risk = 'NORMAL' | 'WATCH' | 'AT_RISK' | 'CRITICAL'
export type AssetRecord = {
  id: string
  number: string
  name: string
  description: string
  category: string
  subcategory: string
  lifecycle: Lifecycle
  operational: Operational
  risk: Risk
  currency: string
  value: number
  equity: number
  valuationAsOf: string
  location: string
  ownerLabel: string
  acquiredOn: string
  tags: string[]
  details: Record<string,string>
  createdAt: string
  updatedAt: string
  origin: 'sample' | 'local'
}
export type ActivityEntry = {
  id: string
  assetId: string
  assetName: string
  event: 'REGISTERED' | 'UPDATED' | 'TAGGED' | 'CLASSIFIED' | 'RESET'
  details: string
  at: string
}
export type RegistryState = {
  version: 1
  records: AssetRecord[]
  tags: string[]
  categories: Category[]
  activity: ActivityEntry[]
}
export type AssetInput = Omit<AssetRecord,'id'|'number'|'createdAt'|'updatedAt'|'origin'>
export const STORE_KEY = 'asset-os:registry:v1'
export const DEFAULT_CATEGORIES: Category[] = [
  {name:'Real Estate',description:'Land, buildings, residential and commercial property',icon:'building',subcategories:['Residential Rental','Commercial Property','Land','Primary Residence','Short-stay Property'],system:true,detailFields:[
    {key:'propertyType',label:'Property type',hint:'Apartment, house, plot...'},
    {key:'areaSqm',label:'Area (m²)',hint:'e.g. 145'},
    {key:'units',label:'Number of units',hint:'e.g. 8'},
    {key:'titleRef',label:'Title reference (sample only)',hint:'Non-sensitive placeholder'},
  ]},
  {name:'Vehicles',description:'Personal, commercial and income-generating vehicles',icon:'car',subcategories:['Commercial Vehicle','Private Car','Motorcycle','Heavy Vehicle','Fleet Vehicle'],system:true,detailFields:[
    {key:'make',label:'Make',hint:'Toyota'},
    {key:'model',label:'Model',hint:'Hilux'},
    {key:'year',label:'Model year',hint:'2022'},
    {key:'mileage',label:'Odometer (km)',hint:'e.g. 72000'},
    {key:'registration',label:'Registration (sample only)',hint:'ABC 123X'},
  ]},
  {name:'Investments',description:'Asset OS references to investments; Trading/Finance retains transaction authority',icon:'chart',subcategories:['Equity Portfolio','Fixed Income','Fund','Private Investment','Other Investment'],system:true,detailFields:[
    {key:'platform',label:'Platform / custodian',hint:'Example platform'},
    {key:'instrument',label:'Instrument / strategy',hint:'e.g. balanced fund'},
    {key:'units',label:'Units (informational)',hint:'e.g. 100'},
    {key:'reference',label:'External position reference',hint:'External ID, not a secret'},
  ]},
  {name:'Business',description:'Business equipment, operating assets and enterprise holdings',icon:'briefcase',subcategories:['Equipment','Machinery','Business Interest','Office Assets','Tools'],system:true,detailFields:[
    {key:'serial',label:'Serial / inventory reference',hint:'Example serial'},
    {key:'condition',label:'Condition',hint:'Good / Fair / Excellent'},
    {key:'department',label:'Assigned department',hint:'Operations'},
    {key:'warrantyUntil',label:'Warranty until',hint:'YYYY-MM-DD'},
  ]},
  {name:'Digital Assets',description:'Software, domains, licenses, intellectual property and digital holdings',icon:'server',subcategories:['Domain','Software','License','Intellectual Property','Digital Business'],system:true,detailFields:[
    {key:'platform',label:'Platform / registrar',hint:'Example provider'},
    {key:'identifier',label:'Asset identifier',hint:'Domain or product name'},
    {key:'renewal',label:'Renewal date',hint:'YYYY-MM-DD'},
    {key:'licenseType',label:'License / right type',hint:'Ownership, subscription...'},
  ]},
  {name:'Other',description:'Other physical, collectible or non-standard assets',icon:'layers',subcategories:['Collectible','Personal Asset','Other'],system:true,detailFields:[
    {key:'identifier',label:'Identifier',hint:'Unique asset description'},
    {key:'condition',label:'Condition',hint:'Current condition'},
  ]},
]
export const SAMPLE_ASSETS: AssetRecord[] = [
 {id:'sample-property',number:'AST-001',name:'Riverside Apartments',description:'Illustrative rental apartments in Nairobi.',category:'Real Estate',subcategory:'Residential Rental',lifecycle:'ACTIVE',operational:'OPERATIONAL',risk:'NORMAL',currency:'KES',value:12200000,equity:8300000,valuationAsOf:'2026-10-01',location:'Nairobi',ownerLabel:'Example owner',acquiredOn:'2024-01-16',tags:['Income producing','Priority'],details:{propertyType:'Apartments',areaSqm:'420',units:'8',titleRef:'SAMPLE-TITLE-001'},createdAt:'2026-08-01T10:00:00Z',updatedAt:'2026-10-01T10:00:00Z',origin:'sample'},
 {id:'sample-vehicle',number:'AST-002',name:'Toyota Hilux 2022',description:'Illustrative commercial pickup in the fleet.',category:'Vehicles',subcategory:'Commercial Vehicle',lifecycle:'ACTIVE',operational:'OPERATIONAL',risk:'WATCH',currency:'KES',value:3450000,equity:2650000,valuationAsOf:'2026-10-02',location:'Nairobi',ownerLabel:'Example owner',acquiredOn:'2024-08-15',tags:['Income producing','Vehicle'],details:{make:'Toyota',model:'Hilux',year:'2022',mileage:'72000',registration:'SAMPLE 001'},createdAt:'2026-08-01T10:00:00Z',updatedAt:'2026-10-02T12:00:00Z',origin:'sample'},
 {id:'sample-investment',number:'AST-003',name:'Investment Portfolio',description:'Illustrative collection of financial holdings. Not linked to a broker.',category:'Investments',subcategory:'Equity Portfolio',lifecycle:'ACTIVE',operational:'IDLE',risk:'NORMAL',currency:'KES',value:4950000,equity:4950000,valuationAsOf:'2026-09-29',location:'Online',ownerLabel:'Example owner',acquiredOn:'2023-06-01',tags:['Long term'],details:{platform:'Example Custodian',instrument:'Diversified holdings',units:'100',reference:'DEMO-PORT-001'},createdAt:'2026-08-01T10:00:00Z',updatedAt:'2026-09-29T12:00:00Z',origin:'sample'},
 {id:'sample-business',number:'AST-004',name:'Business Equipment',description:'Illustrative business computers and office equipment.',category:'Business',subcategory:'Equipment',lifecycle:'ACTIVE',operational:'OPERATIONAL',risk:'NORMAL',currency:'KES',value:1850000,equity:1750000,valuationAsOf:'2026-09-15',location:'Nairobi',ownerLabel:'Example business',acquiredOn:'2025-02-12',tags:['Operations'],details:{serial:'SAMPLE-ASSET-004',condition:'Excellent',department:'Operations',warrantyUntil:'2027-02-12'},createdAt:'2026-08-01T10:00:00Z',updatedAt:'2026-09-15T12:00:00Z',origin:'sample'},
 {id:'sample-digital',number:'AST-005',name:'Software & Domains',description:'Illustrative domain and software rights bundle.',category:'Digital Assets',subcategory:'Software',lifecycle:'ACTIVE',operational:'OPERATIONAL',risk:'WATCH',currency:'KES',value:2400000,equity:150000,valuationAsOf:'2026-09-20',location:'Online',ownerLabel:'Example business',acquiredOn:'2023-11-03',tags:['Review','Digital'],details:{platform:'Example provider',identifier:'sample.example',renewal:'2027-01-01',licenseType:'Proprietary'},createdAt:'2026-08-01T10:00:00Z',updatedAt:'2026-09-20T12:00:00Z',origin:'sample'},
]
const INITIAL_TAGS = ['Income producing','Priority','Vehicle','Long term','Operations','Review','Digital']
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
export function initialRegistry(): RegistryState {
  return {version:1,records:copy(SAMPLE_ASSETS),categories:copy(DEFAULT_CATEGORIES),tags:[...INITIAL_TAGS],activity:[]}
}
function validRecord(value: unknown): value is AssetRecord {
  if (!value || typeof value!=='object') return false
  const v = value as Partial<AssetRecord>
  return typeof v.id==='string'&&typeof v.name==='string'&&typeof v.category==='string'&&typeof v.currency==='string'&&
  typeof v.value==='number'&&Number.isFinite(v.value)&&typeof v.equity==='number'&&Number.isFinite(v.equity)&&
  Array.isArray(v.tags)&&typeof v.details==='object'&&v.details!==null&&
  (v.origin==='sample'||v.origin==='local')
}
export function loadRegistry(storage?: Pick<Storage,'getItem'>): RegistryState {
  const target = storage ?? (typeof window==='undefined' ? undefined : window.localStorage)
  if (!target) return initialRegistry()
  try {
    const data = target.getItem(STORE_KEY)
    if (data===null) return initialRegistry()
    const value: unknown = JSON.parse(data)
    if (!value || typeof value !== 'object') return initialRegistry()
    const obj=value as Partial<RegistryState>
    if (obj.version!==1||!Array.isArray(obj.records)||!obj.records.every(validRecord)||
      !Array.isArray(obj.tags)||!obj.tags.every(t=>typeof t==='string')||
      !Array.isArray(obj.categories)||!obj.categories.every(c=>c&&typeof c.name==='string'&&Array.isArray(c.subcategories))||
      !Array.isArray(obj.activity)) return initialRegistry()
    return copy(obj as RegistryState)
  } catch { return initialRegistry() }
}
export function saveRegistry(state:RegistryState,storage?: Pick<Storage,'setItem'>): boolean {
  const target=storage ?? (typeof window==='undefined'?undefined:window.localStorage)
  if (!target) return false
  try {target.setItem(STORE_KEY,JSON.stringify(state));return true} catch {return false}
}
function uid():string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'local-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)
}
function isoDay(value:string):boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d=new Date(value+'T00:00:00Z')
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value
}
export function validateAsset(input:AssetInput,state:RegistryState):Record<string,string> {
  const errors:Record<string,string>={}
  if (!input.name||!input.name.trim()) errors.name='Name is required.'
  else if (input.name.trim().length>120) errors.name='Keep the name under 120 characters.'
  if (input.description.length>1200) errors.description='Description exceeds 1,200 characters.'
  const category=state.categories.find(c=>c.name===input.category)
  if (!category) errors.category='Select a valid asset category.'
  else if (!category.subcategories.includes(input.subcategory)) errors.subcategory='Select a valid subcategory.'
  if (!/^[A-Z]{3}$/.test(input.currency)) errors.currency='Use an ISO currency code, for example KES.'
  if (!Number.isFinite(input.value)||input.value<0||input.value>1e15) errors.value='Value must be a non-negative finite amount.'
  if (!Number.isFinite(input.equity)||input.equity<0||input.equity>1e15) errors.equity='Equity must be a non-negative finite amount.'
  if (input.valuationAsOf&&!isoDay(input.valuationAsOf)) errors.valuationAsOf='Enter a valid calendar date.'
  if (input.acquiredOn&&!isoDay(input.acquiredOn)) errors.acquiredOn='Enter a valid calendar date.'
  if (input.tags.some(t=>!state.tags.includes(t))) errors.tags='One or more tags no longer exists.'
  if (input.location.length>160) errors.location='Location is too long.'
  if (input.ownerLabel.length>160) errors.ownerLabel='Owner label is too long.'
  if (Object.values(input.details).some(d=>typeof d!=='string'||d.length>300)) errors.details='Category fields must be under 300 characters.'
  return errors
}
export function createAsset(state:RegistryState,input:AssetInput,at=new Date().toISOString()):RegistryState {
  const errors=validateAsset(input,state)
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0])
  const num=Math.max(0,...state.records.map(r=>parseInt(r.number.replace(/\D/g,''),10)||0))+1
  const id=uid()
  const record:AssetRecord={...copy(input),name:input.name.trim(),id,number:'AST-'+String(num).padStart(3,'0'),createdAt:at,updatedAt:at,origin:'local'}
  return {...state,records:[record,...state.records],activity:[{
    id:uid(),assetId:id,assetName:record.name,event:'REGISTERED',details:'Asset registered in browser-only workspace',at
  },...state.activity].slice(0,500)}
}
export function updateAsset(state:RegistryState,id:string,input:AssetInput,at=new Date().toISOString()):RegistryState {
  const current=state.records.find(a=>a.id===id)
  if (!current) throw new Error('Asset was not found.')
  const errors=validateAsset(input,state)
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0])
  const classification=current.category!==input.category||current.subcategory!==input.subcategory
  const retag=JSON.stringify(current.tags)!==JSON.stringify(input.tags)
  const changed=current.name!==input.name||current.description!==input.description||current.value!==input.value||
  current.equity!==input.equity||current.lifecycle!==input.lifecycle||current.operational!==input.operational||
  current.risk!==input.risk||current.currency!==input.currency||current.valuationAsOf!==input.valuationAsOf||
  current.location!==input.location||current.ownerLabel!==input.ownerLabel||current.acquiredOn!==input.acquiredOn||
  JSON.stringify(current.details)!==JSON.stringify(input.details)||retag||classification
  if (!changed) return state
  const event:ActivityEntry['event']=classification?'CLASSIFIED':retag?'TAGGED':'UPDATED'
  return {...state,records:state.records.map(r=>r.id===id?{...current,...copy(input),name:input.name.trim(),updatedAt:at}:r),
    activity:[{id:uid(),assetId:id,assetName:input.name.trim(),event,
      details:classification?'Classification updated from '+current.category+' to '+input.category:
      retag?'Tags updated':'Asset information updated',at},...state.activity].slice(0,500)}
}
export function createTag(state:RegistryState,label:string):RegistryState {
  const clean=label.trim().replace(/\s+/g,' ')
  if (!clean||clean.length>45) throw new Error('Tag must contain 1–45 characters.')
  if (state.tags.some(t=>t.toLowerCase()===clean.toLowerCase())) throw new Error('That tag already exists.')
  return {...state,tags:[...state.tags,clean].sort((a,b)=>a.localeCompare(b))}
}
export function renameTag(state:RegistryState,from:string,to:string):RegistryState {
  const clean=to.trim().replace(/\s+/g,' ')
  if (!state.tags.includes(from)) throw new Error('Tag was not found.')
  if (!clean||clean.length>45||state.tags.some(t=>t!==from&&t.toLowerCase()===clean.toLowerCase())) throw new Error('Choose a unique tag of 1–45 characters.')
  return {...state,tags:state.tags.map(t=>t===from?clean:t).sort((a,b)=>a.localeCompare(b)),
    records:state.records.map(r=>({...r,tags:r.tags.map(t=>t===from?clean:t)}))}
}
export function deleteTag(state:RegistryState,name:string):RegistryState {
  if (!state.tags.includes(name)) throw new Error('Tag was not found.')
  return {...state,tags:state.tags.filter(t=>t!==name),records:state.records.map(r=>({...r,tags:r.tags.filter(t=>t!==name)}))}
}
export function addCategory(state:RegistryState,name:string,description=''):RegistryState {
  const label=name.trim().replace(/\s+/g,' ')
  if (!label||label.length>70||state.categories.some(c=>c.name.toLowerCase()===label.toLowerCase())) throw new Error('Enter a unique category name (1–70 characters).')
  return {...state,categories:[...state.categories,{name:label,description:description.trim().slice(0,180),subcategories:['General'],icon:'layers',detailFields:[{key:'identifier',label:'Identifier',hint:'Optional category reference'}],system:false}]}
}
export function addSubcategory(state:RegistryState,name:string,subcategory:string):RegistryState {
  const label=subcategory.trim().replace(/\s+/g,' ')
  const category=state.categories.find(c=>c.name===name)
  if (!category) throw new Error('Category not found.')
  if (!label||label.length>70||category.subcategories.some(s=>s.toLowerCase()===label.toLowerCase())) throw new Error('Enter a unique subcategory of 1–70 characters.')
  return {...state,categories:state.categories.map(c=>c.name===name?{...c,subcategories:[...c.subcategories,label]}:c)}
}
export const sumInCurrency=(records:AssetRecord[],field:'value'|'equity',currency:string):number=>
  records.filter(r=>r.currency===currency&&r.lifecycle!=='DISPOSED'&&r.lifecycle!=='ARCHIVED').reduce((sum,r)=>sum+r[field],0)
export const distinctCurrencies=(records:AssetRecord[]):string[]=>[...new Set(records.map(r=>r.currency))].sort()
export type SearchCriteria={query:string;category:string;subcategory:string;lifecycle:string;risk:string;tag:string;minValue:string;maxValue:string;order:string}
export function searchAssets(records:AssetRecord[],criteria:SearchCriteria):AssetRecord[] {
  const q=criteria.query.trim().toLowerCase()
  const min=criteria.minValue.trim()?Number(criteria.minValue):null
  const max=criteria.maxValue.trim()?Number(criteria.maxValue):null
  return records.filter(r=>{
    if(q&&!(r.name+' '+r.number+' '+r.description+' '+r.category+' '+r.subcategory+' '+r.location+' '+r.tags.join(' ')).toLowerCase().includes(q))return false
    if(criteria.category&&r.category!==criteria.category)return false
    if(criteria.subcategory&&r.subcategory!==criteria.subcategory)return false
    if(criteria.lifecycle&&r.lifecycle!==criteria.lifecycle)return false
    if(criteria.risk&&r.risk!==criteria.risk)return false
    if(criteria.tag&&!r.tags.includes(criteria.tag))return false
    if(min!==null&&(!Number.isFinite(min)||r.value<min))return false
    if(max!==null&&(!Number.isFinite(max)||r.value>max))return false
    return true
  }).sort((a,b)=>criteria.order==='name'?a.name.localeCompare(b.name):
    criteria.order==='value_high'?b.value-a.value:
    criteria.order==='value_low'?a.value-b.value:
    criteria.order==='oldest'?a.createdAt.localeCompare(b.createdAt):
    b.updatedAt.localeCompare(a.updatedAt))
}
export const EMPTY_SEARCH:SearchCriteria={query:'',category:'',subcategory:'',lifecycle:'',risk:'',tag:'',minValue:'',maxValue:'',order:'updated'}
