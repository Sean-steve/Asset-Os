import { useState, type FormEvent, type ReactNode } from 'react'
import {
 Activity, AlertCircle, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen,
 CalendarDays, ChartColumnIncreasing, CheckCircle2, ChevronRight,
 Coins, FileCheck2, FileClock, Landmark, Layers3, Link2,
 Plus, Receipt, Scale, Search, ShieldAlert, TrendingUp, Wallet, type LucideIcon
} from 'lucide-react'
import type { RegistryState, AssetRecord } from '../registry/core'
import {
 acceptValuation, attachReference, cashTimeline, createFacility, FLOW_CATEGORIES,
 FLOW_TYPES, flowSummary, flowsFor, indicativeEquity, latestAccepted, latestBalance,
 observeBalance, outstandingForAsset, reconciliationSummary, recordFlow,
 recordValuation, referenceFor, roiSnapshot, VALUATION_METHODS,
 type FinancingInput, type FlowType, type ValuationInput,
 type ValuationMethod, type ValuationConfidence, type CashFlowInput
} from './core'
import './economics.css'

type Props={path:string;store:RegistryState;onChange:(next:RegistryState)=>void;navigate:(route:string)=>void;report:(message:string)=>void}
const today=()=>new Date().toISOString().slice(0,10)
const nice=(v:string)=>v.toLowerCase().replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
const fmt=(amount:number,code:string)=>new Intl.NumberFormat('en-KE',{style:'currency',currency:code,maximumFractionDigits:2}).format(amount)
const day=(value:string)=>value?new Date(value+'T00:00:00Z').toLocaleDateString('en-KE',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}):'Not recorded'
const stamp=(value:string)=>new Date(value).toLocaleString('en-KE',{dateStyle:'medium',timeStyle:'short'})
const link=(base:string,id:string)=>base+'/'+encodeURIComponent(id)
function H({screen,title,sub,actions,back}:{screen:number;title:string;sub:string;actions?:ReactNode;back?:()=>void}){
 return <div className="p3-header"><div className="p3-headline">{back&&<button type="button" className="p3-back" onClick={back} aria-label="Go back"><ArrowLeft size={18}/></button>}<div><span className="eyebrow">SCREEN {screen.toString().padStart(2,'0')} / FINANCIAL INTELLIGENCE</span><h1>{title}</h1><p>{sub}</p></div></div><div className="p3-head-actions">{actions}</div></div>
}
function Box({title,extra,children,className=''}:{title:string;extra?:ReactNode;children:ReactNode;className?:string}){
 return <section className={'p3-box '+className}><header><h2>{title}</h2>{extra}</header>{children}</section>
}
function Notice({children,warning=false}:{children:ReactNode;warning?:boolean}){
 return <div className={'p3-notice '+(warning?'warn':'')}><ShieldAlert size={18}/><div>{children}</div></div>
}
function Stat({title,value,info,icon:Icon}:{title:string;value:string;info:string;icon:LucideIcon}){
 return <div className="p3-stat"><div><span>{title}</span><Icon size={19}/></div><strong>{value}</strong><small>{info}</small></div>
}
function Empty({title,description,action}:{title:string;description:string;action?:ReactNode}){
 return <div className="p3-empty"><span><Layers3 size={27}/></span><strong>{title}</strong><p>{description}</p>{action}</div>
}
function Tag({value,tone='neutral'}:{value:string;tone?:'neutral'|'green'|'blue'|'amber'|'red'}){
 return <span className={'p3-tag '+tone}>{nice(value)}</span>
}
function Field({name,value}:{name:string;value:string}){
 return <div className="p3-info-field"><small>{name}</small><strong>{value}</strong></div>
}
function Btn({children,onClick}:{children:ReactNode;onClick:()=>void}){
 return <button className="p3-quick" type="button" onClick={onClick}>{children}<ArrowRight size={16}/></button>
}
function ErrorBox({text}:{text:string}){return text?<div className="p3-error" role="alert"><AlertCircle size={17}/>{text}</div>:null}
function change(props:Props,op:()=>RegistryState,msg:string,after?:()=>void,setError?:(value:string)=>void){
 try{const next=op();props.onChange(next);props.report(msg);setError?.('');after?.()}catch(err){setError?.(err instanceof Error?err.message:'Operation could not be completed.')}
}
function AssetSelect({store,value,onChange,forEntry=false}:{store:RegistryState;value:string;onChange:(v:string)=>void;forEntry?:boolean}){
 const eligible=forEntry?store.records.filter(a=>['ACQUIRED','ACTIVE','SUSPENDED'].includes(a.lifecycle)):store.records
 return <label className="p3-field">Asset<select value={value} onChange={e=>onChange(e.target.value)}><option value="">Choose asset...</option>{eligible.map(a=><option value={a.id} key={a.id}>{a.number} · {a.name} · {a.currency}</option>)}</select></label>
}
function AssetRow({asset,detail,onClick,children}:{asset:AssetRecord;detail:string;onClick:()=>void;children?:ReactNode}){
 return <div className="p3-asset-row"><span className="p3-row-glyph"><Layers3 size={18}/></span><span className="p3-row-name"><strong>{asset.name}</strong><small>{asset.number} · {detail}</small></span>{children}<button type="button" className="p3-row-open" aria-label={'Open '+asset.name} onClick={onClick}><ChevronRight size={18}/></button></div>
}
function ValuationCenter(props:Props){
 const {store,navigate}=props
 const [search,setSearch]=useState('')
 const valuations=store.phase3.valuations
 const eligible=store.records.filter(a=>['ACQUIRED','ACTIVE','SUSPENDED'].includes(a.lifecycle))
 const assets=eligible.filter(a=>!search||a.name.toLowerCase().includes(search.toLowerCase())||a.number.toLowerCase().includes(search.toLowerCase()))
 const drafts=valuations.filter(v=>v.status==='DRAFT')
 const accepted=valuations.filter(v=>v.status==='ACCEPTED')
 return <>
  <H screen={21} title="Valuation center" sub="Evidence-led current value tracking and review without inventing accepted appraisals." actions={<button className="primary-button" type="button" onClick={()=>navigate('valuations/new')}><Plus size={16}/> Record valuation</button>}/>
  <Notice warning>Accepted here means reviewed in this browser preview, not independently appraised, audited, or approved by Finance OS. Values are not suitable for legal or investment decisions.</Notice>
  <div className="p3-stats"><Stat title="Asset valuations" value={String(valuations.length)} info="Local history entries" icon={ChartColumnIncreasing}/><Stat title="Pending review" value={String(drafts.length)} info="Draft records awaiting review" icon={FileClock}/><Stat title="Locally accepted" value={String(accepted.length)} info="Not independently verified" icon={CheckCircle2}/><Stat title="Assets with accepted values" value={String(new Set(accepted.map(v=>v.assetId)).size)} info="Unique assets" icon={Layers3}/></div>
  <div className="p3-cols"><div className="p3-stack">
   <Box title="Assets and valuation coverage" extra={<label className="p3-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find an asset..." aria-label="Find asset for valuation"/></label>}>
    {assets.length?assets.map(a=>{const accepted=latestAccepted(store,a.id);return <AssetRow key={a.id} asset={a} detail={accepted?'Locally accepted '+day(accepted.date):'Unverified registry estimate'} onClick={()=>navigate('valuation-history?asset='+encodeURIComponent(a.id))}><strong className="p3-row-money">{fmt(a.value,a.currency)}</strong><Tag tone={accepted?'green':'amber'} value={accepted?'LOCAL ACCEPTED':'NO ACCEPTED VALUATION'}/></AssetRow>}):<Empty title="No eligible assets" description="Create an asset and complete acquisition to record a valuation." action={<button type="button" className="secondary-button" onClick={()=>navigate('assets/new')}>Create asset <Plus size={15}/></button>}/>}
   </Box>
   <Box title="Drafts to review" extra={<button type="button" className="p3-text-link" onClick={()=>navigate('valuation-history')}>History <ArrowRight size={15}/></button>}>
    {drafts.length?drafts.slice(0,10).map(v=>{const a=store.records.find(x=>x.id===v.assetId);return a?<AssetRow key={v.id} asset={a} detail={nice(v.method)+' · '+day(v.date)} onClick={()=>navigate(link('valuations',v.id))}><strong className="p3-row-money">{fmt(v.amount,v.currency)}</strong><Tag value="DRAFT" tone="amber"/></AssetRow>:null}):<Empty title="No valuation drafts" description="Record a valuation with source and method, then review it locally." action={<button type="button" className="primary-button" onClick={()=>navigate('valuations/new')}>New draft <Plus size={15}/></button>}/>}
   </Box>
  </div><aside className="p3-stack"><Box title="Valuation workflow"><div className="p3-steps">{['Choose an acquired asset','Record effective date, method and value','Add evidence source and confidence','Review and locally accept a draft','Keep superseded valuations in history'].map((step,i)=><div key={step}><b>{String(i+1).padStart(2,'0')}</b><span>{step}</span></div>)}</div></Box>
   <Box title="Explore"><Btn onClick={()=>navigate('valuation-history')}>Valuation history</Btn><Btn onClick={()=>navigate('economics')}>Equity and performance</Btn></Box>
  </aside></div>
 </>
}
function ValuationNew(props:Props){
 const {store,navigate}=props
 const [assetId,setAssetId]=useState('')
 const [date,setDate]=useState(today())
 const [amount,setAmount]=useState('')
 const [method,setMethod]=useState<ValuationMethod>('MANUAL_ESTIMATE')
 const [source,setSource]=useState('')
 const [confidence,setConfidence]=useState<ValuationConfidence>('MEDIUM')
 const [notes,setNotes]=useState('')
 const [error,setError]=useState('')
 const asset=store.records.find(a=>a.id===assetId)
 const submit=(e:FormEvent)=>{e.preventDefault()
  const input:ValuationInput={assetId,date,amount:Number(amount),method,source,confidence,notes}
  change(props,()=>recordValuation(store,input),'Valuation draft saved; review it before acceptance.',
   ()=>navigate('valuation-history?asset='+encodeURIComponent(assetId)),setError)}
 return <>
  <H screen={23} title="Record a valuation" sub="Preserve a new append-only valuation draft with its method, effective date and evidence." back={()=>navigate('valuations')} actions={<Tag value="DRAFT" tone="amber"/>}/>
  <Notice>Draft entries do not alter the asset's current value until they are explicitly accepted. Accepted records here are local review markers, not verified external valuations.</Notice>
  <div className="p3-cols"><div className="p3-stack"><form onSubmit={submit}><Box title="Valuation details"><div className="p3-form">
   <div className="p3-span"><AssetSelect store={store} forEntry value={assetId} onChange={setAssetId}/></div>
   <label className="p3-field">Valuation effective date<input type="date" max={today()} value={date} onChange={e=>setDate(e.target.value)} required/></label>
   <label className="p3-field">Value ({asset?.currency||'asset currency'})<input type="number" min="0.01" step="0.01" placeholder="Enter value" value={amount} onChange={e=>setAmount(e.target.value)} required/></label>
   <label className="p3-field">Method<select value={method} onChange={e=>setMethod(e.target.value as ValuationMethod)}>{VALUATION_METHODS.map(m=><option key={m} value={m}>{nice(m)}</option>)}</select></label>
   <label className="p3-field">Confidence<select value={confidence} onChange={e=>setConfidence(e.target.value as ValuationConfidence)}>{['LOW','MEDIUM','HIGH'].map(c=><option key={c}>{c}</option>)}</select></label>
   <label className="p3-field p3-span">Evidence source label<input required maxLength={140} placeholder="e.g. sample appraisal, broker statement or manual source" value={source} onChange={e=>setSource(e.target.value)}/></label>
   <label className="p3-field p3-span">Assumptions / notes<textarea rows={4} maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Methodology, limitations and non-sensitive supporting context"/></label>
  </div><ErrorBox text={error}/><div className="p3-submit"><button type="button" className="secondary-button" onClick={()=>navigate('valuations')}>Cancel</button><button type="submit" className="primary-button"><FileCheck2 size={16}/> Save draft</button></div></Box></form></div>
   <aside className="p3-stack"><Box title="Current registry value">{asset?<div className="p3-aside-value"><strong>{fmt(asset.value,asset.currency)}</strong><small>Current browser snapshot as of {day(asset.valuationAsOf)}</small></div>:<Empty title="Select an asset" description="Only acquired, active and suspended assets can be valued."/>}</Box><Box title="Evidence requirements"><p className="p3-note">Include a method, source and valuation date. Sensitive report files must not be pasted into this public static prototype.</p></Box></aside>
  </div>
 </>
}
function ValuationDetail(props:Props){
 const {store,navigate}=props
 const id=props.path.split('/')[1]
 const v=store.phase3.valuations.find(x=>x.id===id)
 const a=store.records.find(x=>x.id===v?.assetId)
 const [accept,setAccept]=useState('')
 const [error,setError]=useState('')
 if(!v||!a)return <Empty title="Valuation unavailable" description="This valuation is not in the current browser workspace." action={<button className="secondary-button" type="button" onClick={()=>navigate('valuations')}>Back to valuations</button>}/>
 const previously=store.phase3.valuations.find(x=>x.id===v.supersedesId)
 return <>
  <H screen={22} title={'Valuation evidence · '+a.name} sub="Review an effective-dated valuation without overwriting prior evidence." back={()=>navigate('valuation-history?asset='+encodeURIComponent(a.id))} actions={<Tag value={v.status} tone={v.status==='ACCEPTED'?'green':v.status==='DRAFT'?'amber':'neutral'}/>}/>
  <Notice warning>Acceptance is only an internal preview state change. No professional valuer, financial institution or external system has approved this valuation.</Notice>
  <div className="p3-stats"><Stat title="Proposed value" value={fmt(v.amount,v.currency)} info="User-entered figure" icon={Wallet}/><Stat title="Effective" value={day(v.date)} info="Valuation effective date" icon={CalendarDays}/><Stat title="Confidence" value={nice(v.confidence)} info="Self-declared" icon={Scale}/><Stat title="Method" value={nice(v.method)} info="Source-dependent methodology" icon={TrendingUp}/></div>
  <div className="p3-cols"><div className="p3-stack"><Box title="Valuation record"><div className="p3-detail-fields"><Field name="Asset ID" value={a.number}/><Field name="Value" value={fmt(v.amount,v.currency)}/><Field name="Effective as of" value={day(v.date)}/><Field name="Evidence source" value={v.source}/><Field name="Method" value={nice(v.method)}/><Field name="Recorded" value={stamp(v.recordedAt)}/><Field name="Locally accepted at" value={v.acceptedAt?stamp(v.acceptedAt):'Not accepted'}/><Field name="Prior accepted record" value={previously?day(previously.date)+' — '+fmt(previously.amount,previously.currency):'None'}/></div><p className="p3-note">{v.notes||'No additional valuation assumptions recorded.'}</p></Box></div>
   <aside className="p3-stack"><Box title="Review actions">{v.status==='DRAFT'?<div className="p3-review"><p className="p3-note">Locally accepting updates this asset's current value and marks its previously accepted valuation as superseded. No external approval occurs.</p><label className="p3-field">Type ACCEPT<input autoComplete="off" value={accept} onChange={e=>setAccept(e.target.value)} placeholder="ACCEPT"/></label><button disabled={accept!=='ACCEPT'} className="primary-button" type="button" onClick={()=>change(props,()=>acceptValuation(store,v.id),'Valuation locally accepted and historic record preserved.',undefined,setError)}><CheckCircle2 size={16}/> Accept locally</button><ErrorBox text={error}/></div>:<div className="p3-review"><Tag value={v.status} tone={v.status==='ACCEPTED'?'green':'neutral'}/><p className="p3-note">This record cannot be edited. Create a new draft to supersede an accepted valuation.</p></div>}<Btn onClick={()=>navigate('valuations/new')}>New valuation draft</Btn><Btn onClick={()=>navigate('valuation-history?asset='+encodeURIComponent(a.id))}>All history</Btn></Box></aside>
  </div>
 </>
}
function RecordedTrend({values,currencyCode}:{values:Array<{date:string;amount:number;source:string}>;currencyCode:string}){
 const ordered=[...values].sort((a,b)=>a.date.localeCompare(b.date))
 if(!ordered.length)return <div className="p3-empty"><strong>No locally accepted history yet</strong><p>Review a draft to add an actual observation; no trend is fabricated.</p></div>
 const lo=Math.min(...ordered.map(x=>x.amount)),hi=Math.max(...ordered.map(x=>x.amount))
 const min=lo===hi?Math.max(0,lo*.8):lo
 const max=lo===hi?hi*1.2:hi
 const xy=ordered.map((p,i)=>({x:35+(ordered.length===1?285:i*570/(ordered.length-1)),y:200-165*(p.amount-min)/Math.max(1,max-min),...p}))
 const poly=xy.map(p=>p.x+','+p.y).join(' ')
 return <div className="p3-trend"><svg viewBox="0 0 640 235" role="img" aria-label={'Locally reviewed '+currencyCode+' valuation history with '+ordered.length+' entries'} preserveAspectRatio="xMidYMid meet">
  {[0,1,2,3].map(i=><line key={i} x1="35" x2="620" y1={25+i*56} y2={25+i*56} stroke="currentColor" opacity=".12"/>)}
  {xy.length>1&&<polyline points={poly} fill="none" stroke="#4e9fff" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>}
  {xy.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="5" fill="#70c0ff"><title>{p.date}: {fmt(p.amount,currencyCode)} — {p.source}</title></circle><text x={p.x} y="225" fill="currentColor" fontSize="11" textAnchor="middle">{p.date.slice(5)}</text></g>)}
 </svg><span>{ordered.length} user-entered reviewed valuation{ordered.length===1?'':'s'} · no interpolation beyond known dates</span></div>
}

function ValuationHistory(props:Props){
 const {store,navigate}=props
 const query=new URLSearchParams(props.path.split('?')[1]||'')
 const [assetId,setAssetId]=useState(query.get('asset')||'')
 const [status,setStatus]=useState('')
 const rows=store.phase3.valuations.filter(v=>(!assetId||v.assetId===assetId)&&(!status||v.status===status)).sort((a,b)=>b.date.localeCompare(a.date)||b.recordedAt.localeCompare(a.recordedAt))
 return <>
  <H screen={24} title="Valuation history & trends" sub="A transparent timeline of drafts, locally accepted valuations and superseded records." actions={<button type="button" className="primary-button" onClick={()=>navigate('valuations/new')}><Plus size={16}/> Add valuation</button>}/>
  <Notice>The chart and table below show only actual browser-entered valuations. No synthetic history or extrapolated performance is generated.</Notice>
  <Box title="Review filters"><div className="p3-filter-row"><label className="p3-field">Asset<select value={assetId} onChange={e=>setAssetId(e.target.value)}><option value="">All assets</option>{store.records.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className="p3-field">Review status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{['DRAFT','ACCEPTED','SUPERSEDED'].map(s=><option key={s}>{s}</option>)}</select></label><span className="p3-filter-meta">{rows.length} browser valuations</span></div></Box>
  {assetId&&<Box title="Observed valuation trend (local only)"><RecordedTrend currencyCode={store.records.find(a=>a.id===assetId)?.currency||'KES'} values={store.phase3.valuations.filter(v=>v.assetId===assetId&&v.status!=='DRAFT').map(v=>({date:v.date,amount:v.amount,source:v.source}))}/></Box>}
  <Box title="Historical valuation records">{rows.length?<div className="p3-scroll"><table className="p3-table"><thead><tr><th>ASSET</th><th>EFFECTIVE</th><th>VALUE</th><th>METHOD</th><th>STATUS</th><th></th></tr></thead><tbody>{rows.map(v=>{const a=store.records.find(a=>a.id===v.assetId);return <tr key={v.id}><td>{a?.name||'Unknown'}<small>{v.source}</small></td><td>{day(v.date)}</td><td className="p3-money">{fmt(v.amount,v.currency)}</td><td>{nice(v.method)}</td><td><Tag value={v.status} tone={v.status==='ACCEPTED'?'green':v.status==='DRAFT'?'amber':'neutral'}/></td><td><button type="button" className="p3-text-link" onClick={()=>navigate(link('valuations',v.id))}>Review <ArrowRight size={14}/></button></td></tr>})}</tbody></table></div>:<Empty title="No valuation entries" description="Valuations will appear only after they're entered; the application does not backfill a fictional price history." action={<button className="primary-button" type="button" onClick={()=>navigate('valuations/new')}>Record a valuation <Plus size={15}/></button>}/>}</Box>
 </>
}
function FinancingCenter(props:Props){
 const {store,navigate}=props
 const [creating,setCreating]=useState(false)
 const [assetId,setAssetId]=useState('')
 const [financier,setFinancier]=useState('')
 const [principal,setPrincipal]=useState('')
 const [rate,setRate]=useState('0')
 const [start,setStart]=useState(today())
 const [maturity,setMaturity]=useState('')
 const [frequency,setFrequency]=useState<FinancingInput['frequency']>('MONTHLY')
 const [reference,setReference]=useState('')
 const [notes,setNotes]=useState('')
 const [error,setError]=useState('')
 const asset=store.records.find(a=>a.id===assetId)
 const facilities=store.phase3.facilities
 const verifiedBalances=facilities.filter(f=>latestBalance(store,f.id)).length
 const submit=(e:FormEvent)=>{e.preventDefault();if(!asset)return setError('Choose an asset.')
  const input:FinancingInput={assetId:asset.id,financierLabel:financier,principal:Number(principal),interestRatePct:Number(rate),
    startOn:start,maturesOn:maturity||null,frequency,reference,notes}
  change(props,()=>createFacility(store,input),'Financing facility recorded. Add an observed outstanding balance to estimate equity.',()=>setCreating(false),setError)
 }
 return <>
  <H screen={25} title="Financing center" sub="Track financing facilities separately from observed outstanding balances and real payments." actions={<button type="button" className="primary-button" onClick={()=>setCreating(p=>!p)}><Plus size={16}/>{creating?'Close form':'Record facility'}</button>}/>
  <Notice warning>No lending application, payment, loan servicing or Finance OS posting occurs here. Facility principals are not assumed to equal current outstanding debt.</Notice>
  <div className="p3-stats"><Stat title="Facilities" value={String(facilities.length)} info="Locally recorded terms" icon={Landmark}/><Stat title="With balance observations" value={String(verifiedBalances)} info="Manual snapshots; not lender verified" icon={FileCheck2}/><Stat title="Balance unknown" value={String(facilities.length-verifiedBalances)} info="Excluded from equity derivations" icon={AlertCircle}/><Stat title="Assets financed" value={String(new Set(facilities.map(f=>f.assetId)).size)} info="No cross-asset debt deduplication" icon={Layers3}/></div>
  {creating&&<form onSubmit={submit} className="p3-financing-form"><Box title="Record financing facility"><div className="p3-form">
   <div className="p3-span"><AssetSelect store={store} forEntry value={assetId} onChange={setAssetId}/></div>
   <label className="p3-field">Financier label<input value={financier} required maxLength={130} placeholder="Example lender (not verified)" onChange={e=>setFinancier(e.target.value)}/></label>
   <label className="p3-field">Original principal ({asset?.currency||'currency'})<input value={principal} min="0.01" step="0.01" type="number" required onChange={e=>setPrincipal(e.target.value)}/></label>
   <label className="p3-field">Interest rate (%)<input value={rate} min="0" max="1000" step="0.01" type="number" onChange={e=>setRate(e.target.value)}/></label>
   <label className="p3-field">Frequency<select value={frequency} onChange={e=>setFrequency(e.target.value as FinancingInput['frequency'])}>{['MONTHLY','QUARTERLY','ANNUALLY','OTHER'].map(f=><option key={f}>{f}</option>)}</select></label>
   <label className="p3-field">Start date<input type="date" max={today()} value={start} onChange={e=>setStart(e.target.value)}/></label>
   <label className="p3-field">Maturity date (optional)<input type="date" value={maturity} onChange={e=>setMaturity(e.target.value)}/></label>
   <label className="p3-field">External reference (optional)<input maxLength={120} value={reference} onChange={e=>setReference(e.target.value)}/></label>
   <label className="p3-field p3-span">Notes<textarea rows={2} maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
  </div><ErrorBox text={error}/><div className="p3-submit"><button className="secondary-button" type="button" onClick={()=>setCreating(false)}>Cancel</button><button className="primary-button" type="submit"><CheckCircle2 size={16}/> Record facility</button></div></Box></form>}
  <Box title="Recorded facilities">{facilities.length?facilities.map(f=>{const a=store.records.find(a=>a.id===f.assetId);const b=latestBalance(store,f.id);return a?<AssetRow key={f.id} asset={a} detail={f.financierLabel+' · '+nice(f.frequency)} onClick={()=>navigate(link('financing',f.id))}><span className="p3-loan-line">Principal {fmt(f.principal,f.currency)}<small>Observed debt: {b?fmt(b.balance,b.currency):'Unknown'}</small></span></AssetRow>:null}):<Empty title="No financing facilities" description="Create a facility before adding its dated outstanding balance observations." action={<button type="button" className="secondary-button" onClick={()=>setCreating(true)}>Create facility <Plus size={15}/></button>}/>}</Box>
 </>
}
function FinancingDetail(props:Props){
 const {store,navigate}=props; const id=props.path.split('/')[1]
 const facility=store.phase3.facilities.find(f=>f.id===id)
 const a=store.records.find(a=>a.id===facility?.assetId)
 const [date,setDate]=useState(today()),[balance,setBalance]=useState(''),[source,setSource]=useState(''),[notes,setNotes]=useState(''),[error,setError]=useState('')
 if(!facility||!a)return <Empty title="Facility not found" description="The selected facility is not available in this browser." action={<button className="secondary-button" type="button" onClick={()=>navigate('financing')}>Back to financing</button>}/>
 const observed=store.phase3.balances.filter(b=>b.facilityId===id).sort((x,y)=>y.observedOn.localeCompare(x.observedOn)||y.recordedAt.localeCompare(x.recordedAt))
 const latest=latestBalance(store,id)
 const submit=(e:FormEvent)=>{e.preventDefault()
  change(props,()=>observeBalance(store,{facilityId:id,observedOn:date,balance:Number(balance),sourceLabel:source,notes}),
   'Balance observation recorded locally. This is not a verified lender balance.',()=>{setBalance('');setSource('');setNotes('')},setError)
 }
 return <>
  <H screen={26} title={a.name+' — financing'} sub="Financing terms, manually recorded balance snapshots and observed-debt equity." back={()=>navigate('financing')} actions={<Tag value="Unverified source" tone="amber"/>}/>
  <Notice>Balances may exceed the original principal through interest and fees. Snapshot values are unverified. No repayment, interest calculation or finance ledger is generated.</Notice>
  <div className="p3-stats"><Stat title="Original principal" value={fmt(facility.principal,facility.currency)} info="Not current debt" icon={Landmark}/><Stat title="Latest balance" value={latest?fmt(latest.balance,latest.currency):'Unknown'} info={latest?'As of '+day(latest.observedOn):'No observed balance'} icon={Wallet}/><Stat title="Stated interest" value={facility.interestRatePct+'%'} info="User-provided facility term" icon={TrendingUp}/><Stat title="Term" value={facility.maturesOn?day(facility.maturesOn):'Open'} info={nice(facility.frequency)} icon={CalendarDays}/></div>
  <div className="p3-cols"><div className="p3-stack">
   <Box title="Balance history">{observed.length?observed.map(b=><div className="p3-record-row" key={b.id}><span className="p3-row-glyph"><Wallet size={17}/></span><div><strong>{fmt(b.balance,b.currency)}</strong><small>{day(b.observedOn)} · {b.sourceLabel}</small></div><Tag value="manual snapshot" tone="amber"/></div>):<Empty title="No balance observations yet" description="Principal is not assumed to equal outstanding debt. Record a dated observation to inform the equity estimate."/>}</Box>
   <Box title="Facility details"><div className="p3-detail-fields"><Field name="Financier label" value={facility.financierLabel}/><Field name="Start date" value={day(facility.startOn)}/><Field name="Maturity" value={facility.maturesOn?day(facility.maturesOn):'Not provided'}/><Field name="Reference" value={facility.reference||'Not provided'}/><Field name="Frequency" value={nice(facility.frequency)}/><Field name="Recorded at" value={stamp(facility.recordedAt)}/></div><p className="p3-note">{facility.notes||'No explanatory notes recorded.'}</p></Box>
  </div><aside className="p3-stack">
   <form onSubmit={submit}><Box title="Record balance snapshot"><div className="p3-aside-form"><label className="p3-field">Observation date<input type="date" min={facility.startOn} max={today()} value={date} onChange={e=>setDate(e.target.value)}/></label><label className="p3-field">Outstanding ({facility.currency})<input type="number" min="0" step="0.01" value={balance} required onChange={e=>setBalance(e.target.value)}/></label><label className="p3-field">Source label<input required maxLength={130} placeholder="Example lender statement" value={source} onChange={e=>setSource(e.target.value)}/></label><label className="p3-field">Notes<textarea rows={2} value={notes} maxLength={400} onChange={e=>setNotes(e.target.value)}/></label><ErrorBox text={error}/><button type="submit" className="primary-button"><Plus size={16}/> Add observation</button></div></Box></form>
   <Box title="Next step"><Btn onClick={()=>navigate('economics?asset='+encodeURIComponent(a.id))}>Review indicative equity</Btn><Btn onClick={()=>navigate('cash-flow?asset='+encodeURIComponent(a.id))}>Inspect cash-flow entries</Btn></Box>
  </aside></div>
 </>
}
function MoneyEntry(props:Props){
 const {store,navigate}=props
 const [adding,setAdding]=useState(false)
 const [type,setType]=useState<FlowType>('INCOME')
 const [category,setCategory]=useState(FLOW_CATEGORIES.INCOME[0])
 const [assetId,setAssetId]=useState('')
 const [amount,setAmount]=useState('')
 const [date,setDate]=useState(today())
 const [party,setParty]=useState(''),[notes,setNotes]=useState(''),[error,setError]=useState('')
 const [categoryFilter,setCategoryFilter]=useState(''),[assetFilter,setAssetFilter]=useState('')
 const rows=flowsFor(store,assetFilter||undefined).filter(f=>!categoryFilter||f.type===categoryFilter)
 const kes=flowSummary(rows,'KES')
 const selected=store.records.find(a=>a.id===assetId)
 const submit=(e:FormEvent)=>{e.preventDefault()
  const entry:CashFlowInput={assetId,type,category,amount:Number(amount),occurredOn:date,counterpartyLabel:party,notes}
  change(props,()=>recordFlow(store,entry),'Cash-flow entry recorded. Finance OS reconciliation remains unverified.',()=>{setAdding(false);setAmount('');setNotes('')},setError)
 }
 return <>
  <H screen={27} title="Asset income & expenses" sub="Record categorized asset cash movements with explicit source and currency boundaries." actions={<button type="button" className="primary-button" onClick={()=>setAdding(p=>!p)}><Plus size={16}/>{adding?'Close form':'Record entry'}</button>}/>
  <Notice warning>All entries are manual declarations, not payments or bank transactions. Acquisitions, disposals and financing records are not automatically double-counted as cash movements.</Notice>
  <div className="p3-stats"><Stat title="KES income" value={fmt(kes.INCOME,'KES')} info="Unverified user entries" icon={ArrowUpRight}/><Stat title="KES expenses" value={fmt(kes.EXPENSE,'KES')} info="Unverified user entries" icon={Receipt}/><Stat title="KES capital outlay" value={fmt(kes.CAPEX,'KES')} info="Tracked separately" icon={Coins}/><Stat title="Local entries" value={String(rows.length)} info="All currencies; no FX aggregation" icon={BookOpen}/></div>
  {adding&&<form onSubmit={submit}><Box title="Record a cash-flow entry"><div className="p3-form">
   <div className="p3-span"><AssetSelect store={store} forEntry value={assetId} onChange={setAssetId}/></div>
   <label className="p3-field">Flow type<select value={type} onChange={e=>{const x=e.target.value as FlowType;setType(x);setCategory(FLOW_CATEGORIES[x][0])}}>{FLOW_TYPES.map(f=><option key={f} value={f}>{nice(f)}</option>)}</select></label>
   <label className="p3-field">Category<select value={category} onChange={e=>setCategory(e.target.value)}>{FLOW_CATEGORIES[type].map(c=><option key={c}>{c}</option>)}</select></label>
   <label className="p3-field">Amount ({selected?.currency||'asset currency'})<input value={amount} type="number" step="0.01" min="0.01" onChange={e=>setAmount(e.target.value)} required/></label>
   <label className="p3-field">Occurred on<input value={date} max={today()} type="date" onChange={e=>setDate(e.target.value)}/></label>
   <label className="p3-field">Counterparty (optional label)<input maxLength={120} value={party} onChange={e=>setParty(e.target.value)}/></label>
   <label className="p3-field p3-span">Notes<textarea rows={2} maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
  </div><ErrorBox text={error}/><div className="p3-submit"><button type="button" className="secondary-button" onClick={()=>setAdding(false)}>Cancel</button><button type="submit" className="primary-button"><CheckCircle2 size={16}/> Save entry</button></div></Box></form>}
  <Box title="Cash movement register" extra={<button className="p3-text-link" type="button" onClick={()=>navigate('reconciliation')}>Reconciliation <ArrowRight size={15}/></button>}>
   <div className="p3-filter-row"><label className="p3-field">Asset<select value={assetFilter} onChange={e=>setAssetFilter(e.target.value)}><option value="">All assets</option>{store.records.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className="p3-field">Type<select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="">All types</option>{FLOW_TYPES.map(t=><option key={t} value={t}>{nice(t)}</option>)}</select></label></div>
   {rows.length?<div className="p3-scroll"><table className="p3-table"><thead><tr><th>DATE / ASSET</th><th>TYPE</th><th>CATEGORY</th><th>AMOUNT</th><th>REFERENCE</th></tr></thead><tbody>{rows.map(f=>{const a=store.records.find(x=>x.id===f.assetId),ref=referenceFor(store,f.id);return <tr key={f.id}><td>{day(f.occurredOn)}<small>{a?.name||f.assetId}</small></td><td><Tag value={f.type} tone={f.type==='INCOME'?'green':f.type==='EXPENSE'?'red':'blue'}/></td><td>{f.category}</td><td className="p3-money">{fmt(f.amount,f.currency)}</td><td><Tag value={ref?'REFERENCE ATTACHED':'UNREFERENCED'} tone={ref?'blue':'amber'}/></td></tr>})}</tbody></table></div>:<Empty title="No recorded cash movements" description="Add a local income, expense, capital or financing flow to begin the financial history." action={<button type="button" className="primary-button" onClick={()=>setAdding(true)}>Record entry <Plus size={15}/></button>}/>}
  </Box>
 </>
}
function CashFlow(props:Props){
 const {store,navigate}=props
 const query=new URLSearchParams(props.path.split('?')[1]||'')
 const [assetId,setAssetId]=useState(query.get('asset')||'')
 const [currencyCode,setCurrencyCode]=useState('KES')
 const [from,setFrom]=useState(''),[to,setTo]=useState('')
 const selected=assetId?store.records.find(a=>a.id===assetId):undefined
 const code=selected?.currency||currencyCode
 const all=flowsFor(store,assetId||undefined)
 const totals=flowSummary(all,code,from,to)
 const months=cashTimeline(all,code,from,to)
 const max=Math.max(1,...months.map(m=>Math.max(m.INCOME,m.EXPENSE,m.CAPEX)))
 return <>
  <H screen={28} title="Cash flow & yield" sub="Actual browser-entered flow periods, with financing movements separated from operating cash flow." actions={<button className="primary-button" type="button" onClick={()=>navigate('income-expenses')}><Plus size={16}/> Record cash movement</button>}/>
  <Notice>Operating net = income − expenses. Free cash = operating net − capital outlay. Total net also includes financing inflows/outflows. These are manual entries and not ledger-verified values.</Notice>
  <Box title="Date & currency context"><div className="p3-filter-row"><div className="p3-select-wide"><AssetSelect store={store} value={assetId} onChange={setAssetId}/></div>{!assetId&&<label className="p3-field">Currency<select value={currencyCode} onChange={e=>setCurrencyCode(e.target.value)}>{[...new Set(['KES',...store.records.map(a=>a.currency)])].map(c=><option key={c}>{c}</option>)}</select></label>}<label className="p3-field">From<input type="date" value={from} max={today()} onChange={e=>setFrom(e.target.value)}/></label><label className="p3-field">To<input type="date" value={to} max={today()} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label></div></Box>
  <div className="p3-stats"><Stat title="Operating net" value={fmt(totals.operatingNet,code)} info="Income minus expenses" icon={TrendingUp}/><Stat title="Capital outlay" value={fmt(totals.CAPEX,code)} info="Tracked separately" icon={Coins}/><Stat title="Free cash" value={fmt(totals.freeCash,code)} info="Before financing movements" icon={Wallet}/><Stat title="Total net movements" value={fmt(totals.totalNet,code)} info="Includes financing entries" icon={Activity}/></div>
  <div className="p3-cols"><div className="p3-stack"><Box title="Monthly recorded movements">{months.length?<div className="p3-chart">{months.map(m=><div className="p3-month" key={m.month}><div className="p3-bars"><span title={'Income: '+fmt(m.INCOME,code)} style={{height:Math.max(2,m.INCOME/max*100)+'%'}}/><span title={'Expenses: '+fmt(m.EXPENSE,code)} style={{height:Math.max(2,m.EXPENSE/max*100)+'%'}}/><span title={'Capital: '+fmt(m.CAPEX,code)} style={{height:Math.max(2,m.CAPEX/max*100)+'%'}}/></div><small>{m.month}</small></div>)}</div>:<Empty title="No recorded monthly history" description="The graph is deliberately empty until actual cash-flow records are entered."/>}<div className="p3-legend"><span><i className="income"/>Income</span><span><i className="expense"/>Expense</span><span><i className="capex"/>Capital</span></div></Box>
   <Box title="Monthly breakdown">{months.length?months.map(m=><div className="p3-month-row" key={m.month}><strong>{m.month}</strong><span>Income {fmt(m.INCOME,code)}</span><span>Expense {fmt(m.EXPENSE,code)}</span><b>Net {fmt(m.totalNet,code)}</b></div>):<Empty title="No movements in this interval" description="Adjust the filters or record a cash movement."/>}</Box>
  </div><aside className="p3-stack"><Box title="Cash flow components"><div className="p3-detail-fields"><Field name="Income" value={fmt(totals.INCOME,code)}/><Field name="Expenses" value={fmt(totals.EXPENSE,code)}/><Field name="Capital" value={fmt(totals.CAPEX,code)}/><Field name="Financing inflows" value={fmt(totals.FINANCING_INFLOW,code)}/><Field name="Financing outflows" value={fmt(totals.FINANCING_OUTFLOW,code)}/><Field name="Records" value={String(totals.count)}/></div></Box><Box title="Related workspace"><Btn onClick={()=>navigate('economics')}>Equity and ROI</Btn><Btn onClick={()=>navigate('reconciliation')}>External references</Btn></Box></aside></div>
 </>
}
function Economics(props:Props){
 const {store,navigate}=props
 const query=new URLSearchParams(props.path.split('?')[1]||'')
 const [assetId,setAssetId]=useState(query.get('asset')||'')
 const assets=assetId?store.records.filter(a=>a.id===assetId):store.records
 return <>
  <H screen={29} title="Equity, ROI & performance" sub="Separate outstanding debt observations, registry valuation, operating cash returns and capital performance." actions={<button type="button" className="secondary-button" onClick={()=>navigate('cash-flow')}><ChartColumnIncreasing size={16}/> Cash flow</button>}/>
  <Notice warning>Equity and ROI here are indicative calculations only. Cash-on-cost excludes financing movements and does not account for taxes, time weighting, currency conversion, depreciation or accounting adjustments. Unknown cost basis produces no ROI.</Notice>
  <Box title="Analyze portfolio or individual asset"><div className="p3-filter-row p3-select-wide"><AssetSelect store={store} value={assetId} onChange={setAssetId}/></div></Box>
  <div className="p3-performance-grid">{assets.map(a=>{const e=indicativeEquity(store,a.id),debt=outstandingForAsset(store,a.id),roi=roiSnapshot(store,a.id),accepted=latestAccepted(store,a.id)
    return <article className="p3-perf-card" key={a.id}><div className="p3-perf-head"><div><span className="eyebrow">{a.number} · {a.category}</span><h2>{a.name}</h2></div><Tag value={a.lifecycle} tone={a.lifecycle==='ACTIVE'?'green':'neutral'}/></div>
      <div className="p3-detail-fields"><Field name="Current registry value" value={fmt(a.value,a.currency)}/><Field name="Indicative equity" value={e.method==='UNKNOWN'?'Unknown (no observed debt)':fmt(e.amount,a.currency)}/><Field name="Recorded debt balance" value={debt===null?'Unknown':fmt(debt,a.currency)}/><Field name="Acquisition cost basis" value={roi.basis===null?'Not recorded':fmt(roi.basis,a.currency)}/><Field name="Operating cash-on-cost" value={roi.operatingReturn===null?'Insufficient cost data':roi.operatingReturn.toFixed(2)+'%'}/><Field name="Unrealized value vs basis" value={roi.capitalReturn===null?'Insufficient cost data':roi.capitalReturn.toFixed(2)+'%'} /></div>
      <div className="p3-perf-note">{accepted?'Locally accepted valuation dated '+day(accepted.date):'No reviewed valuation; registry value is unverified.'} {e.method==='REGISTRY_MANUAL'?'Equity is manually entered.':e.method==='OBSERVED_DEBT'?'Equity uses observed loan balances.':'Balance observations are incomplete.'}</div>
      <div className="p3-perf-actions"><button type="button" onClick={()=>navigate('valuation-history?asset='+encodeURIComponent(a.id))}>Valuations <ArrowRight size={15}/></button><button type="button" onClick={()=>navigate('cash-flow?asset='+encodeURIComponent(a.id))}>Cash flow <ArrowRight size={15}/></button></div>
    </article>})}</div>
  {!assets.length&&<Empty title="No assets to analyze" description="Select a valid asset or visit the registry."/>}
 </>
}
function Reconciliation(props:Props){
 const {store,navigate}=props
 const [id,setId]=useState('')
 const [system,setSystem]=useState<'FINANCE_OS'|'BANK'|'OTHER'>('FINANCE_OS')
 const [reference,setReference]=useState(''),[note,setNote]=useState(''),[error,setError]=useState('')
 const [filter,setFilter]=useState<'ALL'|'UNREFERENCED'|'REFERENCE_ATTACHED'>('ALL')
 const summary=reconciliationSummary(store)
 const flow=store.phase3.flows.find(f=>f.id===id)
 const rows=flowsFor(store).filter(f=>filter==='ALL'||(filter==='UNREFERENCED'?!referenceFor(store,f.id):Boolean(referenceFor(store,f.id))))
 const submit=(e:FormEvent)=>{e.preventDefault()
  change(props,()=>attachReference(store,{flowId:id,system,reference,note}),
   'Reference attached locally. No real transaction verification occurred.',()=>{setId('');setReference('');setNote('')},setError)
 }
 return <>
  <H screen={30} title="Finance reconciliation" sub="Attach external transaction references while keeping verification authority with Finance OS." actions={<button className="primary-button" type="button" onClick={()=>navigate('income-expenses')}><Plus size={16}/> Record flow</button>}/>
  <Notice warning>This page never asserts a bank or Finance OS match. Reference attached ≠ reconciled or verified. No external API is connected; verified count remains zero until backend integration.</Notice>
  <div className="p3-stats"><Stat title="Local flows" value={String(summary.total)} info="Manually entered entries" icon={Receipt}/><Stat title="Unreferenced" value={String(summary.unreferenced)} info="No external reference" icon={AlertCircle}/><Stat title="Reference attached" value={String(summary.attached)} info="Not verified" icon={Link2}/><Stat title="Verified matches" value={String(summary.verified)} info="Requires Finance OS integration" icon={FileCheck2}/></div>
  <div className="p3-cols"><div className="p3-stack"><Box title="Reconciliation worklist" extra={<div className="p3-tabs">{(['ALL','UNREFERENCED','REFERENCE_ATTACHED'] as const).map(x=><button type="button" key={x} aria-pressed={filter===x} className={filter===x?'selected':''} onClick={()=>setFilter(x)}>{nice(x)}</button>)}</div>}>
    {rows.length?rows.map(f=>{const a=store.records.find(x=>x.id===f.assetId),r=referenceFor(store,f.id);return <div className="p3-reconcile-row" key={f.id}><div><strong>{a?.name||'Unknown'} · {nice(f.type)}</strong><small>{day(f.occurredOn)} · {f.category} · {fmt(f.amount,f.currency)}</small><small>{r?r.system+' · '+r.reference:'No reference attached'}</small></div><Tag value={r?'REFERENCE ATTACHED':'UNREFERENCED'} tone={r?'blue':'amber'}/>{!r&&<button type="button" className="p3-small-btn" onClick={()=>{setId(f.id);setError('')}}>Attach <Link2 size={14}/></button>}</div>}):<Empty title="No flows to reconcile" description="Add a local cash movement to begin reference mapping." action={<button className="secondary-button" type="button" onClick={()=>navigate('income-expenses')}>Open income & expenses</button>}/>}
  </Box></div><aside className="p3-stack"><Box title="Attach reference">{flow?<form onSubmit={submit} className="p3-aside-form"><span className="p3-current-flow">{fmt(flow.amount,flow.currency)} · {nice(flow.type)}</span><label className="p3-field">Reference source<select value={system} onChange={e=>setSystem(e.target.value as typeof system)}><option value="FINANCE_OS">Finance OS reference</option><option value="BANK">Bank reference</option><option value="OTHER">Other reference</option></select></label><label className="p3-field">Transaction reference<input required maxLength={140} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Non-sensitive external ID"/></label><label className="p3-field">Notes<textarea maxLength={400} rows={3} value={note} onChange={e=>setNote(e.target.value)}/></label><ErrorBox text={error}/><button type="submit" className="primary-button"><Link2 size={16}/> Attach reference</button><button className="secondary-button" type="button" onClick={()=>setId('')}>Cancel</button></form>:<Empty title="Choose an unreferenced entry" description="Select Attach from the worklist. An attached reference is not independently validated."/>}</Box>
   <Box title="Future verification contract"><p className="p3-note">A later Finance OS adapter must verify transaction IDs, posted amounts, currencies, value dates and matching authority. Only that adapter may advance a reference to a verified match.</p></Box></aside></div>
 </>
}
export function EconomicsExperience(props:Props){
 const route=props.path.split('?')[0]
 if(route==='valuations')return <ValuationCenter {...props}/>
 if(route==='valuations/new')return <ValuationNew {...props}/>
 if(route.startsWith('valuations/'))return <ValuationDetail {...props}/>
 if(route==='valuation-history')return <ValuationHistory {...props}/>
 if(route==='financing')return <FinancingCenter {...props}/>
 if(route.startsWith('financing/'))return <FinancingDetail {...props}/>
 if(route==='income-expenses')return <MoneyEntry {...props}/>
 if(route==='cash-flow')return <CashFlow {...props}/>
 if(route==='economics')return <Economics {...props}/>
 if(route==='reconciliation')return <Reconciliation {...props}/>
 return <Empty title="Financial screen not found" description="Open the valuation center or economics workspace." action={<button className="secondary-button" type="button" onClick={()=>props.navigate('valuations')}>Valuation center <ArrowRight size={15}/></button>}/>
}
