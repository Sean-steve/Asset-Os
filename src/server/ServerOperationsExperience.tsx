import {useCallback,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react'
import {ArrowLeft,ArrowRight,CalendarDays,CheckCircle2,FileText,Gauge,Link2,MapPin,RefreshCw,ShieldAlert,ShieldCheck,Wrench} from 'lucide-react'
import {type AuthState,type PageResult,type ServerAsset,ServerError,serverRequest} from './identity'
import './server-operations.css'

type RecordRow={id:string;[field:string]:unknown}
type Kind='maintenance-plans'|'service-jobs'|'insurance-policies'|'utilization-readings'|'evidence-references'|'location-events'|'asset-relationships'
type Page={items:RecordRow[];nextCursor:string|null;limit:number;sourceAuthority:string}
type Summary={
 assetId:string;recordVersion:number;lifecycle:string;currency:string;
 maintenance:{plans:number;activePlans:number;nextDue:string|null;jobs:number;openJobs:number};
 insurance:{recordCount:number;recordedDateActive:number;expiredDate:number;nextExpiry:string|null;coverageVerified:false;insurerConnected:false};
 utilization:{latest:Array<{metric:string;reading:string;observedOn:string}>;sourceAuthority:'USER_ENTRY'};
 location:{toLabel:string|null;effectiveOn:string|null};
 evidence:{count:number;verified:false};
 relationships:{count:number;verified:false};interpretation:string
}
type Deadline={id:string;kind:string;dueOn:string;label:string}
type Calendar={assetId:string;items:Deadline[];limit:number;notificationDelivered:false;calendarSynced:false;note:string}
type Tabs='overview'|'maintenance'|'insurance'|'utilization'|'evidence'|'locations'|'relationships'
const kinds:Kind[]=['maintenance-plans','service-jobs','insurance-policies','utilization-readings','evidence-references','location-events','asset-relationships']
const labels:Record<Tabs,string>={overview:'Overview',maintenance:'Maintenance',insurance:'Insurance',utilization:'Utilization',evidence:'Evidence',locations:'Locations',relationships:'Relationships'}
const validAsset=/^server-registry\/asset\/([0-9a-f-]{36})\/operations$/i
const assetUrl=(id:string)=>'server-registry/asset/'+id+'/operations'
const writable=(auth:AuthState)=>['WORKSPACE_OWNER','OPERATIONS'].includes(auth.membership?.role||'')
const active=(life:string)=>['ACQUIRED','ACTIVE','SUSPENDED'].includes(life)
const today=()=>new Date().toISOString().slice(0,10)
const value=(f:FormData,key:string)=>String(f.get(key)||'').trim()
const emptyToNull=(f:FormData,key:string)=>value(f,key)||null
const text=(v:unknown,missing='Not recorded')=>v===null||v===undefined||v===''?missing:String(v)
const display=(v:unknown)=>typeof v==='string'?v.replaceAll('_',' '):text(v)
const errorText=(e:unknown)=>e instanceof ServerError?e.code+': '+e.message:e instanceof Error?e.message:'The authenticated server request failed.'
const Field=({name,label,kind='text',required=false,max=160,defaultValue,min,placeholder}:{
 name:string;label:string;kind?:'text'|'date'|'number'|'textarea'|'money';required?:boolean;max?:number;
 defaultValue?:string;min?:string;placeholder?:string
})=><label className="so-field">{label}
 {kind==='textarea'?<textarea name={name} aria-label={label} maxLength={max} required={required} defaultValue={defaultValue}/>:
 <input name={name} aria-label={label} type={kind==='date'?'date':kind==='number'?'number':'text'}
  inputMode={kind==='money'?'decimal':undefined}
  pattern={kind==='money'?'[0-9]+(\\.[0-9]{1,2})?':undefined}
  step={kind==='number'?'1':undefined} min={min} maxLength={kind==='date'||kind==='number'?undefined:max}
  required={required} defaultValue={defaultValue} placeholder={placeholder}/>}
 </label>
const Select=({name,label,options}:{name:string;label:string;options:Array<[string,string]>})=><label className="so-field">{label}<select name={name} aria-label={label}>{options.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
const options=(items:string[])=>items.map(v=>[v,v.replaceAll('_',' ')] as [string,string])
const Panel=({title,children,detail}:{title:string;children:ReactNode;detail?:string})=><section className="server-panel so-panel"><div className="so-panel-heading"><h2>{title}</h2>{detail&&<p>{detail}</p>}</div>{children}</section>
function TenantAssetPicker({auth,navigate}:{auth:AuthState;navigate:(path:string)=>void}){
 const [assets,setAssets]=useState<ServerAsset[]>([])
 const [cursor,setCursor]=useState<string|null>(null)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const load=useCallback(async(next:string|null)=>{
  setLoading(true);setError('')
  try{
   const q=new URLSearchParams({limit:'20'})
   if(next)q.set('cursor',next)
   const result=await serverRequest<PageResult>(auth,'/v1/assets?'+q)
   if(result.items.some(asset=>asset.tenantId!==auth.tenantId))throw Error('The tenant asset list failed verification.')
   setAssets(prev=>next?[...prev,...result.items]:result.items);setCursor(result.nextCursor)
  }catch(e){setError(errorText(e));if(!next){setAssets([]);setCursor(null)}}
  finally{setLoading(false)}
 },[auth])
 useEffect(()=>{void load(null)},[load])
 return <div className="server-operations">
  <div className="page-intro"><div><span className="eyebrow">B4.1 · AUTHENTICATED OPERATIONS</span><h1>Secure Operations</h1>
   <p>PostgreSQL maintenance, insurance and asset operations in a verified tenant. Select an asset to view durable records.</p></div></div>
  <div className="server-boundary"><ShieldAlert size={20}/><p>Only the protected B4 API is queried here. Browser-local asset samples are never imported, and external providers are not connected.</p></div>
  <Panel title="Verified tenant assets">
   <div className="server-heading"><span className="server-note">{assets.length} authenticated assets loaded</span><button className="secondary-button" type="button" disabled={loading} onClick={()=>void load(null)}><RefreshCw size={16}/> Refresh</button></div>
   {loading&&!assets.length&&<p role="status">Loading verified tenant assets…</p>}
   {error&&<p className="server-error" role="alert">{error}</p>}
   {!loading&&!error&&assets.length===0&&<p className="server-empty">No assets exist in the authenticated tenant.</p>}
   {!!assets.length&&<div className="table-scroll"><table className="asset-table"><thead><tr><th>Asset</th><th>Lifecycle</th><th>Location label</th><th>Operations</th></tr></thead>
    <tbody>{assets.map(a=><tr key={a.id}><td><strong>{a.name}</strong><small>{a.assetNumber}</small></td><td>{display(a.lifecycle)}</td><td>{text(a.locationLabel)}</td>
     <td><button type="button" className="link-button" onClick={()=>navigate(assetUrl(a.id))}>Open operations <ArrowRight size={15}/></button></td></tr>)}</tbody></table></div>}
   {cursor&&<button className="secondary-button" type="button" disabled={loading} onClick={()=>void load(cursor)}>Load more authenticated assets</button>}
  </Panel>
 </div>
}
type Snapshot={asset:ServerAsset;summary:Summary;calendar:Calendar;histories:Record<Kind,Page>}
function AssetOperations({auth,id,navigate}:{auth:AuthState;id:string;navigate:(route:string)=>void}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null)
 const [tab,setTab]=useState<Tabs>('overview')
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [paging,setPaging]=useState<Kind|null>(null)
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const [relatedAssets,setRelatedAssets]=useState<ServerAsset[]>([])
 const retry=useRef<{signature:string;key:string}|null>(null)
 const reload=useCallback(async()=>{
  setLoading(true);setError('');setSnapshot(null)
  try{
   const root='/v1/assets/'+id
   const result=await Promise.all([
    serverRequest<ServerAsset>(auth,root),
    serverRequest<Summary>(auth,root+'/operations'),
    serverRequest<Calendar>(auth,root+'/operations-calendar'),
    ...kinds.map(kind=>serverRequest<Page>(auth,root+'/'+kind+'?limit=20')),
    serverRequest<PageResult>(auth,'/v1/assets?limit=100')
   ])
   const [asset,summary,calendar]=result as [ServerAsset,Summary,Calendar,...unknown[]]
   if(asset.id!==id||asset.tenantId!==auth.tenantId||summary.assetId!==id||summary.currency!==asset.currency||
      summary.lifecycle!==asset.lifecycle||summary.recordVersion!==asset.recordVersion||calendar.assetId!==id)
    throw Error('Tenant, asset, currency or version mismatch; operational data withheld.')
   const rows=result.slice(3,3+kinds.length) as Page[]
   const histories=Object.fromEntries(kinds.map((kind,i)=>[kind,rows[i]])) as Record<Kind,Page>
   const linked=result[result.length-1] as PageResult
   if(linked.items.some(a=>a.tenantId!==auth.tenantId))throw Error('Related asset list failed tenant validation.')
   setRelatedAssets(linked.items.filter(a=>a.id!==id&&active(a.lifecycle)))
   setSnapshot({asset,summary,calendar,histories})
  }catch(e){setError(errorText(e));setSnapshot(null)}
  finally{setLoading(false)}
 },[auth,id])
 useEffect(()=>{void reload()},[reload])
 const submit=async(route:string,body:Record<string,unknown>,confirmation?:string)=>{
  if(busy||!snapshot||!writable(auth)||!active(snapshot.asset.lifecycle))return false
  if(confirmation&&!window.confirm(confirmation))return false
  const signature=JSON.stringify({route,body,version:snapshot.asset.recordVersion})
  if(retry.current?.signature!==signature)retry.current={signature,key:crypto.randomUUID()}
  setBusy(true);setError('');setSuccess('')
  try{
   await serverRequest(auth,'/v1/assets/'+id+route,{
    method:'POST',headers:{'If-Match':'"'+snapshot.asset.recordVersion+'"','Idempotency-Key':retry.current.key},
    body:JSON.stringify(body)
   })
   retry.current=null
   setSuccess('Change committed to the verified tenant database. Re-reading all operational evidence.')
   await reload()
   return true
  }catch(e){
   setError(errorText(e)+(e instanceof ServerError&&e.status===412?' This asset changed. Refresh before submitting another command.':''))
   return false
  }finally{setBusy(false)}
 }
 const onForm=(e:FormEvent<HTMLFormElement>,route:string,payload:(f:FormData)=>Record<string,unknown>,confirmation?:string)=>{
  e.preventDefault()
  const form=e.currentTarget
  const body=payload(new FormData(form))
  void submit(route,body,confirmation).then(ok=>{if(ok)form.reset()})
 }
 const more=async(kind:Kind)=>{
  const cursor=snapshot?.histories[kind].nextCursor
  if(!cursor||paging||!snapshot)return
  setPaging(kind);setError('')
  try{
   const page=await serverRequest<Page>(auth,'/v1/assets/'+id+'/'+kind+'?limit=20&cursor='+encodeURIComponent(cursor))
   setSnapshot(before=>before?{
    ...before,histories:{...before.histories,[kind]:{...before.histories[kind],
     items:[...before.histories[kind].items,...page.items],nextCursor:page.nextCursor}}
   }:before)
  }catch(e){setError(errorText(e))}
  finally{setPaging(null)}
 }
 const history=(kind:Kind,title:string,columns:Array<[string,string]>,footer?:ReactNode)=><Panel title={title}>
  {!snapshot?.histories[kind].items.length?<p className="server-empty">No authenticated {kind.replaceAll('-',' ')} records for this asset.</p>:
   <div className="table-scroll"><table className="asset-table"><thead><tr>{columns.map(([label])=><th key={label}>{label}</th>)}</tr></thead>
    <tbody>{snapshot.histories[kind].items.map(row=><tr key={row.id}>{columns.map(([label,field])=><td key={label}>{display(row[field])}</td>)}</tr>)}</tbody>
   </table></div>}
  {snapshot?.histories[kind].nextCursor&&<button className="secondary-button" type="button" disabled={paging!==null} onClick={()=>void more(kind)}>Load more {kind.replaceAll('-',' ')}</button>}
  {footer}
 </Panel>
 const controls=writable(auth)&&snapshot&&active(snapshot.asset.lifecycle)
 if(!snapshot)return <div className="server-operations"><div className="server-heading"><button className="secondary-button" onClick={()=>navigate('server-registry/operations')}><ArrowLeft size={16}/> Operations assets</button><button className="secondary-button" type="button" disabled={loading} onClick={()=>void reload()}><RefreshCw size={16}/> Retry</button></div>
  <p role={error?'alert':'status'} className={error?'server-error':'server-note'}>{error||'Loading verified operational records from PostgreSQL…'}</p></div>
 const {asset,summary,calendar,histories}=snapshot
 return <div className="server-operations">
  <div className="server-heading"><button className="secondary-button" onClick={()=>navigate('server-registry/operations')}><ArrowLeft size={16}/> Secure Operations</button>
   <button className="secondary-button" type="button" disabled={busy||loading||paging!==null} onClick={()=>void reload()}><RefreshCw size={16}/> Refresh · v{asset.recordVersion}</button></div>
  <div className="page-intro"><div><span className="eyebrow">B4.1 · POSTGRESQL OPERATIONS</span><h1>{asset.name}</h1><p>{asset.assetNumber} · {display(asset.lifecycle)} · {asset.currency} · Verified tenant</p></div></div>
  <div className="server-boundary"><ShieldAlert size={19}/><p><strong>Operator-entered evidence, not external verification.</strong> Insurance is not confirmed with an insurer. Service jobs are not dispatched, costs are not posted to Finance OS, locations are not GPS and reminders are not delivered.</p></div>
  {error&&<p role="alert" className="server-error">{error} <button type="button" onClick={()=>void reload()}>Refresh authoritative records</button></p>}
  {success&&<p role="status" className="server-success"><CheckCircle2 size={17}/>{success}</p>}
  <div className="so-metrics" aria-label="Verified operations summary">
   <div><Wrench size={18}/><span>Maintenance plans</span><strong>{summary.maintenance.plans}</strong><small>{summary.maintenance.activePlans} active · next {summary.maintenance.nextDue||'not scheduled'}</small></div>
   <div><CalendarDays size={18}/><span>Open service work</span><strong>{summary.maintenance.openJobs}</strong><small>{summary.maintenance.jobs} recorded jobs · no provider dispatch</small></div>
   <div><ShieldCheck size={18}/><span>Recorded-date active policies</span><strong>{summary.insurance.recordedDateActive}</strong><small>{summary.insurance.expiredDate} expired · coverage unverified</small></div>
   <div><Gauge size={18}/><span>Utilization metrics</span><strong>{summary.utilization.latest.length}</strong><small>Cumulative owner observations</small></div>
   <div><FileText size={18}/><span>Evidence references</span><strong>{summary.evidence.count}</strong><small>No document upload or validation</small></div>
   <div><MapPin size={18}/><span>Recorded location</span><strong className="so-location">{text(summary.location.toLabel,'Unknown')}</strong><small>Last observation {summary.location.effectiveOn||'not recorded'}</small></div>
  </div>
  <nav className="so-tabs" aria-label="Operations modules">{(Object.keys(labels) as Tabs[]).map(key=>
   <button type="button" role="tab" aria-selected={tab===key} className={tab===key?'active':''} key={key} onClick={()=>setTab(key)}>{labels[key]}</button>)}</nav>
  {tab==='overview'&&<>
   <Panel title="Recorded operating deadlines" detail="Projections are derived from PostgreSQL. No external calendar, email or notification delivery.">
    {!calendar.items.length?<p className="server-empty">No recorded maintenance, service, policy or evidence deadlines.</p>:
     <div className="table-scroll"><table className="asset-table"><thead><tr><th>Date</th><th>Type</th><th>Recorded item</th><th>Urgency</th></tr></thead>
      <tbody>{calendar.items.map(row=><tr key={row.kind+'-'+row.id}><td>{row.dueOn}</td><td>{display(row.kind)}</td><td>{row.label}</td><td>{row.dueOn<today()?'Overdue':row.dueOn===today()?'Today':'Upcoming'}</td></tr>)}</tbody></table></div>}
    <p className="server-note">Only the earliest {calendar.limit} events are returned. Notifications delivered: No. Kernel calendar synced: No.</p>
   </Panel>
   <Panel title="Latest cumulative utilization">
    {!summary.utilization.latest.length?<p>No owner-entered utilization readings yet.</p>:
     <div className="so-latest">{summary.utilization.latest.map(r=><div key={r.metric}><small>{display(r.metric)}</small><strong>{r.reading}</strong><small>{r.observedOn} · owner observation</small></div>)}</div>}
   </Panel>
   <div className="so-footer">
    <button type="button" className="secondary-button" onClick={()=>navigate('server-registry/asset/'+id)}><FileText size={16}/> Verified asset details</button>
    <button type="button" className="secondary-button" onClick={()=>navigate('server-registry/asset/'+id+'/economics')}><ArrowRight size={16}/> Secure Economics</button>
   </div>
  </>}
  {tab==='maintenance'&&<>
   {history('maintenance-plans','Maintenance plans', [['Title','title'],['Cycle','intervalUnit'],['Next due','nextDue'],['Last completed','lastCompletedOn'],['Status','status']],<>
    {controls&&histories['maintenance-plans'].items.map(r=><div key={'plan-'+r.id} className="so-action-row">
     <span><strong>{text(r.title)}</strong> · {text(r.nextDue)} · {display(r.status)}</span>
     <button className="secondary-button" type="button" disabled={busy} onClick={()=>void submit('/maintenance-plans/'+r.id+'/actions',{action:r.status==='ACTIVE'?'PAUSE':'RESUME'})}>{r.status==='ACTIVE'?'Pause plan':'Resume plan'}</button>
    </div>)}
   </>)}
   {history('service-jobs','Service jobs',[['Service','title'],['Scheduled','scheduledFor'],['Provider label','providerLabel'],['Status','status'],['Completion','completedOn'],['Recorded cost','recordedCost']],<>
    {controls&&histories['service-jobs'].items.filter(r=>['SCHEDULED','IN_PROGRESS'].includes(String(r.status))).map(r=><div key={'job-'+r.id} className="so-action-row">
     <span><strong>{text(r.title)}</strong> · {text(r.scheduledFor)} · {display(r.status)}</span>
     <div className="so-action-buttons">{r.status==='SCHEDULED'&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void submit('/service-jobs/'+r.id+'/actions',{action:'START'})}>Start job</button>}
      <button type="button" className="secondary-button" disabled={busy} onClick={()=>void submit('/service-jobs/'+r.id+'/actions',{action:'CANCEL'},'Cancel this internal service record?')}>Cancel job</button></div>
     <form className="so-complete-form" onSubmit={e=>onForm(e,'/service-jobs/'+r.id+'/actions',f=>({
      action:'COMPLETE',completedOn:value(f,'completedOn'),recordedCost:emptyToNull(f,'recordedCost'),completionNotes:value(f,'completionNotes')
     }))}>
      <Field name="completedOn" label="Completion date" kind="date" required defaultValue={today()}/>
      <Field name="recordedCost" label="Recorded service cost (optional)" kind="money" placeholder="0.00"/>
      <Field name="completionNotes" label="Completion notes" max={1200}/>
      <button type="submit" className="primary-button" disabled={busy}>Record completed service</button>
     </form>
    </div>)}
   </>)}
  </>}
  {tab==='insurance'&&history('insurance-policies','Insurance policy history',[['Insurer','insurerLabel'],['Reference','policyReference'],['Policy type','policyType'],['Start','startOn'],['Expiry','endOn'],['Coverage','coverageAmount'],['Status','status']],<>
   <p className="server-note">Recorded-date active does not mean insured. All policy references, coverage and premiums are unverified.</p>
   {controls&&histories['insurance-policies'].items.filter(r=>r.status==='RECORDED').map(r=><div key={r.id} className="so-action-row">
    <span><strong>{text(r.insurerLabel)}</strong> · {text(r.policyReference)}</span>
    <button type="button" className="secondary-button" disabled={busy} onClick={()=>void submit('/insurance-policies/'+r.id+'/actions',{action:'CANCEL'},'Mark this policy internally cancelled? This will not notify an insurer.')}>Mark cancelled</button>
   </div>)}
  </>)}
  {tab==='utilization'&&history('utilization-readings','Utilization reading history',[['Metric','metric'],['Date','observedOn'],['Cumulative reading','reading'],['Source label','sourceLabel']])}
  {tab==='evidence'&&history('evidence-references','Evidence references',[['Kind','kind'],['Title','title'],['Opaque reference','reference'],['Issued','issuedOn'],['Expires','expiresOn']])}
  {tab==='locations'&&history('location-events','Asset location label history',[['From','fromLabel'],['To','toLabel'],['Effective','effectiveOn'],['Reason','reason']])}
  {tab==='relationships'&&history('asset-relationships','Asset relationships',[['Related asset ID','relatedAssetId'],['Type','type'],['Notes','note']])}
  {!writable(auth)&&<p className="server-note so-restricted" role="status">Your verified tenant role is read-only. Operational mutation forms are not available.</p>}
  {writable(auth)&&!active(asset.lifecycle)&&<p className="server-note so-restricted" role="status">Asset lifecycle is {display(asset.lifecycle)}. Historical operations remain readable, but all new commands are disabled.</p>}
  {controls&&tab!=='overview'&&<div className="so-forms">
   {tab==='maintenance'&&<>
    <Panel title="Create recurring maintenance plan">
     <form className="so-form" onSubmit={e=>onForm(e,'/maintenance-plans',f=>({
      title:value(f,'title'),description:value(f,'description'),intervalValue:Number(value(f,'intervalValue')),
      intervalUnit:value(f,'intervalUnit'),nextDue:value(f,'nextDue')
     }))}>
      <Field name="title" label="Plan title" required/><Field name="description" label="Plan description" kind="textarea" max={1200}/>
      <Field name="intervalValue" label="Interval (1–365)" kind="number" required min="1" defaultValue="1"/>
      <Select name="intervalUnit" label="Cycle unit" options={options(['DAYS','WEEKS','MONTHS'])}/>
      <Field name="nextDue" label="Next due date" kind="date" required defaultValue={today()}/>
      <button className="primary-button" type="submit" disabled={busy}>Record maintenance plan</button>
     </form>
    </Panel>
    <Panel title="Schedule internal service job" detail="Scheduling is a record only; no external technician is dispatched.">
     <form className="so-form" onSubmit={e=>onForm(e,'/service-jobs',f=>({
      title:value(f,'title'),planId:emptyToNull(f,'planId'),scheduledFor:value(f,'scheduledFor'),
      providerLabel:value(f,'providerLabel'),notes:value(f,'notes')
     }))}>
      <Field name="title" label="Service title" required/>
      <Select name="planId" label="Linked active maintenance plan" options={[['','None (standalone job)'],
       ...histories['maintenance-plans'].items.filter(p=>p.status==='ACTIVE').map(p=>[String(p.id),text(p.title)] as [string,string])]}/>
      <Field name="scheduledFor" label="Scheduled service date" kind="date" required defaultValue={today()}/>
      <Field name="providerLabel" label="Provider label (optional)"/>
      <Field name="notes" label="Service notes" kind="textarea" max={1200}/>
      <button type="submit" className="primary-button" disabled={busy}>Schedule internal service</button>
     </form>
    </Panel>
   </>}
   {tab==='insurance'&&<Panel title="Record or replace insurance metadata" detail="Only a manually recorded policy reference; no underwriter verification.">
    <form className="so-form" onSubmit={e=>onForm(e,'/insurance-policies',f=>({
     insurerLabel:value(f,'insurerLabel'),policyReference:value(f,'policyReference'),policyType:value(f,'policyType'),
     startOn:value(f,'startOn'),endOn:value(f,'endOn'),coverageAmount:value(f,'coverageAmount'),
     premiumAmount:emptyToNull(f,'premiumAmount'),replacesId:emptyToNull(f,'replacesId'),notes:value(f,'notes')
    }))}>
     <Field name="insurerLabel" label="Insurer display label" required/>
     <Field name="policyReference" label="Policy reference" max={180}/>
     <Field name="policyType" label="Policy type" required max={120}/>
     <Field name="coverageAmount" label={'Recorded coverage ('+asset.currency+')'} kind="money" required/>
     <Field name="premiumAmount" label={'Recorded premium ('+asset.currency+', optional)'} kind="money"/>
     <Field name="startOn" label="Policy start date" kind="date" required defaultValue={today()}/>
     <Field name="endOn" label="Policy expiry date" kind="date" required/>
     <Select name="replacesId" label="Supersede recorded policy" options={[['','Do not supersede'],
      ...histories['insurance-policies'].items.filter(p=>p.status==='RECORDED').map(p=>[String(p.id),text(p.insurerLabel)+' · '+text(p.policyReference)] as [string,string])]}/>
     <Field name="notes" label="Policy notes" kind="textarea" max={1200}/>
     <button className="primary-button" type="submit" disabled={busy}>Record unverified policy</button>
    </form>
   </Panel>}
   {tab==='utilization'&&<Panel title="Record cumulative utilization" detail="Readings must be nondecreasing and dated after prior observations.">
    <form className="so-form" onSubmit={e=>onForm(e,'/utilization-readings',f=>({
     metric:value(f,'metric'),observedOn:value(f,'observedOn'),reading:value(f,'reading'),
     sourceLabel:value(f,'sourceLabel'),notes:value(f,'notes')
    }))}>
     <Select name="metric" label="Utilization metric" options={options(['ODOMETER_KM','HOURS_TOTAL','USE_COUNT','OCCUPIED_DAYS'])}/>
     <Field name="observedOn" label="Reading date" kind="date" defaultValue={today()} required/>
     <Field name="reading" label="Cumulative reading" kind="money" required/>
     <Field name="sourceLabel" label="Reading source description" required/>
     <Field name="notes" label="Observation notes" kind="textarea" max={800}/>
     <button className="primary-button" type="submit" disabled={busy}>Save utilization observation</button>
    </form>
   </Panel>}
   {tab==='evidence'&&<Panel title="Record opaque evidence reference" detail="No file is uploaded. Do not enter URLs, secrets, base64 or sensitive records.">
    <form className="so-form" onSubmit={e=>onForm(e,'/evidence-references',f=>({
     kind:value(f,'kind'),title:value(f,'title'),reference:value(f,'reference'),
     issuedOn:emptyToNull(f,'issuedOn'),expiresOn:emptyToNull(f,'expiresOn'),notes:value(f,'notes')
    }))}>
     <Select name="kind" label="Evidence category" options={options(['INSURANCE','MAINTENANCE','OWNERSHIP','COMPLIANCE','VALUATION','OTHER'])}/>
     <Field name="title" label="Reference title" required/>
     <Field name="reference" label="Opaque evidence reference" required max={300}/>
     <Field name="issuedOn" label="Date issued (optional)" kind="date"/>
     <Field name="expiresOn" label="Date expires (optional)" kind="date"/>
     <Field name="notes" label="Reference notes" kind="textarea" max={800}/>
     <button className="primary-button" type="submit" disabled={busy}>Record evidence label</button>
    </form>
   </Panel>}
   {tab==='locations'&&<Panel title="Record location label" detail="This changes the server registry location label and preserves chronological history; no live tracking.">
    <form className="so-form" onSubmit={e=>onForm(e,'/location-events',f=>({
     toLabel:value(f,'toLabel'),effectiveOn:value(f,'effectiveOn'),reason:value(f,'reason')
    }))}>
     <Field name="toLabel" label="New location label" required/>
     <Field name="effectiveOn" label="Effective date" kind="date" required defaultValue={today()}/>
     <Field name="reason" label="Reason (optional)" max={500}/>
     <button className="primary-button" type="submit" disabled={busy}>Record location change</button>
    </form>
   </Panel>}
   {tab==='relationships'&&<Panel title="Link tenant assets" detail="Directed references only, not verified legal ownership. Dependency cycles are rejected.">
    <form className="so-form" onSubmit={e=>onForm(e,'/asset-relationships',f=>({
     relatedAssetId:value(f,'relatedAssetId'),type:value(f,'type'),note:value(f,'note')
    }))}>
     <Select name="relatedAssetId" label="Related verified tenant asset" options={relatedAssets.length?
      relatedAssets.map(a=>[a.id,a.name+' · '+a.assetNumber]):[['','No eligible related asset in first 100 tenant assets']]}/>
     <Select name="type" label="Relationship type" options={options(['ASSOCIATED_WITH','COMPONENT_OF','DEPENDS_ON','LOCATED_WITH'])}/>
     <Field name="note" label="Relation note" max={500}/>
     <button className="primary-button" type="submit" disabled={busy||!relatedAssets.length}>Record asset relationship</button>
    </form>
    <p className="server-note">Related asset selector uses the first 100 authenticated tenant assets. The secure registry remains authoritative for selecting other assets.</p>
   </Panel>}
  </div>}
  <p className="so-disclaimer"><Link2 size={16}/> All shown records belong to the verified tenant; no browser-local records are synchronized or treated as authenticated.</p>
 </div>
}
export function ServerOperationsExperience({auth,path,navigate}:{auth:AuthState;path:string;navigate:(route:string)=>void}){
 const match=path.match(validAsset)
 return match?<AssetOperations auth={auth} id={match[1]} navigate={navigate}/>:<TenantAssetPicker auth={auth} navigate={navigate}/>
}
