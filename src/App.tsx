import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity, ArrowRight, ArrowUpRight, BarChart3, Bell, BookOpen, CheckCircle2,
  BriefcaseBusiness, Building2, CalendarDays, CarFront, Calculator, Receipt, Archive, Users, Landmark, Link2,
  ChevronDown, ChevronRight, CircleHelp, Coins, Component,
  ExternalLink, FileText, Gauge, LayoutDashboard, Layers3, Menu,
  Moon, Plus, Search, Server, ShieldCheck, Sparkles, Scale, Settings, LockKeyhole, ClipboardList,
  Sun, TrendingUp, Wallet, Wrench, X, type LucideIcon
} from 'lucide-react'
import { activity, alerts, allocation, events, type Asset } from './demo'
import { RegistryExperience } from './registry/RegistryExperience'
import { LifecycleExperience } from './lifecycle/LifecycleExperience'
import { EconomicsExperience } from './economics/EconomicsExperience'
import { OperationsExperience } from './operations/OperationsExperience'
import { IntelligenceExperience } from './intelligence/IntelligenceExperience'
import { GovernanceExperience } from './governance/GovernanceExperience'
import { alertsFor } from './governance/core'
import { flowSummary, indicativeEquity } from './economics/core'
import { loadRegistry, saveRegistry, sumInCurrency, type AssetRecord, type RegistryState } from './registry/core'
import { phaseNames, screens } from './inventory'

type Page = 'dashboard' | 'design' | 'roadmap' | 'planned' | 'registry' | 'lifecycle' | 'economics' | 'operations' | 'intelligence' | 'governance'
type Period = '1M' | '3M' | '6M' | '1Y' | '5Y'
type Palette = 'blue' | 'green' | 'violet' | 'orange' | 'red'

const nav: Array<{name: string; icon: LucideIcon; slug: string; phase: number}> = [
  { name:'Dashboard',icon:LayoutDashboard,slug:'dashboard',phase:1 },
  { name:'My Assets',icon:Layers3,slug:'assets',phase:1 },
  { name:'Classifications',icon:Component,slug:'classifications',phase:1 },
  { name:'Asset tags',icon:BookOpen,slug:'tags',phase:1 },
  { name:'Advanced search',icon:Search,slug:'search',phase:1 },
  { name:'Asset activity',icon:Activity,slug:'activity',phase:1 },
  { name:'Type-specific views',icon:Layers3,slug:'type-views',phase:1 },
  { name:'Acquisitions',icon:Receipt,slug:'acquisitions',phase:2 },
  { name:'Cost basis',icon:Calculator,slug:'cost-basis',phase:2 },
  { name:'Asset lifecycle',icon:Activity,slug:'lifecycle',phase:2 },
  { name:'Ownership',icon:Users,slug:'ownership',phase:2 },
  { name:'Disposition history',icon:Archive,slug:'dispositions',phase:2 },
  { name:'Portfolios',icon:Wallet,slug:'portfolios',phase:5 },
  { name:'Asset allocation',icon:BarChart3,slug:'allocation',phase:5 },
  { name:'Asset comparison',icon:Scale,slug:'comparison',phase:5 },
  { name:'Performance',icon:TrendingUp,slug:'performance',phase:5 },
  { name:'Risk center',icon:ShieldCheck,slug:'risk-center',phase:5 },
  { name:'Underperforming assets',icon:Activity,slug:'underperforming',phase:5 },
  { name:'Scenarios',icon:Gauge,slug:'scenarios',phase:5 },
  { name:'Valuations',icon:TrendingUp,slug:'valuations',phase:3 },
  { name:'Valuation history',icon:CalendarDays,slug:'valuation-history',phase:3 },
  { name:'Financing',icon:Landmark,slug:'financing',phase:3 },
  { name:'Income & Expenses',icon:Coins,slug:'income-expenses',phase:3 },
  { name:'Cash flow',icon:BarChart3,slug:'cash-flow',phase:3 },
  { name:'Equity & ROI',icon:TrendingUp,slug:'economics',phase:3 },
  { name:'Reconciliation',icon:Link2,slug:'reconciliation',phase:3 },
  { name:'Maintenance',icon:Wrench,slug:'maintenance',phase:4 },
  { name:'Maintenance plans',icon:CalendarDays,slug:'maintenance/plans',phase:4 },
  { name:'Service jobs',icon:Wrench,slug:'maintenance/jobs',phase:4 },
  { name:'Insurance',icon:ShieldCheck,slug:'insurance',phase:4 },
  { name:'Utilization',icon:Gauge,slug:'utilization',phase:4 },
  { name:'Locations & links',icon:Layers3,slug:'locations',phase:4 },
  { name:'Operations calendar',icon:CalendarDays,slug:'operations-calendar',phase:4 },
  { name:'Evidence references',icon:FileText,slug:'evidence',phase:4 },
  { name:'Wealth OS interface',icon:Wallet,slug:'wealth-interface',phase:6 },
  { name:'Kernel action center',icon:ClipboardList,slug:'kernel-actions',phase:6 },
  { name:'Notifications',icon:Bell,slug:'notifications',phase:6 },
  { name:'Reports & exports',icon:BarChart3,slug:'reports',phase:6 },
  { name:'Integration hub',icon:Link2,slug:'integrations',phase:6 },
  { name:'Team & access',icon:Users,slug:'team-access',phase:6 },
  { name:'Security & audit',icon:LockKeyhole,slug:'security-audit',phase:6 },
  { name:'Workspace settings',icon:Settings,slug:'settings',phase:6 },
  { name:'Onboarding',icon:BookOpen,slug:'onboarding',phase:6 },
  { name:'Intelligence',icon:Sparkles,slug:'intelligence',phase:5 },
]

const integrations = [
  {name:'Finance OS',system:'FINANCE_OS',phase:6},
  {name:'Mission OS',system:'MISSION_OS',phase:6},
  {name:'Wealth OS',system:'WEALTH_OS',phase:6},
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
const short = (amount: number) => amount >= 1_000_000 ? 'KES ' + (amount / 1_000_000).toFixed(2) + 'M' : amount >= 1_000 ? 'KES ' + (amount / 1_000).toFixed(0) + 'K' : 'KES ' + Intl.NumberFormat('en-KE').format(amount)
const go = (route: string) => { window.location.hash = '/' + route }
const currentPath = () => decodeURIComponent(window.location.hash.replace(/^#\/?/, '')) || 'dashboard'
const getPage = (path: string): Page =>
  path === 'dashboard' ? 'dashboard' : path === 'design' ? 'design' : path === 'roadmap' ? 'roadmap' : /^(assets(?:\/new)?|asset\/|classifications$|tags$|search$|activity$|type-views$)/.test(path) ? 'registry' : /^(acquisitions(?:\/|$)|cost-basis(?:\/|$)|lifecycle(?:\?|$)|ownership(?:\/|$)|dispose(?:\/|$)|dispositions(?:\/|$))/.test(path) ? 'lifecycle' : /^(valuations(?:\/|$)|valuation-history(?:\?|$)|financing(?:\/|$)|income-expenses$|cash-flow(?:\?|$)|economics(?:\?|$)|reconciliation$)/.test(path) ? 'economics' : /^(maintenance(?:\/|$)|insurance(?:\/|$)|utilization(?:\/|$)|evidence$|locations$|operations-calendar$)/.test(path) ? 'operations' : /^(portfolios$|portfolio\/|allocation(?:\?|$)|comparison$|performance(?:\?|$)|risk-center$|risk\/|underperforming$|scenarios(?:\?|$)|intelligence$)/.test(path) ? 'intelligence' : /^(wealth-interface$|kernel-actions$|notifications$|reports$|integrations(?:\/|$)|team-access$|security-audit$|settings$|onboarding$)/.test(path) ? 'governance' : 'planned'
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const toneFor = (tone: string) => 'tone-' + tone
const currency = (amount:number,code:string) => new Intl.NumberFormat('en-KE',{maximumFractionDigits:2}).format(amount)+' '+code
const viewAsset = (a:AssetRecord):Asset => ({id:a.id,name:a.name,category:a.category,subtype:a.subcategory,value:a.value,equity:a.equity,status:a.lifecycle==='ACTIVE'?'Active':a.lifecycle.split('_').map(s=>s[0]+s.slice(1).toLowerCase()).join(' '),icon:({ 'Real Estate':'building',Vehicles:'car',Investments:'chart',Business:'briefcase','Digital Assets':'server' } as Record<string,string>)[a.category]||'layers',color:({ 'Real Estate':'#478ffa',Vehicles:'#45cba4',Investments:'#f0bf63',Business:'#f58c63','Digital Assets':'#a384f5' } as Record<string,string>)[a.category]||'#95a9c9',currency:a.currency,lifecycle:a.lifecycle})

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

function AssetTable({items,onSelect,onViewAll}: {items:Asset[];onSelect:(asset:Asset)=>void;onViewAll:()=>void}) {
  return <Surface title="Your assets" action={<button className="link-button" onClick={onViewAll}>View all <ArrowRight size={15}/></button>} className="assets-surface">
    <div className="asset-filter-row"><span className="filter-pill selected">All assets <span>{items.length}</span></span><span className="filter-caption">Browser registry preview · Local / sample</span></div>
    <div className="table-scroll"><table className="asset-table"><thead><tr><th>ASSET</th><th>CATEGORY</th><th>CURRENT VALUE</th><th>EQUITY</th><th>STATUS</th><th aria-label="Open"></th></tr></thead><tbody>
      {items.slice(0,6).map(asset=><tr key={asset.id} onClick={()=>onSelect(asset)} className="asset-row">
        <td><button className="asset-name-button" onClick={e=>{e.stopPropagation();onSelect(asset)}}><AssetGlyph asset={asset}/><span><strong>{asset.name}</strong><small>{asset.subtype}</small></span></button></td>
        <td>{asset.category}</td><td className="table-value">{currency(asset.value,asset.currency||"KES")}</td><td className="table-value">{currency(asset.equity,asset.currency||"KES")}</td><td><Status label={asset.status}/></td>
        <td><button className="row-open" type="button" aria-label={'Open '+asset.name} onClick={e=>{e.stopPropagation();onSelect(asset)}}><ChevronRight size={16}/></button></td>
      </tr>)}
    </tbody></table></div>
    <div className="surface-footer"><span>Showing {Math.min(6,items.length)} of {items.length} browser assets</span><button type="button" className="link-button" onClick={onViewAll}>Explore registry <ArrowRight size={15}/></button></div>
  </Surface>
}

function Kpi({label,value,change,icon:Icon,tone,detail}: {label:string;value:string;change:string;icon:LucideIcon;tone:Palette;detail:string}) {
  return <div className={'kpi kpi-'+tone}><div className="kpi-upper"><span>{label}</span><div className="kpi-icon"><Icon size={19}/></div></div><strong>{value}</strong><div className="kpi-foot"><span>{change.startsWith('+')&&<ArrowUpRight size={15}/>} {change}</span><small>{detail}</small></div></div>
}

function TrendChart({period,changePeriod}: {period:Period;changePeriod:(p:Period)=>void}) {
  const values=trendData[period]
  const points=values.map((v,i)=>[38+i*56.2,210-(v-0)/28*190])
  const line='M '+points.map(p=>p.join(' ')).join(' L ')
  const fill=line+' L '+points[points.length-1][0]+' 210 L 38 210 Z'
  return <Surface title="Illustrative trend (demo only)" className="trend-surface" action={<div className="range-tabs" aria-label="Time range">
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

function AllocationChart({items,onView}: {items:Asset[];onView:()=>void}) {
  const kes=items.filter(a=>a.currency==='KES'&&['ACQUIRED','ACTIVE','SUSPENDED'].includes(a.lifecycle||''))
  const total=kes.reduce((s,a)=>s+a.value,0)
  const segments=allocation.map(x=>({...x,value:kes.filter(a=>a.category===x.label).reduce((s,a)=>s+a.value,0)}))
  const boundaries=segments.reduce((acc,s)=>{const last=acc.length?acc[acc.length-1].end:0;const end=total>0?last+s.value/total*100:0;acc.push({...s,start:last,end});return acc},[] as Array<typeof segments[number]&{start:number;end:number}>)
  const bg=total>0?'conic-gradient('+boundaries.filter(x=>x.value>0).map(x=>x.color+' '+x.start+'% '+x.end+'%').join(',')+')':'var(--panel-2)'
  return <Surface title="Asset allocation" className="allocation-surface" action={<button type="button" className="link-button" onClick={onView}>Phase 5 <ArrowRight size={15}/></button>}>
    <div className="allocation-inner"><div className="donut" style={{background:bg}} role="img" aria-label="Current KES asset allocation by category"><div><strong>{total?(total/1_000_000).toFixed(2)+'M':'—'}</strong><span>Tracked value · KES</span></div></div>
    <div className="allocation-legend">{boundaries.filter(i=>i.value>0).map(item=><div key={item.label}><span className="legend-name"><i style={{background:item.color}}/>{item.label}</span><strong>{total>0?(item.value/total*100).toFixed(1):'0'}%</strong></div>)}{total===0&&<span className="p1-subtle">No KES asset values yet.</span>}</div></div>
  </Surface>
}

function Performance({items,onView}: {items:Asset[];onView:()=>void}) {
  const [metric,setMetric]=useState<'Value'|'Equity'>('Value')
  const categories=allocation
  const kes=items.filter(a=>a.currency==='KES'&&['ACQUIRED','ACTIVE','SUSPENDED'].includes(a.lifecycle||''))
  const grand=kes.reduce((sum,a)=>sum+(metric==='Value'?a.value:a.equity),0)
  const series=categories.map(c=>kes.filter(a=>a.category===c.label).reduce((sum,a)=>sum+(metric==='Value'?a.value:a.equity),0))
  const maxima=Math.max(1,...series)
  return <Surface title="Category contribution" className="performance-surface" action={<button type="button" className="link-button" onClick={onView}>Phase 5 <ArrowRight size={15}/></button>}>
    <div className="metric-switch"><button type="button" className={metric==='Value'?'active':''} aria-pressed={metric==='Value'} onClick={()=>setMetric('Value')}>Value</button><button type="button" className={metric==='Equity'?'active':''} aria-pressed={metric==='Equity'} onClick={()=>setMetric('Equity')}>Equity</button><span>KES category snapshot</span></div>
    <div className="bars" aria-label={'Tracked '+metric.toLowerCase()+' by category, KES'}>
      {series.map((value,i)=><div className="bar-cell" key={categories[i].label}><div className="bar-plot"><div style={{height:(value/maxima*100)+'%',background:categories[i].color}} title={categories[i].label+': '+(grand?value/grand*100:0).toFixed(1)+'%'} /></div><small>{categories[i].label}</small></div>)}
    </div>
    <div className="perform-divider" />
    <h3 className="mini-heading">Largest KES assets</h3>
    <div className="perform-list">{kes.slice().sort((a,b)=>b.value-a.value).slice(0,4).map(asset=><div className="perform-item" key={asset.id}><AssetGlyph asset={asset}/><span>{asset.name}</span><strong>{short(asset.value)}</strong></div>)}{!kes.length&&<div className="p1-empty-small">No KES assets tracked.</div>}</div>
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

function Dashboard({items,store,onSelect,onPlanned,onAlert}: {items:Asset[];store:RegistryState;onSelect:(a:Asset)=>void;onPlanned:(phase:number,title:string)=>void;onAlert:(title:string,detail:string)=>void}) {
  const [period,setPeriod]=useState<Period>('1Y')
  const value=sumInCurrency(store.records,'value','KES')
  const held=store.records.filter(a=>a.currency==='KES'&&['ACQUIRED','ACTIVE','SUSPENDED'].includes(a.lifecycle))
  const equity=held.reduce((sum,a)=>sum+indicativeEquity(store,a.id).amount,0)
  const flow=flowSummary(store.phase3.flows,'KES')
  return <>
    <div className="page-intro"><div><span className="eyebrow">YOUR ASSET COMMAND CENTER</span><h1>Good morning <span className="wave">✳</span></h1><p>Here’s the complete picture of your assets and their performance.</p></div><div className="page-actions"><span className="today-chip"><CalendarDays size={16}/> Overview</span><button className="primary-button" type="button" onClick={()=>go('assets/new')}><Plus size={18}/> Add asset</button></div></div>
    <div className="notice"><span className="notice-pill">DEMO DATA</span><span>KES value, indicative equity and all-time income/expenses reflect browser records. Trend, alerts and events remain illustrative; no financial accounts are connected.</span><button type="button" onClick={()=>onPlanned(6,'Integration Hub')}>About connections <ArrowRight size={14}/></button></div>
    <div className="dashboard-layout">
      <div className="dashboard-main">
        <div className="kpi-grid">
          <Kpi label="Held KES asset value" value={short(value)} change="Browser" icon={BarChart3} tone="violet" detail="local records"/>
          <Kpi label="Indicative KES equity" value={short(equity)} change="Unverified" icon={Layers3} tone="green" detail="local records"/>
          <Kpi label="Recorded KES income" value={short(flow.INCOME)} change="Browser" icon={TrendingUp} tone="blue" detail="all-time entries"/>
          <Kpi label="Recorded KES expenses" value={short(flow.EXPENSE)} change="Browser" icon={FileText} tone="red" detail="all-time entries"/>
        </div>
        <div className="chart-grid"><TrendChart period={period} changePeriod={setPeriod}/><AllocationChart items={items} onView={()=>onPlanned(5,'Asset Allocation and Concentration')}/></div>
        <div className="bottom-grid"><AssetTable items={items} onSelect={onSelect} onViewAll={()=>go('assets')}/><Performance items={items} onView={()=>onPlanned(5,'Performance Intelligence Center')}/></div>
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

function Roadmap({onPhase,onRoute,firstAssetId}: {onPhase:(phase:number,title:string)=>void;onRoute:(route:string)=>void;firstAssetId:string|null}) {
  const [filter,setFilter]=useState<number | 'all'>('all')
  const matches=filter==='all'?screens:screens.filter(screen=>screen.phase===filter)
  return <div className="support-page"><div className="page-intro"><div><span className="eyebrow">DELIVERY TRACKER / AOS</span><h1>Screen roadmap</h1><p>Transparent progress across the complete 60-screen Asset OS experience.</p></div></div>
    <div className="roadmap-hero"><div><span className="eyebrow">CURRENT MILESTONE</span><h2>Phase 6 — Kernel interfaces & administration</h2><p>All 60 frontend screens now have navigable experiences: Wealth projection, local Kernel proposal drafts, derived reminders, reports, disconnected integration contracts, role previews, local audit browsing, settings and onboarding. Browser-local only; production integrations remain unconnected.</p></div><div className="roadmap-count"><strong>60<span>/60</span></strong><small>frontend screens implemented</small></div></div>
    <div className="roadmap-filter" role="group" aria-label="Filter screens"><button type="button" className={filter==='all'?'active':''} aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>All phases</button>{phaseNames.map((_,i)=><button type="button" key={i} className={filter===i+1?'active':''} aria-pressed={filter===i+1} onClick={()=>setFilter(i+1)}>Phase {i+1}</button>)}</div>
    <div className="roadmap-list">{matches.map(screen=><button className="roadmap-item" type="button" key={screen.id} onClick={()=>screen.phase===1?onRoute((['dashboard','assets',firstAssetId?'asset/'+encodeURIComponent(firstAssetId):'assets/new','assets/new',firstAssetId?'asset/'+encodeURIComponent(firstAssetId)+'/edit':'assets/new','classifications','tags','search','activity','type-views'][screen.id-1])||'assets'):screen.phase===2?onRoute((['acquisitions','acquisitions/new',firstAssetId?'acquisitions/'+encodeURIComponent(firstAssetId):'acquisitions','cost-basis','lifecycle','ownership',firstAssetId?'ownership/'+encodeURIComponent(firstAssetId):'ownership',firstAssetId?'ownership/manage/'+encodeURIComponent(firstAssetId):'ownership/manage','dispose','dispositions'][screen.id-11])||'acquisitions'):screen.phase===3?onRoute((['valuations','valuations','valuations/new','valuation-history','financing','financing','income-expenses','cash-flow','economics','reconciliation'][screen.id-21])||'valuations'):screen.phase===4?onRoute((['maintenance','maintenance/plans','maintenance/jobs','insurance','insurance','utilization',firstAssetId?'utilization/'+encodeURIComponent(firstAssetId):'utilization','evidence','locations','operations-calendar'][screen.id-31])||'maintenance'):screen.phase===5?onRoute((['portfolios','portfolios','allocation','comparison','performance','risk-center','risk/new','underperforming','scenarios','intelligence'][screen.id-41])||'portfolios'):screen.phase===6?onRoute((['wealth-interface','kernel-actions','notifications','reports','integrations','integrations/WEALTH_OS','team-access','security-audit','settings','onboarding'][screen.id-51])||'integrations'):onPhase(screen.phase,screen.title)}><span className="screen-number">{String(screen.id).padStart(2,'0')}</span><span><strong>{screen.title}</strong><small>Phase {screen.phase} · {phaseNames[screen.phase-1]}</small></span><span className={'status '+(screen.phase<=6?'status-active':'status-neutral')}>{screen.phase<=6?'Built':'Planned'}</span><ChevronRight size={16}/></button>)}</div>
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
  const [store,setStore]=useState<RegistryState>(loadRegistry)
  const [toast,setToast]=useState('')
  const handleChange=(next:RegistryState)=>{setStore(next);if(!saveRegistry(next))setToast('Browser storage is unavailable; changes might be lost on reload.')}
  const report=(message:string)=>setToast(message)
  const [dialog,setDialog]=useState<{title:string;description:string;phase?:number}|null>(null)
  useEffect(()=>{const handle=()=>{setPath(currentPath());setMenuOpen(false);setSearch('');setNotificationsOpen(false)};window.addEventListener('hashchange',handle);return()=>window.removeEventListener('hashchange',handle)},[])
  useEffect(()=>{if(!toast)return;const id=window.setTimeout(()=>setToast(''),4500);return()=>window.clearTimeout(id)},[toast])
  const items=useMemo(()=>store.records.map(viewAsset),[store.records])
  const page=getPage(path)
  const localAlerts=alertsFor(store)
  const unreadAlerts=localAlerts.filter(a=>a.state==='UNREAD')
  const pageSlug=path.split('/').slice(1).join('/')
  const foundNav=[...nav,...integrations.map(i=>({...i,slug:slug(i.name),icon:Layers3}))].find(n=>n.slug===pageSlug)
  const plannedTitle=foundNav?.name || (pageSlug?decodeURIComponent(pageSlug).replace(/-/g,' '):'Future screen')
  const plannedPhase=foundNav?.phase || 1
  const results=useMemo(()=>search.trim()?items.filter(a=>(a.name+' '+a.category+' '+a.subtype).toLowerCase().includes(search.toLowerCase())).slice(0,5):[],[items,search])
  const openPlanned=(phase:number,title:string)=>setDialog({title,phase,description:'This screen is reserved for Phase '+phase+'. Earlier phases never simulate completed external integrations, payments or regulated transfers.'})
  const openAlert=(title:string,detail:string)=>setDialog({title,description:detail+'. This is illustrative demo data. Operational actions are implemented in their scheduled development phases.'})
  return <div className="app" data-theme={theme}>
    {menuOpen && <button type="button" className="mobile-scrim" aria-label="Close navigation" onClick={()=>setMenuOpen(false)}/>}
    <aside className={'sidebar '+(menuOpen?'sidebar-open':'')} aria-label="Main navigation">
      <Brand />
      <div className="sidebar-scroll">
        <div className="nav-section"><span className="nav-heading">WORKSPACE</span>{nav.map(item=><button type="button" key={item.slug} className={'nav-item '+((item.slug==='dashboard'&&page==='dashboard'||page==='planned'&&item.slug===pageSlug||page==='registry'&&item.slug===path||page==='lifecycle'&&(path===item.slug||path.startsWith(item.slug+'/')||path.startsWith(item.slug+'?'))||page==='economics'&&(path===item.slug||path.startsWith(item.slug+'/')||path.startsWith(item.slug+'?'))||page==='operations'&&(path===item.slug||path.startsWith(item.slug+'/')||path.startsWith(item.slug+'?'))||page==='intelligence'&&(path===item.slug||path.startsWith(item.slug+'/')||path.startsWith(item.slug+'?'))||page==='governance'&&(path===item.slug||path.startsWith(item.slug+'/')||path.startsWith(item.slug+'?')))?'current':'')} onClick={()=>{go(item.phase<=6?item.slug:'planned/'+item.slug);setMenuOpen(false)}}><item.icon size={19} strokeWidth={1.8}/><span>{item.name}</span>{item.phase>6&&<span className="nav-soon" title={'Phase '+item.phase}>P{item.phase}</span>}</button>)}</div>
        <div className="nav-section integration-section"><span className="nav-heading">INTEGRATIONS</span>{integrations.map(item=><button type="button" className="nav-item" key={item.name} onClick={()=>{go('integrations/'+item.system);setMenuOpen(false)}}><Layers3 size={18}/><span>{item.name}</span><span className="nav-soon">SPEC</span></button>)}</div>
        <div className="nav-section foundation-section"><span className="nav-heading">BUILD FOUNDATION</span><button type="button" className={'nav-item '+(page==='design'?'current':'')} onClick={()=>go('design')}><Component size={18}/><span>Design system</span></button><button type="button" className={'nav-item '+(page==='roadmap'?'current':'')} onClick={()=>go('roadmap')}><BookOpen size={18}/><span>60-screen roadmap</span></button></div>
      </div>
      <div className="sidebar-bottom"><div className="assistant-card"><span className="assistant-icon"><Sparkles size={18}/></span><strong>Asset intelligence</strong><p>Explore explainable local portfolio signals and guided questions. No AI provider connected.</p><button type="button" onClick={()=>go('intelligence')}>Open intelligence <ArrowRight size={15}/></button></div><div className="sidebar-version"><span className="ready-dot"/> Phase 6 · Frontend complete <span>v0.7</span></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="topbar-left"><button type="button" className="icon-button mobile-menu" onClick={()=>setMenuOpen(o=>!o)} aria-label="Toggle navigation"><Menu size={21}/></button><span className="breadcrumb-label">Personal Kernel</span><ChevronRight size={15} className="crumb-divider"/><strong>Asset OS</strong></div>
        <div className="global-search"><Search size={18}/><input type="search" aria-label="Search registered assets" placeholder="Search assets, documents, or ask..." value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&results[0]){go('asset/'+encodeURIComponent(results[0].id));setSearch('')}}}/><kbd>⌘ K</kbd>
          {search.trim()&&<div className="search-results"><span className="eyebrow">BROWSER ASSET RESULTS</span>{results.length?results.map(asset=><button type="button" key={asset.id} onClick={()=>{go('asset/'+encodeURIComponent(asset.id));setSearch('')}}><AssetGlyph asset={asset}/><span><strong>{asset.name}</strong><small>{asset.category}</small></span><ArrowRight size={16}/></button>):<p>No sample assets match your search.</p>}</div>}
        </div>
        <div className="topbar-actions"><span className="demo-flag">PREVIEW</span><button type="button" className="icon-button" onClick={()=>setTheme(t=>t==='dark'?'light':'dark')} aria-label={theme==='dark'?'Switch to light theme':'Switch to dark theme'}>{theme==='dark'?<Sun size={20}/>:<Moon size={20}/>}</button><div className="notification-anchor"><button type="button" className="icon-button" aria-label="Show locally derived reminders" aria-expanded={notificationsOpen} onClick={()=>setNotificationsOpen(p=>!p)}><Bell size={19}/>{unreadAlerts.length>0&&<span className="notification-dot"/>}</button>{notificationsOpen&&<div className="notification-menu"><strong>Local reminders · {unreadAlerts.length} unread</strong>{localAlerts.length?localAlerts.slice(0,3).map(alert=><button type="button" key={alert.key} onClick={()=>{setNotificationsOpen(false);go('notifications')}}><span>{alert.title}</span><small>{alert.kind.replaceAll('_',' ')} · {alert.date} · {alert.state.toLowerCase()}</small></button>):<p>No recorded alerts in your local reminder horizon.</p>}<button type="button" onClick={()=>{setNotificationsOpen(false);go('notifications')}}><span>Open all local reminders →</span><small>No push or external delivery</small></button></div>}</div><div className="account-chip"><span>AO</span><div><strong>Preview workspace</strong><small>Local demo mode</small></div><ChevronDown size={15}/></div></div>
      </header>
      <main className="main-content">{page==='dashboard'?<Dashboard items={items} store={store} onSelect={a=>go('asset/'+encodeURIComponent(a.id))} onPlanned={openPlanned} onAlert={openAlert}/>:page==='registry'?<RegistryExperience key={path} path={path} store={store} onChange={handleChange} navigate={go} report={report}/>:page==='lifecycle'?<LifecycleExperience key={path} path={path} store={store} onChange={handleChange} navigate={go} report={report}/>:page==='economics'?<EconomicsExperience key={path} path={path} store={store} onChange={handleChange} navigate={go} report={report}/>:page==='operations'?<OperationsExperience key={path} path={path} store={store} onChange={handleChange} navigate={go} report={report}/>:page==='intelligence'?<IntelligenceExperience key={path} path={path} store={store} onChange={handleChange} navigate={go} report={report}/>:page==='governance'?<GovernanceExperience key={path} path={path} store={store} onChange={handleChange} navigate={go} report={report}/>:page==='design'?<DesignSystem openModal={()=>setDialog({title:'Reusable dialog',description:'This is a working, keyboard-dismissable modal using the Asset OS dialog component.'})}/>:page==='roadmap'?<Roadmap onPhase={openPlanned} onRoute={go} firstAssetId={store.records[0]?.id||null}/>:<Planned title={plannedTitle} phase={plannedPhase}/>}
        <footer className="app-footer"><span>© 2026 Asset OS · Personal Kernel ecosystem · Prototype only</span><div><button type="button" onClick={()=>go('roadmap')}><BookOpen size={14}/> Screen plan</button><a href="https://github.com/Sean-steve/Asset-Os" target="_blank" rel="noreferrer"><ExternalLink size={14}/> GitHub repository</a></div></footer>
      </main>
    </div>
    {toast&&<div className="p1-toast" role="status"><CheckCircle2 size={17}/>{toast}</div>}
    {dialog&&<Dialog title={dialog.title} onClose={()=>setDialog(null)}><div className="informational-modal"><span className="modal-callout"><CircleHelp size={20}/> Foundation preview</span><p>{dialog.description}</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setDialog(null)}>Close</button>{dialog.phase&&<button type="button" className="primary-button" onClick={()=>{setDialog(null);go('roadmap')}}>View Phase {dialog.phase} <ArrowRight size={16}/></button>}</div></div></Dialog>}
  </div>
}
