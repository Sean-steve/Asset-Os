/**
 * Asset OS Phase 6 — static GitHub Pages experience. This module defines
 * browser-local projection/interaction contracts; it is NOT Kernel identity,
 * Finance/Wealth authority, permission enforcement, tamper-evident audit,
 * real notifications, or a network integration.
 */
import type {RegistryState,AssetRecord,ActivityEntry} from '../registry/core.ts'
import {outstandingForAsset,latestAccepted} from '../economics/core.ts'
import {operationalEvents} from '../operations/core.ts'
import {performanceSignals} from '../intelligence/core.ts'

export type ConnectedSystem='PERSONAL_KERNEL'|'WEALTH_OS'|'FINANCE_OS'|'MISSION_OS'|'KNOWLEDGE_OS'|'NOTIFICATIONS'
export type IntentStatus='NOT_REQUESTED'|'REQUESTED'
export type IntegrationRequest={id:string;system:ConnectedSystem;status:IntentStatus;purpose:string;recordedAt:string}
export type ProposalStatus='DRAFT'|'REVIEWED_LOCALLY'|'DISMISSED'
export type ActionDraft={id:string;sourceKey:string;assetId:string;title:string;context:string;dueOn:string;status:ProposalStatus;createdAt:string;changedAt:string}
export type AlertDisposition={key:string;state:'ACKNOWLEDGED'|'SNOOZED';until:string|null;changedAt:string}
export type PreviewRole='WORKSPACE_OWNER'|'OPERATIONS'|'PORTFOLIO_ANALYST'|'VIEWER'
export type AdminSettings={
 reportCurrency:string;reminderHorizonDays:7|30|90;notificationsEnabled:boolean;
 previewRole:PreviewRole;welcomeDismissed:boolean
}
export type GovernanceData={
 settings:AdminSettings;integrationRequests:IntegrationRequest[];drafts:ActionDraft[];dispositions:AlertDisposition[]
}
export const DEFAULT_SETTINGS:AdminSettings={
 reportCurrency:'KES',reminderHorizonDays:30,notificationsEnabled:true,
 previewRole:'WORKSPACE_OWNER',welcomeDismissed:false
}
export const emptyGovernanceData=():GovernanceData=>({
 settings:{...DEFAULT_SETTINGS},integrationRequests:[],drafts:[],dispositions:[]
})
export function validGovernanceData(value:unknown):value is GovernanceData{
 if(!value||typeof value!=='object')return false
 const v=value as Partial<GovernanceData>,s=v.settings
 return Boolean(s&&typeof s==='object'&&/^[A-Z]{3}$/.test(s.reportCurrency)&&
 [7,30,90].includes(s.reminderHorizonDays)&&typeof s.notificationsEnabled==='boolean'&&
 ['WORKSPACE_OWNER','OPERATIONS','PORTFOLIO_ANALYST','VIEWER'].includes(s.previewRole)&&
 typeof s.welcomeDismissed==='boolean'&&Array.isArray(v.integrationRequests)&&
 Array.isArray(v.drafts)&&Array.isArray(v.dispositions))
}
export const SYSTEMS:Record<ConnectedSystem,{label:string;owner:string;direction:string;reads:string[];writes:string[];condition:string}> = {
 PERSONAL_KERNEL:{label:'Personal Kernel',owner:'Identity, permissions, final schedule and policies',direction:'Kernel → Asset OS context / Asset OS → proposals',
 reads:['Trusted subject/tenant context','Approved policy boundaries'],writes:['Proposed actions (not direct schedule edits)'],condition:'Backend identity validation and scoped service-to-service authorization required'},
 WEALTH_OS:{label:'Wealth OS',owner:'Wealth strategy, allocation decisions and consolidated net worth',direction:'Asset OS → Wealth OS (read projection)',
 reads:['Current reviewed value and equity quality','Asset concentration and risk facts'],writes:[],condition:'Trusted data-sharing consent, canonical currency policy and signed projections required'},
 FINANCE_OS:{label:'Finance OS',owner:'Payments, transactions and authoritative financial ledger',direction:'Finance OS → Asset OS verified financial facts',
 reads:['Reconciled transaction facts','Observed debt and financial allocations'],writes:['Proposed reconciliation references only'],condition:'Authenticated Finance OS events, reconciliation and idempotency required'},
 MISSION_OS:{label:'Mission OS',owner:'Task and mission execution',direction:'Asset OS → task proposals',
 reads:['Approved work task state'],writes:['Suggested maintenance and risk missions'],condition:'Kernel-approved schedule and Mission OS task contract required'},
 KNOWLEDGE_OS:{label:'Knowledge OS',owner:'Evidence files and secure document access',direction:'Knowledge OS → Asset OS secure metadata',
 reads:['Permitted document reference and verification status'],writes:['Document reference requests only'],condition:'Scoped file permissions and retention rules required'},
 NOTIFICATIONS:{label:'Notification providers',owner:'Delivery of user-authorized alerts',direction:'Asset OS → notification requests after approval',
 reads:['Confirmed delivery receipts'],writes:['Consent-scoped notification requests'],condition:'Delivery credentials, consent, rate limits and preference controls required'}
}
export const SYSTEM_IDS=Object.keys(SYSTEMS) as ConnectedSystem[]
export const ROLES:Record<PreviewRole,{label:string;explanation:string;illustrativeCapabilities:string[]}> = {
 WORKSPACE_OWNER:{label:'Workspace owner',explanation:'Design target for full administrative access once Kernel identity exists.',illustrativeCapabilities:['Asset registry management','Portfolio review','Operations administration','Governed user invitation','Approval of sensitive actions']},
 OPERATIONS:{label:'Operations manager',explanation:'Design target for servicing and scheduling workflows.',illustrativeCapabilities:['View allocated assets','Manage maintenance proposals','Record service observations','Review compliance dates']},
 PORTFOLIO_ANALYST:{label:'Portfolio analyst',explanation:'Design target for portfolio valuation and reporting.',illustrativeCapabilities:['Read authorized asset projections','Compare portfolio performance','Draft risk reviews','Export permitted summaries']},
 VIEWER:{label:'Read-only viewer',explanation:'Design target for permitted read-only reporting.',illustrativeCapabilities:['View scoped asset summaries','Review approved portfolio snapshots','No asset mutation','No team or security administration']}
}
export const ROLE_IDS=Object.keys(ROLES) as PreviewRole[]
const now=()=>new Date().toISOString()
const id=()=>globalThis.crypto?.randomUUID?.()||'local-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)
const round=(n:number)=>Math.round(n*100)/100
const safeLabel=(value:string,name:string,max=500)=>{
 if(typeof value!=='string'||value.length>max||!value.trim())throw Error(name+' must contain 1–'+max+' characters.')
 return value.trim()
}
const held=(a:AssetRecord)=>['ACQUIRED','ACTIVE','SUSPENDED'].includes(a.lifecycle)
const cents=(values:number[])=>values.reduce((s,n)=>s+Math.round(n*100),0)/100
const dateOk=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(new Date(v+'T00:00:00Z').getTime())&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v
const addDays=(d:string,days:number)=>{const day=new Date(d+'T00:00:00Z');day.setUTCDate(day.getUTCDate()+days);return day.toISOString().slice(0,10)}
function history(state:RegistryState,event:ActivityEntry['event'],details:string,at:string){
 return [{id:id(),assetId:'',assetName:'Administration preview',event,details,at},...state.activity].slice(0,500)
}
export function netWorthPreview(state:RegistryState,currency:string){
 if(!/^[A-Z]{3}$/.test(currency))throw Error('Choose one reporting currency.')
 const assets=state.records.filter(a=>held(a)&&a.currency===currency)
 const value=cents(assets.map(a=>a.value))
 const debtFacts=assets.map(asset=>{
  const facilities=state.phase3.facilities.filter(f=>f.assetId===asset.id)
  const balance=facilities.length?outstandingForAsset(state,asset.id):0
  return {assetId:asset.id,assetName:asset.name,value:asset.value,
   debt:balance,hasFinancingRecords:facilities.length>0,
   valuationReviewed:Boolean(latestAccepted(state,asset.id))}
 })
 const unknownDebtAssets=debtFacts.filter(f=>f.debt===null)
 const observedDebt=cents(debtFacts.filter(f=>f.debt!==null).map(f=>f.debt!))
 const complete=unknownDebtAssets.length===0
 return {
  currency,assets,debtFacts,assetCount:assets.length,registryValue:value,
  debtObserved:observedDebt,unknownDebtAssets:unknownDebtAssets.length,
  indicativeNetEquity:complete?round(value-observedDebt):null,
  complete,reviewedValuations:debtFacts.filter(f=>f.valuationReviewed).length,
  disclaimer:'Registry values and manual financing observations are unverified. Missing external liabilities, FX and other wealth are excluded.'
 }
}
export function wealthHandoffPreview(state:RegistryState,currency:string,asOf=now().slice(0,10)){
 if(!dateOk(asOf))throw Error('Invalid projection date.')
 const n=netWorthPreview(state,currency)
 return {
  contract:'asset-os.wealth.snapshot.preview.v1',transport:'NOT_CONNECTED' as const,
  authority:'ASSET_OS_BROWSER_PROJECTION_ONLY' as const,asOf,currency,
  assetCount:n.assetCount,heldAssetValue:n.registryValue,
  debtObserved:n.debtObserved,missingDebtCount:n.unknownDebtAssets,
  indicativeNetEquity:n.indicativeNetEquity,reviewedValuationCount:n.reviewedValuations,
  quality:'UNVERIFIED_USER_ENTRY' as const,
  restrictions:['Not consolidated net worth','No currency conversion','Never posted to Wealth OS','No independent validation']
 }
}
export function saveSettings(state:RegistryState,input:AdminSettings,at=now()):RegistryState{
 if(!/^[A-Z]{3}$/.test(input.reportCurrency)||![7,30,90].includes(input.reminderHorizonDays)||
 typeof input.notificationsEnabled!=='boolean'||!ROLE_IDS.includes(input.previewRole)||
 typeof input.welcomeDismissed!=='boolean')throw Error('Invalid settings values.')
 return {...state,phase6:{...state.phase6,settings:{...input}},
  activity:history(state,'PREVIEW_SETTINGS_CHANGED','Local interface preferences updated; no Kernel policy changed.',at)}
}
export function requestConnectionPlan(state:RegistryState,system:ConnectedSystem,purpose:string,at=now()):RegistryState{
 if(!SYSTEM_IDS.includes(system))throw Error('Unknown integration.')
 const label=safeLabel(purpose,'Integration purpose',350)
 const existing=state.phase6.integrationRequests.find(x=>x.system===system&&x.status==='REQUESTED')
 if(existing)throw Error('Planning request already recorded for this system.')
 const r:IntegrationRequest={id:id(),system,status:'REQUESTED',purpose:label,recordedAt:at}
 return {...state,phase6:{...state.phase6,integrationRequests:[r,...state.phase6.integrationRequests]},
  activity:history(state,'INTEGRATION_PLAN_RECORDED',SYSTEMS[system].label+' planning intent saved; no network connection or credentials.',at)}
}
export function cancelConnectionPlan(state:RegistryState,system:ConnectedSystem,at=now()):RegistryState{
 const exists=state.phase6.integrationRequests.some(r=>r.system===system&&r.status==='REQUESTED')
 if(!exists)throw Error('No planning intent exists for this integration.')
 return {...state,phase6:{...state.phase6,integrationRequests:state.phase6.integrationRequests.map(r=>r.system===system&&r.status==='REQUESTED'?{...r,status:'NOT_REQUESTED' as const}:r)},
  activity:history(state,'INTEGRATION_PLAN_RECORDED',SYSTEMS[system].label+' planning intent withdrawn; no live connection was affected.',at)}
}
export function integrationView(state:RegistryState,system:ConnectedSystem){
 if(!SYSTEM_IDS.includes(system))throw Error('Unknown integration.')
 return {...SYSTEMS[system],id:system,status:'NOT_CONNECTED' as const,
  request:state.phase6.integrationRequests.find(r=>r.system===system&&r.status==='REQUESTED')||null,
  credentialsPresent:false,handshakeVerified:false}
}
export type Candidate={key:string;assetId:string;title:string;context:string;dueOn:string;origin:'OPERATIONS'}
export function kernelCandidates(state:RegistryState,asOf=now().slice(0,10)):Candidate[]{
 if(!dateOk(asOf))throw Error('Invalid current date.')
 return operationalEvents(state).filter(e=>e.date<=addDays(asOf,state.phase6.settings.reminderHorizonDays)).map(e=>({
  key:e.id,assetId:e.assetId,title:e.title,context:e.kind.replaceAll('_',' ')+' — '+e.date,
  dueOn:e.date,origin:'OPERATIONS' as const
 }))
}
export function draftKernelAction(state:RegistryState,sourceKey:string,at=now()):RegistryState{
 const source=kernelCandidates(state,at.slice(0,10)).find(x=>x.key===sourceKey)
 if(!source)throw Error('Select an available operational candidate.')
 if(state.phase6.drafts.some(d=>d.sourceKey===sourceKey&&d.status!=='DISMISSED'))throw Error('A current local action draft already exists for that event.')
 const draft:ActionDraft={id:id(),sourceKey,assetId:source.assetId,title:source.title,context:source.context,
  dueOn:source.dueOn,status:'DRAFT',createdAt:at,changedAt:at}
 return {...state,phase6:{...state.phase6,drafts:[draft,...state.phase6.drafts]},
  activity:history(state,'KERNEL_ACTION_DRAFT_CHANGED','Local proposal drafted; no Kernel schedule or Mission OS task created.',at)}
}
export function setDraftStatus(state:RegistryState,draftId:string,status:'REVIEWED_LOCALLY'|'DISMISSED',at=now()):RegistryState{
 const d=state.phase6.drafts.find(x=>x.id===draftId)
 if(!d)throw Error('Local proposal not found.')
 if(d.status!=='DRAFT'||!['REVIEWED_LOCALLY','DISMISSED'].includes(status))throw Error('Only draft proposals can be reviewed or dismissed.')
 return {...state,phase6:{...state.phase6,drafts:state.phase6.drafts.map(x=>x.id===draftId?{...x,status,changedAt:at}:x)},
  activity:history(state,'KERNEL_ACTION_DRAFT_CHANGED',status+' locally; not submitted to Kernel or Mission OS.',at)}
}
export type LocalAlert={key:string;assetId:string;title:string;context:string;date:string;kind:string;severity:'OVERDUE'|'SOON'|'WATCH'|'HIGH';state:'UNREAD'|'ACKNOWLEDGED'|'SNOOZED'}
export function alertsFor(state:RegistryState,asOf=now().slice(0,10)):LocalAlert[]{
 if(!dateOk(asOf))throw Error('Invalid current date.')
 if(!state.phase6.settings.notificationsEnabled)return []
 const boundary=addDays(asOf,state.phase6.settings.reminderHorizonDays)
 const events=operationalEvents(state).filter(x=>x.date<=boundary)
 const alerts:LocalAlert[]=[
  ...events.map(e=>({key:'event:'+e.id,assetId:e.assetId,title:e.title,context:e.kind.replaceAll('_',' '),date:e.date,kind:e.kind,
   severity:e.date<asOf?'OVERDUE' as const:'SOON' as const,state:'UNREAD' as const})),
  ...performanceSignals(state,asOf).map(s=>({key:'signal:'+s.id,assetId:s.assetId,title:s.title,context:s.reason,date:asOf,kind:s.kind,
   severity:s.severity==='HIGH'?'HIGH' as const:'WATCH' as const,state:'UNREAD' as const}))
 ]
 return alerts.map(a=>{
  const disp=state.phase6.dispositions.find(d=>d.key===a.key)
  const st=disp?.state==='SNOOZED'&&disp.until!==null&&disp.until<asOf?'UNREAD':disp?.state||'UNREAD'
  return {...a,state:st}
 }).sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key))
}
export function setAlertDisposition(state:RegistryState,key:string,value:'ACKNOWLEDGED'|'SNOOZED'|'UNREAD',until:string|null=null,at=now()):RegistryState{
 if(!alertsFor({...state,phase6:{...state.phase6,settings:{...state.phase6.settings,notificationsEnabled:true}}},at.slice(0,10)).some(a=>a.key===key))
  throw Error('Choose an alert derived from local records.')
 if(value==='SNOOZED'&&(!until||!dateOk(until)||until<=at.slice(0,10)||until>addDays(at.slice(0,10),365)))throw Error('Snooze must end on a valid future date within one year.')
 if(value==='UNREAD'){
  return {...state,phase6:{...state.phase6,dispositions:state.phase6.dispositions.filter(d=>d.key!==key)},
   activity:history(state,'LOCAL_ALERT_CHANGED','Local alert reset to unread; no notification delivery.',at)}
 }
 const d:AlertDisposition={key,state:value,until:value==='SNOOZED'?until:null,changedAt:at}
 return {...state,phase6:{...state.phase6,dispositions:[d,...state.phase6.dispositions.filter(x=>x.key!==key)]},
  activity:history(state,'LOCAL_ALERT_CHANGED',value+' locally; no push/email/SMS notification sent.',at)}
}
export type ReportKind='ASSET_REGISTER'|'OPERATIONS_CALENDAR'|'PORTFOLIO_SUMMARY'
export const REPORT_TYPES:ReportKind[]=['ASSET_REGISTER','OPERATIONS_CALENDAR','PORTFOLIO_SUMMARY']
export type Report={name:string;headings:string[];rows:string[][];warning:string}
export function reportPreview(state:RegistryState,kind:ReportKind,currency:string):Report{
 if(!REPORT_TYPES.includes(kind)||!/^[A-Z]{3}$/.test(currency))throw Error('Unknown report type or currency.')
 if(kind==='ASSET_REGISTER'){
  return {name:'asset-registry-'+currency,headings:['Asset ID','Asset name','Category','Lifecycle','Currency','Registry value','Valuation review status'],
   rows:state.records.filter(a=>a.currency===currency).map(a=>[a.id,a.name,a.category,a.lifecycle,a.currency,String(a.value),latestAccepted(state,a.id)?'LOCALLY_REVIEWED':'UNVERIFIED']),
   warning:'Registry estimates only. Owner, location, sensitive metadata and document references excluded.'}
 }
 if(kind==='OPERATIONS_CALENDAR'){
  return {name:'asset-operations-'+currency,headings:['Asset ID','Event type','Event title','Date'],
   rows:operationalEvents(state).filter(e=>state.records.find(a=>a.id===e.assetId)?.currency===currency).map(e=>[e.assetId,e.kind,e.title,e.date]),
   warning:'User-entered dates only. No real reminder delivery, scheduled appointment or external connection.'}
 }
 return {name:'asset-portfolios-'+currency,headings:['Portfolio ID','Portfolio label','Currency','Held asset count','Registry value'],
  rows:state.phase5.portfolios.filter(p=>!p.archivedAt&&p.currency===currency).map(p=>{
   const unique=new Set(state.phase5.memberships.filter(m=>m.portfolioId===p.id&&m.removedAt===null).map(m=>m.assetId))
   const assets=state.records.filter(a=>unique.has(a.id)&&held(a)&&a.currency===currency)
   return [p.id,p.name,currency,String(assets.length),String(cents(assets.map(a=>a.value)))]
  }),
  warning:'Overlapping portfolio memberships can duplicate assets across rows. Do not sum to net worth.'}
}
export function csvCell(value:unknown):string{
 const str=String(value??'').replace(/\u0000/g,'')
 // Excel/LibreOffice CSV formula injection, including after leading whitespace and control chars.
 const escaped=/^[\s\u200b\uFEFF]*[=+@\-]/u.test(str)||/^[\t\r\n]/.test(str)?"'"+str:str
 return '"'+escaped.replace(/"/g,'""')+'"'
}
export function reportCsv(report:Report){
 return [report.headings,...report.rows].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n'
}
export function auditRows(state:RegistryState,query='',event=''){
 const q=query.toLowerCase().trim()
 return state.activity.filter(a=>(!event||a.event===event)&&(!q||(a.assetName+' '+a.event+' '+a.details).toLowerCase().includes(q)))
 .sort((a,b)=>b.at.localeCompare(a.at))
}
export function onboardingSteps(state:RegistryState){
 const local=state.records.filter(a=>a.origin==='local')
 return [
  {id:'asset',title:'Create your first asset',complete:local.length>0,route:'assets/new',detail:'Create a locally entered registry entry; sample assets do not count.'},
  {id:'acquisition',title:'Record an acquisition',complete:state.phase2.acquisitions.some(a=>local.some(x=>x.id===a.assetId)),route:'acquisitions',detail:'Keep an explicit method, date and cost basis.'},
  {id:'valuation',title:'Review a valuation',complete:state.phase3.valuations.some(v=>local.some(a=>a.id===v.assetId)&&v.status==='ACCEPTED'),route:'valuations',detail:'Local acceptance is not independent appraisal.'},
  {id:'portfolio',title:'Create an analytical portfolio',complete:state.phase5.portfolios.some(p=>!p.archivedAt),route:'portfolios',detail:'Portfolio assignment does not transfer ownership.'},
  {id:'operations',title:'Plan an operational event',complete:state.phase4.plans.some(p=>local.some(a=>a.id===p.assetId)),route:'maintenance/plans',detail:'Date-based reminders only; no task dispatched.'},
  {id:'preferences',title:'Review preview preferences',complete:state.activity.some(a=>a.event==='PREVIEW_SETTINGS_CHANGED'),route:'settings',detail:'Select reporting currency and local reminder horizon.'}
 ]
}
