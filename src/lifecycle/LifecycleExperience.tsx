import { useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, AlertTriangle, Archive, ArrowLeft, ArrowRight,
  ArrowUpRight, BadgeCheck, Building2, Calculator, CalendarDays,
  CheckCircle2, ChevronRight, Clock3, Coins, FileCheck2,
  History, Layers3, LockKeyhole, Plus, Receipt, Scale, ShieldAlert,
  TrendingUp, Users, Wallet, type LucideIcon
} from 'lucide-react'
import type { AssetRecord, RegistryState, Lifecycle } from '../registry/core'
import {
  ACQUISITION_METHODS, DISPOSITION_TYPES, EMPTY_COSTS, LIFECYCLE_STATES,
  OWNERSHIP_DIMENSIONS, acquisitionFor, activeInterests, assignOwnership,
  beginAcquisition, completeAcquisition, dispositionFor, disposeAsset,
  lifecycleAction, ownershipTotal, shareBreakdown, transitionHistory, transferOwnership,
  type AcquisitionInput, type AssignmentInput, type DispositionInput,
  type OwnershipDimension, type TransferInput
} from './core'
import './lifecycle.css'

type Props = {
  path:string
  store:RegistryState
  onChange:(next:RegistryState)=>void
  navigate:(route:string)=>void
  report:(message:string)=>void
}
type ViewProps = Props & {asset:AssetRecord}
const today=()=>new Date().toISOString().slice(0,10)
const currency=(n:number,code:string)=>new Intl.NumberFormat('en-KE',{style:'currency',currency:code,maximumFractionDigits:2}).format(n)
const label=(s:string)=>s.toLowerCase().replaceAll('_',' ').replace(/\b[a-z]/g,c=>c.toUpperCase())
const prettyDay=(s:string)=>s?new Date(s+'T00:00:00Z').toLocaleDateString('en-KE',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}):'Not recorded'
const fmtDate=(s:string)=>s?new Date(s).toLocaleString('en-KE',{dateStyle:'medium',timeStyle:'short'}):'—'
const url=(part:string,id:string)=>part+'/'+encodeURIComponent(id)
function Header({number,title,subtitle,back,actions}:{
  number:string;title:string;subtitle:string;back?:()=>void;actions?:ReactNode
}){
  return <div className="p2-header"><div className="p2-headline">{back&&<button type="button" className="p2-back" aria-label="Back" onClick={back}><ArrowLeft size={18}/></button>}<div><span className="eyebrow">{number}</span><h1>{title}</h1><p>{subtitle}</p></div></div><div className="p2-heading-actions"><a className="p2-server-route" href="#/server-registry"><LockKeyhole size={14}/> Authenticated lifecycle workspace <ArrowRight size={13}/></a>{actions}</div></div>
}
function Panel({title,children,extra,className=''}:{title:string;children:ReactNode;extra?:ReactNode;className?:string}){
  return <section className={'p2-panel '+className}><header><h2>{title}</h2>{extra}</header>{children}</section>
}
function Pill({value,accent='blue'}:{value:string;accent?:'blue'|'green'|'red'|'amber'|'neutral'}){
  return <span className={'p2-pill p2-pill-'+accent}>{label(value)}</span>
}
function Notice({children,warning=false}:{children:ReactNode;warning?:boolean}){
  return <div className={'p2-notice '+(warning?'p2-warning':'')}><ShieldAlert size={19}/><div>{children}</div></div>
}
function BigStat({icon:Icon,label:caption,value,hint}: {icon:LucideIcon;label:string;value:string;hint:string}){
  return <article className="p2-stat"><div className="p2-stat-top"><span>{caption}</span><Icon size={20}/></div><strong>{value}</strong><small>{hint}</small></article>
}
function Empty({title,description,action}:{title:string;description:string;action?:ReactNode}){
  return <div className="p2-empty"><span><Layers3 size={29}/></span><h3>{title}</h3><p>{description}</p>{action}</div>
}
function AssetPicker({store,value,onPick,filter}:{
  store:RegistryState;value:string;onPick:(id:string)=>void;filter?:(asset:AssetRecord)=>boolean
}){
  const options=store.records.filter(a=>!filter||filter(a))
  return <label className="p2-field">Asset<select value={value} onChange={e=>onPick(e.target.value)}><option value="">Choose an asset...</option>{options.map(a=><option key={a.id} value={a.id}>{a.number} · {a.name} — {label(a.lifecycle)}</option>)}</select></label>
}
function AssetRow({a,onOpen,footnote,action}:{a:AssetRecord;onOpen:()=>void;footnote?:string;action?:ReactNode}){
  return <div className="p2-asset-row"><span className="p2-icon"><Building2 size={18}/></span><div className="p2-asset-name"><strong>{a.name}</strong><small>{a.number} · {a.category}{footnote?' · '+footnote:''}</small></div><Pill value={a.lifecycle} accent={a.lifecycle==='ACTIVE'?'green':a.lifecycle==='DISPOSED'||a.lifecycle==='ARCHIVED'?'red':'amber'}/>{action||<button className="p2-icon-button" type="button" aria-label={'Open '+a.name} onClick={onOpen}><ChevronRight size={18}/></button>}</div>
}
function Field({label:caption,value}:{label:string;value:string}){
  return <div className="p2-value-field"><span>{caption}</span><strong>{value}</strong></div>
}
function NextLink({title,description,onClick,icon:Icon}:{
  title:string;description:string;onClick:()=>void;icon:LucideIcon
}){
  return <button className="p2-next" onClick={onClick} type="button"><span className="p2-icon"><Icon size={20}/></span><span><strong>{title}</strong><small>{description}</small></span><ArrowRight size={17}/></button>
}
function ErrorBox({error}:{error:string}){return error?<div className="p2-error" role="alert"><AlertTriangle size={16}/>{error}</div>:null}
function apply(props:Props,fn:()=>RegistryState,success:string,onSuccess?:()=>void,setError?:(s:string)=>void){
 try{const result=fn();props.onChange(result);props.report(success);setError?.('');onSuccess?.()}
 catch(err){setError?.(err instanceof Error?err.message:'This operation could not be completed.')}
}
function Acquisitions(props:Props){
 const {store,navigate}=props
 const acquired=store.phase2.acquisitions
 const pending=store.records.filter(a=>a.lifecycle==='ACQUISITION_PENDING')
 const planned=store.records.filter(a=>a.lifecycle==='PLANNED')
 return <>
  <Header number="SCREEN 11 / ACQUISITION CENTER" title="Acquisition center" subtitle="A guided path from planned asset to a recorded acquisition and cost basis." actions={<button type="button" className="primary-button" onClick={()=>navigate('acquisitions/new')}><Plus size={17}/> New acquisition</button>}/>
  <Notice>Acquisition records are browser-only planning records. They are not proof of title, bank payment, settlement, or an external system transaction.</Notice>
  <div className="p2-stat-grid">
   <BigStat label="Recorded acquisitions" value={String(acquired.length)} hint="Locally created acquisition evidence" icon={Receipt}/>
   <BigStat label="In progress" value={String(pending.length)} hint="Awaiting acquisition details" icon={Clock3}/>
   <BigStat label="Planned assets" value={String(planned.length)} hint="Eligible to start acquisition" icon={Layers3}/>
   <BigStat label="Cost basis currencies" value={String(new Set(acquired.map(a=>a.currency)).size)} hint="No cross-currency addition" icon={Coins}/>
  </div>
  <div className="p2-two-column"><div className="p2-stack">
   <Panel title="Acquisitions in progress" extra={<Pill value={String(pending.length)+' pending'}/>}>
    {pending.length?pending.map(a=><AssetRow key={a.id} a={a} onOpen={()=>navigate('acquisitions/new?asset='+encodeURIComponent(a.id))} action={<button className="p2-small-button" type="button" onClick={()=>navigate('acquisitions/new?asset='+encodeURIComponent(a.id))}>Continue <ArrowRight size={14}/></button>}/>):<Empty title="Nothing awaiting acquisition" description="Choose a planned asset to start an acquisition workflow." action={<button className="secondary-button" type="button" onClick={()=>navigate('acquisitions/new')}>Begin acquisition <ArrowRight size={15}/></button>}/>}
   </Panel>
   <Panel title="Recorded acquisition history" extra={<button type="button" className="p2-text-action" onClick={()=>navigate('cost-basis')}>All cost bases <ArrowRight size={15}/></button>}>
    {acquired.length?acquired.map(record=>{const a=store.records.find(x=>x.id===record.assetId);return a?<AssetRow key={record.id} a={a} footnote={prettyDay(record.acquiredOn)} onOpen={()=>navigate(url('acquisitions',a.id))}/>:null}):<Empty title="No verified acquisition inputs" description="Existing synthetic assets show lifecycle status but have no fabricated acquisition provenance. Create a planned asset and record its acquisition to populate this list."/>}
   </Panel>
  </div><aside className="p2-stack"><Panel title="Acquisition process"><div className="p2-step-list"><div><b>01</b><span><strong>Identify the asset</strong><small>Choose a planned record in the registry.</small></span></div><div><b>02</b><span><strong>Begin acquisition</strong><small>Move Planned → Acquisition Pending.</small></span></div><div><b>03</b><span><strong>Record the basis</strong><small>Enter method, date and itemized costs.</small></span></div><div><b>04</b><span><strong>Assign ownership</strong><small>Enter economic or rights interests separately.</small></span></div><div><b>05</b><span><strong>Activate asset</strong><small>Move Acquired → Active when ready.</small></span></div></div></Panel>
  <Panel title="Quick navigation"><NextLink title="Lifecycle manager" description="Inspect allowed transitions" icon={Activity} onClick={()=>navigate('lifecycle')}/><NextLink title="Ownership center" description="Record rights and shares" icon={Users} onClick={()=>navigate('ownership')}/></Panel></aside></div>
  {planned.length>0&&<Panel title="Ready to begin">{planned.map(a=><AssetRow key={a.id} a={a} onOpen={()=>navigate('acquisitions/new?asset='+encodeURIComponent(a.id))} action={<button className="p2-small-button" type="button" onClick={()=>navigate('acquisitions/new?asset='+encodeURIComponent(a.id))}>Start <ArrowRight size={14}/></button>}/>)}</Panel>}
 </>
}
function Wizard(props:Props){
 const {store,navigate}=props
 const query=new URLSearchParams(props.path.split('?')[1]||'')
 const requested=query.get('asset')||''
 const [assetId,setAssetId]=useState(requested)
 const [method,setMethod]=useState<AcquisitionInput['method']>('PURCHASE')
 const [date,setDate]=useState(today())
 const [counterparty,setCounterparty]=useState('')
 const [reference,setReference]=useState('')
 const [notes,setNotes]=useState('')
 const [costs,setCosts]=useState({...EMPTY_COSTS})
 const [error,setError]=useState('')
 const asset=store.records.find(a=>a.id===assetId)
 const eligible=store.records.filter(a=>a.lifecycle==='PLANNED'||a.lifecycle==='ACQUISITION_PENDING')
 const started=asset?.lifecycle==='ACQUISITION_PENDING'
 const basis=Object.values(costs).some(n=>!Number.isFinite(n)||n<0)?0:Object.values(costs).reduce((s,n)=>s+n,0)
 const submit=(e:FormEvent)=>{
  e.preventDefault()
  if(!asset)return setError('Choose an asset.')
  const input:AcquisitionInput={assetId:asset.id,method,acquiredOn:date,counterparty,reference,notes,costs}
  apply(props,()=>completeAcquisition(store,input),'Acquisition recorded; proceed to ownership.',()=>navigate(url('acquisitions',asset.id)),setError)
 }
 return <>
  <Header number="SCREEN 12 / ACQUISITION WIZARD" title="Record an acquisition" subtitle="A structured, auditable-looking local form that respects the asset lifecycle." back={()=>navigate('acquisitions')} actions={<Pill value={started?'STEP 2 — RECORD':'STEP 1 — START'} accent="blue"/>}/>
  <Notice warning>Recording an acquisition here does not make a payment, transfer title, confirm a seller, or create a Finance OS ledger entry. Avoid entering confidential identifiers.</Notice>
  <div className="p2-two-column">
   <div className="p2-stack">
    <Panel title="01 / Select a planned asset"><div className="p2-form-block">
     <AssetPicker store={store} value={assetId} onPick={id=>{setAssetId(id);setError('')}} filter={a=>a.lifecycle==='PLANNED'||a.lifecycle==='ACQUISITION_PENDING'}/>
     {asset&&<div className="p2-inline-asset"><strong>{asset.name}</strong><Pill value={asset.lifecycle} accent="amber"/><small>Currency: {asset.currency} · {asset.number}</small></div>}
     {!eligible.length&&<Empty title="No planned assets" description="New acquisitions begin with a planned asset. Create one in the registry first." action={<button className="primary-button" type="button" onClick={()=>navigate('assets/new')}>Create asset <Plus size={16}/></button>}/>}
     {asset?.lifecycle==='PLANNED'&&<button type="button" className="primary-button" onClick={()=>apply(props,()=>beginAcquisition(store,asset.id),'Acquisition started; enter its details.',undefined,setError)}>Begin acquisition <ArrowRight size={17}/></button>}
    </div></Panel>
    {started&&<form onSubmit={submit} className="p2-stack">
     <Panel title="02 / Method and evidence"><div className="p2-form-grid">
      <label className="p2-field">Acquisition method<select value={method} onChange={e=>setMethod(e.target.value as AcquisitionInput['method'])}>{ACQUISITION_METHODS.map(m=><option key={m} value={m}>{label(m)}</option>)}</select></label>
      <label className="p2-field">Effective acquisition date<input type="date" value={date} max={today()} onChange={e=>setDate(e.target.value)} required/></label>
      <label className="p2-field">Counterparty (non-sensitive label)<input maxLength={120} placeholder="Example seller / transferring party" value={counterparty} onChange={e=>setCounterparty(e.target.value)}/></label>
      <label className="p2-field">Evidence reference (optional)<input maxLength={100} placeholder="Example receipt ID (do not enter secrets)" value={reference} onChange={e=>setReference(e.target.value)}/></label>
      <label className="p2-field p2-wide">Notes<textarea value={notes} maxLength={600} rows={3} onChange={e=>setNotes(e.target.value)} placeholder="Context for this recorded acquisition..."/></label>
     </div></Panel>
     <Panel title="03 / Capitalized acquisition costs"><div className="p2-form-grid">
      {(Object.keys(EMPTY_COSTS) as Array<keyof typeof EMPTY_COSTS>).map(k=><label key={k} className="p2-field">{({purchase:'Purchase / consideration',taxes:'Taxes / registration',fees:'Professional / transaction fees',installation:'Installation / setup',improvements:'Initial improvements',other:'Other capitalized costs'} as Record<string,string>)[k]}<input min="0" step="0.01" type="number" value={costs[k]} onChange={e=>setCosts(p=>({...p,[k]:e.target.value===''?0:Number(e.target.value)}))}/></label>)}
     </div><div className="p2-total"><span>Preview cost basis</span><strong>{currency(basis,asset.currency)}</strong></div></Panel>
     <ErrorBox error={error}/>
     <div className="p2-form-submit"><button type="button" className="secondary-button" onClick={()=>navigate('acquisitions')}>Back to center</button><button type="submit" className="primary-button"><FileCheck2 size={17}/> Record acquisition</button></div>
    </form>}
    {!started&&<ErrorBox error={error}/>}
   </div>
   <aside className="p2-stack"><Panel title="Next steps"><div className="p2-steps"><span className="done"><CheckCircle2 size={16}/> Select asset</span><span><Clock3 size={16}/> Begin acquisition</span><span><Receipt size={16}/> Record cost basis</span><span><Users size={16}/> Assign ownership</span><span><BadgeCheck size={16}/> Activate asset</span></div></Panel><Panel title="Cost basis rules"><p className="p2-copy">Purchase and directly attributable capital costs are itemized in the acquisition record. This prototype performs arithmetic only; jurisdiction-specific tax treatment, depreciation and accounting classifications require Finance/Wealth OS integration.</p></Panel></aside>
  </div>
 </>
}
function AcquisitionDetail(props:ViewProps){
 const {asset,store,navigate}=props
 const record=acquisitionFor(store,asset.id)
 return <>
  <Header number="SCREEN 13 / ACQUISITION RECORD" title={asset.name} subtitle="Acquisition provenance and entry into the asset lifecycle." back={()=>navigate('acquisitions')} actions={<button className="secondary-button" type="button" onClick={()=>navigate(url('cost-basis',asset.id))}><Calculator size={17}/> Cost breakdown</button>}/>
  {!record?<Empty title="No recorded acquisition" description="This asset may be a Phase 1 sample or a legacy asset. Its registry acquisition date is not proof of purchase. Planned and pending assets can complete the wizard." action={<button className="primary-button" type="button" onClick={()=>navigate('acquisitions/new?asset='+encodeURIComponent(asset.id))}>Go to acquisition workflow <ArrowRight size={16}/></button>}/>:<>
   <Notice>Recorded locally on {fmtDate(record.recordedAt)}. No finance posting or legal title verification was performed.</Notice>
   <div className="p2-stat-grid"><BigStat label="Cost basis" value={currency(record.costBasis,record.currency)} hint="Original acquisition snapshot" icon={Wallet}/><BigStat label="Method" value={label(record.method)} hint="Recorded acquisition method" icon={Receipt}/><BigStat label="Acquired on" value={prettyDay(record.acquiredOn)} hint="User-provided date" icon={CalendarDays}/><BigStat label="Lifecycle" value={label(asset.lifecycle)} hint="Current asset state" icon={Activity}/></div>
   <div className="p2-two-column"><div className="p2-stack">
    <Panel title="Acquisition details"><div className="p2-fields"><Field label="Asset number" value={asset.number}/><Field label="Method" value={label(record.method)}/><Field label="Counterparty label" value={record.counterparty||'Not supplied'}/><Field label="Evidence reference" value={record.reference||'Not supplied'}/><Field label="Recorded at" value={fmtDate(record.recordedAt)}/><Field label="Currency" value={record.currency}/></div><p className="p2-copy">{record.notes||'No supporting notes were added.'}</p></Panel>
    <Panel title="What happened next?">{transitionHistory(store,asset.id).map(t=><div className="p2-event-row" key={t.id}><span><Activity size={16}/></span><div><strong>{label(t.from)} → {label(t.to)}</strong><small>{t.reason}</small></div><time>{fmtDate(t.at)}</time></div>)}</Panel>
   </div><aside className="p2-stack">
    <Panel title="Continue the journey"><NextLink title="Review cost basis" description="Inspect itemized acquisition costs" icon={Calculator} onClick={()=>navigate(url('cost-basis',asset.id))}/><NextLink title="Assign ownership" description="Record rights and percentages" icon={Users} onClick={()=>navigate(url('ownership/manage',asset.id))}/><NextLink title="Open lifecycle" description="Activate or review asset state" icon={Activity} onClick={()=>navigate('lifecycle?asset='+encodeURIComponent(asset.id))}/><NextLink title="Record a valuation" description="Document valuation evidence and review" icon={TrendingUp} onClick={()=>navigate('valuations/new')}/></Panel>
   </aside></div>
  </>}
 </>
}
function CostBasisPage(props:Props){
 const {store,navigate}=props; const query=props.path.split('/'); const id=query[1]
 const record=id?acquisitionFor(store,id):undefined
 const asset=id?store.records.find(a=>a.id===id):undefined
 const entries=store.phase2.acquisitions
 return <>
  <Header number="SCREEN 14 / COST BASIS" title={asset?'Cost basis — '+asset.name:'Cost basis center'} subtitle="Original acquisition cost composition, with no tax or depreciation assumptions." back={asset?()=>navigate('cost-basis'):undefined} actions={<button type="button" className="secondary-button" onClick={()=>navigate('acquisitions')}><Receipt size={17}/> Acquisitions</button>}/>
  <Notice>These are recorded acquisition input amounts, not accepted tax basis or posted capital expenditure. Multiple currencies are never combined.</Notice>
  {record&&asset?<div className="p2-two-column"><div className="p2-stack"><Panel title="Capitalized cost components">
   {Object.entries(record.costs).map(([k,v])=><div className="p2-cost-row" key={k}><span>{label(k)}</span><strong>{currency(v,record.currency)}</strong><div className="p2-progress"><span style={{width:record.costBasis?Math.min(100,v/record.costBasis*100)+'%':'0%'}}/></div></div>)}
   <div className="p2-total"><span>Recorded acquisition cost basis</span><strong>{currency(record.costBasis,record.currency)}</strong></div>
  </Panel><Panel title="Basis context"><div className="p2-fields"><Field label="Method" value={label(record.method)}/><Field label="Acquisition effective" value={prettyDay(record.acquiredOn)}/><Field label="Reference" value={record.reference||'No reference'}/><Field label="Source" value="Browser-local acquisition input"/></div></Panel></div>
  <aside className="p2-stack"><Panel title="Next actions"><NextLink title="Ownership details" description="Who holds the economic interest?" icon={Users} onClick={()=>navigate(url('ownership',asset.id))}/><NextLink title="Acquisition record" description="Full record and evidence reference" icon={Receipt} onClick={()=>navigate(url('acquisitions',asset.id))}/></Panel></aside></div>
  :<Panel title="All recorded acquisitions">{entries.length?entries.map(a=>{const item=store.records.find(r=>r.id===a.assetId);return item?<AssetRow key={a.id} a={item} footnote={currency(a.costBasis,a.currency)} onOpen={()=>navigate(url('cost-basis',item.id))}/>:null}):<Empty title="No cost basis records yet" description="Start an acquisition and record its itemized costs to see them here." action={<button className="primary-button" type="button" onClick={()=>navigate('acquisitions/new')}>Record acquisition <Plus size={16}/></button>}/>}</Panel>}
 </>
}
function LifecyclePage(props:Props){
 const {store,navigate}=props
 const query=new URLSearchParams(props.path.split('?')[1]||'')
 const [id,setId]=useState(query.get('asset')||store.records[0]?.id||'')
 const [reason,setReason]=useState('')
 const [error,setError]=useState('')
 const asset=store.records.find(a=>a.id===id)
 const history=asset?transitionHistory(store,asset.id):[]
 const actions: Array<{name:'ACTIVATE'|'SUSPEND'|'REACTIVATE'|'ARCHIVE';title:string;description:string;state:Lifecycle}>=
   [{name:'ACTIVATE',title:'Activate asset',description:'Make an acquired asset active',state:'ACQUIRED'},
    {name:'SUSPEND',title:'Suspend asset',description:'Temporarily take asset out of use',state:'ACTIVE'},
    {name:'REACTIVATE',title:'Reactivate asset',description:'Resume an intentionally suspended asset',state:'SUSPENDED'},
    {name:'ARCHIVE',title:'Archive disposed asset',description:'Retain the complete historical record',state:'DISPOSED'}]
 return <>
  <Header number="SCREEN 15 / LIFECYCLE MANAGER" title="Lifecycle manager" subtitle="Controlled transitions from planning and acquisition through active use and archival." actions={<button type="button" className="primary-button" onClick={()=>navigate('acquisitions/new')}><Plus size={17}/> Begin acquisition</button>}/>
  <Notice warning>State transitions change only this browser's preview. They do not authorize physical handover, convey title, confirm financing, close insurance or perform a regulated transaction.</Notice>
  <div className="p2-lifecycle-track">{LIFECYCLE_STATES.map((s,i)=><span key={s}><b>{String(i+1).padStart(2,'0')}</b>{label(s)}</span>)}</div>
  <div className="p2-two-column"><div className="p2-stack">
   <Panel title="Select asset"><div className="p2-form-block"><AssetPicker store={store} value={id} onPick={x=>{setId(x);setError('')}}/></div></Panel>
   {asset&&<>
   <Panel title={'Current state · '+asset.name}><div className="p2-current"><Pill value={asset.lifecycle} accent={asset.lifecycle==='ACTIVE'?'green':asset.lifecycle==='ARCHIVED'?'red':'amber'}/><p>{asset.number} · {asset.category} · {asset.origin==='sample'?'Seeded baseline, no historic transition provenance':'Browser-created asset'}</p></div>
    <div className="p2-action-grid">{actions.filter(a=>a.state===asset.lifecycle).map(a=><button key={a.name} type="button" onClick={()=>apply(props,()=>lifecycleAction(store,asset.id,a.name,reason),a.title+' completed.',()=>setReason(''),setError)} className="p2-command"><CheckCircle2 size={21}/><strong>{a.title}</strong><small>{a.description}</small><ArrowRight size={15}/></button>)}
    {asset.lifecycle==='PLANNED'&&<NextLink title="Start acquisition" description="First move required for a planned asset" icon={Receipt} onClick={()=>navigate('acquisitions/new?asset='+encodeURIComponent(asset.id))}/>}
    {asset.lifecycle==='ACQUISITION_PENDING'&&<NextLink title="Finish acquisition" description="Record a valid acquisition and basis" icon={Receipt} onClick={()=>navigate('acquisitions/new?asset='+encodeURIComponent(asset.id))}/>}
    {['ACQUIRED','ACTIVE','SUSPENDED'].includes(asset.lifecycle)&&<NextLink title="Dispose asset" description="Irreversible guarded disposition with confirmation" icon={Archive} onClick={()=>navigate(url('dispose',asset.id))}/>}
    {asset.lifecycle==='ARCHIVED'&&<div className="p2-inert"><LockKeyhole size={18}/> Archived assets have no outgoing transitions.</div>}
    </div><div className="p2-form-block"><label className="p2-field">Optional transition reason<input maxLength={300} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why is this state changing?"/></label></div><ErrorBox error={error}/>
   </Panel>
   <Panel title="Transition history">{history.length?history.map(item=><div className="p2-event-row" key={item.id}><span><History size={16}/></span><div><strong>{label(item.from)} → {label(item.to)}</strong><small>{item.reason}</small></div><time>{fmtDate(item.at)}</time></div>):<Empty title="No locally recorded transitions" description="Existing sample statuses are synthetic baseline values. New state changes will appear here."/>}</Panel></>}
  </div><aside className="p2-stack"><Panel title="Allowed state machine"><div className="p2-transition-list">{LIFECYCLE_STATES.map(s=><div key={s}><strong>{label(s)}</strong><span>{({PLANNED:'Acquisition pending',ACQUISITION_PENDING:'Acquired',ACQUIRED:'Active / Disposed',ACTIVE:'Suspended / Disposed',SUSPENDED:'Active / Disposed',DISPOSED:'Archived',ARCHIVED:'No outgoing transitions'} as Record<string,string>)[s]}</span></div>)}</div></Panel>
   <Panel title="Related work"><NextLink title="Ownership" description="View economic interest allocation" onClick={()=>navigate('ownership')} icon={Users}/><NextLink title="Dispositions" description="See preserved exit records" onClick={()=>navigate('dispositions')} icon={Archive}/></Panel>
  </aside></div>
 </>
}
function OwnershipCenter(props:Props){
 const {store,navigate}=props
 const [filter,setFilter]=useState('')
 const inScope=store.records.filter(a=>!filter||a.name.toLowerCase().includes(filter.toLowerCase())||a.number.toLowerCase().includes(filter.toLowerCase()))
 return <>
  <Header number="SCREEN 16 / OWNERSHIP CENTER" title="Ownership center" subtitle="Manage recorded interests, beneficial/economic share allocations and rights references." actions={<button type="button" className="primary-button" onClick={()=>navigate('ownership/manage')}><Plus size={17}/> Record interest</button>}/>
  <Notice warning>Owner names and references are unverified user-entered labels, not Kernel identities or legally validated titles. No actual ownership change occurs outside this browser.</Notice>
  <div className="p2-stat-grid"><BigStat label="Assets tracked" value={String(store.records.length)} hint="All registry assets" icon={Layers3}/><BigStat label="Assets with interests" value={String(new Set(store.phase2.interests.map(i=>i.assetId)).size)} hint="Local recorded rights" icon={Users}/><BigStat label="Recorded transfers" value={String(store.phase2.ownershipChanges.filter(c=>c.type==='TRANSFER').length)} hint="Share reallocation events" icon={ArrowUpRight}/><BigStat label="Unallocated economic" value={String(store.records.filter(a=>ownershipTotal(store,a.id,'ECONOMIC')<100).length)} hint="Assets below 100% allocated" icon={Scale}/></div>
  <Panel title="Ownership by asset" extra={<input className="p2-search-input" aria-label="Find asset ownership" placeholder="Filter assets..." value={filter} onChange={e=>setFilter(e.target.value)}/>}>
   {inScope.length?inScope.map(a=><div className="p2-ownership-asset" key={a.id}>
     <div><strong>{a.name}</strong><small>{a.number} · {label(a.lifecycle)}</small></div>
     <div className="p2-mini-share"><span>Economic</span><div className="p2-progress"><span style={{width:Math.min(100,ownershipTotal(store,a.id,'ECONOMIC'))+'%'}}/></div><b>{ownershipTotal(store,a.id,'ECONOMIC')}%</b></div>
     <button className="p2-small-button" type="button" onClick={()=>navigate(url('ownership',a.id))}>View <ArrowRight size={14}/></button>
   </div>):<Empty title="Nothing matched" description="Clear the filter or create an asset first."/>}
  </Panel>
 </>
}
function OwnershipDetail(props:ViewProps) {
 const {asset,store,navigate}=props
 const current=activeInterests(store,asset.id)
 const history=store.phase2.ownershipChanges.filter(c=>c.assetId===asset.id)
 const snapshot=shareBreakdown(store,asset.id)
 return <>
  <Header number="SCREEN 17 / OWNERSHIP DETAILS" title={'Ownership · '+asset.name} subtitle="Effective-dated interests across economic, beneficial, legal and control dimensions." back={()=>navigate('ownership')} actions={<button className="primary-button" type="button" onClick={()=>navigate(url('ownership/manage',asset.id))}><Plus size={16}/> Assign or transfer</button>}/>
  <Notice>Percentages apply only to economic/beneficial interests. Legal and control entries are rights references, not additive ownership fractions. Records are user-entered, unverified and browser-local.</Notice>
  <div className="p2-four-shares">{snapshot.map(s=><div className="p2-share-card" key={s.dimension}><span>{label(s.dimension)}</span><strong>{s.allocated===null?String(s.count)+' recorded':s.allocated.toFixed(2)+'%'}</strong><small>{s.unallocated===null?'Non-percentage rights':s.unallocated.toFixed(2)+'% not allocated'}</small><div className="p2-progress"><span style={{width:(s.allocated??Math.min(s.count*25,100))+'%'}}/></div></div>)}</div>
  <div className="p2-two-column"><div className="p2-stack">
    <Panel title="Current interests">{current.length?current.map(i=><div className="p2-interest-row" key={i.id}><span className="p2-icon"><Users size={18}/></span><div><strong>{i.partyLabel}</strong><small>{i.partyRef} · {label(i.dimension)} · effective {prettyDay(i.effectiveFrom)}</small></div><b>{i.percentage===null?'Right':i.percentage.toFixed(2)+'%'}</b></div>):<Empty title="No interests recorded" description="Record parties and ownership dimensions to track them locally." action={<button className="primary-button" type="button" onClick={()=>navigate(url('ownership/manage',asset.id))}>Add interest <Plus size={15}/></button>}/>}</Panel>
    <Panel title="Ownership change history">{history.length?history.map(c=><div key={c.id} className="p2-event-row"><span><History size={16}/></span><div><strong>{label(c.type)} · {label(c.dimension)}</strong><small>{c.fromPartyRef?c.fromPartyRef+' → ':''}{c.toPartyRef}{c.percentage!==null?' · '+c.percentage+'%':''}</small><small>Effective {prettyDay(c.effectiveOn)} · {c.note||'No notes'}</small></div><time>{fmtDate(c.createdAt)}</time></div>):<Empty title="No locally recorded ownership history" description="A seeded owner label is not a verified ownership arrangement."/>}</Panel>
  </div><aside className="p2-stack"><Panel title="Ownership actions"><NextLink title="Add or transfer rights" description="Guided allocation with validation" onClick={()=>navigate(url('ownership/manage',asset.id))} icon={Users}/><NextLink title="Cost basis & acquisition" description="Review recorded acquisition" onClick={()=>navigate(url('cost-basis',asset.id))} icon={Calculator}/><NextLink title="Asset overview" description="Return to registry profile" onClick={()=>navigate(url('asset',asset.id))} icon={Layers3}/></Panel></aside></div>
 </>
}
function OwnershipManage(props:Props){
 const {store,navigate}=props
 const id=props.path.split('/')[2]||''
 const [assetId,setAssetId]=useState(id)
 const [tab,setTab]=useState<'assign'|'transfer'>('assign')
 const [dimension,setDimension]=useState<OwnershipDimension>('ECONOMIC')
 const [ref,setRef]=useState('')
 const [party,setParty]=useState('')
 const [percent,setPercent]=useState('100')
 const [on,setOn]=useState(today())
 const [note,setNote]=useState('')
 const [sourceId,setSourceId]=useState('')
 const [error,setError]=useState('')
 const asset=store.records.find(a=>a.id===assetId)
 const rights=asset?activeInterests(store,asset.id).filter(i=>i.percentage!==null):[]
 const src=rights.find(i=>i.id===sourceId)
 const onSubmit=(e:FormEvent)=>{
  e.preventDefault()
  if(!asset)return setError('Choose an asset first.')
  const complete=()=>navigate(url('ownership',asset.id))
  if(tab==='assign'){
   const input:AssignmentInput={assetId:asset.id,partyRef:ref,partyLabel:party,dimension,
     percentage:['ECONOMIC','BENEFICIAL'].includes(dimension)?Number(percent):null,effectiveFrom:on,note}
   apply(props,()=>assignOwnership(store,input),'Interest recorded in this browser.',complete,setError)
  }else{
   const input:TransferInput={assetId:asset.id,sourceInterestId:sourceId,partyRef:ref,partyLabel:party,percentage:Number(percent),effectiveOn:on,note}
   apply(props,()=>transferOwnership(store,input),'Ownership percentage reallocated locally.',complete,setError)
  }
 }
 return <>
  <Header number="SCREEN 18 / OWNERSHIP ASSIGNMENT & TRANSFER" title="Assign or transfer interests" subtitle="Record an effective-dated right or transfer a recorded economic/beneficial share." back={()=>navigate(asset?url('ownership',asset.id):'ownership')} actions={<Pill value="Browser-only" accent="amber"/>}/>
  <Notice warning>High-impact ownership changes are only simulated as local records here. Kernel identity, authorization, signatures, supporting documents and real-world title validation are not connected. Do not use this screen to convey actual ownership.</Notice>
  <div className="p2-two-column"><div className="p2-stack">
   <Panel title="01 / Choose asset and action"><div className="p2-form-block"><AssetPicker store={store} value={assetId} onPick={v=>{setAssetId(v);setSourceId('');setError('')}} filter={a=>['ACQUIRED','ACTIVE','SUSPENDED'].includes(a.lifecycle)}/>
    <div className="p2-tabs"><button type="button" aria-pressed={tab==='assign'} className={tab==='assign'?'active':''} onClick={()=>{setTab('assign');setError('')}}><Plus size={16}/> Assign interest</button><button type="button" aria-pressed={tab==='transfer'} className={tab==='transfer'?'active':''} onClick={()=>{setTab('transfer');setError('')}}><ArrowRight size={16}/> Transfer share</button></div>
   </div></Panel>
   <form onSubmit={onSubmit}><Panel title={'02 / '+(tab==='assign'?'Interest details':'Transfer details')}><div className="p2-form-grid">
    {tab==='assign'?<label className="p2-field">Ownership dimension<select value={dimension} onChange={e=>{setDimension(e.target.value as OwnershipDimension);setPercent('100')}}>{OWNERSHIP_DIMENSIONS.map(d=><option key={d} value={d}>{label(d)}</option>)}</select></label>:<label className="p2-field p2-wide">Source interest<select value={sourceId} onChange={e=>{setSourceId(e.target.value);const i=rights.find(x=>x.id===e.target.value);setPercent(String(i?.percentage||0))}}><option value="">Select existing economic/beneficial share...</option>{rights.map(i=><option key={i.id} value={i.id}>{i.partyLabel} — {label(i.dimension)} {i.percentage}%</option>)}</select></label>}
    <label className="p2-field">Receiving party reference<input required maxLength={90} value={ref} onChange={e=>setRef(e.target.value)} placeholder="Example: PARTY-002"/></label>
    <label className="p2-field">Receiving party label<input required maxLength={120} value={party} onChange={e=>setParty(e.target.value)} placeholder="Example: Business partner"/></label>
    {(tab==='transfer'||dimension==='ECONOMIC'||dimension==='BENEFICIAL')&&<label className="p2-field">Share (%)<input type="number" step="0.01" min="0.01" max={tab==='transfer'?(src?.percentage||100):100} value={percent} onChange={e=>setPercent(e.target.value)} required/></label>}
    <label className="p2-field">Effective on<input type="date" max={today()} required value={on} onChange={e=>setOn(e.target.value)}/></label>
    <label className="p2-field p2-wide">Context note<textarea maxLength={400} value={note} rows={3} placeholder="Reason or non-sensitive supporting note..." onChange={e=>setNote(e.target.value)}/></label>
   </div><div className="p2-form-submit"><button type="button" className="secondary-button" onClick={()=>navigate('ownership')}>Cancel</button><button type="submit" className="primary-button"><CheckCircle2 size={16}/>{tab==='assign'?'Record interest':'Record share transfer'}</button></div><ErrorBox error={error}/></Panel></form>
  </div><aside className="p2-stack">{asset&&<Panel title="Current allocation"><div className="p2-breakdown">{shareBreakdown(store,asset.id).map(x=><div key={x.dimension}><span>{label(x.dimension)}</span><b>{x.allocated===null?x.count+' rights':x.allocated+'% of 100%'}</b><div className="p2-progress"><span style={{width:(x.allocated||0)+'%'}}/></div></div>)}</div></Panel>}
    <Panel title="Rules and protections"><div className="p2-rule-list"><p><CheckCircle2 size={16}/> Economic and beneficial shares cannot exceed 100%.</p><p><CheckCircle2 size={16}/> Legal and control roles are recorded without additive percentages.</p><p><CheckCircle2 size={16}/> Transfers preserve prior effective-dated interests.</p><p><ShieldAlert size={16}/> Real-world legal transfers require external verification and policy approval.</p></div></Panel></aside></div>
 </>
}
function Dispose(props:Props){
 const {store,navigate}=props
 const requested=props.path.split('/')[1]||''
 const [assetId,setAssetId]=useState(requested)
 const [type,setType]=useState<DispositionInput['type']>('SALE')
 const [date,setDate]=useState(today())
 const [proceeds,setProceeds]=useState('0')
 const [costs,setCosts]=useState('0')
 const [counterparty,setCounterparty]=useState('')
 const [reason,setReason]=useState('')
 const [confirm,setConfirm]=useState('')
 const [error,setError]=useState('')
 const asset=store.records.find(a=>a.id===assetId)
 const recorded=asset?acquisitionFor(store,asset.id):undefined
 const net=Number(proceeds)-Number(costs)
 const submit=(e:FormEvent)=>{
  e.preventDefault()
  if(!asset)return setError('Choose an asset for disposition.')
  const input:DispositionInput={assetId:asset.id,type,date,proceeds:Number(proceeds),costs:Number(costs),counterparty,reason,confirm}
  apply(props,()=>disposeAsset(store,input),'Disposition recorded. Historic record preserved.',()=>navigate(url('dispositions',asset.id)),setError)
 }
 return <>
  <Header number="SCREEN 19 / DISPOSITION WIZARD" title="Dispose of an asset" subtitle="Record a controlled exit event; preserve history without deleting the asset." back={()=>navigate('dispositions')} actions={<Pill value="Guarded action" accent="red"/>}/>
  <Notice warning>**Important:** This is an irreversible browser-state action. It does not sell, transfer, donate or destroy a real asset, make a payment, execute signatures or notify external services.</Notice>
  <div className="p2-two-column"><div className="p2-stack"><form onSubmit={submit}><Panel title="01 / Select asset and disposal method"><div className="p2-form-grid">
   <div className="p2-wide"><AssetPicker store={store} value={assetId} onPick={v=>{setAssetId(v);setError('')}} filter={a=>['ACQUIRED','ACTIVE','SUSPENDED'].includes(a.lifecycle)}/></div>
   <label className="p2-field">Method<select value={type} onChange={e=>{setType(e.target.value as DispositionInput['type']);if(!['SALE','TRADE','OTHER'].includes(e.target.value))setProceeds('0')}}>{DISPOSITION_TYPES.map(x=><option key={x} value={x}>{label(x)}</option>)}</select></label>
   <label className="p2-field">Effective disposal date<input type="date" required max={today()} value={date} onChange={e=>setDate(e.target.value)}/></label>
   <label className="p2-field">Proceeds ({asset?.currency||'KES'})<input type="number" min="0" step="0.01" disabled={!['SALE','TRADE','OTHER'].includes(type)} value={proceeds} onChange={e=>setProceeds(e.target.value)}/></label>
   <label className="p2-field">Transaction costs ({asset?.currency||'KES'})<input type="number" min="0" step="0.01" value={costs} onChange={e=>setCosts(e.target.value)}/></label>
   <label className="p2-field p2-wide">Counterparty label (required for sales)<input maxLength={120} placeholder="Non-sensitive reference" value={counterparty} onChange={e=>setCounterparty(e.target.value)}/></label>
   <label className="p2-field p2-wide">Reason for disposal<textarea rows={3} required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason for disposal and any non-sensitive considerations"/></label>
  </div></Panel><Panel title="02 / Review and confirm"><div className="p2-dispose-review"><div><span>Asset</span><strong>{asset?.name||'No asset selected'}</strong></div><div><span>Method</span><strong>{label(type)}</strong></div><div><span>Preview net proceeds</span><strong>{Number.isFinite(net)&&asset?currency(net,asset.currency):'—'}</strong></div><div><span>Original recorded cost basis</span><strong>{recorded?currency(recorded.costBasis,recorded.currency):'Unknown — cannot calculate gain/loss'}</strong></div></div>
   <div className="p2-confirm-box"><label className="p2-field">Type <b>DISPOSE</b> to confirm<input autoComplete="off" required value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="DISPOSE"/></label></div>
   <ErrorBox error={error}/><div className="p2-form-submit"><button type="button" className="secondary-button" onClick={()=>navigate('lifecycle')}>Cancel</button><button className="p2-danger-button" type="submit" disabled={!asset||confirm!=='DISPOSE'}><Archive size={16}/> Confirm local disposition</button></div>
  </Panel></form></div><aside className="p2-stack"><Panel title="Disposition safety"><div className="p2-rule-list"><p><LockKeyhole size={16}/> Disposed assets cannot be reactivated or acquired again.</p><p><History size={16}/> Historical asset records, ownership events and cost components remain visible.</p><p><Wallet size={16}/> Proceeds are not posted into Finance OS.</p><p><Scale size={16}/> Gain/loss estimates are illustrative, not tax advice.</p></div></Panel></aside></div>
 </>
}
function Dispositions(props:Props){
 const {store,navigate}=props
 const id=props.path.split('/')[1]||''
 const asset=id?store.records.find(a=>a.id===id):undefined
 const record=asset?dispositionFor(store,asset.id):undefined
 const [error,setError]=useState('')
 const disposed=store.phase2.dispositions
 if(asset&&record){
  return <>
    <Header number="SCREEN 20 / DISPOSITION HISTORY" title={'Disposition · '+asset.name} subtitle="Preserved exit record and archival controls." back={()=>navigate('dispositions')} actions={<Pill value={asset.lifecycle} accent="red"/>}/>
    <Notice warning>All data on this screen is a local preview and does not prove payment receipt, beneficial ownership transfer or a legally completed disposal.</Notice>
    <div className="p2-stat-grid"><BigStat icon={Archive} label="Disposition method" value={label(record.type)} hint="User-recorded method"/><BigStat icon={Coins} label="Net proceeds" value={currency(record.netProceeds,record.currency)} hint="Not a bank transaction"/><BigStat icon={Calculator} label="Original cost basis" value={record.costBasis!==null?currency(record.costBasis,record.currency):'Unknown'} hint="Original recorded acquisition"/><BigStat icon={TrendingUp} label="Estimated gain / loss" value={record.estimatedGain!==null?currency(record.estimatedGain,record.currency):'Not available'} hint="Preview arithmetic, not taxation"/></div>
    <div className="p2-two-column"><div className="p2-stack">
     <Panel title="Recorded disposition"><div className="p2-fields"><Field label="Asset" value={asset.name}/><Field label="Disposal type" value={label(record.type)}/><Field label="Effective date" value={prettyDay(record.date)}/><Field label="Counterparty" value={record.counterparty||'Not recorded'}/><Field label="Gross proceeds" value={currency(record.proceeds,record.currency)}/><Field label="Transaction costs" value={currency(record.costs,record.currency)}/><Field label="Recorded at" value={fmtDate(record.recordedAt)}/><Field label="Lifecycle now" value={label(asset.lifecycle)}/></div><div className="p2-dispose-reason">{record.reason}</div></Panel>
     <Panel title="Historical transitions">{transitionHistory(store,asset.id).map(t=><div className="p2-event-row" key={t.id}><span><History size={16}/></span><div><strong>{label(t.from)} → {label(t.to)}</strong><small>{t.reason}</small></div><time>{fmtDate(t.at)}</time></div>)}</Panel>
    </div><aside className="p2-stack"><Panel title="Archive controls">{asset.lifecycle==='DISPOSED'?<div className="p2-action-area"><p className="p2-copy">Archiving preserves records and blocks further lifecycle transitions.</p><button className="p2-danger-button" type="button" onClick={()=>apply(props,()=>lifecycleAction(store,asset.id,'ARCHIVE','Archived after recorded disposition'),'Asset archived; history retained.',undefined,setError)}><Archive size={16}/> Archive asset</button><ErrorBox error={error}/></div>:<div className="p2-inert"><LockKeyhole size={18}/> Asset archived. Records preserved.</div>}</Panel>
     <Panel title="History links"><NextLink title="Ownership timeline" description="Review interests at exit" icon={Users} onClick={()=>navigate(url('ownership',asset.id))}/><NextLink title="Cost basis" description="Review original acquisition" icon={Calculator} onClick={()=>navigate(url('cost-basis',asset.id))}/></Panel>
    </aside></div>
  </>
 }
 return <>
  <Header number="SCREEN 20 / DISPOSITION & ARCHIVE HISTORY" title="Dispositions & archive" subtitle="A permanent record of exits within this browser workspace." actions={<button className="primary-button" type="button" onClick={()=>navigate('dispose')}><Plus size={17}/> New disposition</button>}/>
  <div className="p2-stat-grid"><BigStat icon={Archive} label="Recorded exits" value={String(disposed.length)} hint="Browser-only disposal records"/><BigStat icon={LockKeyhole} label="Archived assets" value={String(store.records.filter(a=>a.lifecycle==='ARCHIVED').length)} hint="No outgoing transitions"/><BigStat icon={Receipt} label="Sales" value={String(disposed.filter(d=>d.type==='SALE').length)} hint="Not financially reconciled"/><BigStat icon={History} label="Preserved records" value={String(disposed.length)} hint="Not deletable in this UI"/></div>
  <Panel title="Historical disposition records">{disposed.length?disposed.map(record=>{const a=store.records.find(x=>x.id===record.assetId);return a?<AssetRow key={record.id} a={a} footnote={prettyDay(record.date)+' · '+label(record.type)} onOpen={()=>navigate(url('dispositions',a.id))}/>:null}):<Empty title="No dispositions recorded" description="Acquired, active or suspended assets can enter a guarded disposition workflow." action={<button className="secondary-button" type="button" onClick={()=>navigate('dispose')}>Open disposition wizard <ArrowRight size={16}/></button>}/>}</Panel>
 </>
}
export function LifecycleExperience(props:Props){
 const route=props.path.split('?')[0]
 if(route==='acquisitions')return <Acquisitions {...props}/>
 if(route==='acquisitions/new')return <Wizard {...props}/>
 if(route.startsWith('acquisitions/')){const id=decodeURIComponent(route.split('/')[1]);const a=props.store.records.find(r=>r.id===id);return a?<AcquisitionDetail {...props} asset={a}/>:<Missing navigate={props.navigate}/>}
 if(route==='cost-basis'||route.startsWith('cost-basis/'))return <CostBasisPage {...props}/>
 if(route==='lifecycle')return <LifecyclePage {...props}/>
 if(route==='ownership')return <OwnershipCenter {...props}/>
 if(route.startsWith('ownership/manage'))return <OwnershipManage {...props}/>
 if(route.startsWith('ownership/')){const id=decodeURIComponent(route.split('/')[1]);const a=props.store.records.find(r=>r.id===id);return a?<OwnershipDetail {...props} asset={a}/>:<Missing navigate={props.navigate}/>}
 if(route==='dispose'||route.startsWith('dispose/'))return <Dispose {...props}/>
 if(route==='dispositions'||route.startsWith('dispositions/'))return <Dispositions {...props}/>
 return <Missing navigate={props.navigate}/>
}
function Missing({navigate}:{navigate:(route:string)=>void}){
 return <Empty title="Asset workflow unavailable" description="The requested record or route was not found. Return to the acquisition center." action={<button type="button" className="primary-button" onClick={()=>navigate('acquisitions')}>Go to acquisitions <ArrowRight size={15}/></button>}/>
}
