import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, ArrowLeft, ArrowRight, Building2, CalendarClock,
  CarFront, Check, ChevronRight, CircleAlert, Coins, Filter, FolderTree, History, Info, Layers3,
  Pencil, Plus, RefreshCcw, Search, Server, ShieldCheck,
  SlidersHorizontal, Tag, Trash2, TrendingUp, Wallet, X,
  BriefcaseBusiness, type LucideIcon
} from 'lucide-react'
import {
  addCategory, addSubcategory, createAsset, createTag, deleteTag,
  initialRegistry, renameTag, searchAssets, updateAsset,
  validateAsset, EMPTY_SEARCH,
  type AssetRecord, type AssetInput, type Category,
  type RegistryState, type SearchCriteria
} from './core'
import './registry.css'

type RegistryProps={
  path:string
  store:RegistryState
  onChange:(next:RegistryState)=>void
  navigate:(path:string)=>void
  report:(message:string)=>void
}
const currencyOptions=['KES','USD','EUR','GBP','UGX','TZS','RWF']
const lifecycleOptions=['PLANNED','ACQUISITION_PENDING','ACQUIRED','ACTIVE','SUSPENDED','DISPOSED','ARCHIVED']
const iconMap: Record<string,LucideIcon> = {
  building:Building2,car:CarFront,chart:TrendingUp,briefcase:BriefcaseBusiness,server:Server,layers:Layers3
}
const fmt=(n:number,currency:string)=>new Intl.NumberFormat('en-KE',{maximumFractionDigits:2}).format(n)+' '+currency
const day=(value:string)=>value?new Date(value+'T00:00:00Z').toLocaleDateString('en-KE',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'}):'Not recorded'
const localDate=()=>new Date().toISOString().slice(0,10)
const routeAsset=(id:string)=>'asset/'+encodeURIComponent(id)
const safeNumber=(value:string)=>value.trim()===''?0:Number(value)
const status=(value:string)=>value.replaceAll('_',' ')
const originLabel=(a:AssetRecord)=>a.origin==='sample'?'Sample record':'Browser record'
const defaultInput = (store:RegistryState):AssetInput=>({
  name:'',description:'',category:store.categories[0]?.name||'Real Estate',
  subcategory:store.categories[0]?.subcategories[0]||'General',
  lifecycle:'PLANNED',operational:'IDLE',risk:'NORMAL',currency:'KES',
  value:0,equity:0,valuationAsOf:localDate(),location:'',ownerLabel:'',
  acquiredOn:'',tags:[],details:{},
})
function IconFor({category,size=21}:{category:Category|undefined;size?:number}) {
  const Icon=iconMap[category?.icon||'layers']||Layers3
  return <Icon size={size}/>
}
function P1Header({eyebrow,title,description,actions,back}:{
  eyebrow:string;title:string;description:string;actions?:ReactNode;back?:()=>void
}) {
  return <header className="p1-page-header"><div className="p1-header-left">
    {back&&<button type="button" onClick={back} className="p1-back" aria-label="Go back"><ArrowLeft size={18}/></button>}
    <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
  </div><div className="p1-header-actions">{actions}</div></header>
}
function Card({title,children,extra,className=''}:{title?:string;children:ReactNode;extra?:ReactNode;className?:string}) {
  return <section className={'p1-card '+className}>{title&&<div className="p1-card-head"><h2>{title}</h2>{extra}</div>}{children}</section>
}
function Mini({label,value,icon:Icon}:{label:string;value:string;icon:LucideIcon}) {
  return <div className="p1-mini"><span><Icon size={18}/>{label}</span><strong>{value}</strong></div>
}
function CategoryIcon({category,store}:{category:string;store:RegistryState}) {
  return <span className="p1-category-icon"><IconFor category={store.categories.find(c=>c.name===category)}/></span>
}
function Empty({title,text,action}:{title:string;text:string;action?:ReactNode}) {
  return <div className="p1-empty"><span className="p1-empty-icon"><Layers3 size={27}/></span><h3>{title}</h3><p>{text}</p>{action}</div>
}
function Badge({children,tone='neutral'}:{children:ReactNode;tone?:'neutral'|'green'|'yellow'|'blue'|'red'}) {
  return <span className={'p1-badge p1-badge-'+tone}>{children}</span>
}
function MoneyNotice() {
  return <div className="p1-hint"><Info size={17}/><span>Valuations and equity are manually entered preview figures, not Finance OS ledger balances or accepted valuations. No currency conversion is performed.</span></div>
}
function AssetListRows({assets,store,open,compact=false}:{
  assets:AssetRecord[];store:RegistryState;open:(id:string)=>void;compact?:boolean
}) {
  return <div className="p1-table-scroll"><table className="p1-table"><thead><tr><th>ASSET</th><th>CLASSIFICATION</th><th>VALUE</th><th>LIFECYCLE</th>{!compact&&<th>UPDATED</th>}<th></th></tr></thead><tbody>
    {assets.map(asset=><tr key={asset.id}>
      <td><button type="button" className="p1-row-asset" onClick={()=>open(asset.id)}><CategoryIcon category={asset.category} store={store}/><span><strong>{asset.name}</strong><small>{asset.number} · {asset.location||asset.subcategory}</small></span></button></td>
      <td><strong className="p1-thin">{asset.category}</strong><small className="p1-muted-line">{asset.subcategory}</small></td>
      <td className="p1-cell-money">{fmt(asset.value,asset.currency)}</td>
      <td><Badge tone={asset.lifecycle==='ACTIVE'?'green':asset.lifecycle==='SUSPENDED'?'yellow':asset.lifecycle==='DISPOSED'?'red':'blue'}>{status(asset.lifecycle)}</Badge></td>
      {!compact&&<td className="p1-subtle">{day(asset.updatedAt.slice(0,10))}</td>}
      <td><button type="button" className="p1-row-open" aria-label={'View '+asset.name} onClick={()=>open(asset.id)}><ArrowRight size={17}/></button></td>
    </tr>)}
  </tbody></table></div>
}
function Registry({store,navigate,onChange,report}:RegistryProps){
  const [query,setQuery]=useState('')
  const [category,setCategory]=useState('')
  const [lifecycle,setLifecycle]=useState('')
  const [sort,setSort]=useState('updated')
  const [page,setPage]=useState(1)
  const [confirmReset,setConfirmReset]=useState(false)
  const criteria={...EMPTY_SEARCH,query,category,lifecycle,order:sort}
  const results=useMemo(()=>searchAssets(store.records,criteria),[store.records,query,category,lifecycle,sort])
  const PAGE_SIZE=8
  const pages=Math.max(1,Math.ceil(results.length/PAGE_SIZE))
  const activePage=Math.min(page,pages)
  const displayed=results.slice((activePage-1)*PAGE_SIZE,activePage*PAGE_SIZE)
  const currencies=[...new Set(store.records.map(a=>a.currency))]
  return <>
    <P1Header eyebrow="REGISTRY / SCREEN 02" title="My assets" description="A single workspace for every asset you track." actions={<>
      <button type="button" className="secondary-button" onClick={()=>navigate('search')}><SlidersHorizontal size={17}/> Advanced search</button>
      <button type="button" className="primary-button" onClick={()=>navigate('assets/new')}><Plus size={17}/> Add asset</button>
    </>}/>
    <div className="p1-mini-grid"><Mini label="Tracked assets" value={String(store.records.length).padStart(2,'0')} icon={Layers3}/><Mini label="Asset categories" value={String(new Set(store.records.map(a=>a.category)).size).padStart(2,'0')} icon={FolderTree}/><Mini label="Active assets" value={String(store.records.filter(a=>a.lifecycle==='ACTIVE').length).padStart(2,'0')} icon={Check}/><Mini label="Currencies in use" value={currencies.length?currencies.join(' · '):'—'} icon={Coins}/></div>
    <Card title="Asset registry" extra={<span className="p1-muted">{results.length} matching records</span>}>
      <div className="p1-toolbar"><label className="p1-toolbar-search"><Search size={17}/><input aria-label="Search asset registry" placeholder="Search name, ID, description or location..." value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} /></label>
        <select aria-label="Filter by category" value={category} onChange={e=>{setCategory(e.target.value);setPage(1)}}><option value="">All categories</option>{store.categories.map(c=><option key={c.name}>{c.name}</option>)}</select>
        <select aria-label="Filter by lifecycle" value={lifecycle} onChange={e=>{setLifecycle(e.target.value);setPage(1)}}><option value="">All lifecycles</option>{lifecycleOptions.map(s=><option key={s} value={s}>{status(s)}</option>)}</select>
        <select aria-label="Sort registry" value={sort} onChange={e=>setSort(e.target.value)}><option value="updated">Recently updated</option><option value="name">Name A–Z</option><option value="value_high">Highest value</option><option value="value_low">Lowest value</option></select>
      </div>
      {results.length?<><AssetListRows assets={displayed} store={store} open={id=>navigate(routeAsset(id))}/><div className="p1-table-footer"><span>Showing {(activePage-1)*PAGE_SIZE+1}–{Math.min(activePage*PAGE_SIZE,results.length)} of {results.length}</span><div><button type="button" disabled={activePage<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {activePage} of {pages}</span><button type="button" disabled={activePage>=pages} onClick={()=>setPage(p=>p+1)}>Next</button></div></div></>:<Empty title={store.records.length?'No assets match these filters':'Your asset registry is empty'} text="Adjust the filters or add an asset to start tracking it." action={<button type="button" className="primary-button" onClick={()=>navigate('assets/new')}>Add an asset <Plus size={16}/></button>}/>}
    </Card>
    <div className="p1-foot-actions"><span><ShieldCheck size={16}/> Data stays in this browser. Avoid entering confidential information.</span><button type="button" onClick={()=>setConfirmReset(true)}><RefreshCcw size={15}/> Restore demo records</button></div>
    {confirmReset&&<div className="p1-inline-confirm" role="alert"><strong>Restore sample workspace?</strong><p>This replaces your locally saved registry, custom tags and activity with the five original sample records. This cannot be undone.</p><div><button type="button" className="secondary-button" onClick={()=>setConfirmReset(false)}>Cancel</button><button type="button" className="p1-danger" onClick={()=>{onChange(initialRegistry());setConfirmReset(false);setQuery('');report('Sample workspace restored.')}}>Restore sample data</button></div></div>}
  </>
}
function Detail({asset,store,navigate}:RegistryProps&{asset:AssetRecord}) {
  const meta=[['Reference',asset.number],['Category',asset.category],['Subtype',asset.subcategory],['Owner label',asset.ownerLabel||'Not recorded'],['Location',asset.location||'Not recorded'],['Acquisition date',day(asset.acquiredOn)],['Valuation as of',day(asset.valuationAsOf)]]
  const events=store.activity.filter(e=>e.assetId===asset.id).slice(0,5)
  return <>
    <P1Header eyebrow="ASSET OVERVIEW / SCREEN 03" title={asset.name} description={asset.number+' · '+asset.subcategory+' · '+originLabel(asset)} back={()=>navigate('assets')} actions={<><button type="button" className="secondary-button" onClick={()=>navigate(routeAsset(asset.id)+'/type')}><Layers3 size={17}/> Category view</button><button type="button" className="primary-button" onClick={()=>navigate(routeAsset(asset.id)+'/edit')}><Pencil size={16}/> Edit asset</button></>}/>
    <div className="p1-detail-status"><Badge tone="green">{status(asset.lifecycle)}</Badge><Badge tone={asset.risk==='NORMAL'?'green':'yellow'}>Risk: {status(asset.risk)}</Badge><Badge>{status(asset.operational)}</Badge><span>{asset.origin==='sample'?'SAMPLE DATA':'BROWSER-ONLY RECORD'}</span></div>
    <div className="p1-detail-grid">
      <div className="p1-detail-main">
        <div className="p1-value-grid"><Mini label="Current preview value" value={fmt(asset.value,asset.currency)} icon={Wallet}/><Mini label="Preview equity" value={fmt(asset.equity,asset.currency)} icon={TrendingUp}/></div>
        <MoneyNotice/>
        <Card title="Asset overview"><div className="p1-description">{asset.description||'No description has been entered for this asset.'}</div><div className="p1-field-grid">{meta.map(([label,value])=><div className="p1-read-field" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div></Card>
        <Card title="Classification-specific information" extra={<button className="p1-text-link" type="button" onClick={()=>navigate(routeAsset(asset.id)+'/type')}>Open full view <ArrowRight size={15}/></button>}><TypeFields asset={asset} store={store}/></Card>
        <Card title="Recent changes" extra={<button type="button" className="p1-text-link" onClick={()=>navigate('activity')}>Timeline <ArrowRight size={15}/></button>}>{events.length?events.map(event=><EventItem entry={event} key={event.id}/>):<div className="p1-empty-small">No local changes have been made to this record yet.</div>}</Card>
      </div>
      <div className="p1-detail-aside">
        <Card title="Asset actions"><div className="p1-action-list"><button type="button" onClick={()=>navigate(routeAsset(asset.id)+'/edit')}><Pencil size={17}/> Edit asset information <ChevronRight size={17}/></button><button type="button" onClick={()=>navigate(routeAsset(asset.id)+'/type')}><Layers3 size={17}/> Type-specific details <ChevronRight size={17}/></button><button type="button" onClick={()=>navigate('tags')}><Tag size={17}/> Manage tags <ChevronRight size={17}/></button><button type="button" onClick={()=>navigate('activity')}><History size={17}/> View activity <ChevronRight size={17}/></button></div></Card>
        <Card title="Tags"><div className="p1-chip-wrap">{asset.tags.length?asset.tags.map(t=><span key={t} className="p1-tag">{t}</span>):<span className="p1-subtle">No tags assigned.</span>}</div></Card>
        <Card title="Coming in later phases"><div className="p1-upcoming"><span><CalendarClock size={16}/> Acquisition & ownership <Badge>Phase 2</Badge></span><span><TrendingUp size={16}/> Valuation history <Badge>Phase 3</Badge></span><span><ShieldCheck size={16}/> Insurance & maintenance <Badge>Phase 4</Badge></span></div></Card>
      </div>
    </div>
  </>
}
function TypeFields({asset,store}:{asset:AssetRecord;store:RegistryState}) {
  const category=store.categories.find(c=>c.name===asset.category)
  return <div className="p1-field-grid">{(category?.detailFields||[]).map(field=><div key={field.key} className="p1-read-field"><small>{field.label}</small><strong>{asset.details[field.key]||'Not recorded'}</strong></div>)}{!category?.detailFields.length&&<div className="p1-empty-small">This category has no special fields.</div>}</div>
}
function TypeViews({store,navigate}:RegistryProps) {
  return <><P1Header eyebrow="ASSET INTELLIGENCE / SCREEN 10" title="Asset-specific views" description="Purpose-built profiles for each asset class, while retaining one shared registry." actions={<button type="button" className="secondary-button" onClick={()=>navigate('classifications')}><FolderTree size={16}/> Categories</button>}/>
    <div className="p1-cards-grid">{store.categories.map(category=>{
      const list=store.records.filter(a=>a.category===category.name)
      return <Card key={category.name} className="p1-category-card"><div className="p1-category-card-top"><CategoryIcon category={category.name} store={store}/><div><h3>{category.name}</h3><p>{category.description}</p></div></div><div className="p1-card-divider"/><div className="p1-type-fields"><strong>{category.detailFields.length} specialty fields</strong><span>{category.detailFields.map(f=>f.label).slice(0,3).join(' · ')||'General records'}</span></div><div className="p1-type-card-foot"><span>{list.length} registered</span>{list.length?<button type="button" onClick={()=>navigate(routeAsset(list[0].id)+'/type')}>View an example <ArrowRight size={15}/></button>:<button type="button" onClick={()=>navigate('assets/new')}>Add an asset <Plus size={15}/></button>}</div></Card>
    })}</div>
  </>
}
function TypeDetail({asset,store,navigate}:RegistryProps&{asset:AssetRecord}) {
  const category=store.categories.find(c=>c.name===asset.category)
  const peers=store.records.filter(a=>a.category===asset.category&&a.id!==asset.id)
  return <><P1Header eyebrow="CATEGORY DETAIL / SCREEN 10" title={asset.name+' — '+asset.category} description={'Specialized profile for '+asset.subcategory.toLowerCase()+'. All fields are browser-local.'} back={()=>navigate(routeAsset(asset.id))} actions={<button type="button" className="primary-button" onClick={()=>navigate(routeAsset(asset.id)+'/edit')}><Pencil size={16}/> Edit profile</button>}/>
    <div className="p1-detail-grid"><div className="p1-detail-main">
    <Card title={asset.category+' profile'}><div className="p1-category-feature"><CategoryIcon category={asset.category} store={store}/><div><strong>{category?.name||asset.category}</strong><p>{category?.description||'Custom asset type'}</p></div></div><TypeFields asset={asset} store={store}/></Card>
    <Card title="Asset identification"><div className="p1-field-grid"><div className="p1-read-field"><small>Asset number</small><strong>{asset.number}</strong></div><div className="p1-read-field"><small>Lifecycle</small><strong>{status(asset.lifecycle)}</strong></div><div className="p1-read-field"><small>Location</small><strong>{asset.location||'Not recorded'}</strong></div><div className="p1-read-field"><small>Type</small><strong>{asset.subcategory}</strong></div></div></Card>
    </div><aside className="p1-detail-aside"><Card title="Related assets"><div className="p1-related">{peers.length?peers.map(p=><button type="button" key={p.id} onClick={()=>navigate(routeAsset(p.id)+'/type')}><CategoryIcon category={p.category} store={store}/><span>{p.name}</span><ChevronRight size={16}/></button>):<p>No other assets in this category.</p>}</div></Card><Card title="Next integration"><p className="p1-card-copy">Maintenance telemetry, financing, valuations and type-specific calculations will connect in their corresponding phases. This screen does not fabricate those records.</p></Card></aside></div>
  </>
}
function FormPage({store,onChange,navigate,report,asset}:RegistryProps&{asset?:AssetRecord}) {
  const [draft,setDraft]=useState<AssetInput>(()=>asset?{
    name:asset.name,description:asset.description,category:asset.category,subcategory:asset.subcategory,
    lifecycle:asset.lifecycle,operational:asset.operational,risk:asset.risk,currency:asset.currency,
    value:asset.value,equity:asset.equity,valuationAsOf:asset.valuationAsOf,location:asset.location,
    ownerLabel:asset.ownerLabel,acquiredOn:asset.acquiredOn,tags:[...asset.tags],details:{...asset.details}
  }:defaultInput(store))
  const [errors,setErrors]=useState<Record<string,string>>({})
  const [failure,setFailure]=useState('')
  const [attempted,setAttempted]=useState(false)
  const category=store.categories.find(c=>c.name===draft.category)
  const set=<K extends keyof AssetInput,>(key:K,value:AssetInput[K])=>{setDraft(p=>({...p,[key]:value}));setErrors(p=>{const n={...p};delete n[key as string];return n})}
  const save=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setAttempted(true);setFailure('')
    const errs=validateAsset(draft,store)
    if(Object.keys(errs).length){setErrors(errs);document.getElementById('asset-form-start')?.scrollIntoView({block:'start',behavior:'smooth'});return}
    try {
      const next=asset?updateAsset(store,asset.id,draft):createAsset(store,draft)
      onChange(next)
      const saved=asset?asset.id:next.records[0].id
      report(asset?'Asset changes saved to this browser.':'Asset registered in this browser.')
      navigate(routeAsset(saved))
    }catch(error){setFailure(error instanceof Error?error.message:'The asset could not be saved.')}
  }
  return <>
  <P1Header eyebrow={asset?'ASSET EDITOR / SCREEN 05':'NEW ASSET / SCREEN 04'} title={asset?'Edit asset':'Add a new asset'} description={asset?'Update the recorded information without changing the asset ID or lifecycle.':'Record an asset in your browser-only workspace. No backend or identity is connected.'} back={()=>navigate(asset?routeAsset(asset.id):'assets')} actions={<Badge tone="blue">{asset?'EDIT MODE':'STEP 1 OF 1'}</Badge>}/>
  <MoneyNotice/>
  <form onSubmit={save} noValidate id="asset-form-start" className="p1-form-layout"><div className="p1-form-main">
    <Card title="01 / General information"><div className="p1-form-grid">
      <label className="p1-field p1-span2">Asset name <span>*</span><input value={draft.name} maxLength={121} onChange={e=>set('name',e.target.value)} placeholder="e.g. Toyota Hilux, Rental apartment..." aria-invalid={Boolean(errors.name)} required/>{errors.name&&<small className="p1-error">{errors.name}</small>}</label>
      <label className="p1-field">Category <span>*</span><select value={draft.category} onChange={e=>{const cat=store.categories.find(c=>c.name===e.target.value);setDraft(p=>({...p,category:e.target.value,subcategory:cat?.subcategories[0]||'',details:{}}))}}>{store.categories.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select>{errors.category&&<small className="p1-error">{errors.category}</small>}</label>
      <label className="p1-field">Subcategory <span>*</span><select value={draft.subcategory} onChange={e=>set('subcategory',e.target.value)}>{(category?.subcategories||[]).map(s=><option key={s} value={s}>{s}</option>)}</select>{errors.subcategory&&<small className="p1-error">{errors.subcategory}</small>}</label>
      <label className="p1-field p1-span2">Description <textarea rows={3} maxLength={1201} value={draft.description} onChange={e=>set('description',e.target.value)} placeholder="Purpose, physical description, or what this asset helps you achieve..."/>{errors.description&&<small className="p1-error">{errors.description}</small>}</label>
      <label className="p1-field">Location<input value={draft.location} onChange={e=>set('location',e.target.value)} placeholder="City, region or Online"/></label>
      <label className="p1-field">Owner reference<input value={draft.ownerLabel} onChange={e=>set('ownerLabel',e.target.value)} placeholder="Display label only; ownership module comes later"/></label>
    </div></Card>
    <Card title="02 / Value snapshot"><div className="p1-form-grid">
      <label className="p1-field">Currency <span>*</span><select value={draft.currency} onChange={e=>set('currency',e.target.value)}>{currencyOptions.map(c=><option key={c}>{c}</option>)}</select>{errors.currency&&<small className="p1-error">{errors.currency}</small>}</label>
      <label className="p1-field">Preview asset value <span>*</span><input type="number" step="0.01" min="0" max="1000000000000000" value={draft.value} onChange={e=>set('value',safeNumber(e.target.value))}/>{errors.value&&<small className="p1-error">{errors.value}</small>}</label>
      <label className="p1-field">Preview equity <span>*</span><input type="number" step="0.01" min="0" max="1000000000000000" value={draft.equity} onChange={e=>set('equity',safeNumber(e.target.value))}/>{errors.equity&&<small className="p1-error">{errors.equity}</small>}</label>
      <label className="p1-field">Valuation as of<input type="date" value={draft.valuationAsOf} onChange={e=>set('valuationAsOf',e.target.value)}/>{errors.valuationAsOf&&<small className="p1-error">{errors.valuationAsOf}</small>}</label>
      <label className="p1-field">Acquisition date (optional)<input type="date" value={draft.acquiredOn} onChange={e=>set('acquiredOn',e.target.value)}/>{errors.acquiredOn&&<small className="p1-error">{errors.acquiredOn}</small>}</label>
    </div><div className="p1-inline-hint"><Info size={15}/> Manual prototype values only. Cost basis, debt, ownership and official valuation processes arrive in Phases 2–3.</div></Card>
    <Card title={'03 / '+draft.category+' specifics'}><div className="p1-form-grid">{(category?.detailFields||[]).map(field=><label className="p1-field" key={field.key}>{field.label}<input value={draft.details[field.key]||''} maxLength={300} placeholder={field.hint} onChange={e=>set('details',{...draft.details,[field.key]:e.target.value})}/></label>)}</div>{errors.details&&<small className="p1-error">{errors.details}</small>}</Card>
  </div><div className="p1-form-aside">
    <Card title="04 / Tags"><div className="p1-form-tags">{store.tags.map(tag=><label className="p1-tag-check" key={tag}><input type="checkbox" checked={draft.tags.includes(tag)} onChange={e=>set('tags',e.target.checked?[...draft.tags,tag]:draft.tags.filter(t=>t!==tag))}/><span>{tag}</span></label>)}{!store.tags.length&&<p>No tags are available yet.</p>}</div><button type="button" className="p1-text-link" onClick={()=>navigate('tags')}>Manage tags <ArrowRight size={15}/></button></Card>
    <Card title="05 / Operational state"><div className="p1-readonly-states"><label>Lifecycle <strong>{status(draft.lifecycle)}</strong></label><label>Operational state <strong>{status(draft.operational)}</strong></label><label>Risk state <strong>{status(draft.risk)}</strong></label></div><p className="p1-card-copy">Lifecycle changes and risk assessments are not editable here. They require the dedicated domain workflows in later phases.</p></Card>
    {attempted&&Object.keys(errors).length>0&&<div role="alert" className="p1-error-banner"><CircleAlert size={17}/> Fix {Object.keys(errors).length} invalid fields to save.</div>}
    {failure&&<div role="alert" className="p1-error-banner">{failure}</div>}
    <button type="submit" className="primary-button p1-full-action"><Check size={17}/>{asset?'Save changes':'Create asset'}</button>
    <button type="button" className="secondary-button p1-full-action" onClick={()=>navigate(asset?routeAsset(asset.id):'assets')}>Cancel</button>
    <p className="p1-save-disclaimer">Saved only to this browser’s local storage. Do not enter confidential title, bank or account details.</p>
  </div></form></>
}
function Classifications({store,onChange,navigate,report}:RegistryProps) {
  const [name,setName]=useState('')
  const [description,setDescription]=useState('')
  const [parent,setParent]=useState(store.categories[0]?.name||'')
  const [sub,setSub]=useState('')
  const [error,setError]=useState('')
  const [selected,setSelected]=useState(store.categories[0]?.name||'')
  const [showCreate,setShowCreate]=useState<'category'|'subcategory'|null>(null)
  const selectedCat=store.categories.find(c=>c.name===selected)
  const apply=(fn:()=>RegistryState)=>{
    try{onChange(fn());report('Classification directory updated in this browser.');setShowCreate(null);setName('');setDescription('');setSub('');setError('')}
    catch(err){setError(err instanceof Error?err.message:'Could not update classification.')}
  }
  return <>
    <P1Header eyebrow="CLASSIFICATIONS / SCREEN 06" title="Asset classification" description="A consistent, extensible taxonomy for every asset type." actions={<button type="button" className="primary-button" onClick={()=>{setError('');setShowCreate('category')}}><Plus size={17}/> New category</button>}/>
    <div className="p1-detail-grid"><div className="p1-detail-main"><div className="p1-cards-grid">{store.categories.map(c=><button type="button" key={c.name} className={'p1-taxonomy-item '+(selected===c.name?'active':'')} onClick={()=>setSelected(c.name)}><CategoryIcon category={c.name} store={store}/><span><strong>{c.name}</strong><small>{c.subcategories.length} subcategories · {store.records.filter(r=>r.category===c.name).length} assets</small></span><ChevronRight size={16}/></button>)}</div></div>
      <aside className="p1-detail-aside"><Card title="Selected classification"><div className="p1-taxonomy-detail"><h3>{selectedCat?.name||'Choose a category'}</h3><p>{selectedCat?.description}</p>{selectedCat?.system&&<Badge>Canonical category</Badge>}<div className="p1-subcategory-list">{selectedCat?.subcategories.map(s=><div key={s}><span>{s}</span><span>{store.records.filter(a=>a.category===selectedCat.name&&a.subcategory===s).length}</span></div>)}</div><button type="button" className="secondary-button p1-full-action" onClick={()=>{setParent(selected);setError('');setShowCreate('subcategory')}}><Plus size={15}/> Add subcategory</button><button type="button" className="p1-text-link" onClick={()=>navigate('search')}>Find assets in directory <ArrowRight size={15}/></button></div></Card></aside>
    </div>
    {showCreate&&<div className="p1-plain-overlay"><div className="p1-dialog" role="dialog" aria-modal="true" aria-label={showCreate==='category'?'Create category':'Create subcategory'}><div className="p1-dialog-head"><h2>{showCreate==='category'?'Create custom category':'Create subcategory'}</h2><button type="button" aria-label="Close" onClick={()=>setShowCreate(null)}><X size={19}/></button></div><form onSubmit={e=>{e.preventDefault();apply(()=>showCreate==='category'?addCategory(store,name,description):addSubcategory(store,parent,sub))}} className="p1-dialog-body">{showCreate==='category'?<><label className="p1-field">Category name<input value={name} onChange={e=>setName(e.target.value)} autoFocus placeholder="e.g. Collectibles"/></label><label className="p1-field">Description<input value={description} onChange={e=>setDescription(e.target.value)} placeholder="What belongs in this category?"/></label></>:<><label className="p1-field">Parent category<select value={parent} onChange={e=>setParent(e.target.value)}>{store.categories.map(c=><option key={c.name}>{c.name}</option>)}</select></label><label className="p1-field">Subcategory name<input value={sub} onChange={e=>setSub(e.target.value)} autoFocus placeholder="e.g. Commercial equipment"/></label></>}{error&&<p role="alert" className="p1-error">{error}</p>}<div className="p1-modal-buttons"><button className="secondary-button" type="button" onClick={()=>setShowCreate(null)}>Cancel</button><button className="primary-button" type="submit"><Check size={16}/> Save</button></div></form></div></div>}
  </>
}
function Tags({store,onChange,navigate,report}:RegistryProps) {
  const [tag,setTag]=useState('')
  const [editing,setEditing]=useState<string|null>(null)
  const [rename,setRename]=useState('')
  const [error,setError]=useState('')
  const [deleting,setDeleting]=useState<string|null>(null)
  const apply=(fn:()=>RegistryState,msg:string)=>{try{onChange(fn());setError('');setTag('');setEditing(null);setDeleting(null);report(msg)}catch(err){setError(err instanceof Error?err.message:'Could not update tags.')}}
  return <>
    <P1Header eyebrow="TAGS / SCREEN 07" title="Tags & collections" description="Flexible labels to group assets without duplicating them." actions={<button type="button" className="secondary-button" onClick={()=>navigate('assets')}><Layers3 size={16}/> Asset registry</button>}/>
    <div className="p1-detail-grid"><div className="p1-detail-main"><Card title="Your tags" extra={<span className="p1-muted">{store.tags.length} tags</span>}>
      <div className="p1-tags-list">{store.tags.map(label=><div className="p1-tag-row" key={label}>
        <span className="p1-tag-count"><Tag size={18}/></span>{editing===label?<form className="p1-rename" onSubmit={e=>{e.preventDefault();apply(()=>renameTag(store,label,rename),'Tag renamed on all assigned assets.')}}><input aria-label="Rename tag" autoFocus value={rename} maxLength={45} onChange={e=>setRename(e.target.value)}/><button type="submit" className="p1-icon-action" aria-label="Save tag"><Check size={17}/></button><button type="button" className="p1-icon-action" aria-label="Cancel rename" onClick={()=>setEditing(null)}><X size={17}/></button></form>:<><span className="p1-tag-row-name"><strong>{label}</strong><small>{store.records.filter(a=>a.tags.includes(label)).length} assets assigned</small></span><button type="button" aria-label={'Rename '+label} className="p1-icon-action" onClick={()=>{setEditing(label);setRename(label);setError('')}}><Pencil size={17}/></button><button type="button" aria-label={'Delete '+label} className="p1-icon-action" onClick={()=>setDeleting(label)}><Trash2 size={17}/></button></>}</div>)}
      {!store.tags.length&&<Empty title="No tags" text="Create your first tag to organize assets."/>}</div>
    </Card></div><aside className="p1-detail-aside"><Card title="Create a tag"><form className="p1-tag-create" onSubmit={e=>{e.preventDefault();apply(()=>createTag(store,tag),'Tag added.')}}><label className="p1-field">Tag name<input value={tag} maxLength={45} onChange={e=>setTag(e.target.value)} placeholder="e.g. Critical assets"/></label><button className="primary-button p1-full-action" type="submit"><Plus size={16}/> Create tag</button></form>{error&&<p role="alert" className="p1-error p1-side-error">{error}</p>}</Card><Card title="How tags work"><p className="p1-card-copy">A tag may be attached to multiple assets. Renaming or removing a tag updates its local asset assignments without deleting an asset.</p></Card></aside></div>
    {deleting&&<div className="p1-plain-overlay"><div className="p1-dialog" role="alertdialog" aria-modal="true" aria-label="Confirm tag deletion"><div className="p1-dialog-head"><h2>Delete tag?</h2><button type="button" aria-label="Close" onClick={()=>setDeleting(null)}><X size={18}/></button></div><div className="p1-dialog-body"><p>The tag “{deleting}” will be removed from {store.records.filter(a=>a.tags.includes(deleting)).length} assets. Assets themselves are not deleted.</p><div className="p1-modal-buttons"><button className="secondary-button" type="button" onClick={()=>setDeleting(null)}>Keep tag</button><button type="button" className="p1-danger" onClick={()=>apply(()=>deleteTag(store,deleting),'Tag deleted and assignments cleared.')}>Delete tag</button></div></div></div></div>}
  </>
}
function AdvancedSearch({store,navigate}:RegistryProps) {
  const [criteria,setCriteria]=useState<SearchCriteria>({...EMPTY_SEARCH})
  const [currency,setCurrency]=useState('KES')
  const [page,setPage]=useState(1)
  const filtered=useMemo(()=>searchAssets(store.records,criteria).filter(a=>(!criteria.minValue&&!criteria.maxValue)||a.currency===currency),[store.records,criteria,currency])
  const PAGE_SIZE=10
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE))
  const pageSafe=Math.min(page,pages)
  const set=(key:keyof SearchCriteria,value:string)=>{setCriteria(prev=>({...prev,[key]:value}));setPage(1)}
  const picked=store.categories.find(c=>c.name===criteria.category)
  return <>
    <P1Header eyebrow="SEARCH & DISCOVERY / SCREEN 08" title="Advanced asset search" description="Find the exact assets you need using lifecycle, risk, tags, classifications and values." actions={<button type="button" className="secondary-button" onClick={()=>{setCriteria({...EMPTY_SEARCH});setCurrency('KES');setPage(1)}}><RefreshCcw size={16}/> Reset filters</button>}/>
    <div className="p1-detail-grid p1-search-layout"><aside className="p1-detail-aside"><Card title="Filter assets"><div className="p1-filter-form">
      <label className="p1-field">Search<input value={criteria.query} onChange={e=>set('query',e.target.value)} placeholder="Name, ID, keyword..."/></label>
      <label className="p1-field">Category<select value={criteria.category} onChange={e=>setCriteria(c=>({...c,category:e.target.value,subcategory:''}))}><option value="">All categories</option>{store.categories.map(c=><option key={c.name}>{c.name}</option>)}</select></label>
      <label className="p1-field">Subcategory<select value={criteria.subcategory} onChange={e=>set('subcategory',e.target.value)}><option value="">All subcategories</option>{(picked?.subcategories||store.categories.flatMap(c=>c.subcategories)).map(s=><option key={s+'-'+criteria.category} value={s}>{s}</option>)}</select></label>
      <label className="p1-field">Lifecycle<select value={criteria.lifecycle} onChange={e=>set('lifecycle',e.target.value)}><option value="">Any state</option>{lifecycleOptions.map(s=><option key={s} value={s}>{status(s)}</option>)}</select></label>
      <label className="p1-field">Risk<select value={criteria.risk} onChange={e=>set('risk',e.target.value)}><option value="">Any risk</option>{['NORMAL','WATCH','AT_RISK','CRITICAL'].map(s=><option key={s} value={s}>{status(s)}</option>)}</select></label>
      <label className="p1-field">Tag<select value={criteria.tag} onChange={e=>set('tag',e.target.value)}><option value="">Any tag</option>{store.tags.map(tag=><option key={tag}>{tag}</option>)}</select></label>
      <div className="p1-filter-money"><label className="p1-field">Min. value<input type="number" min="0" value={criteria.minValue} onChange={e=>set('minValue',e.target.value)} placeholder="0"/></label><label className="p1-field">Max. value<input type="number" min="0" value={criteria.maxValue} onChange={e=>set('maxValue',e.target.value)} placeholder="Any"/></label></div>
      <label className="p1-field">Filter currency<select value={currency} onChange={e=>setCurrency(e.target.value)}>{currencyOptions.map(c=><option key={c}>{c}</option>)}</select><small>Value limits apply only to assets in this currency.</small></label>
    </div></Card></aside>
      <div className="p1-detail-main"><Card title="Search results" extra={<Badge tone="blue">{filtered.length} found</Badge>}><div className="p1-search-result-head"><span><Filter size={16}/> Filtered asset catalog</span><select aria-label="Sort search results" value={criteria.order} onChange={e=>set('order',e.target.value)}><option value="updated">Recently updated</option><option value="name">Name A–Z</option><option value="value_high">Value high to low</option><option value="value_low">Value low to high</option><option value="oldest">Oldest first</option></select></div>
      {filtered.length?<><AssetListRows assets={filtered.slice((pageSafe-1)*PAGE_SIZE,pageSafe*PAGE_SIZE)} store={store} open={id=>navigate(routeAsset(id))} compact/><div className="p1-table-footer"><span>Showing {(pageSafe-1)*PAGE_SIZE+1}–{Math.min(pageSafe*PAGE_SIZE,filtered.length)} of {filtered.length}</span><div><button type="button" disabled={pageSafe<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>{pageSafe}/{pages}</span><button type="button" disabled={pageSafe>=pages} onClick={()=>setPage(p=>p+1)}>Next</button></div></div></>:<Empty title="Nothing matches" text="Try removing a filter, choosing another currency, or adding an asset." action={<button type="button" className="secondary-button" onClick={()=>setCriteria({...EMPTY_SEARCH})}>Clear filters</button>}/>}</Card></div>
    </div></>
}
function EventItem({entry,onOpen}:{entry:RegistryState['activity'][number];onOpen?:()=>void}) {
  return <div className="p1-event"><span className="p1-event-icon"><Activity size={17}/></span><div><strong>{entry.event.toLowerCase().replaceAll('_',' ')} · {entry.assetName}</strong><small>{entry.details}</small></div><time dateTime={entry.at}>{new Date(entry.at).toLocaleString('en-KE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</time>{onOpen&&<button type="button" aria-label={'View '+entry.assetName} onClick={onOpen}><ArrowRight size={16}/></button>}</div>
}
function Timeline({store,navigate}:RegistryProps) {
  const [filter,setFilter]=useState('')
  const [assetId,setAssetId]=useState('')
  const [page,setPage]=useState(1)
  const matched=store.activity.filter(e=>(!filter||e.event===filter)&&(!assetId||e.assetId===assetId))
  const items=matched.slice((page-1)*15,page*15)
  return <>
    <P1Header eyebrow="ACTIVITY & HISTORY / SCREEN 09" title="Asset activity" description="Trace local registry edits and classifications with an append-only browser timeline." actions={<button type="button" className="secondary-button" onClick={()=>navigate('assets')}><Layers3 size={16}/> Registry</button>}/>
    <div className="p1-mini-grid"><Mini label="Recorded events" value={String(store.activity.length)} icon={Activity}/><Mini label="Registered locally" value={String(store.records.filter(r=>r.origin==='local').length)} icon={Plus}/><Mini label="Asset updates" value={String(store.activity.filter(e=>e.event==='UPDATED').length)} icon={Pencil}/><Mini label="Classification edits" value={String(store.activity.filter(e=>e.event==='CLASSIFIED').length)} icon={FolderTree}/></div>
    <Card title="Change timeline"><div className="p1-toolbar"><select aria-label="Filter by event type" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1)}}><option value="">All activity types</option>{['REGISTERED','UPDATED','TAGGED','CLASSIFIED'].map(e=><option key={e} value={e}>{status(e)}</option>)}</select><select aria-label="Filter by asset" value={assetId} onChange={e=>{setAssetId(e.target.value);setPage(1)}}><option value="">All assets</option>{store.records.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
    {items.length?<div className="p1-activity-history">{items.map(e=><EventItem entry={e} key={e.id} onOpen={()=>navigate(routeAsset(e.assetId))}/>)}</div>:<Empty title="No matching activity yet" text="Edits and asset creations will be listed here. Synthetic seed data intentionally does not pretend to have a verified audit trail." action={<button type="button" className="primary-button" onClick={()=>navigate('assets/new')}><Plus size={16}/> Add an asset</button>}/>}
    {matched.length>15&&<div className="p1-table-footer"><span>{matched.length} local changes</span><div><button type="button" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>{page} / {Math.ceil(matched.length/15)}</span><button type="button" disabled={page*15>=matched.length} onClick={()=>setPage(p=>p+1)}>Next</button></div></div>}
    </Card>
    <div className="p1-hint p1-audit-hint"><Info size={17}/> Browser-local activity is informational and can be modified or cleared by the browser owner. It is not an immutable, authoritative server audit log.</div>
  </>
}
export function RegistryExperience(props:RegistryProps) {
  const path=props.path
  const seg=path.split('/')
  if(path==='assets')return <Registry {...props}/>
  if(path==='assets/new')return <FormPage {...props}/>
  if(path==='classifications')return <Classifications {...props}/>
  if(path==='tags')return <Tags {...props}/>
  if(path==='search')return <AdvancedSearch {...props}/>
  if(path==='activity')return <Timeline {...props}/>
  if(path==='type-views')return <TypeViews {...props}/>
  if(seg[0]==='asset'&&seg[1]) {
    const asset=props.store.records.find(a=>a.id===decodeURIComponent(seg[1]))
    if(!asset)return <><P1Header eyebrow="NOT FOUND" title="Asset unavailable" description="This asset does not exist in the current browser workspace." back={()=>props.navigate('assets')}/><Empty title="Asset not found" text="It may have been cleared from local storage or the link might be outdated." action={<button type="button" className="primary-button" onClick={()=>props.navigate('assets')}>Back to registry <ArrowRight size={16}/></button>}/></>
    if(seg[2]==='edit')return <FormPage key={asset.id} {...props} asset={asset}/>
    if(seg[2]==='type')return <TypeDetail {...props} asset={asset}/>
    return <Detail {...props} asset={asset}/>
  }
  return <><P1Header eyebrow="NOT FOUND" title="Unknown route" description="This Phase 1 route is not available."/><Empty title="No matching screen" text="Return to the asset registry or dashboard." action={<button type="button" className="primary-button" onClick={()=>props.navigate('assets')}>Open registry <ArrowRight size={16}/></button>}/></>
}
