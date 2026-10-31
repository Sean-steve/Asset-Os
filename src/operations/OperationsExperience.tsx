import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
 Activity, AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2,
 ChevronRight, ClipboardCheck, Clock3, FileText, FolderOpen, Gauge, History,
 Layers3, Link2, ListChecks, MapPin, Pause, Play, Plus, RefreshCcw,
 ShieldCheck, SlidersHorizontal, Trash2, Wrench, type LucideIcon
} from 'lucide-react'
import type { RegistryState, AssetRecord } from '../registry/core'
import {
 addEvidence, addRelation, createJob, createPlan, cancelPolicy, DOCUMENT_KINDS,
 eventUrgency, latestReading, METRICS, moveLocation, operationalEvents, policyState,
 recordPolicy, recordReading, RELATION_TYPES, setPlanState, updateJob, utilizationSeries,
 type EvidenceKind, type PlanInterval, type RelationType,
 type UtilizationMetric
} from './core'
import './operations.css'

type Props={
 path:string;store:RegistryState;onChange:(next:RegistryState)=>void;
 navigate:(route:string)=>void;report:(message:string)=>void
}
const today=()=>new Date().toISOString().slice(0,10)
const titlecase=(s:string)=>s.toLowerCase().replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
const fmtDate=(date:string)=>date?new Date(date+'T00:00:00Z').toLocaleDateString('en-KE',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}):'Not recorded'
const fmtMoney=(n:number,c:string)=>new Intl.NumberFormat('en-KE',{style:'currency',currency:c,maximumFractionDigits:2}).format(n)
const route=(name:string,id:string)=>name+'/'+encodeURIComponent(id)
const live=(a:AssetRecord)=>['ACQUIRED','ACTIVE','SUSPENDED'].includes(a.lifecycle)
const assetName=(state:RegistryState,id:string)=>state.records.find(a=>a.id===id)?.name||'Unknown asset'
const stamp=(iso:string)=>new Date(iso).toLocaleString('en-KE',{dateStyle:'medium',timeStyle:'short'})
function Head({screen,name,desc,extra,back}:{
 screen:number;name:string;desc:string;extra?:ReactNode;back?:()=>void
}){
 return <header className="p4-header"><div className="p4-head-left">{back&&<button className="p4-back" aria-label="Back" onClick={back} type="button"><ArrowLeft size={18}/></button>}<div><span className="eyebrow">ASSET OPERATIONS / SCREEN {String(screen).padStart(2,'0')}</span><h1>{name}</h1><p>{desc}</p></div></div><div className="p4-head-actions">{extra}</div></header>
}
function Card({title,children,extra,className=''}:{title:string;children:ReactNode;extra?:ReactNode;className?:string}){
 return <section className={'p4-card '+className}><header><h2>{title}</h2>{extra}</header>{children}</section>
}
function Notice({children,warn=false}:{children:ReactNode;warn?:boolean}){
 return <div className={'p4-notice '+(warn?'is-warning':'')}><AlertTriangle size={17}/><span>{children}</span></div>
}
function Stats({items}:{items:Array<{label:string;value:string;icon:LucideIcon;hint:string}>}){
 return <div className="p4-stats">{items.map(({label,value,icon:Icon,hint})=><div className="p4-stat" key={label}><span><Icon size={17}/>{label}</span><strong>{value}</strong><small>{hint}</small></div>)}</div>
}
function Empty({name,desc,action}:{name:string;desc:string;action?:ReactNode}){
 return <div className="p4-empty"><div><Layers3 size={27}/></div><h3>{name}</h3><p>{desc}</p>{action}</div>
}
function Badge({value,accent='neutral'}:{value:string;accent?:'neutral'|'green'|'blue'|'amber'|'red'}){
 return <span className={'p4-badge '+accent}>{titlecase(value)}</span>
}
function ErrorBox({error}:{error:string}){return error?<div className="p4-error" role="alert"><AlertTriangle size={17}/>{error}</div>:null}
function AssetSelect({store,value,onChange,includeInactive=false}:{store:RegistryState;value:string;onChange:(s:string)=>void;includeInactive?:boolean}){
 return <label className="p4-field">Asset<select required value={value} onChange={e=>onChange(e.target.value)}><option value="">Select asset...</option>{store.records.filter(a=>includeInactive||live(a)).map(a=><option key={a.id} value={a.id}>{a.number} · {a.name}</option>)}</select></label>
}
function Info({label,value}:{label:string;value:string}){
 return <div className="p4-info"><small>{label}</small><strong>{value}</strong></div>
}
function Next({name,desc,icon:Icon,onClick}:{name:string;desc:string;icon:LucideIcon;onClick:()=>void}){
 return <button className="p4-next" type="button" onClick={onClick}><span className="p4-symbol"><Icon size={18}/></span><span><strong>{name}</strong><small>{desc}</small></span><ArrowRight size={16}/></button>
}
function AssetLine({asset,detail,open,extra}:{asset:AssetRecord;detail:string;open:()=>void;extra?:ReactNode}){
 return <div className="p4-asset-line"><span className="p4-symbol"><Layers3 size={18}/></span><div><strong>{asset.name}</strong><small>{asset.number} · {detail}</small></div>{extra}<button type="button" aria-label={'View '+asset.name} className="p4-open" onClick={open}><ChevronRight size={18}/></button></div>
}
function apply(props:Props,action:()=>RegistryState,success:string,setError?:(value:string)=>void,after?:()=>void){
 try{
  const next=action();props.onChange(next);props.report(success);setError?.('');after?.()
 }catch(error){setError?.(error instanceof Error?error.message:'Operation could not be completed.')}
}
function Maintenance(props:Props){
 const {store,navigate}=props
 const plans=store.phase4.plans,jobs=store.phase4.jobs
 const due=plans.filter(p=>p.status==='ACTIVE'&&p.nextDue<=today())
 const activeJobs=jobs.filter(j=>['SCHEDULED','IN_PROGRESS'].includes(j.status))
 return <>
  <Head screen={31} name="Maintenance center" desc="Preventive schedules, service jobs and lifecycle-aware maintenance, all in one workspace."
    extra={<button className="primary-button" type="button" onClick={()=>navigate('maintenance/plans')}><Plus size={17}/> New maintenance plan</button>}/>
  <Notice warn>Maintenance is recorded locally; no vendor dispatch, equipment diagnosis, invoice, real service verification or Mission OS task is generated.</Notice>
  <Stats items={[{label:'Maintenance plans',value:String(plans.length),icon:Wrench,hint:'Browser-entered schedules'},
    {label:'Due / overdue',value:String(due.length),icon:Clock3,hint:'Active plans at or before today'},
    {label:'Open service jobs',value:String(activeJobs.length),icon:ListChecks,hint:'No automatic dispatch'},
    {label:'Completed jobs',value:String(jobs.filter(j=>j.status==='COMPLETED').length),icon:CheckCircle2,hint:'Locally recorded completions'}]}/>
  <div className="p4-cols"><div className="p4-stack">
   <Card title="Due maintenance" extra={<button type="button" className="p4-link" onClick={()=>navigate('operations-calendar')}>Operations calendar <ArrowRight size={15}/></button>}>
    {due.length?due.map(p=>{const a=store.records.find(x=>x.id===p.assetId);return a?<AssetLine key={p.id} asset={a} detail={p.title+' · Due '+fmtDate(p.nextDue)} open={()=>navigate('maintenance/plans') } extra={<Badge value={p.nextDue<today()?'OVERDUE':'DUE TODAY'} accent="amber"/>}/>:null}):<Empty name="No maintenance due" desc="Due tasks appear only after you create maintenance plans with real dates." action={<button className="secondary-button" type="button" onClick={()=>navigate('maintenance/plans')}>Create a plan <Plus size={15}/></button>}/>}
   </Card>
   <Card title="Open service work">{activeJobs.length?activeJobs.map(j=>{const a=store.records.find(x=>x.id===j.assetId);return a?<AssetLine key={j.id} asset={a} detail={j.title+' · '+fmtDate(j.scheduledFor)} open={()=>navigate('maintenance/jobs')} extra={<Badge value={j.status} accent={j.status==='IN_PROGRESS'?'blue':'amber'}/>} />:null}):<Empty name="No open service jobs" desc="Create a job when work is scheduled; progress must be recorded manually."/>}</Card>
  </div><aside className="p4-stack">
   <Card title="Maintenance workflow"><div className="p4-steps">{['Register a maintenance plan and recurrence','Review next due date','Create scheduled service work','Start and complete with notes and cost','Review the next generated due date'].map((s,i)=><div key={s}><b>{String(i+1).padStart(2,'0')}</b><span>{s}</span></div>)}</div></Card>
   <Card title="Quick actions"><Next icon={Wrench} name="Maintenance plans" desc="Recurring dates and paused plans" onClick={()=>navigate('maintenance/plans')}/><Next icon={ClipboardCheck} name="Work orders" desc="Service status and completion" onClick={()=>navigate('maintenance/jobs')}/><Next icon={ShieldCheck} name="Insurance" desc="Protection status and renewal" onClick={()=>navigate('insurance')}/></Card>
  </aside></div>
 </>
}
function Plans(props:Props){
 const {store,navigate}=props
 const [form,setForm]=useState(false),[assetId,setAssetId]=useState(''),[name,setName]=useState(''),
 [desc,setDesc]=useState(''),[frequency,setFrequency]=useState('1'),[unit,setUnit]=useState<PlanInterval>('MONTHS'),
 [due,setDue]=useState(today()),[error,setError]=useState('')
 const submit=(e:FormEvent)=>{e.preventDefault()
  apply(props,()=>createPlan(store,{assetId,title:name,description:desc,interval:Number(frequency),unit,nextDue:due}),
   'Maintenance plan recorded locally.',setError,()=>{setForm(false);setName('');setDesc('')})}
 return <>
  <Head screen={32} name="Maintenance plans" desc="Recurring schedules with explicit due dates. No tasks are sent outside this browser."
   back={()=>navigate('maintenance')} extra={<button className="primary-button" type="button" onClick={()=>setForm(p=>!p)}><Plus size={17}/>{form?'Close form':'Create plan'}</button>}/>
  <Notice>Due dates are calendar reminders, not globally authoritative personal schedules. Human Kernel integration is planned for a later phase.</Notice>
  {form&&<form onSubmit={submit}><Card title="Create a recurring plan"><div className="p4-form">
   <div className="p4-span"><AssetSelect store={store} value={assetId} onChange={setAssetId}/></div>
   <label className="p4-field">Maintenance task<input maxLength={120} required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Oil change / annual inspection"/></label>
   <label className="p4-field">First due date<input type="date" required value={due} onChange={e=>setDue(e.target.value)}/></label>
   <label className="p4-field">Every<input type="number" min="1" max="365" step="1" required value={frequency} onChange={e=>setFrequency(e.target.value)}/></label>
   <label className="p4-field">Recurrence unit<select value={unit} onChange={e=>setUnit(e.target.value as PlanInterval)}>{['DAYS','WEEKS','MONTHS'].map(v=><option key={v}>{v}</option>)}</select></label>
   <label className="p4-field p4-span">Instructions / notes<textarea rows={2} maxLength={500} value={desc} onChange={e=>setDesc(e.target.value)}/></label>
  </div><ErrorBox error={error}/><div className="p4-form-actions"><button type="button" className="secondary-button" onClick={()=>setForm(false)}>Cancel</button><button type="submit" className="primary-button"><Check size={16}/> Save maintenance plan</button></div></Card></form>}
  <Card title="Recorded plans">{store.phase4.plans.length?store.phase4.plans.map(p=>{
    const a=store.records.find(a=>a.id===p.assetId);return a?<div className="p4-plan-row" key={p.id}><div className="p4-plan-main"><strong>{p.title}</strong><small>{a.name} · Every {p.interval} {titlecase(p.unit)} · next {fmtDate(p.nextDue)}</small><span>{p.description||'No instructions recorded.'}</span></div><Badge value={p.status} accent={p.status==='ACTIVE'?'green':'neutral'}/><button type="button" className="p4-small" onClick={()=>apply(props,()=>setPlanState(store,p.id,p.status==='ACTIVE'?'PAUSED':'ACTIVE'),'Maintenance plan status updated.',setError)}>{p.status==='ACTIVE'?<Pause size={15}/>:<Play size={15}/>} {p.status==='ACTIVE'?'Pause':'Resume'}</button><button type="button" className="p4-small" onClick={()=>navigate('maintenance/jobs?plan='+encodeURIComponent(p.id))}>Create job <ArrowRight size={15}/></button></div>:null
   }):<Empty name="No recurring plans" desc="Create a schedule with a known next-due date to begin tracking maintenance." action={<button className="primary-button" type="button" onClick={()=>setForm(true)}>Add plan <Plus size={16}/></button>}/>}</Card>
  {!form&&<ErrorBox error={error}/>}
 </>
}
function Jobs(props:Props){
 const {store,navigate}=props
 const qs=new URLSearchParams(props.path.split('?')[1]||'')
 const related=qs.get('plan')||''
 const selectedPlan=store.phase4.plans.find(p=>p.id===related)
 const [form,setForm]=useState(Boolean(selectedPlan)),[assetId,setAssetId]=useState(selectedPlan?.assetId||''),
 [planId,setPlanId]=useState(related),[name,setName]=useState(selectedPlan?.title||''),
 [when,setWhen]=useState(selectedPlan?.nextDue||today()),[provider,setProvider]=useState(''),
 [notes,setNotes]=useState(''),[error,setError]=useState(''),[completion,setCompletion]=useState<string|null>(null),
 [cost,setCost]=useState('0'),[completedDate,setCompletedDate]=useState(today()),[completedNotes,setCompletedNotes]=useState('')
 const plans=store.phase4.plans.filter(p=>p.assetId===assetId&&p.status==='ACTIVE')
 const submit=(e:FormEvent)=>{e.preventDefault();apply(props,()=>createJob(store,{assetId,planId:planId||null,title:name,scheduledFor:when,providerLabel:provider,notes}),
  'Service job scheduled in local workspace.',setError,()=>{setForm(false);setName('');setNotes('')})}
 const complete=(e:FormEvent)=>{e.preventDefault();if(!completion)return
  apply(props,()=>updateJob(store,completion,'COMPLETE',{date:completedDate,cost:Number(cost),notes:completedNotes}),
   'Completion recorded locally and next plan due date advanced when applicable.',setError,()=>{setCompletion(null);setCost('0');setCompletedNotes('')})}
 return <>
  <Head screen={33} name="Service jobs & work orders" desc="Scheduled maintenance work, status changes, recorded costs and completion evidence."
   back={()=>navigate('maintenance')} extra={<button className="primary-button" type="button" onClick={()=>setForm(p=>!p)}><Plus size={17}/>{form?'Close':'New work order'}</button>}/>
  <Notice warn>Jobs are local records only. Completing a job does not dispatch a contractor, pay a vendor, create a Finance OS expense or certify equipment safety.</Notice>
  {form&&<form onSubmit={submit}><Card title="Schedule work"><div className="p4-form">
   <div className="p4-span"><AssetSelect store={store} value={assetId} onChange={v=>{setAssetId(v);setPlanId('')}}/></div>
   <label className="p4-field">Optional maintenance plan<select value={planId} onChange={e=>{setPlanId(e.target.value);const p=plans.find(p=>p.id===e.target.value);if(p){setName(p.title);setWhen(p.nextDue)}}}><option value="">One-time work</option>{plans.map(p=><option value={p.id} key={p.id}>{p.title} · {fmtDate(p.nextDue)}</option>)}</select></label>
   <label className="p4-field">Scheduled for<input type="date" required value={when} onChange={e=>setWhen(e.target.value)}/></label>
   <label className="p4-field">Work title<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
   <label className="p4-field">Provider label (optional)<input maxLength={120} value={provider} onChange={e=>setProvider(e.target.value)} placeholder="No vendor connection"/></label>
   <label className="p4-field p4-span">Scope / notes<textarea maxLength={500} rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
  </div><ErrorBox error={error}/><div className="p4-form-actions"><button type="button" className="secondary-button" onClick={()=>setForm(false)}>Cancel</button><button type="submit" className="primary-button"><Check size={16}/> Schedule job</button></div></Card></form>}
  <Card title="Service work history">{store.phase4.jobs.length?store.phase4.jobs.map(j=><div className="p4-plan-row" key={j.id}><div className="p4-plan-main"><strong>{j.title}</strong><small>{assetName(store,j.assetId)} · Scheduled {fmtDate(j.scheduledFor)}{j.completedOn?' · Completed '+fmtDate(j.completedOn):''}</small><span>{j.completedOn?'Recorded service cost: '+fmtMoney(j.recordedCost||0,store.records.find(a=>a.id===j.assetId)?.currency||'KES'):'Provider: '+(j.providerLabel||'Not recorded')}</span></div><Badge value={j.status} accent={j.status==='COMPLETED'?'green':j.status==='CANCELLED'?'neutral':'amber'}/>{j.status==='SCHEDULED'&&<button className="p4-small" type="button" onClick={()=>apply(props,()=>updateJob(store,j.id,'START'),'Service marked in progress.',setError)}><Play size={15}/> Start</button>}{!['COMPLETED','CANCELLED'].includes(j.status)&&<button className="p4-small" type="button" onClick={()=>{setCompletion(j.id);setError('')}}><Check size={15}/> Complete</button>}{!['COMPLETED','CANCELLED'].includes(j.status)&&<button className="p4-small subtle" type="button" onClick={()=>apply(props,()=>updateJob(store,j.id,'CANCEL'),'Service job cancelled locally.',setError)}>Cancel</button>}</div>):<Empty name="No scheduled service jobs" desc="Create a work order from an active plan or directly for an acquired asset." action={<button className="primary-button" type="button" onClick={()=>setForm(true)}>Schedule work <Plus size={16}/></button>}/>}</Card>
  {completion&&<form onSubmit={complete}><Card title="Record completed work"><div className="p4-form"><label className="p4-field">Completed on<input type="date" required max={today()} value={completedDate} onChange={e=>setCompletedDate(e.target.value)}/></label><label className="p4-field">Recorded service cost (not paid)<input type="number" step="0.01" min="0" value={cost} onChange={e=>setCost(e.target.value)}/></label><label className="p4-field p4-span">Completion notes<textarea maxLength={500} rows={2} value={completedNotes} onChange={e=>setCompletedNotes(e.target.value)} /></label></div><ErrorBox error={error}/><div className="p4-form-actions"><button type="button" className="secondary-button" onClick={()=>setCompletion(null)}>Cancel</button><button className="primary-button" type="submit"><Check size={16}/> Record completion</button></div></Card></form>}
  {!form&&!completion&&<ErrorBox error={error}/>}
 </>
}
function Insurance(props:Props){
 const {store,navigate}=props
 const policies=store.phase4.policies
 const active=policies.filter(p=>policyState(p,today())==='ACTIVE')
 const expiring=active.filter(p=>p.endOn<=new Date(Date.now()+30*86400000).toISOString().slice(0,10))
 return <>
  <Head screen={34} name="Insurance center" desc="Coverage references, renewals and upcoming expiries—without making insurance claims."
   extra={<button className="primary-button" type="button" onClick={()=>navigate('insurance/new')}><Plus size={17}/> Record insurance</button>}/>
  <Notice warn>Policies are unverified, manually entered metadata. Asset OS cannot confirm an insurer, issue coverage, take premiums or guarantee that a policy is enforceable.</Notice>
  <Stats items={[{label:'Policy references',value:String(policies.length),icon:ShieldCheck,hint:'Including superseded history'},
   {label:'Currently dated',value:String(active.length),icon:CheckCircle2,hint:'Date-active, not insurer verified'},
   {label:'Expires within 30 days',value:String(expiring.length),icon:Clock3,hint:'From entered expiry dates'},
   {label:'Already expired',value:String(policies.filter(p=>policyState(p,today())==='EXPIRED').length),icon:AlertTriangle,hint:'Renewal candidate references'}]}/>
  <div className="p4-cols"><div className="p4-stack"><Card title="Recorded coverage">{policies.length?policies.map(p=>{const asset=store.records.find(a=>a.id===p.assetId);const status=policyState(p,today());return asset?<AssetLine key={p.id} asset={asset} detail={p.insurerLabel+' · Ends '+fmtDate(p.endOn)} open={()=>navigate(route('insurance/policies',p.id))} extra={<Badge value={status} accent={status==='ACTIVE'?'green':status==='EXPIRED'?'red':'amber'}/>} />:null}):<Empty name="No insurance records" desc="Add a non-sensitive policy reference and its coverage dates to populate the insurance center." action={<button type="button" className="primary-button" onClick={()=>navigate('insurance/new')}>Add policy reference <Plus size={16}/></button>}/>}</Card></div>
   <aside className="p4-stack"><Card title="Protection workflow"><div className="p4-steps">{['Enter insurer and policy reference','Record coverage dates and amount','Review upcoming expiry','Record renewal as a new policy snapshot','Preserve superseded and cancelled records'].map((x,i)=><div key={x}><b>{String(i+1).padStart(2,'0')}</b><span>{x}</span></div>)}</div></Card><Card title="Navigate"><Next icon={CalendarDays} name="Operations calendar" desc="Expiry reminders" onClick={()=>navigate('operations-calendar')}/><Next icon={FolderOpen} name="Evidence references" desc="Store a non-sensitive document reference" onClick={()=>navigate('evidence')}/></Card></aside>
  </div>
 </>
}
function InsuranceForm(props:Props){
 const {store,navigate}=props
 const query=new URLSearchParams(props.path.split('?')[1]||'')
 const oldId=query.get('renew')||''
 const old=store.phase4.policies.find(p=>p.id===oldId)
 const [assetId,setAssetId]=useState(old?.assetId||''),[insurer,setInsurer]=useState(old?.insurerLabel||''),
 [reference,setReference]=useState(''),[kind,setKind]=useState(old?.policyType||'General insurance'),
 [from,setFrom]=useState(old?.endOn||today()),[end,setEnd]=useState(''),
 [coverage,setCoverage]=useState(old?String(old.coverageAmount):''),[premium,setPremium]=useState(''),
 [notes,setNotes]=useState(''),[error,setError]=useState('')
 const asset=store.records.find(a=>a.id===assetId)
 const submit=(e:FormEvent)=>{e.preventDefault()
  apply(props,()=>recordPolicy(store,{assetId,insurerLabel:insurer,policyReference:reference,policyType:kind,
   startOn:from,endOn:end,coverageAmount:Number(coverage),premiumAmount:premium.trim()?Number(premium):null,notes},oldId||null),
   'Insurance policy reference recorded locally. Coverage remains unverified.',setError,()=>navigate('insurance'))}
 return <>
  <Head screen={35} name={old?'Record insurance renewal':'Record insurance policy'} desc="Capture coverage metadata and expiry information as an unverified browser reference."
   back={()=>navigate('insurance')} extra={<Badge value={old?'RENEWAL SNAPSHOT':'NEW POLICY'} accent="blue"/>}/>
  <Notice warn>No real policy documents are uploaded or signed. A renewal is represented as a new metadata snapshot; insurer confirmation and premium settlement are outside this preview.</Notice>
  <div className="p4-cols"><div className="p4-stack"><form onSubmit={submit}><Card title="Policy and coverage details"><div className="p4-form">
   <div className="p4-span"><AssetSelect store={store} value={assetId} onChange={v=>{if(!old)setAssetId(v)}}/></div>
   <label className="p4-field">Insurer label<input maxLength={120} required value={insurer} onChange={e=>setInsurer(e.target.value)} placeholder="Unverified insurer"/></label>
   <label className="p4-field">Policy reference (non-sensitive)<input required maxLength={120} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Masked/reference only"/></label>
   <label className="p4-field">Policy type<input required maxLength={100} value={kind} onChange={e=>setKind(e.target.value)}/></label>
   <label className="p4-field">Coverage amount ({asset?.currency||'currency'})<input type="number" min="0" step="0.01" required value={coverage} onChange={e=>setCoverage(e.target.value)}/></label>
   <label className="p4-field">Coverage begins<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
   <label className="p4-field">Coverage expires<input required type="date" value={end} min={from} onChange={e=>setEnd(e.target.value)}/></label>
   <label className="p4-field">Premium (optional; not paid)<input type="number" min="0" step="0.01" value={premium} onChange={e=>setPremium(e.target.value)}/></label>
   <label className="p4-field p4-span">Coverage context<textarea maxLength={500} rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
  </div><ErrorBox error={error}/><div className="p4-form-actions"><button className="secondary-button" type="button" onClick={()=>navigate('insurance')}>Cancel</button><button className="primary-button" type="submit"><ShieldCheck size={16}/> Save policy reference</button></div></Card></form></div>
   <aside className="p4-stack"><Card title="Protection boundaries"><div className="p4-copy"><p>Coverage amount and premium are declarations, not Finance OS ledger transactions. Insurance is not active merely because this screen displays a date-active reference.</p><p>The actual policy document, insurer verification, claims and renewal payment require a later secured backend integration.</p></div></Card>{old&&<Card title="Replacing policy"><div className="p4-info-grid"><Info label="Former insurer" value={old.insurerLabel}/><Info label="Original expiry" value={fmtDate(old.endOn)}/><Info label="Old reference" value={old.policyReference}/></div></Card>}</aside>
  </div>
 </>
}
function InsuranceDetail(props:Props){
 const {store,navigate}=props
 const id=props.path.split('/')[2]||''
 const p=store.phase4.policies.find(p=>p.id===id)
 const a=store.records.find(a=>a.id===p?.assetId)
 const [error,setError]=useState('')
 if(!p||!a)return <Empty name="Policy not found" desc="This policy reference does not exist in the local workspace." action={<button className="secondary-button" onClick={()=>navigate('insurance')} type="button">Back to insurance</button>}/>
 const status=policyState(p,today())
 return <>
  <Head screen={35} name={p.insurerLabel+' — '+a.name} desc="A preserved insurance reference with coverage terms and renewal lineage."
   back={()=>navigate('insurance')} extra={<Badge value={status} accent={status==='ACTIVE'?'green':status==='EXPIRED'?'red':'amber'}/>}/>
  <Notice warn>Insurance dates and references are manually declared and not issuer-confirmed. Verify with the insurer before relying on coverage.</Notice>
  <div className="p4-cols"><div className="p4-stack">
   <Card title="Policy reference and dates"><div className="p4-info-grid">
    <Info label="Asset" value={a.name}/><Info label="Insurer" value={p.insurerLabel}/><Info label="Reference" value={p.policyReference}/><Info label="Coverage type" value={p.policyType}/>
    <Info label="Start" value={fmtDate(p.startOn)}/><Info label="Expiry" value={fmtDate(p.endOn)}/>
    <Info label="Coverage amount" value={fmtMoney(p.coverageAmount,p.currency)}/>
    <Info label="Premium entered" value={p.premiumAmount===null?'Not recorded':fmtMoney(p.premiumAmount,p.currency)}/>
    <Info label="Recorded" value={stamp(p.recordedAt)}/><Info label="Renewal of" value={p.replacesId||'Original reference'}/>
   </div><p className="p4-copy">{p.notes||'No policy context notes were recorded.'}</p></Card>
   <Card title="Policy history">{store.phase4.policies.filter(x=>x.assetId===p.assetId).map(x=><div className="p4-plan-row" key={x.id}><div className="p4-plan-main"><strong>{x.insurerLabel}</strong><small>{x.policyReference} · {fmtDate(x.startOn)}–{fmtDate(x.endOn)}</small></div><Badge value={policyState(x,today())} accent="blue"/><button className="p4-small" type="button" onClick={()=>navigate(route('insurance/policies',x.id))}>Open</button></div>)}</Card>
  </div><aside className="p4-stack"><Card title="Next steps">{p.status==='RECORDED'&&<Next icon={RefreshCcw} name="Record renewal" desc="New coverage record; preserve history" onClick={()=>navigate('insurance/new?renew='+encodeURIComponent(p.id))}/>}<Next icon={CalendarDays} name="Calendar" desc="Review policy expiry" onClick={()=>navigate('operations-calendar')}/>{p.status==='RECORDED'&&<div className="p4-side-action"><button type="button" className="secondary-button" onClick={()=>apply(props,()=>cancelPolicy(store,p.id),'Policy reference cancelled locally; issuer not contacted.',setError)}><Trash2 size={15}/> Cancel local policy reference</button></div>}<ErrorBox error={error}/></Card></aside></div>
 </>
}
function Utilization(props:Props){
 const {store,navigate}=props
 const [assetId,setAssetId]=useState(''),[metric,setMetric]=useState<UtilizationMetric>('ODOMETER_KM'),
 [date,setDate]=useState(today()),[value,setValue]=useState(''),[source,setSource]=useState(''),
 [notes,setNotes]=useState(''),[form,setForm]=useState(false),[error,setError]=useState('')
 const submit=(e:FormEvent)=>{e.preventDefault();apply(props,()=>recordReading(store,{assetId,metric,observedOn:date,value:Number(value),sourceLabel:source,notes}),
  'Cumulative utilization reading recorded manually.',setError,()=>{setValue('');setForm(false);setSource('')})}
 const groups=[...new Set(store.phase4.readings.map(r=>r.assetId))]
 return <>
  <Head screen={36} name="Utilization dashboard" desc="Manual cumulative asset usage and observation history, not live device telemetry."
   extra={<button className="primary-button" type="button" onClick={()=>setForm(p=>!p)}><Plus size={16}/> Record reading</button>}/>
  <Notice warn>These are user-entered cumulative readings. They do not prove mileage, occupancy, availability, device connectivity or efficiency. Real utilization percentages require external capacity and time-window data.</Notice>
  <Stats items={[{label:'Recorded readings',value:String(store.phase4.readings.length),icon:Gauge,hint:'Browser-only measurements'},
   {label:'Assets observed',value:String(groups.length),icon:Layers3,hint:'With recorded readings'},
   {label:'Measurement types',value:String(new Set(store.phase4.readings.map(r=>r.metric)).size),icon:SlidersHorizontal,hint:'Cumulative units'},
   {label:'Live connected devices',value:'0',icon:Activity,hint:'No telemetry integrations'}]}/>
  {form&&<form onSubmit={submit}><Card title="Add cumulative utilization reading"><div className="p4-form">
   <div className="p4-span"><AssetSelect store={store} value={assetId} onChange={setAssetId}/></div>
   <label className="p4-field">Metric<select value={metric} onChange={e=>setMetric(e.target.value as UtilizationMetric)}>{METRICS.map(m=><option key={m} value={m}>{titlecase(m)}</option>)}</select></label>
   <label className="p4-field">Observed on<input type="date" max={today()} value={date} onChange={e=>setDate(e.target.value)}/></label>
   <label className="p4-field">Cumulative reading<input type="number" min="0" step={['USE_COUNT','OCCUPIED_DAYS'].includes(metric)?'1':'0.01'} required value={value} onChange={e=>setValue(e.target.value)} placeholder="Total to date"/></label>
   <label className="p4-field">Reading source<input required maxLength={120} value={source} onChange={e=>setSource(e.target.value)} placeholder="e.g. manual log or meter"/ ></label>
   <label className="p4-field p4-span">Notes<textarea rows={2} maxLength={400} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
  </div><ErrorBox error={error}/><div className="p4-form-actions"><button type="button" className="secondary-button" onClick={()=>setForm(false)}>Cancel</button><button className="primary-button" type="submit"><Check size={16}/> Record observation</button></div></Card></form>}
  <Card title="Asset usage profiles">{groups.length?groups.map(id=>{const a=store.records.find(a=>a.id===id);const metricNames=[...new Set(store.phase4.readings.filter(r=>r.assetId===id).map(r=>r.metric))];return a?<AssetLine key={id} asset={a} detail={metricNames.map(m=>titlecase(m)+': '+latestReading(store,id,m)?.value).join(' · ')} open={()=>navigate(route('utilization',id))} extra={<Badge value={String(metricNames.length)+' metrics'} accent="blue"/>}/>:null}):<Empty name="No utilization history" desc="Record the first manual reading for a vehicle, property, machine or any other asset." action={<button type="button" className="primary-button" onClick={()=>setForm(true)}>Add reading <Plus size={16}/></button>}/>}</Card>
 </>
}
function UtilizationDetails(props:Props){
 const {store,navigate}=props
 const id=decodeURIComponent(props.path.split('/')[1]||'')
 const a=store.records.find(a=>a.id===id)
 const [metric,setMetric]=useState<UtilizationMetric>('ODOMETER_KM')
 if(!a)return <Empty name="Asset not found" desc="Choose a registered asset from utilization." action={<button className="secondary-button" type="button" onClick={()=>navigate('utilization')}>Back to utilization</button>}/>
 const measures=utilizationSeries(store,id,metric),latest=measures[measures.length-1],previous=measures[measures.length-2]
 return <>
  <Head screen={37} name={a.name+' — utilization'} desc="Chronological manually entered readings and deltas for one selected metric."
   back={()=>navigate('utilization')} extra={<button className="secondary-button" type="button" onClick={()=>navigate('utilization')}><Plus size={16}/> Add reading</button>}/>
  <Notice>Usage figures are cumulative, not rates. Differences between observations are simple arithmetic without time/capacity normalization.</Notice>
  <Card title="Select utilization metric"><div className="p4-filter"><label className="p4-field">Measurement<select value={metric} onChange={e=>setMetric(e.target.value as UtilizationMetric)}>{METRICS.map(m=><option key={m}>{m}</option>)}</select></label></div></Card>
  <Stats items={[{label:'Latest total',value:latest?String(latest.value):'—',icon:Gauge,hint:titlecase(metric)},
   {label:'Change since prior',value:latest?.delta!==null&&latest?String(latest.delta):'—',icon:Activity,hint:'Cumulative-unit difference'},
   {label:'Observations',value:String(measures.length),icon:History,hint:'Chronologically recorded'},
   {label:'Last recorded',value:latest?fmtDate(latest.observedOn):'—',icon:CalendarDays,hint:'User-entered date'}]}/>
  <Card title="Recorded series">{measures.length?<div className="p4-scroll"><table className="p4-table"><thead><tr><th>OBSERVED</th><th>TOTAL</th><th>DELTA</th><th>SOURCE</th><th>NOTES</th></tr></thead><tbody>{measures.slice().reverse().map(r=><tr key={r.id}><td>{fmtDate(r.observedOn)}</td><td className="p4-money">{r.value}</td><td>{r.delta===null?'Baseline':r.delta>=0?'+'+r.delta:r.delta}</td><td>{r.sourceLabel}</td><td>{r.notes||'—'}</td></tr>)}</tbody></table></div>:<Empty name="No readings for this metric" desc="Choose another metric or record an observation. No synthetic graph is generated."/>}</Card>
  {previous&&<div className="p4-notice">From {fmtDate(previous.observedOn)} to {fmtDate(latest.observedOn)}, the cumulative change was {latest.delta} {titlecase(metric).toLowerCase()} units.</div>}
 </>
}
function Evidence(props:Props){
 const {store}=props
 const [form,setForm]=useState(false),[assetId,setAssetId]=useState(''),[kind,setKind]=useState<EvidenceKind>('COMPLIANCE'),
 [name,setName]=useState(''),[ref,setRef]=useState(''),[issued,setIssued]=useState(''),
 [expires,setExpires]=useState(''),[notes,setNotes]=useState(''),[filter,setFilter]=useState(''),[error,setError]=useState('')
 const submit=(e:FormEvent)=>{e.preventDefault();apply(props,()=>addEvidence(store,{assetId,kind,title:name,reference:ref,issuedOn:issued||null,expiresOn:expires||null,notes}),
  'Evidence reference saved. No file was uploaded.',setError,()=>{setForm(false);setName('');setRef('')})}
 const docs=store.phase4.documents.filter(d=>!filter||d.kind===filter)
 return <>
  <Head screen={38} name="Documents & evidence vault" desc="Non-sensitive evidence metadata and expiry reminders without binary uploads or confidential files."
   extra={<button className="primary-button" type="button" onClick={()=>setForm(p=>!p)}><Plus size={16}/> Reference evidence</button>}/>
  <Notice warn>There is no secure vault or file upload in this static prototype. Do not enter actual title numbers, policy numbers, ID documents, URLs, base64 files, passwords or other sensitive information.</Notice>
  <Stats items={[{label:'Evidence references',value:String(store.phase4.documents.length),icon:FileText,hint:'Metadata only'},
   {label:'Expiring references',value:String(store.phase4.documents.filter(d=>d.expiresOn&&d.expiresOn>=today()&&d.expiresOn<=new Date(Date.now()+30*86400000).toISOString().slice(0,10)).length),icon:CalendarDays,hint:'Within 30 days'},
   {label:'Expired references',value:String(store.phase4.documents.filter(d=>d.expiresOn&&d.expiresOn<today()).length),icon:AlertTriangle,hint:'From entered dates'},
   {label:'Uploaded files',value:'0',icon:FolderOpen,hint:'No file storage connected'}]}/>
  {form&&<form onSubmit={submit}><Card title="Add an evidence reference"><div className="p4-form">
    <div className="p4-span"><AssetSelect store={store} value={assetId} onChange={setAssetId}/></div>
    <label className="p4-field">Category<select value={kind} onChange={e=>setKind(e.target.value as EvidenceKind)}>{DOCUMENT_KINDS.map(k=><option key={k}>{k}</option>)}</select></label>
    <label className="p4-field">Title<input required value={name} maxLength={120} onChange={e=>setName(e.target.value)} placeholder="e.g. inspection certificate reference"/></label>
    <label className="p4-field p4-span">Non-sensitive reference only<input required value={ref} maxLength={160} onChange={e=>setRef(e.target.value)} placeholder="e.g. SAMPLE-CERT-01 (no URLs or secrets)"/></label>
    <label className="p4-field">Issued on (optional)<input type="date" max={today()} value={issued} onChange={e=>setIssued(e.target.value)}/></label>
    <label className="p4-field">Expiry (optional)<input type="date" min={issued||undefined} value={expires} onChange={e=>setExpires(e.target.value)}/></label>
    <label className="p4-field p4-span">Notes<textarea maxLength={400} rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
  </div><ErrorBox error={error}/><div className="p4-form-actions"><button type="button" className="secondary-button" onClick={()=>setForm(false)}>Cancel</button><button className="primary-button" type="submit"><Check size={16}/> Save metadata</button></div></Card></form>}
  <Card title="Reference register" extra={<select className="p4-inline-select" aria-label="Filter evidence category" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All kinds</option>{DOCUMENT_KINDS.map(k=><option key={k}>{k}</option>)}</select>}>
   {docs.length?docs.map(d=><div className="p4-plan-row" key={d.id}><span className="p4-symbol"><FileText size={17}/></span><div className="p4-plan-main"><strong>{d.title}</strong><small>{assetName(store,d.assetId)} · {d.reference} · {titlecase(d.kind)}</small><span>{d.expiresOn?'Expires '+fmtDate(d.expiresOn):'No expiry supplied'} · Metadata only</span></div><Badge value={d.expiresOn&&d.expiresOn<today()?'EXPIRED':'REFERENCE ONLY'} accent={d.expiresOn&&d.expiresOn<today()?'red':'blue'}/></div>):<Empty name="No evidence references" desc="Store non-sensitive metadata; files and secure document workflows require a later backend." action={<button className="primary-button" type="button" onClick={()=>setForm(true)}>Add reference <Plus size={16}/></button>}/>}
  </Card>
 </>
}
function Locations(props:Props){
 const {store,navigate}=props
 const [tab,setTab]=useState<'move'|'relation'>('move'),[assetId,setAssetId]=useState(''),[to,setTo]=useState(''),
 [date,setDate]=useState(today()),[reason,setReason]=useState(''),[related,setRelated]=useState(''),
 [type,setType]=useState<RelationType>('ASSOCIATED_WITH'),[note,setNote]=useState(''),[error,setError]=useState('')
 const asset=store.records.find(a=>a.id===assetId)
 const submit=(e:FormEvent)=>{e.preventDefault()
  if(tab==='move')apply(props,()=>moveLocation(store,{assetId,toLabel:to,effectiveOn:date,reason}),
   'Location change recorded and asset location updated.',setError,()=>{setTo('');setReason('')})
  else apply(props,()=>addRelation(store,{assetId,relatedAssetId:related,type,note}),
   'Asset relationship recorded locally.',setError,()=>{setRelated('');setNote('')})
 }
 return <>
  <Head screen={39} name="Locations & relationships" desc="Track asset placement and dependencies, with preserved move history and cycle protection."
   back={()=>navigate('assets')}/>
  <Notice>Location labels are user-provided, not GPS positions or geofenced telemetry. Relationships are informational and do not create a legal lien, title or financial security interest.</Notice>
  <div className="p4-cols"><div className="p4-stack"><Card title="Manage location or relationship"><div className="p4-tabs"><button type="button" aria-pressed={tab==='move'} className={tab==='move'?'active':''} onClick={()=>{setTab('move');setError('')}}><MapPin size={16}/> Record location change</button><button type="button" aria-pressed={tab==='relation'} className={tab==='relation'?'active':''} onClick={()=>{setTab('relation');setError('')}}><Link2 size={16}/> Link two assets</button></div>
    <form onSubmit={submit}><div className="p4-form"><div className="p4-span"><AssetSelect store={store} value={assetId} onChange={setAssetId}/></div>
     {tab==='move'?<>
      <div className="p4-info p4-span"><small>Current location</small><strong>{asset?.location||'Not recorded'}</strong></div>
      <label className="p4-field">Destination label<input required maxLength={150} value={to} onChange={e=>setTo(e.target.value)} placeholder="City, office, storage zone..."/></label>
      <label className="p4-field">Effective date<input type="date" max={today()} value={date} onChange={e=>setDate(e.target.value)}/></label>
      <label className="p4-field p4-span">Reason<textarea rows={2} maxLength={400} value={reason} onChange={e=>setReason(e.target.value)}/></label>
     </>:<>
      <label className="p4-field">Related asset<select value={related} onChange={e=>setRelated(e.target.value)}><option value="">Choose another asset...</option>{store.records.filter(a=>live(a)&&a.id!==assetId).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label className="p4-field">Relationship type<select value={type} onChange={e=>setType(e.target.value as RelationType)}>{RELATION_TYPES.map(k=><option key={k}>{k}</option>)}</select></label>
      <label className="p4-field p4-span">Relationship note<textarea rows={2} maxLength={400} value={note} onChange={e=>setNote(e.target.value)}/></label>
     </>}
    </div><ErrorBox error={error}/><div className="p4-form-actions"><button type="submit" className="primary-button"><Check size={16}/>{tab==='move'?'Save move':'Save relation'}</button></div></form>
   </Card>
   <Card title="Recorded location history">{store.phase4.locations.length?store.phase4.locations.map(l=><div className="p4-plan-row" key={l.id}><span className="p4-symbol"><MapPin size={17}/></span><div className="p4-plan-main"><strong>{assetName(store,l.assetId)}</strong><small>{l.fromLabel||'No prior location'} → {l.toLabel}</small><span>Effective {fmtDate(l.effectiveOn)} · {l.reason||'No reason supplied'}</span></div></div>):<Empty name="No recorded moves" desc="Seeded location labels have no invented movement history."/>}</Card>
  </div><aside className="p4-stack">
   <Card title="Asset relationships">{store.phase4.relations.length?store.phase4.relations.map(r=><div className="p4-plan-row" key={r.id}><span className="p4-symbol"><Link2 size={16}/></span><div className="p4-plan-main"><strong>{assetName(store,r.assetId)}</strong><small>{titlecase(r.type)} → {assetName(store,r.relatedAssetId)}</small><span>{r.note||'Informational link'}</span></div></div>):<Empty name="No relationships yet" desc="Link registered assets without changing their ownership or financing."/>}</Card>
   <Card title="Rules"><div className="p4-copy"><p>Component and dependency relationships cannot create cycles. Asset self-links and duplicate links are blocked.</p><p>Later Kernel integration will handle identity, permissions and globally authoritative policies.</p></div></Card>
  </aside></div>
 </>
}
function Calendar(props:Props){
 const {store,navigate}=props
 const [month,setMonth]=useState(''),[kind,setKind]=useState(''),[filter,setFilter]=useState('ALL')
 const all=useMemo(()=>operationalEvents(store),[store])
 const filtered=all.filter(e=>(!month||e.date.startsWith(month))&&(!kind||e.kind===kind)&&
  (filter==='ALL'||filter===eventUrgency(e.date,today())))
 const overdue=all.filter(e=>eventUrgency(e.date,today())==='OVERDUE')
 const next30=all.filter(e=>e.date>=today()&&e.date<=new Date(Date.now()+30*86400000).toISOString().slice(0,10))
 const go=(event:typeof all[number])=>{
  if(event.kind==='MAINTENANCE_DUE')navigate('maintenance/plans')
  if(event.kind==='SERVICE_SCHEDULED')navigate('maintenance/jobs')
  if(event.kind==='POLICY_EXPIRY')navigate(route('insurance/policies',event.sourceId))
  if(event.kind==='EVIDENCE_EXPIRY')navigate('evidence')
 }
 return <>
  <Head screen={40} name="Operational calendar" desc="Read-only event timeline derived solely from entered plans, service jobs, policy dates and evidence expiries."
   extra={<button type="button" className="secondary-button" onClick={()=>navigate('maintenance')}><Wrench size={16}/> Maintenance center</button>}/>
  <Notice warn>This is an Asset OS planning projection, not a booked appointment or Human Kernel schedule. Event dates are local inputs; no push notifications, vendor booking or external calendar sync occurs.</Notice>
  <Stats items={[{label:'Scheduled events',value:String(all.length),icon:CalendarDays,hint:'Only entered operational dates'},
   {label:'Past due',value:String(overdue.length),icon:AlertTriangle,hint:'All categories, relative to today'},
   {label:'Next 30 days',value:String(next30.length),icon:Clock3,hint:'Inclusive of today'},
   {label:'Connected calendars',value:'0',icon:Link2,hint:'No Kernel or external sync'}]}/>
  <Card title="Operational events"><div className="p4-calendar-filters"><label className="p4-field">Month<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><label className="p4-field">Event type<select value={kind} onChange={e=>setKind(e.target.value)}><option value="">All types</option>{['MAINTENANCE_DUE','SERVICE_SCHEDULED','POLICY_EXPIRY','EVIDENCE_EXPIRY'].map(t=><option key={t} value={t}>{titlecase(t)}</option>)}</select></label><label className="p4-field">Urgency<select value={filter} onChange={e=>setFilter(e.target.value)}>{['ALL','OVERDUE','TODAY','UPCOMING'].map(t=><option key={t}>{t}</option>)}</select></label><button className="p4-small" type="button" onClick={()=>{setMonth('');setKind('');setFilter('ALL')}}><RefreshCcw size={16}/> Clear</button></div>
   {filtered.length?<div className="p4-calendar-list">{filtered.map(event=><button key={event.id} type="button" onClick={()=>go(event)} className="p4-cal-event"><span className="p4-cal-date"><strong>{event.date.slice(8,10)}</strong><small>{new Date(event.date+'T00:00:00Z').toLocaleDateString('en-KE',{timeZone:'UTC',month:'short',year:'numeric'})}</small></span><span className="p4-cal-description"><strong>{event.title}</strong><small>{assetName(store,event.assetId)} · {titlecase(event.kind)}</small></span><Badge value={eventUrgency(event.date,today())} accent={eventUrgency(event.date,today())==='OVERDUE'?'red':eventUrgency(event.date,today())==='TODAY'?'amber':'blue'}/><ChevronRight size={16}/></button>)}</div>:<Empty name="No operational calendar events" desc="Add due dates to a maintenance plan, service job, insurance record or evidence reference. No dates are fabricated." action={<button type="button" className="secondary-button" onClick={()=>navigate('maintenance/plans')}>Add maintenance plan <Plus size={15}/></button>}/>}
  </Card>
 </>
}
export function OperationsExperience(props:Props){
 const routeName=props.path.split('?')[0]
 if(routeName==='maintenance')return <Maintenance {...props}/>
 if(routeName==='maintenance/plans')return <Plans {...props}/>
 if(routeName==='maintenance/jobs')return <Jobs {...props}/>
 if(routeName==='insurance')return <Insurance {...props}/>
 if(routeName==='insurance/new')return <InsuranceForm {...props}/>
 if(routeName.startsWith('insurance/policies/'))return <InsuranceDetail {...props}/>
 if(routeName==='utilization')return <Utilization {...props}/>
 if(routeName.startsWith('utilization/'))return <UtilizationDetails {...props}/>
 if(routeName==='evidence')return <Evidence {...props}/>
 if(routeName==='locations')return <Locations {...props}/>
 if(routeName==='operations-calendar')return <Calendar {...props}/>
 return <Empty name="Operations screen not found" desc="Return to the maintenance center." action={<button className="secondary-button" onClick={()=>props.navigate('maintenance')} type="button">Maintenance center <ArrowRight size={15}/></button>}/>
}
