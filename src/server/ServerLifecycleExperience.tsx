import {useCallback,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react'
import {ArrowLeft,ArrowRight,CheckCircle2,FileText,RefreshCw,ShieldAlert} from 'lucide-react'
import {type AuthState,type ServerAsset,ServerError,serverRequest} from './identity'
import './server-lifecycle.css'

type LifecycleEvent={id:string;from:string;to:string;reason:string;occurredAt:string}
type Acquisition={id:string;method:string;effectiveOn:string;currency:string;costBasis:string;costs:Record<string,string>;counterpartyLabel:string;evidenceReference:string}
type OwnershipInterest={id:string;partyRef:string;partyLabel:string;dimension:string;percentage:string|null;effectiveFrom:string;effectiveTo:string|null;source:string}
type OwnershipEvent={id:string;kind:string;dimension:string;fromPartyRef:string|null;toPartyRef:string;percentage:string|null;effectiveOn:string}
type Disposition={id:string;kind:string;effectiveOn:string;proceeds:string;costs:string;netProceeds:string;costBasis:string|null;estimatedGain:string|null;currency:string;reason:string}
type Snapshot={asset:ServerAsset;transitions:LifecycleEvent[];acquisition:Acquisition|null;ownershipInterests:OwnershipInterest[];ownershipChanges:OwnershipEvent[];disposition:Disposition|null}
type History={items:Array<{id:string;assetId:string;effectiveOn:string;method?:string;kind?:string;currency:string}>;nextCursor:string|null;limit:number}
type Props={auth:AuthState;path:string;navigate:(route:string)=>void}
const writable=(auth:AuthState)=>['WORKSPACE_OWNER','OPERATIONS'].includes(auth.membership?.role||'')
const idRegex=/^server-registry\/asset\/([0-9a-f-]{36})\/lifecycle$/i
const note=(error:unknown)=>error instanceof ServerError?error.code+': '+error.message:
  error instanceof Error?error.message:'Server request failed; no local preview was substituted.'
const today=()=>new Date().toISOString().slice(0,10)
const base='server-registry/lifecycle'
const assetUrl=(id:string)=>'server-registry/asset/'+id
const detailUrl=(id:string)=>assetUrl(id)+'/lifecycle'
const dimensions=['ECONOMIC','BENEFICIAL','LEGAL','CONTROL'] as const
const costKeys=['purchase','taxes','fees','installation','improvements','other'] as const
const moves:Record<string,{action:string;label:string}[]>={
 PLANNED:[{action:'START_ACQUISITION',label:'Begin acquisition'}],
 ACQUIRED:[{action:'ACTIVATE',label:'Activate'}],
 ACTIVE:[{action:'SUSPEND',label:'Suspend'}],
 SUSPENDED:[{action:'REACTIVATE',label:'Reactivate'}],
 DISPOSED:[{action:'ARCHIVE',label:'Archive'}]
}
function Panel({title,children}:{title:string;children:ReactNode}){
 return <section className="server-panel"><h2>{title}</h2>{children}</section>
}
function DateField({value,onChange,label='Effective date'}:{value:string;onChange:(value:string)=>void;label?:string}){
 return <label>{label}<input type="date" required max={today()} value={value} onChange={event=>onChange(event.target.value)}/></label>
}
function Button({busy,children}:{busy:boolean;children:React.ReactNode}){
 return <button className="primary-button" type="submit" disabled={busy}>{busy?'Recording…':children}</button>
}
type Submit=(route:string,input:Record<string,unknown>)=>Promise<boolean>
function LifecycleCommands({state,submit,busy}:{state:Snapshot;submit:Submit;busy:boolean}){
 const [reason,setReason]=useState('')
 const actions=moves[state.asset.lifecycle]||[]
 if(!actions.length)return null
 return <Panel title="Lifecycle control">
  <p className="server-note">Each action requires the latest PostgreSQL record version. No direct state editing is permitted.</p>
  <div className="server-lifecycle-actions"><label>Action reason<input aria-label="Lifecycle reason" required maxLength={400} placeholder="Why is this change being recorded?" value={reason} onChange={e=>setReason(e.target.value)}/></label>
  {actions.map(a=><button className="primary-button" key={a.action} disabled={busy||!reason.trim()} onClick={()=>void submit('/lifecycle-actions',{action:a.action,reason:reason.trim()}).then(ok=>{if(ok)setReason('')})}>{a.label}</button>)}</div>
 </Panel>
}
function AcquisitionForm({submit,busy}:{submit:Submit;busy:boolean}){
 const [method,setMethod]=useState('PURCHASE')
 const [date,setDate]=useState(today())
 const [counterparty,setCounterparty]=useState('')
 const [reference,setReference]=useState('')
 const [notes,setNotes]=useState('')
 const [costs,setCosts]=useState<Record<string,string>>(Object.fromEntries(costKeys.map(k=>[k,'0.00'])))
 const send=(event:FormEvent)=>{
  event.preventDefault()
  void submit('/acquisitions',{method,effectiveOn:date,counterpartyLabel:counterparty,evidenceReference:reference,notes,costs})
 }
 return <Panel title="Complete initial acquisition">
  <p className="server-note">One initial acquisition per asset. Costs are exact decimal strings in the asset’s currency. Recorded data is not proof of payment.</p>
  <form className="server-form" onSubmit={send}>
   <label>Acquisition method<select value={method} onChange={e=>setMethod(e.target.value)}>{['PURCHASE','TRANSFER','GIFT','INHERITANCE','CREATION','EXCHANGE','INVESTMENT','OTHER'].map(x=><option key={x}>{x}</option>)}</select></label>
   <DateField value={date} onChange={setDate}/>
   <label>Counterparty label<input maxLength={120} value={counterparty} onChange={e=>setCounterparty(e.target.value)}/></label>
   <label>Evidence reference (not a document upload)<input maxLength={140} value={reference} onChange={e=>setReference(e.target.value)}/></label>
   {costKeys.map(k=><label key={k}>{k}<input aria-label={'Acquisition '+k} required inputMode="decimal" pattern="(0|[1-9][0-9]{0,17})(\.[0-9]{1,2})?" value={costs[k]} onChange={e=>setCosts(v=>({...v,[k]:e.target.value}))}/></label>)}
   <label className="server-wide">Notes<textarea maxLength={600} rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
   <div className="server-wide"><Button busy={busy}>Record acquisition</Button></div>
  </form>
 </Panel>
}
function OwnershipForm({snapshot,submit,busy}:{snapshot:Snapshot;submit:Submit;busy:boolean}){
 const [dimension,setDimension]=useState<string>('ECONOMIC')
 const [partyRef,setPartyRef]=useState('')
 const [partyLabel,setPartyLabel]=useState('')
 const [percentage,setPercentage]=useState('')
 const [date,setDate]=useState(today())
 const [noteText,setNote]=useState('')
 const percentageBased=['ECONOMIC','BENEFICIAL'].includes(dimension)
 const active=snapshot.ownershipInterests.filter(i=>i.effectiveTo===null&&i.dimension===dimension)
 const send=(event:FormEvent)=>{
  event.preventDefault()
  void submit('/ownership-interests',{dimension,partyRef:partyRef.trim(),partyLabel:partyLabel.trim(),
   percentage:percentageBased?percentage:null,effectiveOn:date,note:noteText})
 }
 return <Panel title="Assign recorded ownership interest">
  <p className="server-note">Economic and beneficial percentages are limited to 100% per dimension. Legal and control entries are references only, not title verification.</p>
  <p className="server-note">Current {dimension} claims: {active.map(i=>i.partyLabel+(i.percentage?' ('+i.percentage+'%)':'')).join(', ')||'none recorded'}</p>
  <form className="server-form" onSubmit={send}>
   <label>Ownership dimension<select aria-label="Ownership dimension" value={dimension} onChange={e=>{setDimension(e.target.value);setPercentage('')}}>{dimensions.map(d=><option key={d}>{d}</option>)}</select></label>
   <label>Party reference<input aria-label="Ownership party reference" required maxLength={90} value={partyRef} onChange={e=>setPartyRef(e.target.value)}/></label>
   <label>Party label<input aria-label="Ownership party label" required maxLength={120} value={partyLabel} onChange={e=>setPartyLabel(e.target.value)}/></label>
   {percentageBased&&<label>Percentage<input aria-label="Ownership percentage" required inputMode="decimal" pattern="(0|[1-9][0-9]{0,2})(\.[0-9]{1,2})?" value={percentage} onChange={e=>setPercentage(e.target.value)}/></label>}
   <DateField value={date} onChange={setDate}/>
   <label>Reference note<input maxLength={400} value={noteText} onChange={e=>setNote(e.target.value)}/></label>
   <div className="server-wide"><Button busy={busy}>Record ownership claim</Button></div>
  </form>
 </Panel>
}
function TransferForm({snapshot,submit,busy}:{snapshot:Snapshot;submit:Submit;busy:boolean}){
 const [source,setSource]=useState('')
 const [party,setParty]=useState('')
 const [name,setName]=useState('')
 const [percentage,setPercentage]=useState('')
 const [date,setDate]=useState(today())
 const [noteText,setNote]=useState('')
 const candidates=snapshot.ownershipInterests.filter(i=>i.effectiveTo===null&&['ECONOMIC','BENEFICIAL'].includes(i.dimension))
 const send=(event:FormEvent)=>{
  event.preventDefault()
  void submit('/ownership-transfers',{sourceInterestId:source,toPartyRef:party.trim(),
   toPartyLabel:name.trim(),percentage,effectiveOn:date,note:noteText})
 }
 if(!candidates.length)return null
 return <Panel title="Transfer an existing interest">
  <p className="server-note">Choose an active economic/beneficial source. The original period is closed, and any retained portion remains with the source party.</p>
  <form className="server-form" onSubmit={send}>
   <label>Source interest<select aria-label="Transfer source interest" required value={source} onChange={e=>setSource(e.target.value)}><option value="">Choose a source</option>{candidates.map(i=><option key={i.id} value={i.id}>{i.partyLabel} · {i.dimension} · {i.percentage}%</option>)}</select></label>
   <label>Receiving party reference<input aria-label="Transfer receiving reference" required maxLength={90} value={party} onChange={e=>setParty(e.target.value)}/></label>
   <label>Receiving party label<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
   <label>Transferred percentage<input aria-label="Transfer percentage" required inputMode="decimal" value={percentage} onChange={e=>setPercentage(e.target.value)}/></label>
   <DateField value={date} onChange={setDate}/>
   <label>Reason / evidence note<input maxLength={400} value={noteText} onChange={e=>setNote(e.target.value)}/></label>
   <div className="server-wide"><Button busy={busy}>Record transfer</Button></div>
  </form>
 </Panel>
}
function DispositionForm({submit,busy}:{submit:Submit;busy:boolean}){
 const [kind,setKind]=useState('SALE')
 const [date,setDate]=useState(today())
 const [proceeds,setProceeds]=useState('0.00')
 const [costs,setCosts]=useState('0.00')
 const [reason,setReason]=useState('')
 const [counterparty,setCounterparty]=useState('')
 const [confirmed,setConfirmed]=useState(false)
 const send=(event:FormEvent)=>{
  event.preventDefault()
  if(!confirmed)return
  void submit('/disposition',{kind,effectiveOn:date,proceeds,costs,counterpartyLabel:counterparty,reason:reason.trim(),confirm:'DISPOSE'})
 }
 return <Panel title="Record asset disposition">
  <p className="server-note">This permanently closes active use and ownership changes. Proceeds are USER-ENTERED, not paid or reconciled. Estimated gain is NOT a tax figure.</p>
  <form className="server-form" onSubmit={send}>
   <label>Disposition kind<select value={kind} onChange={e=>setKind(e.target.value)}>{['SALE','TRANSFER','DONATION','WRITE_OFF','DESTRUCTION','TRADE','OTHER'].map(k=><option key={k}>{k}</option>)}</select></label>
   <DateField value={date} onChange={setDate}/>
   <label>Proceeds<input aria-label="Disposition proceeds" inputMode="decimal" required value={proceeds} onChange={e=>setProceeds(e.target.value)}/></label>
   <label>Disposition costs<input aria-label="Disposition costs" inputMode="decimal" required value={costs} onChange={e=>setCosts(e.target.value)}/></label>
   <label>Counterparty label<input maxLength={120} value={counterparty} onChange={e=>setCounterparty(e.target.value)}/></label>
   <label>Reason<input aria-label="Disposition reason" required maxLength={400} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   <label className="server-wide server-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I confirm this user-entered disposition should close the asset lifecycle.</label>
   <div className="server-wide"><button type="submit" className="primary-button" disabled={busy||!confirmed}>{busy?'Recording…':'Confirm disposition'}</button></div>
  </form>
 </Panel>
}
function AssetLifecycle({auth,id,navigate}:{auth:AuthState;id:string;navigate:(route:string)=>void}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null)
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const pending=useRef<{signature:string;key:string}|null>(null)
 const refresh=useCallback(async()=>{
  setLoading(true);setError('')
  try{
   const data=await serverRequest<Snapshot>(auth,'/v1/assets/'+id+'/lifecycle')
   if(data.asset.id!==id||data.asset.tenantId!==auth.tenantId)throw Error('Unexpected tenant asset response.')
   setSnapshot(data)
  }catch(e){setError(note(e));setSnapshot(null)}
  finally{setLoading(false)}
 },[auth,id])
 useEffect(()=>{void refresh()},[refresh])
 const submit:Submit=async(route,input)=>{
  if(!writable(auth)||!snapshot)return false
  const signature=JSON.stringify({route,input,version:snapshot.asset.recordVersion})
  if(pending.current?.signature!==signature)pending.current={signature,key:crypto.randomUUID()}
  setBusy(true);setError('');setSuccess('')
  try{
   await serverRequest(auth,'/v1/assets/'+id+route,{method:'POST',
    headers:{'If-Match':'"'+snapshot.asset.recordVersion+'"','Idempotency-Key':pending.current.key},
    body:JSON.stringify(input)})
   pending.current=null
   setSuccess('Recorded in the verified tenant database. Reloaded the authoritative history.')
   await refresh()
   return true
  }catch(e){setError(note(e)+(e instanceof ServerError&&e.status===412?' Reload this asset to resolve the record version conflict.':''));return false}
  finally{setBusy(false)}
 }
 return <div className="server-lifecycle">
  <div className="server-heading"><button className="secondary-button" onClick={()=>navigate('server-registry')}><ArrowLeft size={16}/> Server assets</button>
   <button className="secondary-button" disabled={busy||loading} onClick={()=>void refresh()}><RefreshCw size={16}/> Refresh</button></div>
  {error&&<p role="alert" className="server-error">{error} <button onClick={()=>void refresh()}>Retry / refresh</button></p>}
  {success&&<p role="status" className="server-success"><CheckCircle2 size={16}/>{success}</p>}
  {loading&&<p role="status">Loading PostgreSQL lifecycle evidence…</p>}
  {snapshot&&<>
   <div className="server-panel"><span className="eyebrow">VERIFIED TENANT HISTORY</span><h2>{snapshot.asset.name}</h2>
    <div className="server-kpis"><div><small>Lifecycle</small><strong>{snapshot.asset.lifecycle}</strong></div><div><small>Record version</small><strong>{snapshot.asset.recordVersion}</strong></div><div><small>Currency</small><strong>{snapshot.asset.currency}</strong></div></div>
    <button className="secondary-button" onClick={()=>navigate(assetUrl(id))}>Registry details <ArrowRight size={16}/></button></div>
   <Panel title="Acquisition and cost basis">
    {snapshot.acquisition?<div className="server-lifecycle-evidence">
     <p><strong>{snapshot.acquisition.method}</strong> · {snapshot.acquisition.effectiveOn} · reference {snapshot.acquisition.evidenceReference||'Not supplied'}</p>
     <p>Recorded cost basis: <strong>{snapshot.acquisition.costBasis} {snapshot.acquisition.currency}</strong> (user-entered)</p>
     <dl>{Object.entries(snapshot.acquisition.costs).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v} {snapshot.acquisition?.currency}</dd></div>)}</dl>
    </div>:<p>No authenticated initial acquisition has been recorded.</p>}
   </Panel>
   <Panel title="Ownership interests and transfers">
    {!snapshot.ownershipInterests.length?<p>No ownership claims have been recorded in this tenant.</p>:
     <div className="table-scroll"><table className="asset-table"><thead><tr><th>Party</th><th>Dimension</th><th>Share</th><th>Effective period</th></tr></thead><tbody>{snapshot.ownershipInterests.map(i=><tr key={i.id}><td>{i.partyLabel}<small>{i.partyRef}</small></td><td>{i.dimension}</td><td>{i.percentage===null?'Nonpercentage reference':i.percentage+'%'}</td><td>{i.effectiveFrom} → {i.effectiveTo||'Current'}</td></tr>)}</tbody></table></div>}
    {snapshot.ownershipChanges.length>0&&<p className="server-note">{snapshot.ownershipChanges.length} recorded assignment/transfer events preserved in server history.</p>}
   </Panel>
   <Panel title="Disposition and archive">
    {snapshot.disposition?<div className="server-lifecycle-evidence"><p><strong>{snapshot.disposition.kind}</strong> · {snapshot.disposition.effectiveOn}</p>
      <p>Proceeds {snapshot.disposition.proceeds} · costs {snapshot.disposition.costs} · recorded net {snapshot.disposition.netProceeds} {snapshot.disposition.currency}</p>
      <p>Initial cost basis {snapshot.disposition.costBasis||'Unknown'} · indicative gain {snapshot.disposition.estimatedGain||'Unknown'} {snapshot.disposition.currency}</p>
      <p className="server-note">Not a Finance OS payment, verified sale or tax calculation.</p></div>:<p>No server disposition recorded.</p>}
   </Panel>
   <Panel title="Lifecycle event timeline">
    {!snapshot.transitions.length?<p>No lifecycle transitions recorded.</p>:<ol className="server-timeline">{snapshot.transitions.map(t=><li key={t.id}><strong>{t.from} → {t.to}</strong><span>{t.reason} · {new Date(t.occurredAt).toLocaleDateString()}</span></li>)}</ol>}
   </Panel>
   {writable(auth)&&<div className="server-lifecycle-commands">
    <LifecycleCommands state={snapshot} submit={submit} busy={busy}/>
    {snapshot.asset.lifecycle==='ACQUISITION_PENDING'&&<AcquisitionForm submit={submit} busy={busy}/>}
    {['ACQUIRED','ACTIVE','SUSPENDED'].includes(snapshot.asset.lifecycle)&&<>
      <OwnershipForm key={'owner-'+snapshot.asset.recordVersion} snapshot={snapshot} submit={submit} busy={busy}/>
      <TransferForm key={'transfer-'+snapshot.asset.recordVersion} snapshot={snapshot} submit={submit} busy={busy}/>
      <DispositionForm submit={submit} busy={busy}/>
    </>}
   </div>}
   {!writable(auth)&&<p className="server-note">Your verified role is read-only. Mutation controls are intentionally not displayed.</p>}
  </>}
 </div>
}
function HistoryCenter({auth,navigate}:{auth:AuthState;navigate:(route:string)=>void}){
 const [kind,setKind]=useState<'acquisitions'|'dispositions'>('acquisitions')
 const [rows,setRows]=useState<History['items']>([])
 const [cursor,setCursor]=useState<string|null>(null)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const fetchPage=useCallback(async(next:string|null)=>{
  setBusy(true);setError('')
  try{
   const q=new URLSearchParams({limit:'20'})
   if(next)q.set('cursor',next)
   const page=await serverRequest<History>(auth,'/v1/'+kind+'?'+q)
   setRows(v=>next?[...v,...page.items]:page.items)
   setCursor(page.nextCursor)
  }catch(e){setError(note(e))}
  finally{setBusy(false)}
 },[auth,kind])
 useEffect(()=>{setRows([]);setCursor(null);void fetchPage(null)},[fetchPage])
 return <Panel title="Authenticated lifecycle history">
  <p className="server-note">Only tenant-owned acquisition and disposition records from PostgreSQL appear here.</p>
  <div className="server-heading"><label>History type<select aria-label="Server history type" value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="acquisitions">Acquisitions</option><option value="dispositions">Dispositions</option></select></label>
  <button className="secondary-button" onClick={()=>void fetchPage(null)} disabled={busy}><RefreshCw size={16}/> Refresh</button></div>
  {error&&<p className="server-error" role="alert">{error}</p>}
  {busy&&<p role="status">Loading tenant history…</p>}
  {!busy&&!rows.length&&!error&&<p>No server history in this tenant.</p>}
  {rows.length>0&&<div className="table-scroll"><table className="asset-table"><thead><tr><th>Asset</th><th>Event</th><th>Effective date</th><th>Currency</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><button className="link-button" onClick={()=>navigate(detailUrl(r.assetId))}>{r.assetId.slice(0,8)} <ArrowRight size={14}/></button></td><td>{r.kind||r.method}</td><td>{r.effectiveOn}</td><td>{r.currency}</td></tr>)}</tbody></table></div>}
  {cursor&&<button className="secondary-button" disabled={busy} onClick={()=>void fetchPage(cursor)}>Load more</button>}
 </Panel>
}
export function ServerLifecycleExperience({auth,path,navigate}:Props){
 const detail=path.match(idRegex)
 return <div className="server-registry server-lifecycle">
  <div className="page-intro"><div><span className="eyebrow">B2.1 · POSTGRESQL LIFECYCLE</span><h1>Verified Asset Operations</h1>
  <p>Acquisition, recorded ownership, asset lifecycle and disposition under your authenticated tenant.</p></div>
  <div className="page-actions"><span className="server-status server-signedIn">Verified tenant · {auth.membership?.role.replaceAll('_',' ')}</span></div></div>
  <div className="server-boundary"><ShieldAlert size={20}/><p><strong>Server authority only:</strong> these records are fetched from PostgreSQL and do not reuse Phase 2 browser-local mock assets. Ownership is a user-entered claim, not verified title. Financial figures are not Finance OS transactions.</p></div>
  {detail?<AssetLifecycle key={auth.tenantId+'|'+detail[1]} auth={auth} id={detail[1]} navigate={navigate}/>:<HistoryCenter auth={auth} navigate={navigate}/>}
  <p className="server-note"><FileText size={15}/> Full transaction certification uses real PostgreSQL and signed test-issuer identities in backend CI. Live staging identity/provider activation is a separate operational gate.</p>
 </div>
}
