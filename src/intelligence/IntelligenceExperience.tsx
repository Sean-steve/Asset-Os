import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
 Activity, AlertTriangle, ArrowLeft, ArrowRight, BarChart3, Bot, BrainCircuit,
 CheckCircle2, ChevronRight, CircleHelp, Coins, FileText,
 Gauge, History, Layers3, Lightbulb, Plus, Scale, Search, ShieldAlert,
 ShieldCheck, Sparkles, TrendingDown, TrendingUp, Wallet, type LucideIcon
} from 'lucide-react'
import type { AssetRecord, RegistryState } from '../registry/core'
import { flowSummary, flowsFor, latestAccepted, roiSnapshot } from '../economics/core'
import {
 addMember, allocation, appendIntelligenceNote, archivePortfolio, assessRisk, assistantAnswer,
 calculateScenario, compareAssets, createPortfolio, DEFAULT_RISK_SCORES, explainableInsights,
 held, latestRisk, membersFor, performanceSignals, portfolioSnapshot, removeMember,
 riskBand, RISK_DIMENSIONS, riskScore, saveScenario, type AllocationGroup,
 type RiskDimension, type RiskScores, type ScenarioInput
} from './core'
import './intelligence.css'

type Props={path:string;store:RegistryState;onChange:(s:RegistryState)=>void;navigate:(path:string)=>void;report:(message:string)=>void}
const today=()=>new Date().toISOString().slice(0,10)
const nice=(s:string)=>s.toLowerCase().replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
const money=(n:number,c:string)=>new Intl.NumberFormat('en-KE',{style:'currency',currency:c,maximumFractionDigits:2}).format(n)
const day=(d:string)=>d?new Date(d+'T00:00:00Z').toLocaleDateString('en-KE',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}):'—'
const url=(r:string,id:string)=>r+'/'+encodeURIComponent(id)
const allCurrencies=(s:RegistryState)=>[...new Set(['KES',...s.records.map(a=>a.currency)])]
function Header({num,title,sub,actions,back}:{num:number;title:string;sub:string;actions?:ReactNode;back?:()=>void}){
 return <div className="p5-header"><div className="p5-heading">{back&&<button className="p5-back" aria-label="Back" type="button" onClick={back}><ArrowLeft size={17}/></button>}<div><span className="eyebrow">SCREEN {num} / ASSET INTELLIGENCE</span><h1>{title}</h1><p>{sub}</p></div></div><div className="p5-header-actions">{actions}</div></div>
}
function Box({title,children,extra,className=''}:{title:string;children:ReactNode;extra?:ReactNode;className?:string}){
 return <section className={'p5-box '+className}><header><h2>{title}</h2>{extra}</header>{children}</section>
}
function Notice({children,warn=false}:{children:ReactNode;warn?:boolean}){
 return <div className={'p5-notice '+(warn?'warn':'')}><ShieldAlert size={17}/><span>{children}</span></div>
}
function Pill({text,tone='neutral'}:{text:string;tone?:'neutral'|'blue'|'green'|'amber'|'red'}){
 return <span className={'p5-pill '+tone}>{nice(text)}</span>
}
function Empty({title,description,action}:{title:string;description:string;action?:ReactNode}){
 return <div className="p5-empty"><span><Layers3 size={28}/></span><strong>{title}</strong><p>{description}</p>{action}</div>
}
function Stat({icon:Icon,label,value,hint}:{icon:LucideIcon;label:string;value:string;hint:string}){
 return <article className="p5-stat"><div><span>{label}</span><Icon size={19}/></div><strong>{value}</strong><small>{hint}</small></article>
}
function ErrorBox({value}:{value:string}){return value?<div role="alert" className="p5-error"><AlertTriangle size={17}/>{value}</div>:null}
function LinkAction({title,description,icon:Icon,onClick}:{title:string;description:string;icon:LucideIcon;onClick:()=>void}){
 return <button type="button" className="p5-link-action" onClick={onClick}><span className="p5-glyph"><Icon size={18}/></span><span><strong>{title}</strong><small>{description}</small></span><ArrowRight size={16}/></button>
}
function AssetSelect({store,value,onChange}:{store:RegistryState;value:string;onChange:(s:string)=>void}){
 return <label className="p5-field">Asset<select aria-label="Asset" value={value} required onChange={e=>onChange(e.target.value)}><option value="">Select an asset...</option>{store.records.filter(held).map(a=><option key={a.id} value={a.id}>{a.number} · {a.name} ({a.currency})</option>)}</select></label>
}
function Field({label,value}:{label:string;value:string}){return <div className="p5-detail-field"><span>{label}</span><strong>{value}</strong></div>}
function AssetRow({asset,detail,extra,onClick}:{asset:AssetRecord;detail:string;extra?:ReactNode;onClick:()=>void}){
 return <div className="p5-asset-row"><span className="p5-glyph"><Layers3 size={18}/></span><div className="p5-asset-name"><strong>{asset.name}</strong><small>{asset.number} · {detail}</small></div>{extra}<button type="button" className="p5-open" aria-label={'Open '+asset.name} onClick={onClick}><ChevronRight size={17}/></button></div>
}
function apply(props:Props,fn:()=>RegistryState,message:string,setError?:(e:string)=>void,after?:()=>void){
 try{const next=fn();props.onChange(next);props.report(message);setError?.('');after?.()}
 catch(error){setError?.(error instanceof Error?error.message:'Operation not completed.')}
}
function Portfolios(props:Props){
 const {store,navigate}=props
 const [form,setForm]=useState(false),[name,setName]=useState(''),[description,setDescription]=useState(''),[currency,setCurrency]=useState('KES'),[error,setError]=useState('')
 const portfolios=store.phase5.portfolios.filter(p=>!p.archivedAt)
 const submit=(e:FormEvent)=>{e.preventDefault();apply(props,()=>createPortfolio(store,{name,description,currency}),
   'Local portfolio created; add assets to analyze it.',setError,()=>{setForm(false);setName('');setDescription('')})}
 return <>
  <Header num={41} title="Portfolio directory" sub="Group currently held assets without transferring ownership or mixing different currencies."
   actions={<button className="primary-button" type="button" onClick={()=>setForm(x=>!x)}><Plus size={16}/> {form?'Close':'Create portfolio'}</button>}/>
  <Notice warn>Portfolios are browser-local analytical collections. An asset can be in more than one portfolio; portfolio totals must not be added together as if holdings were unique across portfolios.</Notice>
  <div className="p5-stats"><Stat icon={Wallet} label="Active portfolios" value={String(portfolios.length)} hint="Local analytical groups"/><Stat icon={Layers3} label="Unique grouped assets" value={String(new Set(store.phase5.memberships.filter(m=>m.removedAt===null).map(m=>m.assetId)).size)} hint="Across portfolio memberships"/><Stat icon={Coins} label="Portfolio currencies" value={String(new Set(portfolios.map(p=>p.currency)).size)} hint="No implicit exchange rates"/><Stat icon={History} label="Archived portfolios" value={String(store.phase5.portfolios.filter(p=>p.archivedAt).length)} hint="Historical membership retained"/></div>
  {form&&<form onSubmit={submit}><Box title="Create an analytical portfolio"><div className="p5-form"><label className="p5-field">Portfolio name<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Personal rental properties"/></label><label className="p5-field">Reporting currency<select value={currency} onChange={e=>setCurrency(e.target.value)}>{allCurrencies(store).map(c=><option key={c}>{c}</option>)}</select></label><label className="p5-field p5-wide">Purpose & scope<textarea rows={3} maxLength={500} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Which assets and questions should this portfolio cover?"/></label></div><ErrorBox value={error}/><div className="p5-submit"><button type="button" className="secondary-button" onClick={()=>setForm(false)}>Cancel</button><button className="primary-button" type="submit"><CheckCircle2 size={16}/> Create portfolio</button></div></Box></form>}
  <div className="p5-two"><div className="p5-stack"><Box title="Your portfolios">{portfolios.length?portfolios.map(p=>{const s=portfolioSnapshot(store,p.id);return <div className="p5-portfolio-row" key={p.id}><span className="p5-glyph"><Wallet size={19}/></span><div><strong>{p.name}</strong><small>{p.description||'No description'} · {s.assets.length} active asset(s)</small></div><span className="p5-money">{money(s.totalValue,p.currency)}</span><button type="button" className="p5-open" onClick={()=>navigate(url('portfolio',p.id))} aria-label={'Open portfolio '+p.name}><ChevronRight size={17}/></button></div>}):<Empty title="No portfolios yet" description="Create a currency-specific portfolio and attach currently held assets. Seed assets are not assigned automatically." action={<button type="button" className="primary-button" onClick={()=>setForm(true)}><Plus size={16}/> Create your first portfolio</button>}/>}</Box></div>
   <aside className="p5-stack"><Box title="Portfolio workflow"><div className="p5-steps">{['Create a portfolio and choose its currency','Add acquired or active assets in that currency','Review allocation and concentration','Compare assets and record risk assessments','Explore assumptions, never automatic trades'].map((t,i)=><div key={t}><b>{String(i+1).padStart(2,'0')}</b><span>{t}</span></div>)}</div></Box><Box title="Analysis tools"><LinkAction title="Allocation" description="Category, location, lifecycle and risk labels" icon={BarChart3} onClick={()=>navigate('allocation')}/><LinkAction title="Compare assets" description="Like-for-like valuation and returns" icon={Scale} onClick={()=>navigate('comparison')}/></Box></aside></div>
 </>
}
function PortfolioDetail(props:Props){
 const {store,navigate}=props,id=decodeURIComponent(props.path.split('/')[1]||'')
 const portfolio=store.phase5.portfolios.find(p=>p.id===id)
 const [assetId,setAssetId]=useState(''),[error,setError]=useState('')
 if(!portfolio)return <Empty title="Portfolio not found" description="This portfolio does not exist in the current browser workspace." action={<button className="secondary-button" type="button" onClick={()=>navigate('portfolios')}>Return to portfolios</button>}/>
 const s=portfolioSnapshot(store,id)
 const eligible=store.records.filter(a=>held(a)&&a.currency===portfolio.currency&&!s.assets.some(b=>b.id===a.id))
 const archived=Boolean(portfolio.archivedAt)
 return <>
  <Header num={42} title={portfolio.name} sub={portfolio.description||'Portfolio asset membership, value and operations.'} back={()=>navigate('portfolios')} actions={<Pill text={archived?'ARCHIVED':'ACTIVE'} tone={archived?'neutral':'green'}/>}/>
  <Notice>Values are registry snapshots; equity is indicative and missing loan observations may make it incomplete. Adding or removing an asset here never alters its ownership or legal title.</Notice>
  <div className="p5-stats"><Stat icon={Layers3} label="Assets held" value={String(s.assets.length)} hint="Current non-disposed members"/><Stat icon={Wallet} label="Registry value" value={money(s.totalValue,s.currency)} hint="Unverified, single currency"/><Stat icon={Coins} label="Known indicative equity" value={money(s.knownEquity,s.currency)} hint={s.equityComplete?'Complete for known held entries':s.unknownEquityCount+' assets have unknown debt balance'}/><Stat icon={Gauge} label="Largest position" value={s.largestShare===null?'—':s.largestShare+'%'} hint="Concentration of this portfolio"/></div>
  <div className="p5-two"><div className="p5-stack"><Box title="Portfolio holdings">{s.assets.length?s.assets.map(a=><AssetRow key={a.id} asset={a} detail={a.category+' · '+nice(a.lifecycle)} extra={<><span className="p5-money">{money(a.value,a.currency)}</span>{!archived&&<button type="button" className="p5-small" onClick={()=>apply(props,()=>removeMember(store,id,a.id),'Membership removed, history retained.',setError)}>Remove</button>}</>} onClick={()=>navigate(url('asset',a.id))}/>):<Empty title="No active holdings" description="This portfolio has no active asset memberships. Add a matching-currency asset to build a portfolio."/>}</Box>
   {!archived&&<Box title="Add a matching-currency asset"><div className="p5-form-inline"><label className="p5-field">Available assets<select value={assetId} onChange={e=>setAssetId(e.target.value)}><option value="">Choose an eligible asset...</option>{eligible.map(a=><option value={a.id} key={a.id}>{a.name} · {money(a.value,a.currency)}</option>)}</select></label><button type="button" disabled={!assetId} className="primary-button" onClick={()=>apply(props,()=>addMember(store,id,assetId),'Asset linked for analysis.',setError,()=>setAssetId(''))}><Plus size={16}/> Add</button></div>{eligible.length===0&&<p className="p5-copy">All eligible assets are already included, or your registry has no {portfolio.currency} assets in an acquired/active/suspended state.</p>}<ErrorBox value={error}/></Box>}
   <Box title="Membership history">{store.phase5.memberships.filter(m=>m.portfolioId===id).length?store.phase5.memberships.filter(m=>m.portfolioId===id).map(m=><div className="p5-ledger" key={m.id}><strong>{assetName(store,m.assetId)}</strong><span>Added {new Date(m.addedAt).toLocaleDateString('en-KE')}</span><Pill text={m.removedAt?'REMOVED':'CURRENT'} tone={m.removedAt?'neutral':'blue'}/></div>):<Empty title="No membership events" description="New additions and removals are preserved here."/>}</Box>
  </div><aside className="p5-stack"><Box title="Next actions"><LinkAction title="Allocation" description="See portfolio composition" icon={BarChart3} onClick={()=>navigate('allocation?portfolio='+encodeURIComponent(id))}/><LinkAction title="Performance" description="Recorded cash and reviewed values" icon={TrendingUp} onClick={()=>navigate('performance?portfolio='+encodeURIComponent(id))}/><LinkAction title="Run scenario" description="One-period what-if sensitivity" icon={Gauge} onClick={()=>navigate('scenarios?portfolio='+encodeURIComponent(id))}/></Box>{!archived&&<Box title="Archive portfolio"><div className="p5-aside"><p>Archive this analytical group and close its active memberships without disposing of the underlying assets.</p><button type="button" className="secondary-button" onClick={()=>apply(props,()=>archivePortfolio(store,id),'Portfolio archived; underlying assets unaffected.',setError,()=>navigate('portfolios'))}>Archive portfolio</button></div></Box>}</aside></div>
 </>
}
const assetName=(store:RegistryState,id:string)=>store.records.find(a=>a.id===id)?.name||'Unknown asset'
function Allocation(props:Props){
 const {store,navigate}=props
 const query=new URLSearchParams(props.path.split('?')[1]||'')
 const [portfolioId,setPortfolioId]=useState(query.get('portfolio')||''),[currency,setCurrency]=useState('KES'),[group,setGroup]=useState<AllocationGroup>('CATEGORY')
 const portfolio=store.phase5.portfolios.find(p=>p.id===portfolioId)
 const currencyCode=portfolio?.currency||currency
 const assets=portfolio?membersFor(store,portfolio.id):store.records
 const rows=allocation(assets,currencyCode,group)
 const total=rows.reduce((s,r)=>s+r.value,0)
 return <>
  <Header num={43} title="Asset allocation & concentration" sub="Single-currency allocation and concentration breakdowns derived from current holdings." actions={<button className="secondary-button" type="button" onClick={()=>navigate('portfolios')}><Wallet size={16}/> Portfolios</button>}/>
  <Notice warn>Allocation is based on registry values, not custodian data. Values in distinct currencies are never added; risk-label allocation uses registry tags, not formal risk assessments.</Notice>
  <Box title="Choose your allocation scope"><div className="p5-filters"><label className="p5-field">Scope<select value={portfolioId} onChange={e=>setPortfolioId(e.target.value)}><option value="">All currently held assets</option>{store.phase5.portfolios.filter(p=>!p.archivedAt).map(p=><option key={p.id} value={p.id}>{p.name} ({p.currency})</option>)}</select></label>{!portfolio&&<label className="p5-field">Currency<select value={currency} onChange={e=>setCurrency(e.target.value)}>{allCurrencies(store).map(c=><option key={c}>{c}</option>)}</select></label>}<label className="p5-field">Group by<select value={group} onChange={e=>setGroup(e.target.value as AllocationGroup)}>{(['CATEGORY','LOCATION','LIFECYCLE','RISK'] as const).map(x=><option key={x} value={x}>{nice(x)}</option>)}</select></label></div></Box>
  <div className="p5-stats"><Stat label="Holdings counted" value={String(rows.reduce((s,r)=>s+r.count,0))} icon={Layers3} hint="Current lifecycle states"/><Stat label="Total current value" value={money(total,currencyCode)} icon={Wallet} hint="Unverified registry estimates"/><Stat label="Largest group" value={rows[0]?rows[0].share+'%':'—'} icon={BarChart3} hint={rows[0]?.label||'No groups'}/><Stat label="Allocation groups" value={String(rows.length)} icon={Scale} hint={nice(group)}/></div>
  <div className="p5-two"><div className="p5-stack"><Box title={'Composition by '+nice(group)}>{rows.length?<div className="p5-alloc-list">{rows.map((r,index)=><div key={r.label} className="p5-alloc-item"><div><strong>{r.label}</strong><span>{money(r.value,currencyCode)} · {r.count} assets · {r.share.toFixed(2)}%</span></div><div className="p5-meter"><span className={'g'+index%5} style={{width:Math.min(100,r.share)+'%'}}/></div></div>)}</div>:<Empty title="No qualifying assets" description="Add acquired assets or choose a matching reporting currency. The allocation chart never fills itself with synthetic data."/>}</Box>
  </div><aside className="p5-stack"><Box title="Concentration insight">{rows[0]?<div className="p5-aside"><Pill text={rows[0].share>=60?'REVIEW CONCENTRATION':'OBSERVED ALLOCATION'} tone={rows[0].share>=60?'amber':'blue'}/><h3>{rows[0].share.toFixed(2)}% in {rows[0].label}</h3><p>{rows[0].share>=60?'The largest group exceeds an illustrative 60% review threshold. This is not an investment recommendation.':'No single group exceeds the illustrative 60% threshold.'}</p></div>:<Empty title="No concentration calculated" description="A non-zero portfolio is required."/>}</Box><Box title="Continue"><LinkAction title="Compare holdings" description="Individual asset metrics" icon={Scale} onClick={()=>navigate('comparison')}/><LinkAction title="Manage portfolios" description="Membership and coverage" icon={Wallet} onClick={()=>navigate('portfolios')}/></Box></aside></div>
 </>
}
function Comparison(props:Props){
 const {store,navigate}=props
 const [ids,setIds]=useState<string[]>([]),[query,setQuery]=useState(''),[error,setError]=useState('')
 const assets=store.records.filter(a=>held(a)&&(a.name+' '+a.category).toLowerCase().includes(query.toLowerCase()))
 const current=useMemo(()=>{if(ids.length<2)return null;try{return compareAssets(store,ids)}catch(e){return null}},[store,ids])
 const toggle=(id:string)=>{setError('');setIds(p=>p.includes(id)?p.filter(x=>x!==id):p.length<4?[...p,id]:(setError('Compare up to four assets.'),p))}
 return <>
  <Header num={44} title="Asset comparison" sub="Compare two to four held assets using consistent recorded metrics and transparent data gaps." actions={<button type="button" className="secondary-button" onClick={()=>setIds([])}>Clear selection</button>}/>
  <Notice warn>Comparisons cannot rank unlike currencies: mixed-currency selections show per-asset figures with an explicit incompatibility warning. Missing cost bases and debt observations remain unknown.</Notice>
  <Box title="Select 2–4 assets"><div className="p5-compare-top"><label className="p5-search"><Search size={16}/><input aria-label="Filter comparable assets" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search eligible holdings..."/></label><strong>{ids.length} / 4 selected</strong></div><div className="p5-choice-list">{assets.map(a=><label className="p5-choice" key={a.id}><input type="checkbox" checked={ids.includes(a.id)} onChange={()=>toggle(a.id)}/><div><strong>{a.name}</strong><small>{a.category} · {a.currency}</small></div><span>{money(a.value,a.currency)}</span></label>)}</div><ErrorBox value={error}/></Box>
  {current?<><div className="p5-stats"><Stat label="Assets compared" value={String(current.items.length)} icon={Layers3} hint="Current held assets"/><Stat label="Currency comparability" value={current.currencyCompatible?'SAME':'MIXED'} icon={Coins} hint={current.currencies.join(' / ')}/><Stat label="With cost basis" value={String(current.items.filter(i=>i.acquisitionBasis!==null).length)} icon={Scale} hint="Required for cash-on-cost"/><Stat label="Locally reviewed values" value={String(current.items.filter(i=>i.acceptedValuation!==null).length)} icon={CheckCircle2} hint="Not independently verified"/></div>
   {!current.currencyCompatible&&<Notice warn>These assets have different currencies. No total, FX conversion, ranking or relative monetary comparison is provided.</Notice>}
   <Box title="Side-by-side metric comparison"><div className="p5-scroll"><table className="p5-table"><thead><tr><th>METRIC</th>{current.items.map(i=><th key={i.asset.id}>{i.asset.name}<small>{i.asset.currency}</small></th>)}</tr></thead><tbody>
    <tr><th>Lifecycle</th>{current.items.map(i=><td key={i.asset.id}><Pill text={i.asset.lifecycle} tone="blue"/></td>)}</tr>
    <tr><th>Current registry value</th>{current.items.map(i=><td key={i.asset.id}>{money(i.asset.value,i.asset.currency)}</td>)}</tr>
    <tr><th>Indicative equity</th>{current.items.map(i=><td key={i.asset.id}>{i.equity===null?'Unknown':money(i.equity,i.asset.currency)}</td>)}</tr>
    <tr><th>Acquisition cost basis</th>{current.items.map(i=><td key={i.asset.id}>{i.acquisitionBasis===null?'Not recorded':money(i.acquisitionBasis,i.asset.currency)}</td>)}</tr>
    <tr><th>Operating cash-on-cost</th>{current.items.map(i=><td key={i.asset.id}>{i.operatingReturnPct===null?'Unknown':i.operatingReturnPct+'%'}</td>)}</tr>
    <tr><th>Unrealized value vs basis</th>{current.items.map(i=><td key={i.asset.id}>{i.capitalReturnPct===null?'Unknown':i.capitalReturnPct+'%'}</td>)}</tr>
    <tr><th>Reviewed valuation date</th>{current.items.map(i=><td key={i.asset.id}>{i.acceptedValuation?day(i.acceptedValuation):'Unreviewed'}</td>)}</tr>
   </tbody></table></div></Box></>:<Empty title="Select at least two assets" description="Choose holdings above. No comparison results are fabricated when assets or financial histories are missing." action={<button type="button" className="secondary-button" onClick={()=>navigate('assets')}>Open asset registry</button>}/>}
 </>
}
function Performance(props:Props){
 const {store,navigate}=props
 const query=new URLSearchParams(props.path.split('?')[1]||'')
 const [portfolioId,setPortfolioId]=useState(query.get('portfolio')||''),[currency,setCurrency]=useState('KES')
 const p=store.phase5.portfolios.find(p=>p.id===portfolioId),code=p?.currency||currency
 const assets=(p?membersFor(store,p.id):store.records).filter(a=>held(a)&&a.currency===code)
 const flows=flowSummary(assets.flatMap(a=>flowsFor(store,a.id)),code)
 const withBasis=assets.filter(a=>roiSnapshot(store,a.id).basis!==null)
 const signals=performanceSignals(store).filter(s=>assets.some(a=>a.id===s.assetId))
 return <>
  <Header num={45} title="Performance intelligence" sub="Compare recorded operating outcomes and valuation coverage without fabricated success metrics."
   actions={<button className="secondary-button" type="button" onClick={()=>navigate('underperforming')}><TrendingDown size={16}/> Review flagged assets</button>}/>
  <Notice warn>Operating results use manually entered cash-flow records only. ROI is a simple cash-on-cost proxy, not IRR, realized profit, accounting return or a forecast.</Notice>
  <Box title="Performance scope"><div className="p5-filters"><label className="p5-field">Portfolio<select value={portfolioId} onChange={e=>setPortfolioId(e.target.value)}><option value="">All held assets</option>{store.phase5.portfolios.filter(x=>!x.archivedAt).map(x=><option key={x.id} value={x.id}>{x.name} ({x.currency})</option>)}</select></label>{!p&&<label className="p5-field">Reporting currency<select value={currency} onChange={e=>setCurrency(e.target.value)}>{allCurrencies(store).map(x=><option key={x}>{x}</option>)}</select></label>}</div></Box>
  <div className="p5-stats"><Stat label="Recorded income" value={money(flows.INCOME,code)} icon={TrendingUp} hint="Not reconciled"/><Stat label="Recorded expenses" value={money(flows.EXPENSE,code)} icon={TrendingDown} hint="Not paid/posted"/><Stat label="Operating net" value={money(flows.operatingNet,code)} icon={Wallet} hint="Income less expense"/><Stat label="Assets with basis" value={String(withBasis.length)+'/'+assets.length} icon={Scale} hint="ROI data coverage"/></div>
  <div className="p5-two"><div className="p5-stack"><Box title="Asset performance breakdown">{assets.length?assets.map(a=>{const roi=roiSnapshot(store,a.id),f=flowSummary(flowsFor(store,a.id),a.currency);return <AssetRow key={a.id} asset={a} detail={'Operating net '+money(f.operatingNet,a.currency)+' · '+(roi.operatingReturn===null?'ROI unknown':roi.operatingReturn+'% cash-on-cost')} extra={<Pill text={latestAccepted(store,a.id)?'REVIEWED LOCAL':'UNVERIFIED VALUE'} tone={latestAccepted(store,a.id)?'blue':'amber'}/>} onClick={()=>navigate('economics?asset='+encodeURIComponent(a.id))}/> }):<Empty title="No eligible assets in scope" description="Select held assets in a matching currency to see measured outcomes."/>}</Box>
   <Box title="Observed performance flags">{signals.length?signals.slice(0,10).map(s=><div className="p5-signal" key={s.id}><span className="p5-glyph"><AlertTriangle size={18}/></span><div><strong>{s.title}</strong><small>{assetName(store,s.assetId)} · {s.reason}</small></div><Pill text={s.severity} tone={s.severity==='HIGH'?'red':'amber'}/><button className="p5-open" aria-label="Review signal" type="button" onClick={()=>navigate(s.actionRoute)}><ChevronRight size={16}/></button></div>):<Empty title="No qualifying performance flags" description="Missing financial evidence is not evidence of good performance. Create income/expense and valuation records to improve coverage."/>}</Box>
  </div><aside className="p5-stack"><Box title="Decision inputs"><div className="p5-aside"><h3>Data coverage matters</h3><p>Comparison quality depends on recorded acquisition basis, actual entered cash movements, and locally reviewed valuations. Unavailable information stays unknown rather than becoming zero.</p></div></Box><Box title="Open workspaces"><LinkAction title="Asset economics" description="Per-asset ROI and equity inputs" icon={Scale} onClick={()=>navigate('economics')}/><LinkAction title="Finance reconciliation" description="Unverified reference matching" icon={Coins} onClick={()=>navigate('reconciliation')}/></Box></aside></div>
 </>
}
function RiskCenter(props:Props){
 const {store,navigate}=props
 const heldAssets=store.records.filter(held)
 const scored=heldAssets.map(a=>({a,r:latestRisk(store,a.id)}))
 const high=scored.filter(x=>x.r&&riskScore(x.r.scores)>=75)
 const signals=performanceSignals(store).filter(s=>s.kind==='HIGH_RISK'||s.kind==='OVERDUE_MAINTENANCE')
 return <>
  <Header num={46} title="Risk management center" sub="Explicit, source-attributed risk assessments and operational flags—not inferred insurance, financial or legal guarantees."
   actions={<button type="button" className="primary-button" onClick={()=>navigate('risk/new')}><Plus size={16}/> Assess asset</button>}/>
  <Notice warn>Risk scores are self-reported and use illustrative weights (market 30%, liquidity 25%, condition 20%, regulatory 15%, counterparty 10%). They are not financial advice or professionally validated risk ratings.</Notice>
  <div className="p5-stats"><Stat label="Assessed assets" value={String(scored.filter(x=>x.r).length)} icon={ShieldCheck} hint="User-recorded assessments"/><Stat label="Unassessed held" value={String(scored.filter(x=>!x.r).length)} icon={CircleHelp} hint="No score invented"/><Stat label="Critical scores" value={String(high.length)} icon={AlertTriangle} hint="≥75 / 100 from entered values"/><Stat label="Operational risk flags" value={String(signals.length)} icon={Activity} hint="Local rules and due dates"/></div>
  <div className="p5-two"><div className="p5-stack"><Box title="Assets & assessments">{scored.length?scored.map(({a,r})=><AssetRow key={a.id} asset={a} detail={r?'Assessed '+day(r.observedOn)+' · '+r.source:'Not assessed — no inferred rating'} extra={r?<Pill text={riskBand(riskScore(r.scores))+' · '+riskScore(r.scores)} tone={riskScore(r.scores)>=75?'red':riskScore(r.scores)>=50?'amber':'blue'}/>:<Pill text="UNASSESSED" tone="neutral"/>} onClick={()=>navigate(url('risk',a.id))}/>):<Empty title="No held assets to assess" description="Register and acquire an asset to create its first risk assessment."/>}</Box>
   <Box title="Rule-based operational flags">{signals.length?signals.map(s=><div className="p5-signal" key={s.id}><span className="p5-glyph"><ShieldAlert size={17}/></span><div><strong>{s.title}</strong><small>{assetName(store,s.assetId)} · {s.reason}</small></div><button className="p5-open" type="button" aria-label="Open risk flag" onClick={()=>navigate(s.actionRoute)}><ArrowRight size={16}/></button></div>):<Empty title="No rule-based risk flags" description="No current qualifying signals in entered data. This is not a safety certification."/>}</Box>
  </div><aside className="p5-stack"><Box title="Risk framework"><div className="p5-risk-weights">{Object.entries({MARKET:30,LIQUIDITY:25,CONDITION:20,REGULATORY:15,COUNTERPARTY:10}).map(([key,v])=><div key={key}><span>{nice(key)}</span><strong>{v}%</strong><div className="p5-meter"><span style={{width:v+'%'}}/></div></div>)}</div></Box><Box title="Explore"><LinkAction title="Risk details" description="Record a date/source and 1–5 scores" icon={ShieldCheck} onClick={()=>navigate('risk/new')}/><LinkAction title="Underperforming assets" description="Financial and operational flags" icon={TrendingDown} onClick={()=>navigate('underperforming')}/></Box></aside></div>
  </>
}
function RiskDetails(props:Props){
 const {store,navigate}=props
 const routeId=props.path.split('/')[1]||''
 const pre=routeId!=='new'?decodeURIComponent(routeId):''
 const [assetId,setAssetId]=useState(pre),[date,setDate]=useState(today()),[source,setSource]=useState(''),[reason,setReason]=useState(''),
 [scores,setScores]=useState<RiskScores>({...DEFAULT_RISK_SCORES}),[error,setError]=useState('')
 const asset=store.records.find(a=>a.id===assetId)
 const latest=asset?latestRisk(store,asset.id):undefined
 const history=store.phase5.risks.filter(r=>r.assetId===assetId).sort((a,b)=>b.observedOn.localeCompare(a.observedOn))
 const submit=(e:FormEvent)=>{e.preventDefault();apply(props,()=>assessRisk(store,{assetId,observedOn:date,source,reason,scores}),
  'Risk assessment recorded locally; no external verification.',setError,()=>navigate(url('risk',assetId)))}
 return <>
  <Header num={47} title={asset?'Risk assessment · '+asset.name:'Assess an asset'} sub="Five explicit 1–5 dimensions, a written rationale and preserved effective-dated history."
   back={()=>navigate('risk-center')} actions={latest&&<Pill text={riskBand(riskScore(latest.scores))+' '+riskScore(latest.scores)+'/100'} tone={riskScore(latest.scores)>=75?'red':'blue'}/>}/>
  <Notice warn>These risk scores describe only your self-assessment. They are not market ratings, insurance underwriting, verified legal status or investment suitability determinations.</Notice>
  <div className="p5-two"><div className="p5-stack"><form onSubmit={submit}><Box title="Record an explainable risk assessment"><div className="p5-form"><div className="p5-wide"><AssetSelect store={store} value={assetId} onChange={setAssetId}/></div>
   <label className="p5-field">Effective assessment date<input type="date" value={date} max={today()} onChange={e=>setDate(e.target.value)} required/></label>
   <label className="p5-field">Source / assessor label<input required maxLength={120} value={source} onChange={e=>setSource(e.target.value)} placeholder="e.g. owner assessment"/></label>
   <div className="p5-wide p5-dimensions">{RISK_DIMENSIONS.map(dim=><label className="p5-score-field" key={dim}><span><strong>{nice(dim)}</strong><small>1 = low assessed exposure · 5 = high assessed exposure</small></span><select value={scores[dim]} onChange={e=>setScores(p=>({...p,[dim]:Number(e.target.value) as RiskScores[RiskDimension]}))}>{[1,2,3,4,5].map(v=><option value={v} key={v}>{v}</option>)}</select></label>)}</div>
   <label className="p5-field p5-wide">Explain the observed risks<textarea rows={4} maxLength={600} required value={reason} onChange={e=>setReason(e.target.value)} placeholder="Record source, assumptions, evidence limitations and relevant context..."/></label>
  </div><div className="p5-score-preview"><span>Preview weighted score</span><strong>{riskScore(scores)} / 100</strong><Pill text={riskBand(riskScore(scores))} tone={riskScore(scores)>=75?'red':riskScore(scores)>=50?'amber':'green'}/></div><ErrorBox value={error}/><div className="p5-submit"><button type="button" className="secondary-button" onClick={()=>navigate('risk-center')}>Cancel</button><button className="primary-button" type="submit"><CheckCircle2 size={16}/> Record assessment</button></div></Box></form>
   <Box title="Assessment history">{history.length?history.map(r=><div className="p5-history-row" key={r.id}><div><strong>{riskScore(r.scores)} / 100 · {nice(riskBand(riskScore(r.scores)))}</strong><small>{day(r.observedOn)} · {r.source}</small><p>{r.reason}</p></div><Pill text="RECORDED" tone="blue"/></div>):<Empty title="No historical assessment" description="Existing registry risk labels are not converted into fabricated scored assessments."/>}</Box>
  </div><aside className="p5-stack"><Box title="Methodology"><div className="p5-aside"><p>Each dimension is scored 1–5. Normalized weighted score = Σ ((score − 1) / 4 × weight × 100). Bands: low &lt;25, moderate &lt;50, high &lt;75, critical ≥75.</p><p>The score is a transparent visual planning aid, never a guarantee.</p></div></Box><Box title="Follow-up"><LinkAction title="Risk center" description="All held assets and flags" icon={ShieldAlert} onClick={()=>navigate('risk-center')}/><LinkAction title="Performance signals" description="Finance-related watch conditions" icon={Activity} onClick={()=>navigate('underperforming')}/></Box></aside></div>
 </>
}
function Underperforming(props:Props){
 const {store,navigate}=props
 const [filter,setFilter]=useState<'ALL'|'HIGH'|'WATCH'>('ALL')
 const all=performanceSignals(store)
 const rows=all.filter(s=>filter==='ALL'||s.severity===filter)
 const affected=new Set(rows.map(s=>s.assetId)).size
 return <>
  <Header num={48} title="Underperforming & watchlist" sub="Explainable performance/risk signals generated only from recorded financial and operational facts."
   actions={<button className="secondary-button" type="button" onClick={()=>navigate('performance')}><TrendingUp size={16}/> Performance center</button>}/>
  <Notice warn>Absence from this watchlist is not evidence of profitability or safety. The rules only detect known negative operating cash flow, accepted values below recorded cost, stale valuations, high assessed risk and overdue maintenance.</Notice>
  <div className="p5-stats"><Stat label="Signals" value={String(all.length)} icon={AlertTriangle} hint="Transparent deterministic rules"/><Stat label="Affected assets" value={String(new Set(all.map(s=>s.assetId)).size)} icon={Layers3} hint="Distinct currently held assets"/><Stat label="High priority" value={String(all.filter(s=>s.severity==='HIGH').length)} icon={ShieldAlert} hint="Illustrative severity"/><Stat label="In filtered view" value={String(affected)} icon={Search} hint="Distinct assets shown"/></div>
  <Box title="Evidence-based watchlist" extra={<div className="p5-tabs">{(['ALL','HIGH','WATCH'] as const).map(x=><button type="button" key={x} aria-pressed={filter===x} className={filter===x?'active':''} onClick={()=>setFilter(x)}>{nice(x)}</button>)}</div>}>
   {rows.length?rows.map(s=><div className="p5-watch" key={s.id}><span className="p5-glyph"><AlertTriangle size={18}/></span><div><strong>{s.title}</strong><small>{assetName(store,s.assetId)} · {nice(s.kind)}</small><p>{s.reason}</p></div><Pill text={s.severity} tone={s.severity==='HIGH'?'red':'amber'}/><button type="button" className="p5-small" onClick={()=>navigate(s.actionRoute)}>Investigate <ArrowRight size={15}/></button></div>):<Empty title="No qualifying signals" description="The current entries do not meet these thresholds. Missing underlying histories are not automatically treated as good performance."/>}
  </Box>
 </>
}
function Scenarios(props:Props){
 const {store,navigate}=props
 const q=new URLSearchParams(props.path.split('?')[1]||'')
 const [name,setName]=useState('Market sensitivity'),[portfolioId,setPortfolioId]=useState(q.get('portfolio')||''),
 [currency,setCurrency]=useState('KES'),[valueShock,setValueShock]=useState('-10'),[incomeShock,setIncomeShock]=useState('-15'),
 [expenseShock,setExpenseShock]=useState('10'),[assumptions,setAssumptions]=useState('Illustrative one-period stress; no time projection.'),
 [error,setError]=useState('')
 const p=store.phase5.portfolios.find(x=>x.id===portfolioId),code=p?.currency||currency
 const input:ScenarioInput={name,portfolioId:portfolioId||null,currency:code,valueShockPct:Number(valueShock),
  incomeShockPct:Number(incomeShock),expenseShockPct:Number(expenseShock),assumptions}
 let result:ReturnType<typeof calculateScenario>|null=null
 try{result=calculateScenario(store,input)}catch{result=null}
 const save=(e:FormEvent)=>{e.preventDefault();apply(props,()=>saveScenario(store,input),'Sensitivity scenario saved for later review.',setError)}
 const choose=(id:string)=>{const s=store.phase5.scenarios.find(x=>x.id===id);if(!s)return
  setName(s.name);setPortfolioId(s.portfolioId||'');setCurrency(s.currency);setValueShock(String(s.valueShockPct));
  setIncomeShock(String(s.incomeShockPct));setExpenseShock(String(s.expenseShockPct));setAssumptions(s.assumptions);setError('')}
 return <>
  <Header num={49} title="Forecasting & scenarios" sub="Transparent sensitivity analysis against current observed values—not an AI forecast or predicted market outcome."
   actions={<button type="button" className="secondary-button" onClick={()=>navigate('performance')}><BarChart3 size={16}/> Performance evidence</button>}/>
  <Notice warn>This screen does NOT forecast future performance. It calculates a one-period what-if sensitivity using current recorded value and entered income/expense totals. No compounding, model probabilities, FX, tax or financial advice.</Notice>
  <div className="p5-two"><div className="p5-stack"><form onSubmit={save}><Box title="Define a transparent stress scenario"><div className="p5-form">
   <label className="p5-field">Scenario name<input value={name} maxLength={120} required onChange={e=>setName(e.target.value)}/></label>
   <label className="p5-field">Portfolio scope<select value={portfolioId} onChange={e=>setPortfolioId(e.target.value)}><option value="">All held assets in currency</option>{store.phase5.portfolios.filter(x=>!x.archivedAt).map(x=><option key={x.id} value={x.id}>{x.name} ({x.currency})</option>)}</select></label>
   {!p&&<label className="p5-field">Currency<select value={currency} onChange={e=>setCurrency(e.target.value)}>{allCurrencies(store).map(x=><option key={x}>{x}</option>)}</select></label>}
   <label className="p5-field">Asset value shock (%)<input type="number" step=".01" min="-100" max="300" value={valueShock} onChange={e=>setValueShock(e.target.value)}/></label>
   <label className="p5-field">Income shock (%)<input type="number" step=".01" min="-100" max="300" value={incomeShock} onChange={e=>setIncomeShock(e.target.value)}/></label>
   <label className="p5-field">Expense shock (%)<input type="number" step=".01" min="-100" max="300" value={expenseShock} onChange={e=>setExpenseShock(e.target.value)}/></label>
   <label className="p5-field p5-wide">Assumptions & limitations<textarea rows={3} maxLength={500} value={assumptions} onChange={e=>setAssumptions(e.target.value)}/></label>
  </div><ErrorBox value={error}/><div className="p5-submit"><button type="submit" className="primary-button"><CheckCircle2 size={16}/> Save scenario inputs</button></div></Box></form>
   {result&&<Box title="Current vs one-period stress preview"><div className="p5-scenario-grid">
    <Field label="Assets" value={String(result.assetCount)}/><Field label="Observed cash-flow records" value={String(result.observationCount)}/>
    <Field label="Current portfolio value" value={money(result.baseValue,code)}/><Field label="Stressed value" value={money(result.stressedValue,code)}/>
    <Field label="Value change" value={money(result.valueChange,code)}/><Field label="Baseline operating net" value={money(result.baseOperatingNet,code)}/>
    <Field label="Stressed operating net" value={money(result.stressedOperatingNet,code)}/><Field label="Operating net sensitivity" value={money(result.operatingNetChange,code)}/>
   </div><div className="p5-formula"><strong>Formulas:</strong> stressed value = current value × (1 + value shock). Stressed operating net = entered income × (1 + income shock) − entered expenses × (1 + expense shock). Debt, capital costs, payments and future periods are not projected.</div></Box>}
  </div><aside className="p5-stack"><Box title="Saved assumptions">{store.phase5.scenarios.length?store.phase5.scenarios.map(s=><button type="button" className="p5-saved-scenario" key={s.id} onClick={()=>choose(s.id)}><strong>{s.name}</strong><small>{s.currency} · value {s.valueShockPct}% · income {s.incomeShockPct}% · expense {s.expenseShockPct}%</small><ArrowRight size={16}/></button>):<Empty title="No saved scenarios" description="Save a set of assumptions locally to revisit it. There are no generated forecasts."/>}</Box><Box title="Limitations"><div className="p5-aside"><p>No inflation, time horizon, interest accrual, probabilities, Monte Carlo simulation or live market data. A zero baseline operating figure often means missing records—not zero real cash flow.</p></div></Box></aside></div>
 </>
}
function Assistant(props:Props){
 const {store,navigate}=props
 const [question,setQuestion]=useState(''),[responses,setResponses]=useState<Array<{question:string;text:string;route:string;source:string}>>([]),
 [noteTitle,setNoteTitle]=useState(''),[noteBody,setNoteBody]=useState(''),[noteOpen,setNoteOpen]=useState(false),[error,setError]=useState('')
 const insights=explainableInsights(store)
 const ask=(text:string)=>{const result=assistantAnswer(store,text);setResponses(p=>[{question:text,text:result.text,route:result.route,source:result.source},...p]);setQuestion('')}
 const submit=(e:FormEvent)=>{e.preventDefault();if(question.trim())ask(question)}
 const save=(e:FormEvent)=>{e.preventDefault();apply(props,()=>appendIntelligenceNote(store,{assetId:null,title:noteTitle,body:noteBody}),
  'Decision note saved locally; no external action executed.',setError,()=>{setNoteTitle('');setNoteBody('');setNoteOpen(false)})}
 return <>
  <Header num={50} title="Asset intelligence assistant" sub="A source-attributed, rules-based explainer for current browser records—not a connected generative AI system."
   actions={<Pill text="RULES-BASED · OFFLINE" tone="blue"/>}/>
  <Notice warn>No language model, external AI provider, user-specific financial advice, real-time market analysis or autonomous actions are connected. Answers follow explicit local rules and may be incomplete when data is missing.</Notice>
  <div className="p5-stats"><Stat label="Explainable signals" value={String(insights.length)} icon={Lightbulb} hint="Only rules with current evidence"/><Stat label="Saved notes" value={String(store.phase5.notes.length)} icon={FileText} hint="Local draft decisions"/><Stat label="Live data providers" value="0" icon={BrainCircuit} hint="No external model or API"/><Stat label="Automated actions" value="0" icon={ShieldCheck} hint="Human approval always required"/></div>
  <div className="p5-two"><div className="p5-stack">
   <Box title="Ask about your current asset records"><div className="p5-assistant-intro"><div className="p5-bot-icon"><Bot size={27}/></div><div><strong>How can I help analyze Asset OS?</strong><p>Choose a topic or ask a question. I will report available rules and sources, and clearly identify unknown information.</p></div></div><div className="p5-chips">{['What risks need review?','Which assets show weak performance?','What valuations are available?','Show my portfolio allocation','How do scenarios work?'].map(x=><button type="button" key={x} onClick={()=>ask(x)}>{x} <ArrowRight size={13}/></button>)}</div>
    <form onSubmit={submit} className="p5-ask-form"><label className="p5-field">Your question<input value={question} maxLength={350} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about risk, portfolio, performance, valuations..."/></label><button type="submit" disabled={!question.trim()} className="primary-button"><Sparkles size={16}/> Explain</button></form>
    <div className="p5-answers">{responses.length?responses.map((r,i)=><div className="p5-answer" key={i}><strong>{r.question}</strong><p>{r.text}</p><small>Basis: {r.source}. No external AI.</small><button type="button" className="p5-small" onClick={()=>navigate(r.route)}>Open related screen <ArrowRight size={15}/></button></div>):<Empty title="No question asked yet" description="Ask a question or choose a guided topic. Responses are generated locally from known records and transparent rules."/>}</div>
   </Box>
   <Box title="Current explainable insight cards">{insights.length?insights.slice(0,12).map(i=><div className="p5-watch" key={i.id}><span className="p5-glyph"><Lightbulb size={17}/></span><div><strong>{i.title}</strong><small>{i.basis}</small><p>{i.detail}</p></div><Pill text={i.severity} tone={i.severity==='HIGH'?'red':'amber'}/><button type="button" className="p5-open" onClick={()=>navigate(i.route)} aria-label="Open related insight"><ArrowRight size={16}/></button></div>):<Empty title="No rule-derived insights" description="Enter maintenance, valuations, cash flows, portfolio membership or risk assessments to provide sufficient evidence. No insights are invented."/ >}</Box>
  </div><aside className="p5-stack">
   <Box title="Human decision notes"><div className="p5-aside"><p>Document a choice or open question. This stays in the browser and does not trigger a transaction, transfer, buy/sell recommendation or system policy change.</p><button type="button" className="secondary-button" onClick={()=>setNoteOpen(v=>!v)}><Plus size={16}/> Write decision note</button></div>
    {noteOpen&&<form onSubmit={save}><div className="p5-aside-form"><label className="p5-field">Note title<input required maxLength={120} value={noteTitle} onChange={e=>setNoteTitle(e.target.value)}/></label><label className="p5-field">Decision / question<textarea rows={4} required maxLength={1000} value={noteBody} onChange={e=>setNoteBody(e.target.value)}/></label><ErrorBox value={error}/><button type="submit" className="primary-button"><CheckCircle2 size={15}/> Save note</button></div></form>}
    {store.phase5.notes.map(n=><div className="p5-history-row" key={n.id}><div><strong>{n.title}</strong><small>{new Date(n.recordedAt).toLocaleDateString('en-KE')}</small><p>{n.body}</p></div></div>)}
   </Box><Box title="Source boundaries"><div className="p5-aside"><p>Only your current browser workspace is read. External financial providers, Personal Kernel actions and live intelligence require Phase 6 or backend development.</p></div></Box></aside></div>
 </>
}
export function IntelligenceExperience(props:Props){
 const path=props.path.split('?')[0]
 if(path==='portfolios')return <Portfolios {...props}/>
 if(path.startsWith('portfolio/'))return <PortfolioDetail {...props}/>
 if(path==='allocation')return <Allocation {...props}/>
 if(path==='comparison')return <Comparison {...props}/>
 if(path==='performance')return <Performance {...props}/>
 if(path==='risk-center')return <RiskCenter {...props}/>
 if(path==='risk/new'||path.startsWith('risk/'))return <RiskDetails {...props}/>
 if(path==='underperforming')return <Underperforming {...props}/>
 if(path==='scenarios')return <Scenarios {...props}/>
 if(path==='intelligence')return <Assistant {...props}/>
 return <Empty title="Intelligence view not found" description="Choose one of the portfolio or performance workspaces." action={<button className="secondary-button" onClick={()=>props.navigate('portfolios')} type="button">Portfolios</button>}/>
}
