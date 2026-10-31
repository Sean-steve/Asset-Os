import {useCallback,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react'
import {ArrowLeft,ArrowRight,CheckCircle2,Clock3,LockKeyhole,RefreshCw,ShieldAlert,Wallet} from 'lucide-react'
import {type AuthState,ServerError} from './identity'
import {
 type LifecycleSnapshot,type OwnershipDimension,type DomainRoute,
 ACQUISITION_METHODS,DISPOSITION_KINDS,OWNERSHIP_DIMENSIONS,COST_KEYS,
 allowedAction,asMoney,costBasis,defaultCosts,editable,getLifecycle,
 isActiveOwnership,postDomainCommand,sharesByDimension,todayIso,toCents
} from './lifecycle-api'
import './server-lifecycle.css'

type Props={auth:AuthState;assetId:string;navigate:(route:string)=>void}
type Tab='overview'|'acquisition'|'ownership'|'disposition'|'history'
const readable=(s:string)=>s.replaceAll('_',' ').toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase())
const currency=(value:string|null,code:string)=>value===null?'Not recorded':value+' '+code
const labelDate=(value:string|null|undefined)=>value?value.slice(0,10):'—'
const errorText=(error:unknown)=>{
 if(error instanceof ServerError)return error.code+': '+error.message
 return 'Server operation failed. Your changes were not assumed to be saved.'
}
function Card({title,children}:{title:string;children:ReactNode}){
 return <section className="server-panel b21-card"><h2>{title}</h2>{children}</section>
}
function Field({label,children}:{label:string;children:ReactNode}){
 return <label className="b21-field"><span>{label}</span>{children}</label>
}
function Note({children}:{children:ReactNode}){
 return <div className="b21-warning"><ShieldAlert size={16}/><p>{children}</p></div>
}
function Summary({snapshot}:{snapshot:LifecycleSnapshot}){
 const a=snapshot.asset
 return <div className="b21-summary">
  <div><small>Lifecycle</small><strong>{readable(a.lifecycle)}</strong></div>
  <div><small>Registry version</small><strong>v{a.recordVersion}</strong></div>
  <div><small>Acquisition basis</small><strong>{currency(snapshot.acquisition?.costBasis||null,a.currency)}</strong></div>
  <div><small>Recorded disposition</small><strong>{snapshot.disposition?readable(snapshot.disposition.kind):'None'}</strong></div>
 </div>
}
function Transition({snapshot,onCommand,busy,canWrite}:{
 snapshot:LifecycleSnapshot;onCommand:(route:DomainRoute,payload:unknown)=>Promise<boolean>;
 busy:boolean;canWrite:boolean
}){
 const action=allowedAction(snapshot.asset.lifecycle)
 const [reason,setReason]=useState('')
 if(!action)return <p className="server-note">This lifecycle state has no direct transition. Acquisitions and disposals require recorded evidence.</p>
 const verb:Record<string,string>={
  START_ACQUISITION:'Begin acquisition',
  ACTIVATE:'Activate asset',SUSPEND:'Suspend asset',REACTIVATE:'Reactivate asset',ARCHIVE:'Archive disposed asset'
 }
 async function submit(event:FormEvent){
  event.preventDefault()
  if(await onCommand('lifecycle-actions',{action,reason:reason.trim()}))setReason('')
 }
 return <form className="b21-action" onSubmit={e=>void submit(e)}>
  <Field label="Reason for transition"><input required maxLength={400} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain the state change"/></Field>
  <button type="submit" className="primary-button" disabled={!canWrite||busy}>{busy?'Saving to PostgreSQL…':verb[action]}</button>
 </form>
}
function Acquisition({snapshot,onCommand,busy,canWrite}:{
 snapshot:LifecycleSnapshot;onCommand:(route:DomainRoute,payload:unknown)=>Promise<boolean>;
 busy:boolean;canWrite:boolean
}){
 const [method,setMethod]=useState<(typeof ACQUISITION_METHODS)[number]>('PURCHASE')
 const [date,setDate]=useState(todayIso())
 const [costs,setCosts]=useState(defaultCosts)
 const [counterparty,setCounterparty]=useState('')
 const [reference,setReference]=useState('')
 const [notes,setNotes]=useState('')
 let estimate='Enter valid decimal amounts'
 try{estimate=costBasis(costs)+' '+snapshot.asset.currency}catch{/* entry not yet valid */}
 const recorded=snapshot.acquisition
 const canRecord=snapshot.asset.lifecycle==='ACQUISITION_PENDING'&&!recorded
 async function submit(event:FormEvent){
  event.preventDefault()
  if(await onCommand('acquisitions',{
   method,effectiveOn:date,counterpartyLabel:counterparty,
   evidenceReference:reference,notes,costs
  })){setNotes('')}
 }
 return <>
  {recorded?<div className="b21-readonly">
   <div className="b21-summary"><div><small>Acquired on</small><strong>{labelDate(recorded.effectiveOn)}</strong></div>
    <div><small>Method</small><strong>{readable(recorded.method)}</strong></div>
    <div><small>Cost basis (recorded)</small><strong>{currency(recorded.costBasis,recorded.currency)}</strong></div></div>
   <p>Counterparty: {recorded.counterpartyLabel||'Not entered'} · Evidence reference: {recorded.evidenceReference||'Not entered'}</p>
   <div className="b21-cost-grid">{COST_KEYS.map(key=><div key={key}><small>{readable(key)}</small><strong>{recorded.costs?.[key]||'0.00'}</strong></div>)}</div>
   <Note>Cost basis is user-entered acquisition evidence, not a Finance OS payment or reconciled ledger balance.</Note>
  </div>:null}
  {canRecord&&<form className="b21-form" onSubmit={e=>void submit(e)}>
   <div className="b21-form-grid">
    <Field label="Acquisition method"><select value={method} onChange={e=>setMethod(e.target.value as typeof method)}>{ACQUISITION_METHODS.map(x=><option key={x} value={x}>{readable(x)}</option>)}</select></Field>
    <Field label="Effective acquisition date"><input aria-label="Effective acquisition date" type="date" required max={todayIso()} value={date} onChange={e=>setDate(e.target.value)}/></Field>
    <Field label="Counterparty label"><input maxLength={120} value={counterparty} onChange={e=>setCounterparty(e.target.value)}/></Field>
    <Field label="Evidence reference (metadata only)"><input maxLength={140} value={reference} onChange={e=>setReference(e.target.value)}/></Field>
   </div>
   <h3>Itemized cost basis · {snapshot.asset.currency}</h3>
   <div className="b21-cost-grid">{COST_KEYS.map(key=><Field key={key} label={readable(key)}><input aria-label={'Cost '+key} inputMode="decimal" pattern="(0|[1-9][0-9]{0,17})(\.[0-9]{1,2})?" required value={costs[key]} onChange={e=>setCosts(s=>({...s,[key]:e.target.value}))}/></Field>)}</div>
   <div className="b21-total"><span>Indicative cost basis</span><strong>{estimate}</strong></div>
   <Field label="Acquisition notes"><textarea rows={3} maxLength={600} value={notes} onChange={e=>setNotes(e.target.value)}/></Field>
   <Note>Only one initial acquisition can be recorded. Purchase consideration must be positive. Saving changes asset lifecycle to Acquired and cannot be undone from this screen.</Note>
   <button className="primary-button" disabled={!canWrite||busy} type="submit">{busy?'Recording…':'Record acquisition & cost basis'} <ArrowRight size={16}/></button>
  </form>}
  {!recorded&&!canRecord&&<p className="server-note">Begin acquisition from the Lifecycle tab before recording an acquisition. Disposed/archived assets are immutable.</p>}
 </>
}
function Ownership({snapshot,onCommand,busy,canWrite}:{
 snapshot:LifecycleSnapshot;onCommand:(route:DomainRoute,payload:unknown)=>Promise<boolean>;
 busy:boolean;canWrite:boolean
}){
 const [dimension,setDimension]=useState<OwnershipDimension>('ECONOMIC')
 const [partyRef,setPartyRef]=useState(''),[partyLabel,setPartyLabel]=useState('')
 const [percentage,setPercentage]=useState(''),[effectiveOn,setEffectiveOn]=useState(todayIso())
 const [note,setNote]=useState('')
 const [sourceId,setSourceId]=useState(''),[targetRef,setTargetRef]=useState('')
 const [targetLabel,setTargetLabel]=useState(''),[transferShare,setTransferShare]=useState('')
 const [transferDate,setTransferDate]=useState(todayIso()),[transferNote,setTransferNote]=useState('')
 const current=snapshot.ownershipInterests.filter(isActiveOwnership)
 const transferable=current.filter(i=>(i.dimension==='ECONOMIC'||i.dimension==='BENEFICIAL')&&i.percentage)
 const enabled=['ACQUIRED','ACTIVE','SUSPENDED'].includes(snapshot.asset.lifecycle)&&canWrite
 async function assign(event:FormEvent){
  event.preventDefault()
  const ok=await onCommand('ownership-interests',{
   dimension,partyRef:partyRef.trim(),partyLabel:partyLabel.trim(),
   percentage:dimension==='LEGAL'||dimension==='CONTROL'?null:percentage,
   effectiveOn,note
  })
  if(ok){setPartyRef('');setPartyLabel('');setPercentage('');setNote('')}
 }
 async function transfer(event:FormEvent){
  event.preventDefault()
  const ok=await onCommand('ownership-transfers',{
   sourceInterestId:sourceId,toPartyRef:targetRef.trim(),toPartyLabel:targetLabel.trim(),
   percentage:transferShare,effectiveOn:transferDate,note:transferNote
  })
  if(ok){setSourceId('');setTargetRef('');setTargetLabel('');setTransferShare('');setTransferNote('')}
 }
 return <>
  <div className="b21-ownership-totals">{(['ECONOMIC','BENEFICIAL'] as OwnershipDimension[]).map(x=>
   <div key={x}><small>{readable(x)} allocated</small><strong>{sharesByDimension(current,x)}%</strong><span>Recorded share, not verified title</span></div>)}</div>
  <div className="b21-table-wrap"><table className="b21-table"><thead><tr><th>Recorded party</th><th>Dimension</th><th>Share</th><th>Effective period</th><th>Status</th></tr></thead><tbody>
   {snapshot.ownershipInterests.map(i=><tr key={i.id}><td><strong>{i.partyLabel}</strong><small>{i.partyRef}</small></td>
    <td>{readable(i.dimension)}</td><td>{i.percentage===null?'Reference-only':i.percentage+'%'}</td>
    <td>{labelDate(i.effectiveFrom)} → {i.effectiveTo?labelDate(i.effectiveTo):'Current'}</td>
    <td>{i.effectiveTo?'Historical':'Current'}</td></tr>)}
  </tbody></table>{!snapshot.ownershipInterests.length&&<p className="server-empty">No recorded ownership interests for this tenant asset.</p>}</div>
  <Note>Ownership is a user-entered claim only. Economic and beneficial shares may not exceed 100% per dimension. Legal/control references do not establish verified legal rights.</Note>
  {enabled&&<div className="b21-dual">
   <form className="b21-form b21-subpanel" onSubmit={e=>void assign(e)}>
    <h3>Assign ownership interest</h3>
    <Field label="Ownership dimension"><select value={dimension} onChange={e=>setDimension(e.target.value as OwnershipDimension)}>{OWNERSHIP_DIMENSIONS.map(x=><option key={x}>{x}</option>)}</select></Field>
    <Field label="Party reference"><input required maxLength={90} value={partyRef} onChange={e=>setPartyRef(e.target.value)} placeholder="Private internal reference"/></Field>
    <Field label="Party display label"><input required maxLength={120} value={partyLabel} onChange={e=>setPartyLabel(e.target.value)}/></Field>
    {(['ECONOMIC','BENEFICIAL'] as string[]).includes(dimension)&&<Field label="Ownership percentage"><input required inputMode="decimal" aria-label="Ownership percentage" value={percentage} onChange={e=>setPercentage(e.target.value)} placeholder="25.00" pattern="(0|[1-9][0-9]{0,2})(\.[0-9]{1,2})?"/></Field>}
    <Field label="Ownership effective date"><input required type="date" max={todayIso()} value={effectiveOn} onChange={e=>setEffectiveOn(e.target.value)}/></Field>
    <Field label="Assignment note"><textarea rows={2} maxLength={400} value={note} onChange={e=>setNote(e.target.value)}/></Field>
    <button className="primary-button" type="submit" disabled={busy}>Record ownership claim</button>
   </form>
   <form className="b21-form b21-subpanel" onSubmit={e=>void transfer(e)}>
    <h3>Transfer an active share</h3>
    <Field label="Source ownership interest"><select required value={sourceId} onChange={e=>setSourceId(e.target.value)}>
     <option value="">Choose a current interest</option>{transferable.map(i=><option value={i.id} key={i.id}>{i.partyLabel} · {i.dimension} · {i.percentage}%</option>)}
    </select></Field>
    <Field label="Recipient party reference"><input required value={targetRef} maxLength={90} onChange={e=>setTargetRef(e.target.value)}/></Field>
    <Field label="Recipient display label"><input required value={targetLabel} maxLength={120} onChange={e=>setTargetLabel(e.target.value)}/></Field>
    <Field label="Share to transfer (%)"><input required aria-label="Share to transfer" inputMode="decimal" pattern="(0|[1-9][0-9]{0,2})(\.[0-9]{1,2})?" value={transferShare} onChange={e=>setTransferShare(e.target.value)} placeholder="10.00"/></Field>
    <Field label="Transfer effective date"><input type="date" required max={todayIso()} value={transferDate} onChange={e=>setTransferDate(e.target.value)}/></Field>
    <Field label="Transfer note"><textarea rows={2} maxLength={400} value={transferNote} onChange={e=>setTransferNote(e.target.value)}/></Field>
    <button className="primary-button" type="submit" disabled={busy||!transferable.length}>Record transfer</button>
   </form>
  </div>}
  {!enabled&&<p className="server-note">Current ownership claims can only be modified for Acquired, Active or Suspended assets by an Owner or Operations member.</p>}
 </>
}
function DispositionPanel({snapshot,onCommand,busy,canWrite}:{
 snapshot:LifecycleSnapshot;onCommand:(route:DomainRoute,payload:unknown)=>Promise<boolean>;
 busy:boolean;canWrite:boolean
}){
 const [kind,setKind]=useState<(typeof DISPOSITION_KINDS)[number]>('SALE')
 const [date,setDate]=useState(todayIso()),[proceeds,setProceeds]=useState('0')
 const [costs,setCosts]=useState('0'),[counterparty,setCounterparty]=useState('')
 const [reason,setReason]=useState(''),[confirm,setConfirm]=useState('')
 let preview='Enter valid amounts'
 try{preview=asMoney(toCents(proceeds)-toCents(costs))+' '+snapshot.asset.currency}catch{/* draft */}
 const enabled=['ACQUIRED','ACTIVE','SUSPENDED'].includes(snapshot.asset.lifecycle)&&canWrite
 const d=snapshot.disposition
 async function submit(event:FormEvent){
  event.preventDefault()
  await onCommand('disposition',{
   kind,effectiveOn:date,proceeds,costs,counterpartyLabel:counterparty,
   reason:reason.trim(),confirm
  })
 }
 return <>
  {d&&<div className="b21-readonly">
   <div className="b21-summary">
    <div><small>Disposition</small><strong>{readable(d.kind)} · {labelDate(d.effectiveOn)}</strong></div>
    <div><small>Net proceeds (entered)</small><strong>{currency(d.netProceeds,d.currency)}</strong></div>
    <div><small>Initial cost basis</small><strong>{currency(d.costBasis,d.currency)}</strong></div>
    <div><small>Indicative gain/loss</small><strong>{currency(d.estimatedGain,d.currency)}</strong></div>
   </div><p>Reason: {d.reason}</p>
   <Note>This is not a bank payment, Finance OS ledger record, verified sale or a tax certificate.</Note>
  </div>}
  {!d&&enabled&&<form className="b21-form" onSubmit={e=>void submit(e)}>
   <Note>Disposition ends normal asset operations. This irreversible recorded history requires an exact confirmation phrase. No money will be moved.</Note>
   <div className="b21-form-grid">
    <Field label="Disposition kind"><select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}>{DISPOSITION_KINDS.map(k=><option key={k}>{k}</option>)}</select></Field>
    <Field label="Effective disposition date"><input required type="date" max={todayIso()} value={date} onChange={e=>setDate(e.target.value)}/></Field>
    <Field label={'Entered proceeds · '+snapshot.asset.currency}><input required aria-label="Disposition proceeds" inputMode="decimal" pattern="(0|[1-9][0-9]{0,17})(\.[0-9]{1,2})?" value={proceeds} onChange={e=>setProceeds(e.target.value)}/></Field>
    <Field label={'Entered costs · '+snapshot.asset.currency}><input required aria-label="Disposition costs" inputMode="decimal" pattern="(0|[1-9][0-9]{0,17})(\.[0-9]{1,2})?" value={costs} onChange={e=>setCosts(e.target.value)}/></Field>
    <Field label="Counterparty label"><input maxLength={120} value={counterparty} onChange={e=>setCounterparty(e.target.value)}/></Field>
    <Field label="Confirmation (type DISPOSE)"><input required aria-label="Confirmation (type DISPOSE)" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="DISPOSE"/></Field>
   </div>
   <Field label="Reason and evidence context"><textarea required maxLength={400} rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></Field>
   <div className="b21-total"><span>Entered net proceeds, not payment</span><strong>{preview}</strong></div>
   <button type="submit" disabled={busy||confirm!=='DISPOSE'} className="primary-button">{busy?'Recording…':'Confirm recorded disposition'}</button>
  </form>}
  {!d&&!enabled&&<p className="server-note">Disposition is available only to authenticated Owners/Operations for Acquired, Active or Suspended assets.</p>}
 </>
}
function History({snapshot}:{snapshot:LifecycleSnapshot}){
 const events=[
  ...snapshot.transitions.map(x=>({id:'l-'+x.id,at:x.occurredAt,title:readable(x.from)+' → '+readable(x.to),detail:x.reason})),
  ...snapshot.ownershipChanges.map(x=>({id:'o-'+x.id,at:x.recordedAt,title:'Ownership '+readable(x.kind)+' · '+readable(x.dimension),detail:(x.fromPartyRef?x.fromPartyRef+' → ':'')+x.toPartyRef+' · '+(x.percentage||'reference')+(x.percentage?'%':'')}))
 ].sort((a,b)=>b.at.localeCompare(a.at))
 return <div className="b21-history">{events.length?events.map(x=><article key={x.id}>
   <Clock3 size={16}/><div><strong>{x.title}</strong><p>{x.detail}</p></div><time dateTime={x.at}>{labelDate(x.at)}</time>
  </article>):<p className="server-empty">No server lifecycle or ownership history has been recorded.</p>}</div>
}
export function ServerLifecycleExperience({auth,assetId,navigate}:Props){
 const [snapshot,setSnapshot]=useState<LifecycleSnapshot|null>(null)
 const [tab,setTab]=useState<Tab>('overview')
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false)
 const [error,setError]=useState(''),[success,setSuccess]=useState('')
 const requestId=useRef(0)
 const previous=useRef<{fingerprint:string;key:string}|null>(null)
 const writable=editable(auth)
 const reload=useCallback(async()=>{
  const id=++requestId.current
  setLoading(true)
  try{
   const value=await getLifecycle(auth,assetId)
   if(id!==requestId.current)return
   if(value.asset.tenantId!==auth.tenantId||value.asset.id!==assetId)
    throw Error('Response tenant or asset does not match verified selection.')
   setSnapshot(value);setError('')
  }catch(e){if(id===requestId.current){setSnapshot(null);setError(errorText(e))}}
  finally{if(id===requestId.current)setLoading(false)}
 },[auth,assetId])
 useEffect(()=>{void reload();return()=>{requestId.current++}},[reload])
 const command=useCallback(async(route:DomainRoute,payload:unknown)=>{
  if(!snapshot||busy||!writable)return false
  const body=JSON.stringify(payload)
  const fingerprint=[auth.tenantId,assetId,snapshot.asset.recordVersion,route,body].join('|')
  if(previous.current?.fingerprint!==fingerprint)
   previous.current={fingerprint,key:crypto.randomUUID()}
  setError('');setSuccess('');setBusy(true)
  try{
   await postDomainCommand(auth,snapshot,route,payload,previous.current.key)
   previous.current=null
   setSuccess('Saved to the authenticated PostgreSQL registry. Event and audit history recorded.')
   await reload()
   return true
  }catch(e){
   if(e instanceof ServerError&&e.status===412){
    previous.current=null
    await reload()
    setError('RECORD_VERSION_CONFLICT: Asset changed elsewhere. Review the refreshed state before retrying.')
   }else setError(errorText(e))
   return false
  }finally{setBusy(false)}
 },[auth,assetId,snapshot,busy,writable,reload])
 const tabs:Tab[]=['overview','acquisition','ownership','disposition','history']
 return <div className="b21-workflow">
  <div className="b21-header"><div>
   <button className="secondary-button" type="button" onClick={()=>navigate('server-registry/asset/'+assetId)}><ArrowLeft size={16}/> Secure asset details</button>
   <span className="eyebrow">B2.1 · AUTHENTICATED DOMAIN WORKFLOW</span>
   <h2>{snapshot?.asset.name||'Lifecycle & Ownership'}</h2>
   <p>Verified tenant operations · PostgreSQL evidence · Asset ID {assetId}</p>
  </div><button type="button" className="secondary-button" onClick={()=>void reload()} disabled={loading||busy}><RefreshCw size={16}/> Refresh from server</button></div>
  <div className="b21-banner"><LockKeyhole size={18}/><span>No demo data is shown here. Only tenant-verified server records and transaction-confirmed changes are displayed. Ownership and financial evidence are user-entered, not externally certified.</span></div>
  {loading&&!snapshot&&<Card title="Loading authoritative records"><p role="status">Checking server lifecycle and active tenant membership…</p></Card>}
  {error&&<p className="server-error" role="alert">{error} {!snapshot&&<button type="button" onClick={()=>void reload()}>Retry</button>}</p>}
  {success&&!error&&<p className="b21-success" role="status"><CheckCircle2 size={17}/>{success}</p>}
  {snapshot&&<><Summary snapshot={snapshot}/>
   <nav className="b21-tabs" aria-label="Server lifecycle sections">{tabs.map(t=>
    <button type="button" key={t} aria-current={tab===t?'page':undefined} className={tab===t?'selected':''}
     onClick={()=>{setTab(t);setError('');setSuccess('')}}>{readable(t)}</button>)}</nav>
   {tab==='overview'&&<Card title="Lifecycle authority">
    <div className="b21-lifecycle"><strong>{readable(snapshot.asset.lifecycle)}</strong><p>Only allowed transitions are available. A state change requires a reason, active membership and the current asset version.</p></div>
    <Transition key={snapshot.asset.lifecycle} snapshot={snapshot} onCommand={command} busy={busy} canWrite={writable}/>
    {snapshot.asset.lifecycle==='ACQUISITION_PENDING'&&<button type="button" className="secondary-button" onClick={()=>setTab('acquisition')}>Continue acquisition <ArrowRight size={16}/></button>}
    <div className="b21-quick"><button type="button" onClick={()=>setTab('acquisition')}>Acquisition & cost basis</button>
     <button type="button" onClick={()=>setTab('ownership')}>Ownership & transfers</button>
     <button type="button" onClick={()=>setTab('disposition')}>Disposition</button></div>
    {!writable&&<p className="server-note">Your verified tenant role permits reading only; all domain mutations are disabled.</p>}
   </Card>}
   {tab==='acquisition'&&<Card title="Acquisition evidence & exact cost basis"><Acquisition snapshot={snapshot} onCommand={command} busy={busy} canWrite={writable}/></Card>}
   {tab==='ownership'&&<Card title="Ownership assignment, transfer & interest history"><Ownership snapshot={snapshot} onCommand={command} busy={busy} canWrite={writable}/></Card>}
   {tab==='disposition'&&<Card title="Disposition & archival evidence"><DispositionPanel snapshot={snapshot} onCommand={command} busy={busy} canWrite={writable}/></Card>}
   {tab==='history'&&<Card title="Persisted lifecycle & ownership event history"><History snapshot={snapshot}/></Card>}
   <div className="b21-footnote"><Wallet size={16}/><span>All money is user-entered in {snapshot.asset.currency}; no Finance OS ledger posting, verified legal-title transfer, tax computation or external event delivery is performed.</span></div>
  </>}
 </div>
}
