import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity, ArrowRight, ArrowUpRight, BarChart3, Bell, BookOpen,
  BriefcaseBusiness, Building2, CalendarDays, CarFront,
  ChevronDown, ChevronRight, CircleHelp, Coins, Component,
  ExternalLink, FileText, Gauge, LayoutDashboard, Layers3, Menu,
  Moon, Plus, Search, Server, ShieldCheck, Sparkles,
  Sun, TrendingUp, Wallet, Wrench, X, type LucideIcon
} from 'lucide-react'
import { activity, alerts, allocation, assets, demoSummary, events, type Asset } from './demo'
import { phaseNames, screens } from './inventory'

type Page = 'dashboard' | 'design' | 'roadmap' | 'planned'
type Period = '1M' | '3M' | '6M' | '1Y' | '5Y'
type Palette = 'blue' | 'green' | 'violet' | 'orange' | 'red'

const nav: Array<{name: string; icon: LucideIcon; slug: string; phase: number}> = [
  { name:'Dashboard',icon:LayoutDashboard,slug:'dashboard',phase:1 },
  { name:'My Assets',icon:Layers3,slug:'my-assets',phase:1 },
  { name:'Portfolios',icon:Wallet,slug:'portfolios',phase:5 },
  { name:'Valuations',icon:TrendingUp,slug:'valuations',phase:3 },
  { name:'Income & Expenses',icon:Coins,slug:'income-expenses',phase:3 },
  { name:'Maintenance',icon:Wrench,slug:'maintenance',phase:4 },
  { name:'Insurance',icon:ShieldCheck,slug:'insurance',phase:4 },
  { name:'Utilization',icon:Gauge,slug:'utilization',phase:4 },
  { name:'Risk & Performance',icon:Activity,slug:'risk-performance',phase:5 },
  { name:'Documents',icon:FileText,slug:'documents',phase:4 },
  { name:'Reports',icon:BarChart3,slug:'reports',phase:6 },
  { name:'Intelligence',icon:Sparkles,slug:'intelligence',phase:5 },
]

const integrations = [
  {name:'Finance OS',phase:6},
  {name:'Mission OS',phase:6},
  {name:'Wealth OS',phase:6},
]
const icons: Record<string, LucideIcon> = {
  building: Building2, car: CarFront, chart: BarChart3,
  briefcase: BriefcaseBusiness, server: Server,
}
const periods: Period[] = ['1M','3M','6M','1Y','5Y']
const trendData: Record<Period, number[]> = {
  '1M':[20.9,21.2,21.0,21.7,22.1,22.5,22.2,22.9,23.4,23.2,24.1,24.85],
  '3M':[18.2,18.0,18.8,19.5,20.2,20.1,21.7,21.3,22.8,23.2,24.1,24.85],
  '6M':[15.4,15.8,16.0,16.9,17.4,18.5,19.1,20.0,21.6,22.2,23.7,24.85],
  '1Y':[12.0,13.1,14.3,15.0,16.7,18.0,19.4,20.8,22.2,23.7,23.4,24.85],
  '5Y':[3.9,4.8,6.6,7.1,8.4,10.6,11.7,13.9,16.2,19.4,21.7,24.85],
}
const money = (amount: number) => 'KES ' + Intl.NumberFormat('en-KE').format(amount)
const short = (amount: number) => amount >= 1_000_000 ? 'KES ' + (amount / 1_000_000).toFixed(2) + 'M' : 'KES ' + (amount / 1_000).toFixed(0) + 'K'
const go = (route: string) => { window.location.hash = '/' + route }
const currentPath = () => decodeURIComponent(window.location.hash.replace(/^#\/?/, '')) || 'dashboard'
const getPage = (path: string): Page =>
  path === 'dashboard' ? 'dashboard' : path === 'design' ? 'design' : path === 'roadmap' ? 'roadmap' : 'planned'
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const toneFor = (tone: string) => 'tone-' + tone

function Brand() {
  return <div className="brand">
    <svg className="brand-mark" viewBox="0 0 44 44" aria-hidden="true"><path d="M18 5c2-3 6-3 8 1l14 25c2 3 0 7-4 7H8c-4 0-6-4-4-7L18 5Z" fill="#168bee"/><path d="M23 11 9 36h9l10-18-5-7Z" fill="#6bd0ff"/><path d="M28 18 18 36h17L28 18Z" fill="#075fae"/></svg>
    <div><strong>Asset OS</strong><span>Your assets. Greater clarity. More wealth.</span></div>
  </div>
}

function Surface({ title, action, children, className = '' }: {title:string;action?: ReactNode;children:ReactNode;className?:string}) {
  return <section className={'surface ' + className}><div className="surface-title"><h2>{title}</h2>{action}</div>{children}</section>
}

function Status({label}: {label:string}) {
  return <span className={'status ' + (label === 'Active' ? 'status-active' : 'status-review')}>{label}</span>
}

function AssetGlyph({asset}: {asset:Asset}) {
  const Icon = icons[asset.icon] || Layers3
  return <span className="asset-glyph" style={{backgroundColor:asset.color+'18',color:asset.color}}><Icon size={20} strokeWidth={1.8} /></span>
}

function AssetTable({onSelect,onViewAll}: {onSelect:(asset:Asset)=>void;onViewAll:()=>void}) {
  return <Surface title="Your assets" action={<button className="link-button" onClick={onViewAll}>View all <ArrowRight size={15}/></button>} className="assets-surface">
    <div className="asset-filter-row"><span className="filter-pill selected">All assets <span>05</span></span><span className="filter-caption">Current portfolio snapshot · Demo</span></div>
    <div className="table-scroll"><table className="asset-table"><thead><tr><th>ASSET</th><th>CATEGORY</th><th>CURRENT VALUE</th><th>EQUITY</th><th>STATUS</th><th aria-label="Open"></th></tr></thead><tbody>
      {assets.map(asset=><tr key={asset.id} onClick={()=>onSelect(asset)} className="asset-row">
        <td><button className="asset-name-button" onClick={e=>{e.stopPropagation();onSelect(asset)}}><AssetGlyph asset={asset}/><span><strong>{asset.name}</strong><small>{asset.subtype}</small></span></button></td>
        <td>{asset.category}</td><td className="table-value">{money(asset.value)}</td><td className="table-value">{money(asset.equity)}</td><td><Status label={asset.status}/></td>
        <td><button className="row-open" type="button" aria-label={'Open '+asset.name} onClick={e=>{e.stopPropagation();onSelect(asset)}}><ChevronRight size={16}/></button></td>
      </tr>)}
    </tbody></table></div>
    <div className="surface-footer"><span>Showing 5 illustrative assets</span><button type="button" className="link-button" onClick={onViewAll}>Explore registry <ArrowRight size={15}/></button></div>
  </Surface>
}

function Kpi({label,value,change,icon:Icon,tone,detail}: {label:string;value:string;change:string;icon:LucideIcon;tone:Palette;detail:string}) {
  return <div className={'kpi kpi-'+tone}><div className="kpi-upper"><span>{label}</span><div className="kpi-icon"><Icon size={19}/></div></div><strong>{value}</strong><div className="kpi-foot"><span><ArrowUpRight size={15}/>{change}</span><small>{detail}</small></div></div>
}

function TrendChart({period,changePeriod}: {period:Period;changePeriod:(p:Period)=>void}) {
  const values=trendData[period]
  const points=values.map((v,i)=>[38+i*56.2,210-(v-0)/28*190])
  const line='M '+points.map(p=>p.join(' ')).join(' L ')
  const fill=line+' L '+points[points.length-1][0]+' 210 L 38 210 Z'
  return <Surface title="Net worth trend" className="trend-surface" action={<div className="range-tabs" aria-label="Time range">
    {periods.map(p=><button type="button" key={p} aria-pressed={p===period} className={p===period?'active':''} onClick={()=>changePeriod(p)}>{p}</button>)}
  </div>}>
    <div className="chart-container">
      <svg viewBox="0 0 700 240" role="img" aria-label={'Illustrative net worth trend for '+period+'. Last value KES 24.85 million.'} preserveAspectRatio="xMidYMid meet">
        <defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#268bff" stopOpacity=".32"/><stop offset="100%" stopColor="#268bff" stopOpacity=".01"/></linearGradient></defs>
        {[0,1,2,3,4].map(i=><g key={i}><line x1="38" x2="670" y1={20+i*47.5} y2={20+i*47.5} stroke="currentColor" opacity=".1"/><text x="0" y={25+i*47.5} fill="currentColor" opacity=".56" fontSize="12">{(2.8-i*.7).toFixed(1)}M</text></g>)}
        {values.map((_,i)=><line key={i} x1={38+i*56.2} x2={38+i*56.2} y1="20" y2="210" stroke="currentColor" opacity=".045"/>)}
        <path d={fill} fill="url(#areaFill)" />
        <path d={line} stroke="#318fff" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={points[points.length-1][0]} cy={points[points.length-1][1]} r="5.5" fill="#74bcff" stroke="#081422" strokeWidth="2"/>
        {['Jan','Mar','May','Jul','Sep','Nov'].map((month,i)=><text key={month} x={38+i*112.4} y="232" fill="currentColor" opacity=".55" fontSize="12">{month}</text>)}
      </svg>
      <div className="trend-note"><span className="note-dot"/> <span>Illustrative portfolio trend</span><strong>+12.8% this year</strong></div>
    </div>
  </Surface>
}

function AllocationChart({onView}: {onView:()=>void}) {
  return <Surface title="Asset allocation" className="allocation-surface" action={<button type="button" className="link-button" onClick={onView}>View all <ArrowRight size={15}/></button>}>
    <div className="allocation-inner"><div className="donut" role="img" aria-label="Asset allocation: real estate 49%, vehicles 14%, investments 20%, business 7%, digital assets 10%"><div><strong>24.85M</strong><span>Total value · KES</span></div></div>
    <div className="allocation-legend">{allocation.map(item=><div key={item.label}><span className="legend-name"><i style={{background:item.color}}/>{item.label}</span><strong>{item.pct}%</strong></div>)}</div></div>
  </Surface>
}

function Performance({onView}: {onView:()=>void}) {
  const [metric,setMetric]=useState<'Value'|'Equity'>('Value')
  const series=metric==='Value'?[49,14,20,7,10]:[47,15,28,9,1]
  const colors=allocation.map(a=>a.color)
  return <Surface title="Performance overview" className="performance-surface" action={<button type="button" className="link-button" onClick={onView}>View all <ArrowRight size={15}/></button>}>
    <div className="metric-switch"><button type="button" className={metric==='Value'?'active':''} aria-pressed={metric==='Value'} onClick={()=>setMetric('Value')}>Value</button><button type="button" className={metric==='Equity'?'active':''} aria-pressed={metric==='Equity'} onClick={()=>setMetric('Equity')}>Equity</button><span>Category contribution (%)</span></div>
    <div className="bars" aria-label={'Illustrative '+metric.toLowerCase()+' breakdown by category'}>
      {series.map((value,i)=><div className="bar-cell" key={allocation[i].label}><div className="bar-plot"><div style={{height:(value/50*100)+'%',background:colors[i]}} title={allocation[i].label+': '+value+'%'} /></div><small>{['Real estate','Vehicles','Invest.','Business','Digital'][i]}</small></div>)}
    </div>
    <div className="perform-divider" />
    <h3 className="mini-heading">Top performing assets</h3>
    <div className="perform-list">{assets.slice(0,4).map((asset,i)=><div className="perform-item" key={asset.id}><AssetGlyph asset={asset}/><span>{asset.name}</span><strong><TrendingUp size={13}/>{[12.4,8.6,6.1,4.2][i]}%</strong></div>)}</div>
  </Surface>
}

function InsightPanels({onPlanned,onAlert}: {onPlanned:(phase:number,title:string)=>void;onAlert:(title:string,detail:string)=>void}) {
  return <aside className="insight-column">
    <Surface title="Needs attention" action={<button className="link-button" type="button" onClick={()=>onPlanned(4,'Needs attention')}>View all <ArrowRight size={15}/></button>}>
      <div className="alert-list">{alerts.map(item=><button type="button" className="insight-row" key={item.id} onClick={()=>onAlert(item.title,item.detail)}>
        <span className={'insight-icon '+toneFor(item.tone)}><Bell size={18}/></span><span className="insight-description"><strong>{item.title}</strong><small>{item.detail}</small></span><span className="insight-right"><ChevronRight size={16}/></span>
      </button>)}</div>
    </Surface>
    <Surface title="Upcoming events" action={<button className="link-button" type="button" onClick={()=>onPlanned(4,'Operational Calendar')}>View all <ArrowRight size={15}/></button>}>
      <div className="event-list">{events.map((item,i)=><button className="event-row" type="button" key={i} onClick={()=>onAlert(item.title,item.detail)}><span className="event-date"><small>{item.date.split(' ')[0]}</small><strong>{item.date.split(' ')[1]}</strong></span><span className={'insight-icon small '+toneFor(item.tone)}><CalendarDays size={16}/></span><span className="insight-description"><strong>{item.title}</strong><small>{item.detail}</small></span></button>)}</div>
    </Surface>
    <Surface title="Recent activity" action={<button className="link-button" type="button" onClick={()=>onPlanned(1,'Asset Activity Timeline')}>View all <ArrowRight size={15}/></button>}>
      <div className="activity-list">{activity.map((item,i)=><div className="activity-row" key={i}><span className={'insight-icon small '+toneFor(item.tone)}>{i===1?<Wrench size={16}/>:i===2?<Plus size={16}/>:<TrendingUp size={16}/>}</span><span className="insight-description"><strong>{item.title}</strong><small>{item.detail}</small></span><small className="when">{item.when}</small></div>)}</div>
    </Surface>
  </aside>
}

function Dashboard({onSelect,onPlanned,onAlert}: {onSelect:(a:Asset)=>void;onPlanned:(phase:number,title:string)=>void;onAlert:(title:string,detail:string)=>void}) {
  const [period,setPeriod]=useState<Period>('1Y')
  return <>
    <div className="page-intro"><div><span className="eyebrow">YOUR ASSET COMMAND CENTER</span><h1>Good morning <span className="wave">✳</span></h1><p>Here’s the complete picture of your assets and their performance.</p></div><div className="page-actions"><span className="today-chip"><CalendarDays size={16}/> Overview</span><button className="primary-button" type="button" onClick={()=>onPlanned(1,'Create Asset')}><Plus size={18}/> Add asset</button></div></div>
    <div className="notice"><span className="notice-pill">DEMO DATA</span><span>Illustrative KES figures. No personal assets or financial accounts are connected.</span><button type="button" onClick={()=>onPlanned(6,'Integration Hub')}>About connections <ArrowRight size={14}/></button></div>
    <div className="dashboard-layout">
      <div className="dashboard-main">
        <div className="kpi-grid">
          <Kpi label="Total asset value" value={short(demoSummary.value)} change="+3.2%" icon={BarChart3} tone="violet" detail="vs. last month"/>
          <Kpi label="Total equity" value={short(demoSummary.equity)} change="+4.1%" icon={Layers3} tone="green" detail="vs. last month"/>
          <Kpi label="Monthly asset income" value={short(demoSummary.monthlyIncome)} change="+6.8%" icon={TrendingUp} tone="blue" detail="vs. last month"/>
          <Kpi label="Monthly expenses" value={short(demoSummary.monthlyExpenses)} change="-2.3%" icon={FileText} tone="red" detail="vs. last month"/>
        </div>
        <div className="chart-grid"><TrendChart period={period} changePeriod={setPeriod}/><AllocationChart onView={()=>onPlanned(5,'Asset Allocation and Concentration')}/></div>
        <div className="bottom-grid"><AssetTable onSelect={onSelect} onViewAll={()=>onPlanned(1,'My Assets — Registry')}/><Performance onView={()=>onPlanned(5,'Performance Intelligence Center')}/></div>
      </div>
      <InsightPanels onPlanned={onPlanned} onAlert={onAlert}/>
    </div>
  </>
}

function DesignSystem({openModal}: {openModal:()=>void}) {
  const [input,setInput]=useState('')
  const colors=[['Ocean blue','#268bff'],['Success green','#48d1a5'],['Amber','#f2bd65'],['Alert coral','#f27c80'],['Digital violet','#a589ee'],['Ink navy','#08121f']]
  return <div className="support-page"><div className="page-intro"><div><span className="eyebrow">FOUNDATION / 00</span><h1>Design system</h1><p>The reusable visual language behind every Asset OS screen.</p></div></div>
    <div className="support-banner"><Component size={20}/><div><strong>Phase 0 component laboratory</strong><span>Production-ready primitives for the next 60 screens. All examples are local UI controls.</span></div></div>
    <div className="design-grid">
      <Surface title="Color system"><div className="swatches">{colors.map(([name,hex])=><div key={name} className="swatch"><span style={{background:hex}}/><strong>{name}</strong><small>{hex}</small></div>)}</div></Surface>
      <Surface title="Typography & hierarchy"><div className="type-demo"><div className="type-display">Assets in focus.</div><h2>Your wealth, in context.</h2><p>Primary body text supports clear, confident decisions. Secondary text explains sources, status and next actions.</p><small className="eyebrow">OVERLINE / SYSTEM LABEL / 12PX</small></div></Surface>
      <Surface title="Buttons & actions"><div className="component-stack"><button type="button" className="primary-button" onClick={openModal}><Plus size={17}/> Primary action</button><button type="button" className="secondary-button" onClick={openModal}>Secondary action <ChevronRight size={16}/></button><button type="button" className="link-button" onClick={openModal}>Text action <ArrowRight size={15}/></button></div></Surface>
      <Surface title="Form & status primitives"><div className="form-demo"><label htmlFor="token-input">Field label</label><input id="token-input" value={input} onChange={e=>setInput(e.target.value)} placeholder="Try an asset name..." /><small>{input ? 'Preview: '+input : 'Accessible focus and validation-ready input'}</small><div className="status-demo"><Status label="Active"/><Status label="Review"/><span className="status status-neutral">Planned</span></div></div></Surface>
    </div>
  </div>
}

function Roadmap({onPhase}: {onPhase:(phase:number,title:string)=>void}) {
  const [filter,setFilter]=useState<number | 'all'>('all')
  const matches=filter==='all'?screens:screens.filter(screen=>screen.phase===filter)
  return <div className="support-page"><div className="page-intro"><div><span className="eyebrow">DELIVERY TRACKER / AOS</span><h1>Screen roadmap</h1><p>Transparent progress across the complete 60-screen Asset OS experience.</p></div></div>
    <div className="roadmap-hero"><div><span className="eyebrow">CURRENT MILESTONE</span><h2>Phase 0 — Design foundation</h2><p>Application shell, reusable tokens, shared components, prototype charts, navigation and GitHub Pages pipeline.</p></div><div className="roadmap-count"><strong>00<span>/60</span></strong><small>product screens certified</small></div></div>
    <div className="roadmap-filter" role="group" aria-label="Filter screens"><button type="button" className={filter==='all'?'active':''} aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>All phases</button>{phaseNames.map((_,i)=><button type="button" key={i} className={filter===i+1?'active':''} aria-pressed={filter===i+1} onClick={()=>setFilter(i+1)}>Phase {i+1}</button>)}</div>
    <div className="roadmap-list">{matches.map(screen=><button className="roadmap-item" type="button" key={screen.id} onClick={()=>onPhase(screen.phase,screen.title)}><span className="screen-number">{String(screen.id).padStart(2,'0')}</span><span><strong>{screen.title}</strong><small>Phase {screen.phase} · {phaseNames[screen.phase-1]}</small></span><span className="status status-neutral">Planned</span><ChevronRight size={16}/></button>)}</div>
  </div>
}

function Planned({title,phase}: {title:string;phase:number}) {
  return <div className="support-page"><div className="page-intro"><div><span className="eyebrow">UPCOMING PRODUCT EXPERIENCE</span><h1>{title}</h1><p>Reserved in the canonical screen inventory. Not yet implemented.</p></div></div><div className="planned-panel"><span className="planned-icon"><BookOpen size={28}/></span><span className="eyebrow">SCHEDULED FOR PHASE {phase}</span><h2>Designed to be complete, not just clickable.</h2><p>This destination is intentionally marked as planned. Its full UI, validated interactions, relevant states and connected navigation will be developed in Phase {phase}.</p><button className="primary-button" type="button" onClick={()=>go('roadmap')}>Explore all 60 screens <ArrowRight size={17}/></button></div></div>
}

function Dialog({title,children,onClose}: {title:string;children:ReactNode;onClose:()=>void}) {
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[onClose])
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="dialog" role="dialog" aria-modal="true" aria-label={title}><div className="dialog-head"><h2>{title}</h2><button type="button" aria-label="Close dialog" className="icon-button" onClick={onClose}><X size={20}/></button></div>{children}</div></div>
}

export default function App() {
  const [path,setPath]=useState(currentPath)
  const [theme,setTheme]=useState<'dark'|'light'>('dark')
  const [menuOpen,setMenuOpen]=useState(false)
  const [notificationsOpen,setNotificationsOpen]=useState(false)
  const [search,setSearch]=useState('')
  const [selected,setSelected]=useState<Asset|null>(null)
  const [dialog,setDialog]=useState<{title:string;description:string;phase?:number}|null>(null)
  useEffect(()=>{const handle=()=>{setPath(currentPath());setMenuOpen(false);setSearch('');setNotificationsOpen(false)};window.addEventListener('hashchange',handle);return()=>window.removeEventListener('hashchange',handle)},[])
  const page=getPage(path)
  const pageSlug=path.split('/').slice(1).join('/')
  const foundNav=[...nav,...integrations.map(i=>({...i,slug:slug(i.name),icon:Layers3}))].find(n=>n.slug===pageSlug)
  const plannedTitle=foundNav?.name || (pageSlug?decodeURIComponent(pageSlug).replace(/-/g,' '):'Future screen')
  const plannedPhase=foundNav?.phase || 1
  const results=useMemo(()=>search.trim()?assets.filter(a=>(a.name+' '+a.category+' '+a.subtype).toLowerCase().includes(search.toLowerCase())).slice(0,5):[],[search])
  const openPlanned=(phase:number,title:string)=>setDialog({title,phase,description:'This screen is reserved for Phase '+phase+'. The Phase 0 preview intentionally does not simulate completed data-entry or production workflows.'})
  const openAlert=(title:string,detail:string)=>setDialog({title,description:detail+'. This is illustrative demo data. Operational actions are implemented in their scheduled development phases.'})
  return <div className="app" data-theme={theme}>
    {menuOpen && <button type="button" className="mobile-scrim" aria-label="Close navigation" onClick={()=>setMenuOpen(false)}/>}
    <aside className={'sidebar '+(menuOpen?'sidebar-open':'')} aria-label="Main navigation">
      <Brand />
      <div className="sidebar-scroll">
        <div className="nav-section"><span className="nav-heading">WORKSPACE</span>{nav.map(item=><button type="button" key={item.slug} className={'nav-item '+((item.slug==='dashboard'&&page==='dashboard'||page==='planned'&&item.slug===pageSlug)?'current':'')} onClick={()=>{go(item.slug==='dashboard'?'dashboard':'planned/'+item.slug);setMenuOpen(false)}}><item.icon size={19} strokeWidth={1.8}/><span>{item.name}</span>{item.slug!=='dashboard'&&<span className="nav-soon" title={'Phase '+item.phase}>P{item.phase}</span>}</button>)}</div>
        <div className="nav-section integration-section"><span className="nav-heading">INTEGRATIONS</span>{integrations.map(item=><button type="button" className="nav-item" key={item.name} onClick={()=>{go('planned/'+slug(item.name));setMenuOpen(false)}}><Layers3 size={18}/><span>{item.name}</span><span className="nav-soon">P6</span></button>)}</div>
        <div className="nav-section foundation-section"><span className="nav-heading">BUILD FOUNDATION</span><button type="button" className={'nav-item '+(page==='design'?'current':'')} onClick={()=>go('design')}><Component size={18}/><span>Design system</span></button><button type="button" className={'nav-item '+(page==='roadmap'?'current':'')} onClick={()=>go('roadmap')}><BookOpen size={18}/><span>60-screen roadmap</span></button></div>
      </div>
      <div className="sidebar-bottom"><div className="assistant-card"><span className="assistant-icon"><Sparkles size={18}/></span><strong>Asset intelligence</strong><p>Intelligence workflows arrive in Phase 5.</p><button type="button" onClick={()=>openPlanned(5,'Asset AI Intelligence Assistant')}>Explore the roadmap <ArrowRight size={15}/></button></div><div className="sidebar-version"><span className="ready-dot"/> Phase 0 · UI foundation <span>v0.1</span></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="topbar-left"><button type="button" className="icon-button mobile-menu" onClick={()=>setMenuOpen(o=>!o)} aria-label="Toggle navigation"><Menu size={21}/></button><span className="breadcrumb-label">Personal Kernel</span><ChevronRight size={15} className="crumb-divider"/><strong>Asset OS</strong></div>
        <div className="global-search"><Search size={18}/><input type="search" aria-label="Search demonstration assets" placeholder="Search assets, documents, or ask..." value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&results[0]){setSelected(results[0]);setSearch('')}}}/><kbd>⌘ K</kbd>
          {search.trim()&&<div className="search-results"><span className="eyebrow">DEMO ASSET RESULTS</span>{results.length?results.map(asset=><button type="button" key={asset.id} onClick={()=>{setSelected(asset);setSearch('')}}><AssetGlyph asset={asset}/><span><strong>{asset.name}</strong><small>{asset.category}</small></span><ArrowRight size={16}/></button>):<p>No sample assets match your search.</p>}</div>}
        </div>
        <div className="topbar-actions"><span className="demo-flag">PREVIEW</span><button type="button" className="icon-button" onClick={()=>setTheme(t=>t==='dark'?'light':'dark')} aria-label={theme==='dark'?'Switch to light theme':'Switch to dark theme'}>{theme==='dark'?<Sun size={20}/>:<Moon size={20}/>}</button><div className="notification-anchor"><button type="button" className="icon-button" aria-label="Show demo notifications" aria-expanded={notificationsOpen} onClick={()=>setNotificationsOpen(p=>!p)}><Bell size={19}/><span className="notification-dot">3</span></button>{notificationsOpen&&<div className="notification-menu"><strong>Demo notifications</strong>{alerts.slice(0,3).map(alert=><button type="button" key={alert.id} onClick={()=>{setNotificationsOpen(false);openAlert(alert.title,alert.detail)}}><span>{alert.title}</span><small>{alert.detail}</small></button>)}</div>}</div><div className="account-chip"><span>AO</span><div><strong>Preview workspace</strong><small>Local demo mode</small></div><ChevronDown size={15}/></div></div>
      </header>
      <main className="main-content">{page==='dashboard'?<Dashboard onSelect={setSelected} onPlanned={openPlanned} onAlert={openAlert}/>:page==='design'?<DesignSystem openModal={()=>setDialog({title:'Reusable dialog',description:'This is a working, keyboard-dismissable modal using the Asset OS dialog component.'})}/>:page==='roadmap'?<Roadmap onPhase={openPlanned}/>:<Planned title={plannedTitle} phase={plannedPhase}/>}
        <footer className="app-footer"><span>© 2026 Asset OS · Personal Kernel ecosystem · Prototype only</span><div><button type="button" onClick={()=>go('roadmap')}><BookOpen size={14}/> Screen plan</button><a href="https://github.com/Sean-steve/Asset-Os" target="_blank" rel="noreferrer"><ExternalLink size={14}/> GitHub repository</a></div></footer>
      </main>
    </div>
    {selected&&<Dialog title="Illustrative asset detail" onClose={()=>setSelected(null)}><div className="asset-detail-modal"><div className="modal-asset"><AssetGlyph asset={selected}/><div><h3>{selected.name}</h3><span>{selected.id} · {selected.category} · Sample data</span></div></div><div className="detail-stat-grid"><div><small>Current value</small><strong>{money(selected.value)}</strong></div><div><small>Equity</small><strong>{money(selected.equity)}</strong></div></div><p>This preview demonstrates the shared asset detail entry point. The complete Asset Details experience is scheduled for Phase 1; these values are not connected to a database.</p><button className="primary-button" type="button" onClick={()=>{setSelected(null);go('roadmap')}}>See delivery roadmap <ArrowRight size={16}/></button></div></Dialog>}
    {dialog&&<Dialog title={dialog.title} onClose={()=>setDialog(null)}><div className="informational-modal"><span className="modal-callout"><CircleHelp size={20}/> Foundation preview</span><p>{dialog.description}</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setDialog(null)}>Close</button>{dialog.phase&&<button type="button" className="primary-button" onClick={()=>{setDialog(null);go('roadmap')}}>View Phase {dialog.phase} <ArrowRight size={16}/></button>}</div></div></Dialog>}
  </div>
}
