import {useMemo,useState,type FormEvent,type ReactNode} from 'react'
import {
 Activity,AlertTriangle,ArrowLeft,ArrowRight,Bell,BookOpen,
 CalendarDays,Check,CheckCircle2,ChevronRight,ClipboardList,CloudOff,Coins,
 Download,FileBarChart,FileText,Filter,Globe,History,KeyRound,
 Layers3,Link2,ListChecks,LockKeyhole,Plus,Search,
 Settings,Shield,ShieldAlert,ShieldCheck,Users,Wallet, type LucideIcon
} from 'lucide-react'
import type {RegistryState} from '../registry/core'
import {
 alertsFor,auditRows,cancelConnectionPlan,draftKernelAction,
 integrationView,kernelCandidates,netWorthPreview,onboardingSteps,reportCsv,reportPreview,
 requestConnectionPlan,ROLE_IDS,ROLES,saveSettings,setAlertDisposition,setDraftStatus,
 SYSTEM_IDS,wealthHandoffPreview,
 type ConnectedSystem,type PreviewRole,type ReportKind,type AdminSettings
} from './core'
import './governance.css'

type Props={path:string;store:RegistryState;onChange:(s:RegistryState)=>void;navigate:(path:string)=>void;report:(message:string)=>void}
const today=()=>new Date().toISOString().slice(0,10)
const label=(s:string)=>s.toLowerCase().replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
const date=(s:string)=>s?new Date(s+'T00:00:00Z').toLocaleDateString('en-KE',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}):'Not recorded'
const money=(n:number,c:string)=>new Intl.NumberFormat('en-KE',{style:'currency',currency:c,maximumFractionDigits:2}).format(n)
const currencies=(s:RegistryState)=>[...new Set(['KES',...s.records.map(a=>a.currency)])]
const assetName=(s:RegistryState,id:string)=>s.records.find(a=>a.id===id)?.name||'Unidentified asset'
function Head({number,title,description,actions,back}:{number:number;title:string;description:string;actions?:ReactNode;back?:()=>void}){
 return <div className="g6-head"><div className="g6-heading">{back&&<button className="g6-back" type="button" aria-label="Go back" onClick={back}><ArrowLeft size={17}/></button>}<div><span className="eyebrow">SCREEN {String(number).padStart(2,'0')} / ASSET OS GOVERNANCE</span><h1>{title}</h1><p>{description}</p></div></div><div className="g6-head-actions">{actions}</div></div>
}
function Box({title,children,extra}:{title:string;children:ReactNode;extra?:ReactNode}){
 return <section className="g6-box"><header><h2>{title}</h2>{extra}</header>{children}</section>
}
function Notice({children,warn=false}:{children:ReactNode;warn?:boolean}){
 return <div className={'g6-notice '+(warn?'warn':'')}><ShieldAlert size={17}/><span>{children}</span></div>
}
function Stat({icon:Icon,title,value,detail}:{icon:LucideIcon;title:string;value:string;detail:string}){
 return <article className="g6-stat"><span><Icon size={18}/>{title}</span><strong>{value}</strong><small>{detail}</small></article>
}
function Badge({children,tone='blue'}:{children:ReactNode;tone?:'blue'|'red'|'green'|'amber'|'neutral'}){
 return <span className={'g6-badge '+tone}>{children}</span>
}
function Empty({title,description,action}:{title:string;description:string;action?:ReactNode}){
 return <div className="g6-empty"><span><Layers3 size={29}/></span><strong>{title}</strong><p>{description}</p>{action}</div>
}
function ErrorBox({error}:{error:string}){return error?<div className="g6-error" role="alert"><AlertTriangle size={17}/>{error}</div>:null}
function Next({title,detail,onClick,icon:Icon}:{title:string;detail:string;onClick:()=>void;icon:LucideIcon}){
 return <button className="g6-next" type="button" onClick={onClick}><span className="g6-glyph"><Icon size={17}/></span><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={16}/></button>
}
function Pair({name,value}:{name:string;value:string}){
 return <div className="g6-pair"><small>{name}</small><strong>{value}</strong></div>
}
function apply(p:Props,fn:()=>RegistryState,msg:string,error:(v:string)=>void,after?:()=>void){
 try{const next=fn();p.onChange(next);p.report(msg);error('');after?.()}
 catch(e){error(e instanceof Error?e.message:'Request could not be completed.')}
}
function Wealth(props:Props){
 const {store,navigate}=props
 const [currency,setCurrency]=useState(store.phase6.settings.reportCurrency)
 const snapshot=netWorthPreview(store,currency)
 const handoff=wealthHandoffPreview(store,currency)
 return <>
  <Head number={51} title="Net worth & Wealth OS interface" description="Currency-scoped asset facts, observed liabilities and a clearly untransmitted Wealth OS handoff preview."
   actions={<Badge>READ-ONLY PROJECTION</Badge>}/>
  <Notice warn>This is not your consolidated net worth. Asset OS does not know your external cash, retirement assets, unrecorded debts or tax exposures. Wealth OS is not connected, and no payload is transmitted.</Notice>
  <Box title="Projection scope" extra={<Badge>Not synchronized</Badge>}><div className="g6-filters"><label className="g6-field">Reporting currency<select value={currency} onChange={e=>setCurrency(e.target.value)}>{currencies(store).map(c=><option key={c}>{c}</option>)}</select></label><button type="button" className="secondary-button" onClick={()=>navigate('portfolios')}><Wallet size={16}/> View portfolios</button></div></Box>
  <div className="g6-stats"><Stat title="Held registry value" icon={Wallet} value={money(snapshot.registryValue,currency)} detail={snapshot.assetCount+' currently held assets; not independently valued'}/><Stat title="Observed financing balances" icon={Coins} value={money(snapshot.debtObserved,currency)} detail="Only dated lender observations provided"/><Stat title="Indicative net equity" icon={Activity} value={snapshot.indicativeNetEquity===null?'Unknown':money(snapshot.indicativeNetEquity,currency)} detail={snapshot.complete?'Based on records currently present':'Unknown debt on '+snapshot.unknownDebtAssets+' asset(s)'}/><Stat title="Locally reviewed valuations" icon={ShieldCheck} value={String(snapshot.reviewedValuations)+'/'+snapshot.assetCount} detail="Locally accepted, not professionally certified"/></div>
  <div className="g6-cols"><div className="g6-stack">
   <Box title="Asset-level wealth inputs">{snapshot.debtFacts.length?<div className="g6-scroll"><table className="g6-table"><thead><tr><th>ASSET</th><th>VALUE</th><th>OBSERVED DEBT</th><th>QUALITY</th></tr></thead><tbody>{snapshot.debtFacts.map(d=><tr key={d.assetId}><td>{d.assetName}</td><td>{money(d.value,currency)}</td><td>{d.debt===null?'Unknown':money(d.debt,currency)}</td><td><Badge tone={d.valuationReviewed?'green':'amber'}>{d.valuationReviewed?'Locally reviewed':'Unverified value'}</Badge></td></tr>)}</tbody></table></div>:<Empty title="No held assets in this currency" description="Change the reporting currency or acquire assets to populate a projection."/>}</Box>
   <Box title="Wealth contract preview (never transmitted)"><div className="g6-code-intro">A minimal, read-only projection contract. No owner names, account identifiers, lender references or document content is included.</div><pre className="g6-json">{JSON.stringify(handoff,null,2)}</pre></Box>
  </div><aside className="g6-stack"><Box title="System authority boundary"><div className="g6-steps">{['Asset OS owns asset identity and source facts','Finance OS owns posted transaction truth','Wealth OS owns consolidated wealth and allocation','Personal Kernel owns identity, consent and policy','No cross-OS transfer occurs from GitHub Pages'].map((text,i)=><div key={text}><b>{i+1}</b><span>{text}</span></div>)}</div></Box><Box title="Related workflows"><Next icon={Coins} title="Financing balances" detail="Inspect observed debt dates" onClick={()=>navigate('financing')}/><Next icon={Link2} title="Wealth contract details" detail="Inspect integration requirements" onClick={()=>navigate('integrations/WEALTH_OS')}/></Box></aside></div>
 </>
}
function KernelActions(props:Props){
 const {store,navigate}=props
 const [error,setError]=useState(''),[filter,setFilter]=useState<'ALL'|'DRAFT'|'REVIEWED_LOCALLY'|'DISMISSED'>('ALL')
 const candidates=kernelCandidates(store)
 const drafts=store.phase6.drafts.filter(d=>filter==='ALL'||d.status===filter)
 return <>
  <Head number={52} title="Personal Kernel action center" description="Turn asset events into local proposals for future Kernel-governed execution."
   actions={<button className="secondary-button" type="button" onClick={()=>navigate('operations-calendar')}><CalendarDays size={16}/> Operations calendar</button>}/>
  <Notice warn>Action cards are local drafts only. No Personal Kernel schedule, Mission OS task, contractor booking or notification is created—even when a draft is marked reviewed.</Notice>
  <div className="g6-stats"><Stat title="Eligible events" icon={CalendarDays} value={String(candidates.length)} detail={'Within '+store.phase6.settings.reminderHorizonDays+' days or overdue'}/><Stat title="Local drafts" icon={ClipboardList} value={String(store.phase6.drafts.filter(x=>x.status==='DRAFT').length)} detail="Not submitted"/><Stat title="Reviewed locally" icon={CheckCircle2} value={String(store.phase6.drafts.filter(x=>x.status==='REVIEWED_LOCALLY').length)} detail="No Kernel approval"/><Stat title="Kernel actions sent" icon={CloudOff} value="0" detail="No connection configured"/></div>
  <div className="g6-cols"><div className="g6-stack">
   <Box title="Available event candidates">{candidates.length?candidates.map(x=><div className="g6-row" key={x.key}><span className="g6-glyph"><CalendarDays size={17}/></span><div><strong>{x.title}</strong><small>{assetName(store,x.assetId)} · Due {date(x.dueOn)} · {x.context}</small></div><button type="button" className="g6-small" onClick={()=>apply(props,()=>draftKernelAction(store,x.key),'Local Kernel proposal drafted, not submitted.',setError)}><Plus size={15}/> Draft action</button></div>):<Empty title="No operational candidates" description="Enter actual maintenance, service, insurance or evidence dates to create candidate proposals." action={<button type="button" className="secondary-button" onClick={()=>navigate('maintenance/plans')}>Create maintenance plan</button>}/>}</Box>
   <Box title="Proposal review history" extra={<select className="g6-inline-select" aria-label="Filter proposal status" value={filter} onChange={e=>setFilter(e.target.value)}>{(['ALL','DRAFT','REVIEWED_LOCALLY','DISMISSED'] as const).map(v=><option key={v}>{v}</option>)}</select>}>{drafts.length?drafts.map(d=><div className="g6-row" key={d.id}><span className="g6-glyph"><ListChecks size={18}/></span><div><strong>{d.title}</strong><small>{assetName(store,d.assetId)} · {d.context} · {date(d.dueOn)}</small></div><Badge tone={d.status==='DRAFT'?'amber':'blue'}>{label(d.status)}</Badge>{d.status==='DRAFT'&&<><button type="button" className="g6-small" onClick={()=>apply(props,()=>setDraftStatus(store,d.id,'REVIEWED_LOCALLY'),'Draft reviewed locally; no Kernel action executed.',setError)}>Mark reviewed</button><button type="button" className="g6-small subtle" onClick={()=>apply(props,()=>setDraftStatus(store,d.id,'DISMISSED'),'Local proposal dismissed.',setError)}>Dismiss</button></>}</div>):<Empty title="No proposals match this view" description="Drafts and their review history appear after you choose operational candidates."/>}</Box><ErrorBox error={error}/>
  </div><aside className="g6-stack"><Box title="Proposed integration contract"><div className="g6-steps">{['Find asset-originated due events','Create a local draft and inspect context','Kernel authenticates subject and tenant (future)','Kernel decides schedule authority (future)','Mission OS creates task only after authorization (future)'].map((t,i)=><div key={t}><b>{i+1}</b><span>{t}</span></div>)}</div></Box><Box title="Kernel integration"><Next icon={Shield} title="Personal Kernel interface" detail="Missing identity and schedule authority" onClick={()=>navigate('integrations/PERSONAL_KERNEL')}/></Box></aside></div>
 </>
}
function Notifications(props:Props){
 const {store,navigate}=props
 const [filter,setFilter]=useState<'ALL'|'UNREAD'|'SNOOZED'|'ACKNOWLEDGED'>('ALL'),[error,setError]=useState('')
 const all=alertsFor(store),shown=all.filter(a=>filter==='ALL'||a.state===filter)
 const snooze=(key:string)=>{const end=new Date();end.setUTCDate(end.getUTCDate()+7);apply(props,()=>setAlertDisposition(store,key,'SNOOZED',end.toISOString().slice(0,10)),'Alert snoozed in this browser; no external notification sent.',setError)}
 return <>
  <Head number={53} title="Notifications & reminders" description="Local operational and risk reminders derived from data you entered—not push, SMS or email delivery."
   actions={<button type="button" className="secondary-button" onClick={()=>navigate('settings')}><Settings size={16}/> Reminder preferences</button>}/>
  <Notice warn>Notifications are calculated only when this page is open. There is no background scheduler or delivery service. Acknowledging or snoozing here has no effect on Kernel, provider alerts or compliance obligations.</Notice>
  <div className="g6-stats"><Stat icon={Bell} title="Derived alerts" value={String(all.length)} detail="Based on entered records"/><Stat icon={AlertTriangle} title="Unread" value={String(all.filter(a=>a.state==='UNREAD').length)} detail="Local-only state"/><Stat icon={CalendarDays} title="Snoozed" value={String(all.filter(a=>a.state==='SNOOZED').length)} detail="Local browser preference"/><Stat icon={CloudOff} title="Delivered remotely" value="0" detail="No push/email/SMS provider"/></div>
  <Box title="Local reminder timeline" extra={<select className="g6-inline-select" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)} aria-label="Filter reminder status">{(['ALL','UNREAD','SNOOZED','ACKNOWLEDGED'] as const).map(x=><option key={x}>{x}</option>)}</select>}>
   {!store.phase6.settings.notificationsEnabled?<Empty title="Local reminders disabled" description="Enable preview notifications in Workspace Settings. No external delivery service is running." action={<button className="secondary-button" type="button" onClick={()=>navigate('settings')}>Open settings</button>}/>:shown.length?shown.map(a=><div className="g6-row g6-alert" key={a.key}><span className="g6-glyph"><Bell size={17}/></span><div><strong>{a.title}</strong><small>{assetName(store,a.assetId)} · {label(a.kind)} · {a.date}</small><p>{a.context}</p></div><Badge tone={a.severity==='HIGH'||a.severity==='OVERDUE'?'red':'amber'}>{a.severity}</Badge><Badge tone={a.state==='UNREAD'?'blue':'neutral'}>{label(a.state)}</Badge>{a.state!=='ACKNOWLEDGED'&&<button type="button" className="g6-small" onClick={()=>apply(props,()=>setAlertDisposition(store,a.key,'ACKNOWLEDGED'),'Alert acknowledged locally.',setError)}><Check size={15}/> Acknowledge</button>}{a.state!=='SNOOZED'&&<button className="g6-small subtle" type="button" onClick={()=>snooze(a.key)}>Snooze 7d</button>}{a.state!=='UNREAD'&&<button className="g6-small subtle" type="button" onClick={()=>apply(props,()=>setAlertDisposition(store,a.key,'UNREAD'),'Alert set to unread locally.',setError)}>Reset</button>}</div>):<Empty title="No reminders to display" description="Enter maintenance/insurance/evidence dates or risk/financial records, or adjust the chosen filter."/>}
  </Box><ErrorBox error={error}/>
 </>
}
function triggerDownload(filename:string,body:string){
 const blob=new Blob(['\uFEFF',body],{type:'text/csv;charset=utf-8'})
 const href=URL.createObjectURL(blob),element=document.createElement('a')
 element.href=href;element.download=filename;element.click();window.setTimeout(()=>URL.revokeObjectURL(href),1000)
}
function Reports(props:Props){
 const {store,navigate}=props
 const [kind,setKind]=useState<ReportKind>('ASSET_REGISTER'),[currency,setCurrency]=useState(store.phase6.settings.reportCurrency),
 [query,setQuery]=useState(''),[error,setError]=useState('')
 const base=reportPreview(store,kind,currency)
 const filtered={...base,rows:base.rows.filter(r=>!query.trim()||r.join(' ').toLowerCase().includes(query.trim().toLowerCase()))}
 const download=()=>{try{if(!filtered.rows.length)throw Error('No matching rows are available to export.')
  triggerDownload(filtered.name+'-'+today()+'.csv',reportCsv(filtered));props.report('CSV generated in this browser. No data sent to a server.');setError('')
 }catch(e){setError(e instanceof Error?e.message:'Report could not be exported.')}}
 return <>
  <Head number={54} title="Reports & exports" description="Preview and locally export narrow, non-sensitive summary datasets, without a connected report service."
   actions={<button type="button" className="primary-button" onClick={download}><Download size={16}/> Export filtered CSV</button>}/>
  <Notice warn>The preview is unauthenticated localStorage data. Exports intentionally exclude owner labels, policy references, personal identity data and evidence contents. Do not share export files with untrusted recipients.</Notice>
  <Box title="Report controls"><div className="g6-filters"><label className="g6-field">Report type<select value={kind} onChange={e=>setKind(e.target.value as ReportKind)}><option value="ASSET_REGISTER">Asset register (minimal)</option><option value="OPERATIONS_CALENDAR">Operational dates</option><option value="PORTFOLIO_SUMMARY">Portfolio summary</option></select></label><label className="g6-field">Currency<select value={currency} onChange={e=>setCurrency(e.target.value)}>{currencies(store).map(c=><option key={c}>{c}</option>)}</select></label><label className="g6-field">Filter rows<input type="search" value={query} maxLength={100} onChange={e=>setQuery(e.target.value)} placeholder="Filter displayed contents"/></label></div></Box>
  <div className="g6-stats"><Stat icon={FileBarChart} title="Rows available" value={String(base.rows.length)} detail="In selected currency"/><Stat icon={Filter} title="Rows matching" value={String(filtered.rows.length)} detail="Client-side text filter"/><Stat icon={CloudOff} title="Remote reports run" value="0" detail="No backend/report jobs"/><Stat icon={ShieldCheck} title="Format" value="CSV" detail="Formula-protected cell encoding"/></div>
  <Box title="Report preview" extra={<Badge>LOCAL FILE ONLY</Badge>}>{filtered.rows.length?<div className="g6-scroll"><table className="g6-table"><thead><tr>{filtered.headings.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{filtered.rows.slice(0,80).map((row,index)=><tr key={index}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table>{filtered.rows.length>80&&<p className="g6-hint">Showing 80 of {filtered.rows.length} rows; CSV includes all filtered rows.</p>}</div>:<Empty title="No report rows" description="Choose a different report, currency or filter; the app does not invent report records."/>}<p className="g6-hint">{filtered.warning}</p></Box><ErrorBox error={error}/>
  <div className="g6-cols"><div className="g6-stack"><Box title="Output contract"><div className="g6-steps">{['No server request or external sync','Only a known column allowlist is exported','CSV formula prefixes are escaped','No user account, owner or document secrets','Verify financial facts with Finance OS separately'].map((t,i)=><div key={t}><b>{i+1}</b><span>{t}</span></div>)}</div></Box></div><aside className="g6-stack"><Box title="Continue"><Next icon={FileText} title="Activity history" detail="Inspect source events" onClick={()=>navigate('security-audit')}/><Next icon={Wallet} title="Wealth projection" detail="Review single-currency value inputs" onClick={()=>navigate('wealth-interface')}/></Box></aside></div>
 </>
}
function Integrations(props:Props){
 const {store,navigate}=props
 return <>
  <Head number={55} title="Integration hub" description="An explicit registry of future external OS boundaries, required contracts and disconnected status."
   actions={<Badge tone="amber">0 CONNECTED</Badge>}/>
  <Notice warn>No external credentials, OAuth sessions, live webhook subscriptions, Kernel subject tokens or provider handshakes exist. A planning request is not a connection.</Notice>
  <div className="g6-stats"><Stat title="Defined contracts" value={String(SYSTEM_IDS.length)} detail="Read/write authority specifications" icon={Link2}/><Stat title="Live connections" value="0" detail="Every service remains disconnected" icon={CloudOff}/><Stat title="Planning requests" value={String(store.phase6.integrationRequests.filter(r=>r.status==='REQUESTED').length)} detail="Local notes only" icon={ClipboardList}/><Stat title="Verified credentials" value="0" detail="Do not enter secrets here" icon={KeyRound}/></div>
  <div className="g6-integration-grid">{SYSTEM_IDS.map(id=>{const s=integrationView(store,id);return <button type="button" className="g6-integr-card" key={id} onClick={()=>navigate('integrations/'+id)}><div><span className="g6-glyph"><Globe size={22}/></span><Badge tone="amber">NOT CONNECTED</Badge></div><h3>{s.label}</h3><p>{s.owner}</p><small>{s.request?'Planning intent recorded':'No planning intent recorded'}</small><span className="g6-card-action">Review contract <ArrowRight size={16}/></span></button>})}</div>
 </>
}
function IntegrationDetail(props:Props){
 const {store,navigate}=props
 const system=props.path.split('/')[1] as ConnectedSystem
 const [purpose,setPurpose]=useState(''),[error,setError]=useState('')
 if(!SYSTEM_IDS.includes(system))return <Empty title="Integration unavailable" description="Select a supported integration contract." action={<button className="secondary-button" onClick={()=>navigate('integrations')} type="button">Back to integration hub</button>}/>
 const s=integrationView(store,system)
 const send=(e:FormEvent)=>{e.preventDefault();apply(props,()=>requestConnectionPlan(store,system,purpose),'Integration planning intent saved locally; no connection attempted.',setError,()=>setPurpose(''))}
 return <>
  <Head number={56} title={s.label+' interface'} description="Review data authority, permitted directions and deployment requirements—without attempting to connect." back={()=>navigate('integrations')} actions={<Badge tone="amber">NOT CONNECTED</Badge>}/>
  <Notice warn>There is no credential entry form or fake 'Connected' button. This static preview cannot authenticate users, configure a real provider or exchange messages with {s.label}.</Notice>
  <div className="g6-cols"><div className="g6-stack">
   <Box title="Authority and contract"><div className="g6-pairs"><Pair name="System owner" value={s.owner}/><Pair name="Proposed data direction" value={s.direction}/><Pair name="Authenticated handshake" value="Not available"/><Pair name="Current connection" value="Not connected"/></div></Box>
   <Box title="Proposed messages & governance"><div className="g6-contracts"><div><h3>Incoming / consumed facts</h3>{s.reads.length?s.reads.map(r=><p key={r}><CheckCircle2 size={15}/>{r}</p>):<p>No incoming messages specified.</p>}</div><div><h3>Outgoing / proposed facts</h3>{s.writes.length?s.writes.map(w=><p key={w}><ArrowRight size={15}/>{w}</p>):<p>Read-only projection; no outbound mutation authority.</p>}</div><div><h3>Prerequisite</h3><p><ShieldCheck size={16}/>{s.condition}</p></div></div></Box>
   <Box title="Record a planning intention">{!s.request?<form onSubmit={send}><div className="g6-form"><label className="g6-field g6-wide">Why should this integration be built?<textarea required maxLength={350} rows={3} value={purpose} onChange={e=>setPurpose(e.target.value)} placeholder="Describe the intended data use; no credentials or URLs..."/></label></div><ErrorBox error={error}/><div className="g6-actions"><button className="primary-button" type="submit"><ClipboardList size={16}/> Save local planning note</button></div></form>:<div className="g6-planning"><strong>Local planning intent</strong><p>{s.request.purpose}</p><small>Recorded {new Date(s.request.recordedAt).toLocaleString('en-KE')}. Nothing was transmitted.</small><button type="button" className="secondary-button" onClick={()=>apply(props,()=>cancelConnectionPlan(store,system),'Planning request removed; no external connection was affected.',setError)}>Withdraw intent</button><ErrorBox error={error}/></div>}</Box>
  </div><aside className="g6-stack"><Box title="Production checklist"><div className="g6-steps">{['Kernel-approved user/tenant identity','Least-privilege credential storage server-side','Consent, revocation and secret rotation','Signed/versioned events and idempotency','Backfill, observability, retries and recovery','End-to-end staging and security certification'].map((t,i)=><div key={t}><b>{i+1}</b><span>{t}</span></div>)}</div></Box><Box title="Related surface"><Next icon={Globe} title="All integrations" detail="Review additional system contracts" onClick={()=>navigate('integrations')}/></Box></aside></div>
 </>
}
function Team(props:Props){
 const {store,navigate}=props
 const [role,setRole]=useState<PreviewRole>(store.phase6.settings.previewRole)
 const [error,setError]=useState('')
 return <>
  <Head number={57} title="Team & access design" description="Role responsibilities and a non-authoritative interface preview; no invitations or real authentication." actions={<Badge tone="amber">NO ACCESS ENFORCEMENT</Badge>}/>
  <Notice warn>Selecting a role only changes this explanation and a saved preview preference. It does not create users, restrict routes, protect localStorage, invite teammates or grant any actual authority.</Notice>
  <div className="g6-stats"><Stat title="Proposed roles" value={String(ROLE_IDS.length)} icon={Users} detail="Design templates"/><Stat title="Authenticated users" value="0" icon={KeyRound} detail="No login service"/><Stat title="Real invitations" value="0" icon={CloudOff} detail="No email or identity provider"/><Stat title="Enforced permissions" value="0" icon={LockKeyhole} detail="Kernel required"/></div>
  <div className="g6-role-grid">{ROLE_IDS.map(id=><button key={id} type="button" className={'g6-role-card '+(role===id?'selected':'')} onClick={()=>setRole(id)} aria-pressed={role===id}><Shield size={23}/><strong>{ROLES[id].label}</strong><small>{ROLES[id].explanation}</small><span>{role===id?'Viewing role':'View responsibilities'} <ChevronRight size={15}/></span></button>)}</div>
  <div className="g6-cols"><div className="g6-stack"><Box title={ROLES[role].label+' — proposed abilities'}><div className="g6-list">{ROLES[role].illustrativeCapabilities.map(c=><div key={c}><CheckCircle2 size={16}/>{c}</div>)}</div></Box><Box title="Save preview role preference"><div className="g6-planning"><p>This only stores which role description is selected. It is not a permission policy.</p><button type="button" className="primary-button" onClick={()=>apply(props,()=>saveSettings(store,{...store.phase6.settings,previewRole:role}),'Role description preference saved; no privileges changed.',setError)}><Check size={16}/> Save preview choice</button><ErrorBox error={error}/></div></Box></div>
  <aside className="g6-stack"><Box title="Not yet supported"><div className="g6-steps">{['Real login, sessions and MFA','Verified actor and organization identity','Invitations, roles and tenant boundaries','Server-authorized commands and object checks','Durable, tamper-evident security events'].map((s,i)=><div key={s}><b>{i+1}</b><span>{s}</span></div>)}</div></Box><Box title="Security model"><Next icon={ShieldAlert} title="Audit & boundaries" detail="Review what is and is not enforced" onClick={()=>navigate('security-audit')}/></Box></aside></div>
 </>
}
function SecurityAudit(props:Props){
 const {store,navigate}=props
 const [query,setQuery]=useState(''),[event,setEvent]=useState('')
 const events=useMemo(()=>[...new Set(store.activity.map(a=>a.event))].sort(),[store.activity])
 const rows=auditRows(store,query,event)
 return <>
  <Head number={58} title="Security & activity review" description="Browsable local domain events with explicit limitations on identity, privacy and audit reliability."
   actions={<Badge tone="amber">NOT A SECURITY AUDIT LOG</Badge>}/>
  <Notice warn>The activity list is stored in modifiable browser localStorage. It has no trusted actor identity, immutable append-only storage, cryptographic signatures, secure timestamps or production retention guarantees.</Notice>
  <div className="g6-stats"><Stat title="Local history entries" value={String(store.activity.length)} icon={History} detail="User-modifiable browser events"/><Stat title="Authenticated principals" value="0" icon={KeyRound} detail="No account identities"/><Stat title="Tamper-evident records" value="0" icon={ShieldAlert} detail="No signed event store"/><Stat title="Security mechanisms" value="Planned" icon={Shield} detail="Requires backend and Kernel identity"/></div>
  <div className="g6-cols"><div className="g6-stack"><Box title="Local activity timeline"><div className="g6-filters"><label className="g6-field">Search history<input type="search" value={query} maxLength={120} onChange={e=>setQuery(e.target.value)} placeholder="Asset, event, context"/></label><label className="g6-field">Event type<select value={event} onChange={e=>setEvent(e.target.value)}><option value="">All event types</option>{events.map(e=><option value={e} key={e}>{label(e)}</option>)}</select></label></div>{rows.length?rows.slice(0,100).map(a=><div className="g6-row" key={a.id}><span className="g6-glyph"><History size={16}/></span><div><strong>{label(a.event)}</strong><small>{a.assetName} · {new Date(a.at).toLocaleString('en-KE')}</small><p>{a.details}</p></div></div>):<Empty title="No matching local events" description="Events are produced by data entry and preview preferences. They do not prove who performed an action."/>}{rows.length>100&&<p className="g6-hint">Showing the newest 100 of {rows.length} matching entries.</p>}</Box></div>
   <aside className="g6-stack"><Box title="Required production security"><div className="g6-steps">{['Personal Kernel subject and tenant binding','Server-side role and per-object access checks','Encryption, data minimization and consent','Signed/immutable audit with actors','Retention, export and erasure governance','Penetration tests and compliance review'].map((x,i)=><div key={x}><b>{i+1}</b><span>{x}</span></div>)}</div></Box><Box title="Inspect contracts"><Next title="Team model" detail="Role preview is not authorization" icon={Users} onClick={()=>navigate('team-access')}/><Next title="Integration boundaries" detail="No live system access" icon={Link2} onClick={()=>navigate('integrations')}/></Box></aside>
  </div>
 </>
}
function SettingsPage(props:Props){
 const {store,navigate}=props
 const [draft,setDraft]=useState<AdminSettings>({...store.phase6.settings})
 const [error,setError]=useState('')
 const update=<K extends keyof AdminSettings>(key:K,value:AdminSettings[K])=>setDraft(p=>({...p,[key]:value}))
 const save=(e:FormEvent)=>{e.preventDefault();apply(props,()=>saveSettings(store,draft),'Browser preview settings saved; no Kernel policy modified.',setError)}
 return <>
  <Head number={59} title="Workspace settings" description="Currency, local reminder horizon, preview role and onboarding display preferences."
   actions={<Badge>LOCAL PREFERENCES</Badge>}/>
  <Notice warn>Settings affect only this browser preview. They do not update Personal Kernel scheduling rules, real notification consent, tenant policy, identity, external accounts or access permissions.</Notice>
  <div className="g6-cols"><div className="g6-stack"><form onSubmit={save}><Box title="Display and reminder preferences"><div className="g6-form">
   <label className="g6-field">Preferred reporting currency<select value={draft.reportCurrency} onChange={e=>update('reportCurrency',e.target.value)}>{currencies(store).map(c=><option key={c}>{c}</option>)}</select><small>Applies to new projection/report views; never converts currencies.</small></label>
   <label className="g6-field">Preview reminder horizon<select value={draft.reminderHorizonDays} onChange={e=>update('reminderHorizonDays',Number(e.target.value) as 7|30|90)}>{[7,30,90].map(x=><option value={x} key={x}>{x} days</option>)}</select><small>Includes overdue events; no background alerts.</small></label>
   <label className="g6-field">Role display preference<select value={draft.previewRole} onChange={e=>update('previewRole',e.target.value as PreviewRole)}>{ROLE_IDS.map(r=><option value={r} key={r}>{ROLES[r].label}</option>)}</select><small>Not an authentication or permission setting.</small></label>
   <label className="g6-toggle"><input type="checkbox" checked={draft.notificationsEnabled} onChange={e=>update('notificationsEnabled',e.target.checked)}/><span><strong>Show local reminder cards</strong><small>Only calculates from entered records when the preview is open.</small></span></label>
   <label className="g6-toggle"><input type="checkbox" checked={!draft.welcomeDismissed} onChange={e=>update('welcomeDismissed',!e.target.checked)}/><span><strong>Show onboarding guide</strong><small>Controls guide visibility; onboarding progress remains derived.</small></span></label>
  </div><ErrorBox error={error}/><div className="g6-actions"><button type="submit" className="primary-button"><Check size={16}/> Save preview settings</button></div></Box></form>
   <Box title="Workspace storage boundaries"><div className="g6-list"><div><ShieldAlert size={16}/> Browser localStorage is not encrypted or access-controlled.</div><div><FileText size={16}/> Do not store identification documents, private financial accounts or actual credentials.</div><div><CloudOff size={16}/> Clearing browser data permanently removes locally entered records unless you have independently retained a permitted export.</div><div><KeyRound size={16}/> There is no secret storage or authenticated login.</div></div></Box>
  </div><aside className="g6-stack"><Box title="Preferences affect"><Next title="Wealth projection" detail="Uses preferred reporting currency initially" icon={Wallet} onClick={()=>navigate('wealth-interface')}/><Next title="Notifications" detail="Uses local horizon and enabled setting" icon={Bell} onClick={()=>navigate('notifications')}/><Next title="Onboarding" detail="Shows progress without fabricating records" icon={BookOpen} onClick={()=>navigate('onboarding')}/></Box><Box title="Version"><div className="g6-planning"><strong>Asset OS frontend preview</strong><p>Schema v6; original browser storage key retained for migration. Backend, production identity and integration deployment are separate work.</p></div></Box></aside></div>
 </>
}
function Onboarding(props:Props){
 const {store,navigate}=props
 const steps=onboardingSteps(store)
 const completed=steps.filter(s=>s.complete).length
 const dismissed=store.phase6.settings.welcomeDismissed
 const [error,setError]=useState('')
 return <>
  <Head number={60} title="Onboarding & empty-state guide" description="A truthful checklist showing progress toward a complete local asset-management workflow."
   actions={<Badge tone={completed===steps.length?'green':'blue'}>{completed}/{steps.length} COMPLETE</Badge>}/>
  <Notice warn>This is an onboarding guide for a browser prototype. Your sample assets are illustrative, not personal holdings. No account is created, no bank is connected and no external tasks are sent.</Notice>
  <div className="g6-stats"><Stat icon={BookOpen} title="Guide steps" value={String(steps.length)} detail="Derived from local milestones"/><Stat icon={CheckCircle2} title="Completed" value={String(completed)} detail="Only existing entered data"/><Stat icon={Layers3} title="Your local assets" value={String(store.records.filter(a=>a.origin==='local').length)} detail="Excludes sample records"/><Stat icon={CloudOff} title="Onboarded to Kernel" value="0" detail="No real identity connection"/></div>
  <div className="g6-cols"><div className="g6-stack"><Box title="Guided setup">{steps.map((s,i)=><div className="g6-setup-row" key={s.id}><span className={'g6-setup-index '+(s.complete?'complete':'')}>{s.complete?<Check size={17}/>:String(i+1).padStart(2,'0')}</span><div><strong>{s.title}</strong><small>{s.detail}</small></div><Badge tone={s.complete?'green':'neutral'}>{s.complete?'Recorded':'Not yet recorded'}</Badge><button type="button" className="g6-small" onClick={()=>navigate(s.route)}>Open <ArrowRight size={15}/></button></div>)}</Box>
   <Box title="Onboarding display"><div className="g6-planning"><p>{dismissed?'The optional onboarding guide was previously dismissed. You can re-enable it without changing asset data.':'The onboarding guide is enabled. Dismissing it does not delete progress or prevent access to screens.'}</p><button type="button" className="secondary-button" onClick={()=>apply(props,()=>saveSettings(store,{...store.phase6.settings,welcomeDismissed:!dismissed}),dismissed?'Onboarding guide enabled locally.':'Onboarding guide dismissed locally.',setError)}>{dismissed?'Re-enable guide':'Dismiss guide'}</button><ErrorBox error={error}/></div></Box></div>
   <aside className="g6-stack"><Box title="Understand the environment"><div className="g6-steps">{['Use the public preview without sensitive data','Create your own asset records first','Add acquisition and accepted-local valuations','Track planned maintenance and insurance dates','Review read-only Wealth and contract screens','Production integration requires later secure deployment'].map((x,i)=><div key={x}><b>{i+1}</b><span>{x}</span></div>)}</div></Box><Box title="Start working"><Next title="Asset command center" detail="Current local overview" onClick={()=>navigate('dashboard')} icon={Layers3}/><Next title="Register an asset" detail="Create a new local record" onClick={()=>navigate('assets/new')} icon={Plus}/></Box></aside></div>
 </>
}
export function GovernanceExperience(props:Props){
 const path=props.path.split('?')[0]
 if(path==='wealth-interface')return <Wealth {...props}/>
 if(path==='kernel-actions')return <KernelActions {...props}/>
 if(path==='notifications')return <Notifications {...props}/>
 if(path==='reports')return <Reports {...props}/>
 if(path==='integrations')return <Integrations {...props}/>
 if(path.startsWith('integrations/'))return <IntegrationDetail {...props}/>
 if(path==='team-access')return <Team {...props}/>
 if(path==='security-audit')return <SecurityAudit {...props}/>
 if(path==='settings')return <SettingsPage {...props}/>
 if(path==='onboarding')return <Onboarding {...props}/>
 return <Empty title="Governance screen not found" description="Select a registered Phase 6 destination." action={<button type="button" className="secondary-button" onClick={()=>props.navigate('integrations')}>Integration hub</button>}/>
}
