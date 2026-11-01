import {useCallback,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react'
import {ArrowLeft,ArrowRight,CheckCircle2,FileText,Landmark,RefreshCw,ShieldAlert,TrendingUp} from 'lucide-react'
import {type AuthState,type PageResult,type ServerAsset,ServerError,serverRequest} from './identity'
import './server-economics.css'

type Valuation={id:string;effectiveOn:string;amount:string;currency:string;method:string;confidence:string;sourceLabel:string;status:'DRAFT'|'ACCEPTED'|'SUPERSEDED';recordedAt:string;acceptedAt:string|null}
type Facility={id:string;financierLabel:string;originalPrincipal:string;currency:string;interestRatePct:string;startedOn:string;maturesOn:string|null;frequency:string;reference:string;latestOutstanding:string|null;balanceObservedOn:string|null}
type Balance={id:string;observedOn:string;outstanding:string;sourceLabel:string;recordedAt:string}
type Flow={id:string;kind:string;category:string;amount:string;currency:string;occurredOn:string;counterpartyLabel:string;sourceAuthority:string;recordedAt:string}
type Reference={id:string;flowId:string;system:string;externalReference:string;note:string;verified:false;ledgerPosted:false}
type Page<T>={items:T[];nextCursor:string|null;limit:number}
type Economics={
 assetId:string;currency:string;lifecycle:string;recordVersion:number;
 selectedValue:string|null;valueSource:string;acceptedValuation:Valuation|null;originalCostBasis:string|null;
 financing:{facilityCount:number;missingBalanceCount:number;debtBalance:string|null;sourceAuthority:string;asOf:string|null};
 indicativeEquity:string|null;
 observedCashFlow:{totals:Record<string,string>;operatingNet:string;includesFinancingInNet:false;sourceAuthority:string};
 indicativeValueChange:string|null;indicativeChangePercent:string|null;interpretation:string
}
type Snapshot={asset:ServerAsset;economics:Economics;valuations:Page<Valuation>;financing:{items:Facility[]};flows:Page<Flow>;references:{items:Reference[]}}
type Props={auth:AuthState;path:string;navigate:(route:string)=>void}
const itemRoute=(id:string)=>'server-registry/asset/'+id+'/economics'
const routeId=/^server-registry\/asset\/([0-9a-f-]{36})\/economics$/i
const canWrite=(auth:AuthState)=>['WORKSPACE_OWNER','OPERATIONS'].includes(auth.membership?.role||'')
const writableLifecycle=(lifecycle:string)=>['ACQUIRED','ACTIVE','SUSPENDED'].includes(lifecycle)
const today=()=>new Date().toISOString().slice(0,10)
const errorText=(error:unknown)=>error instanceof ServerError?error.code+': '+error.message:error instanceof Error?error.message:'Unexpected server error'
const money=(amount:string|null,currency:string)=>amount===null?'Unknown':currency+' '+amount.split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+(amount.split('.')[1]||'00').padEnd(2,'0')
const formValue=(data:FormData,name:string)=>String(data.get(name)||'').trim()
const moneyField=(name:string,label:string)=><label key={name}>{label}<input name={name} aria-label={label} type="text" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" placeholder="0.00" required/></label>
const dateField=(name:string,label:string)=><label key={name}>{label}<input name={name} aria-label={label} type="date" max={today()} defaultValue={today()} required/></label>
function Panel({title,children}:{title:string;children:ReactNode}){
 return <section className="server-panel"><h2>{title}</h2>{children}</section>
}
function AssetSelection({auth,navigate}:{auth:AuthState;navigate:(route:string)=>void}){
 const [rows,setRows]=useState<ServerAsset[]>([])
 const [cursor,setCursor]=useState<string|null>(null)
 const [busy,setBusy]=useState(true)
 const [error,setError]=useState('')
 const load=useCallback(async(next:string|null)=>{
  setBusy(true);setError('')
  try{
   const params=new URLSearchParams({limit:'20'})
   if(next)params.set('cursor',next)
   const response=await serverRequest<PageResult>(auth,'/v1/assets?'+params.toString())
   if(response.items.some(asset=>asset.tenantId!==auth.tenantId))throw Error('Tenant asset response did not match verified tenant.')
   setRows(previous=>next?[...previous,...response.items]:response.items)
   setCursor(response.nextCursor)
  }catch(e){setError(errorText(e));if(!next){setRows([]);setCursor(null)}}
  finally{setBusy(false)}
 },[auth])
 useEffect(()=>{void load(null)},[load])
 return <div className="server-economics">
  <div className="page-intro"><div><span className="eyebrow">B3.1 · VERIFIED TENANT</span><h1>Secure Economics</h1><p>Select a PostgreSQL asset to review financial observations, valuations and financing without importing browser preview data.</p></div></div>
  <div className="server-boundary"><ShieldAlert size={19}/><p><strong>Unverified evidence:</strong> valuations and balances are user-entered, not appraisals, bank confirmations or Finance OS postings.</p></div>
  <Panel title="Authenticated assets">
   <div className="server-heading"><span className="server-note">Only verified tenant assets appear below.</span><button type="button" className="secondary-button" onClick={()=>void load(null)} disabled={busy}><RefreshCw size={16}/> Refresh</button></div>
   {error&&<p className="server-error" role="alert">{error}</p>}
   {busy&&!rows.length&&<p role="status">Loading authenticated assets…</p>}
   {!busy&&!error&&!rows.length&&<p className="server-empty">No PostgreSQL assets have been registered in this tenant.</p>}
   {!!rows.length&&<div className="table-scroll"><table className="asset-table"><thead><tr><th>Asset</th><th>Lifecycle</th><th>Currency</th><th>Open</th></tr></thead><tbody>{rows.map(asset=><tr key={asset.id}>
    <td><strong>{asset.name}</strong><small>{asset.assetNumber}</small></td><td>{asset.lifecycle}</td><td>{asset.currency}</td><td><button type="button" className="link-button" onClick={()=>navigate(itemRoute(asset.id))}>View economics <ArrowRight size={15}/></button></td>
   </tr>)}</tbody></table></div>}
   {cursor&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void load(cursor)}>Load more server assets</button>}
  </Panel>
 </div>
}
function AssetEconomics({auth,id,navigate}:{auth:AuthState;id:string;navigate:(route:string)=>void}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null)
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const [valuationCursor,setValuationCursor]=useState<string|null>(null)
 const [flowCursor,setFlowCursor]=useState<string|null>(null)
 const [moreBusy,setMoreBusy]=useState(false)
 const [balanceFacility,setBalanceFacility]=useState<string>('')
 const [balances,setBalances]=useState<Balance[]>([])
 const [balanceCursor,setBalanceCursor]=useState<string|null>(null)
 const [balanceBusy,setBalanceBusy]=useState(false)
 const pending=useRef<{signature:string;key:string}|null>(null)
 const reload=useCallback(async()=>{
  setLoading(true);setError('');setSnapshot(null)
  try{
   const base='/v1/assets/'+id
   const [asset,economics,valuations,financing,flows,references]=await Promise.all([
    serverRequest<ServerAsset>(auth,base),
    serverRequest<Economics>(auth,base+'/economics'),
    serverRequest<Page<Valuation>>(auth,base+'/valuations?limit=20'),
    serverRequest<{items:Facility[]}>(auth,base+'/financing'),
    serverRequest<Page<Flow>>(auth,base+'/cash-flows?limit=20'),
    serverRequest<{items:Reference[]}>(auth,base+'/reconciliation-references')
   ])
   if(asset.id!==id||asset.tenantId!==auth.tenantId||economics.assetId!==id||economics.currency!==asset.currency)
    throw Error('Asset or currency mismatch in the authenticated financial response.')
   if(economics.recordVersion!==asset.recordVersion)
    throw Error('Financial evidence changed during loading. Refresh to read one asset version.')
   setSnapshot({asset,economics,valuations,financing,flows,references})
   setValuationCursor(valuations.nextCursor);setFlowCursor(flows.nextCursor)
   setBalanceFacility('');setBalances([]);setBalanceCursor(null)
  }catch(e){setError(errorText(e))}
  finally{setLoading(false)}
 },[auth,id])
 useEffect(()=>{void reload()},[reload])
 const submit=async(route:string,data:Record<string,unknown>)=>{
  if(!canWrite(auth)||!snapshot||!writableLifecycle(snapshot.asset.lifecycle))return false
  const signature=JSON.stringify({route,data,version:snapshot.asset.recordVersion})
  if(pending.current?.signature!==signature)pending.current={signature,key:crypto.randomUUID()}
  setBusy(true);setError('');setSuccess('')
  try{
   await serverRequest(auth,'/v1/assets/'+id+route,{method:'POST',headers:{
    'If-Match':'"'+snapshot.asset.recordVersion+'"','Idempotency-Key':pending.current.key
   },body:JSON.stringify(data)})
   pending.current=null
   setSuccess('Saved to the verified tenant database. Refreshing authoritative evidence.')
   await reload()
   return true
  }catch(e){
   setError(errorText(e)+(e instanceof ServerError&&e.status===412?' Refresh the asset before retrying.':''))
   return false
  }finally{setBusy(false)}
 }
 const submitForm=(event:FormEvent<HTMLFormElement>,route:string,payload:(f:FormData)=>Record<string,unknown>)=>{
  event.preventDefault()
  const form=event.currentTarget
  void submit(route,payload(new FormData(form))).then(ok=>{if(ok)form.reset()})
 }
 const more=async(kind:'valuations'|'cash-flows')=>{
  const cursor=kind==='valuations'?valuationCursor:flowCursor
  if(!cursor||!snapshot)return
  setMoreBusy(true);setError('')
  try{
   const page=await serverRequest<Page<Valuation>|Page<Flow>>(auth,'/v1/assets/'+id+'/'+kind+'?limit=20&cursor='+encodeURIComponent(cursor))
   setSnapshot(previous=>previous?kind==='valuations'?{...previous,valuations:{...previous.valuations,items:[...previous.valuations.items,...(page.items as Valuation[])]}}:
    {...previous,flows:{...previous.flows,items:[...previous.flows.items,...(page.items as Flow[])]}}:previous)
   if(kind==='valuations')setValuationCursor(page.nextCursor)
   else setFlowCursor(page.nextCursor)
  }catch(e){setError(errorText(e))}
  finally{setMoreBusy(false)}
 }
 const loadBalances=async(facilityId:string,next:string|null)=>{
  setBalanceBusy(true);setError('')
  if(!next){setBalanceFacility(facilityId);setBalances([]);setBalanceCursor(null)}
  try{
   const page=await serverRequest<Page<Balance>>(auth,'/v1/assets/'+id+'/financing/'+facilityId+'/balances?limit=20'+(next?'&cursor='+encodeURIComponent(next):''))
   setBalances(prev=>next?[...prev,...page.items]:page.items)
   setBalanceCursor(page.nextCursor)
  }catch(e){setError(errorText(e))}
  finally{setBalanceBusy(false)}
 }
 if(loading&&!snapshot)return <div className="server-economics"><p role="status">Loading verified asset economics from PostgreSQL…</p>{error&&<p className="server-error">{error}</p>}</div>
 if(!snapshot)return <div className="server-economics"><div className="server-heading"><button className="secondary-button" onClick={()=>navigate('server-registry/economics')}><ArrowLeft size={16}/> Secure Economics</button><button className="secondary-button" onClick={()=>void reload()}>Retry</button></div><p className="server-error" role="alert">{error||'Asset evidence could not be loaded.'}</p></div>
 const {asset,economics:summary,valuations,financing,flows,references}=snapshot
 const authorized=canWrite(auth)&&writableLifecycle(asset.lifecycle)
 const draft=valuations.items.filter(v=>v.status==='DRAFT')
 const recordNote='All values shown are tenant-scoped user-entered observations. No bank feed, external appraisal, posting, FX conversion, payment or tax calculation is connected.'
 return <div className="server-economics">
  <div className="server-heading"><button type="button" className="secondary-button" onClick={()=>navigate('server-registry/economics')}><ArrowLeft size={16}/> Secure Economics</button>
   <button type="button" className="secondary-button" disabled={busy||loading} onClick={()=>void reload()}><RefreshCw size={16}/> Refresh version {asset.recordVersion}</button></div>
  <div className="page-intro"><div><span className="eyebrow">B3.1 · POSTGRESQL FINANCIAL EVIDENCE</span><h1>{asset.name}</h1><p>{asset.assetNumber} · {asset.lifecycle} · {asset.currency} · Tenant-verified records</p></div></div>
  <div className="server-boundary"><ShieldAlert size={19}/><p><strong>Evidence, not a verified financial statement.</strong> {recordNote} <strong>Signed tenant:</strong> {auth.membership?.role.replaceAll('_',' ')}.</p></div>
  {error&&<p className="server-error" role="alert">{error} <button type="button" onClick={()=>void reload()}>Reload authoritative evidence</button></p>}
  {success&&<p className="server-success" role="status"><CheckCircle2 size={16}/>{success}</p>}
  <section className="server-econ-kpis" aria-label="Asset economics">
   <div><small>Selected asset value</small><strong>{money(summary.selectedValue,asset.currency)}</strong><span>{summary.valueSource.replaceAll('_',' ').toLowerCase()}</span></div>
   <div><small>Indicative equity</small><strong>{money(summary.indicativeEquity,asset.currency)}</strong><span>{summary.financing.missingBalanceCount?summary.financing.missingBalanceCount+' facility balances missing':'Not verified against lenders'}</span></div>
   <div><small>Recorded outstanding debt</small><strong>{money(summary.financing.debtBalance,asset.currency)}</strong><span>{summary.financing.facilityCount} recorded facilities · oldest balance {summary.financing.asOf||'unknown'}</span></div>
   <div><small>Observed operating net</small><strong>{money(summary.observedCashFlow.operatingNet,asset.currency)}</strong><span>User-entered inflows less expenses &amp; CAPEX, excluding financing</span></div>
   <div><small>Recorded original cost basis</small><strong>{money(summary.originalCostBasis,asset.currency)}</strong><span>Acquisition components, not confirmed payments</span></div>
   <div><small>Indicative value change</small><strong>{money(summary.indicativeValueChange,asset.currency)}</strong><span>{summary.indicativeChangePercent===null?'Percentage unavailable':summary.indicativeChangePercent+'%'} · not annualized ROI</span></div>
  </section>
  <Panel title="Valuation history">
   <p className="server-note">Only an internally accepted valuation takes precedence over the unverified registry entry. Drafts and superseded records remain visible.</p>
   {!valuations.items.length?<p className="server-empty">No valuations recorded in PostgreSQL.</p>:
   <div className="table-scroll"><table className="asset-table"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Source / confidence</th><th>Status</th></tr></thead><tbody>{valuations.items.map(v=><tr key={v.id}>
    <td>{v.effectiveOn}</td><td>{money(v.amount,asset.currency)}</td><td>{v.method.replaceAll('_',' ')}</td><td>{v.sourceLabel}<small>{v.confidence}</small></td><td><span className={'server-econ-badge '+(v.status==='ACCEPTED'?'accepted':'')}>{v.status}</span></td>
   </tr>)}</tbody></table></div>}
   {valuationCursor&&<button className="secondary-button" disabled={moreBusy} onClick={()=>void more('valuations')}>Load earlier valuations</button>}
  </Panel>
  <Panel title="Financing and debt observations">
   <p className="server-note">Missing balances stay UNKNOWN, never zero. Original principal is not automatically the current outstanding debt.</p>
   {!financing.items.length?<p className="server-empty">No financing facilities have been recorded.</p>:
   <div className="table-scroll"><table className="asset-table"><thead><tr><th>Lender label</th><th>Original principal</th><th>Rate / cadence</th><th>Current observed debt</th><th>History</th></tr></thead><tbody>{financing.items.map(f=><tr key={f.id}>
    <td>{f.financierLabel}<small>{f.startedOn} → {f.maturesOn||'unspecified'}</small></td><td>{money(f.originalPrincipal,asset.currency)}</td><td>{f.interestRatePct}% · {f.frequency}</td><td>{money(f.latestOutstanding,asset.currency)}<small>{f.balanceObservedOn||'No balance observation'}</small></td>
    <td><button className="link-button" type="button" disabled={balanceBusy} onClick={()=>void loadBalances(f.id,null)}>Balance history <ArrowRight size={15}/></button></td>
   </tr>)}</tbody></table></div>}
   {balanceFacility&&<div className="server-econ-subhistory"><h3>Recorded balance history</h3>{balanceBusy&&!balances.length?<p role="status">Loading balance history…</p>:!balances.length?<p>No observations found for this facility.</p>:
    <div className="table-scroll"><table className="asset-table"><thead><tr><th>As of</th><th>Amount</th><th>Source label</th></tr></thead><tbody>{balances.map(b=><tr key={b.id}><td>{b.observedOn}</td><td>{money(b.outstanding,asset.currency)}</td><td>{b.sourceLabel}</td></tr>)}</tbody></table></div>}
    {balanceCursor&&<button className="secondary-button" disabled={balanceBusy} onClick={()=>void loadBalances(balanceFacility,balanceCursor)}>Load earlier balances</button>}
   </div>}
  </Panel>
  <Panel title="Manual cash-flow observations">
   <p className="server-note">Recorded income {money(summary.observedCashFlow.totals.INCOME||'0.00',asset.currency)} · expenses {money(summary.observedCashFlow.totals.EXPENSE||'0.00',asset.currency)} · capital expenditure {money(summary.observedCashFlow.totals.CAPEX||'0.00',asset.currency)}. Financing cash flows are not operating results.</p>
   {!flows.items.length?<p className="server-empty">No manual cash-flow observations have been recorded.</p>:
   <div className="table-scroll"><table className="asset-table"><thead><tr><th>Date</th><th>Kind</th><th>Category</th><th>Amount</th><th>Origin</th></tr></thead><tbody>{flows.items.map(f=><tr key={f.id}><td>{f.occurredOn}</td><td>{f.kind.replaceAll('_',' ')}</td><td>{f.category}</td><td>{money(f.amount,asset.currency)}</td><td>{f.sourceAuthority.replaceAll('_',' ')}</td></tr>)}</tbody></table></div>}
   {flowCursor&&<button className="secondary-button" disabled={moreBusy} onClick={()=>void more('cash-flows')}>Load earlier cash flows</button>}
  </Panel>
  <Panel title="Unverified reconciliation references">
   <p className="server-note">Reference labels are not transactions, reconciliations or ledger postings.</p>
   {!references.items.length?<p className="server-empty">No manual reference labels recorded.</p>:
   <div className="table-scroll"><table className="asset-table"><thead><tr><th>System</th><th>Reference</th><th>Flow identifier</th><th>Verification</th></tr></thead><tbody>{references.items.map(r=><tr key={r.id}><td>{r.system}</td><td>{r.externalReference}</td><td>{r.flowId.slice(0,8)}…</td><td>Unverified · not posted</td></tr>)}</tbody></table></div>}
  </Panel>
  {authorized&&<section className="server-econ-commands" aria-label="Versioned economics commands">
   <Panel title="Record draft valuation">
    <form key={'valuation-'+asset.recordVersion} className="server-econ-form" onSubmit={e=>submitForm(e,'/valuations',f=>({
     effectiveOn:formValue(f,'effectiveOn'),amount:formValue(f,'amount'),method:formValue(f,'method'),confidence:formValue(f,'confidence'),sourceLabel:formValue(f,'sourceLabel'),notes:formValue(f,'notes')
    }))}>
     {dateField('effectiveOn','Valuation effective date')}{moneyField('amount','Valuation amount')}
     <label>Method<select name="method" aria-label="Valuation method">{['MANUAL_ESTIMATE','MARKET_COMPARABLES','INCOME_APPROACH','COST_APPROACH','BROKER_STATEMENT','APPRAISAL'].map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label>
     <label>Confidence<select name="confidence" aria-label="Valuation confidence"><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></label>
     <label>Source description<input name="sourceLabel" aria-label="Valuation source description" maxLength={160} required/></label>
     <label>Notes<textarea name="notes" aria-label="Valuation notes" maxLength={800}/></label>
     <button type="submit" className="primary-button" disabled={busy}>Record valuation draft</button>
    </form>
   </Panel>
   <Panel title="Accept internal valuation">
    <p className="server-note">Internal acceptance does not constitute independent appraisal. It supersedes the existing accepted record only when its effective date is not earlier.</p>
    {!draft.length?<p>No draft valuation in the loaded history. Load earlier valuations if necessary.</p>:
    <form key={'accept-'+asset.recordVersion} className="server-econ-form" onSubmit={e=>{const data=new FormData(e.currentTarget);submitForm(e,'/valuations/'+formValue(data,'valuationId')+'/accept',f=>({note:formValue(f,'note'),confirm:'ACCEPT_VALUATION'}))}}>
     <label>Draft valuation<select name="valuationId" aria-label="Draft valuation" required>{draft.map(v=><option key={v.id} value={v.id}>{v.effectiveOn} · {money(v.amount,asset.currency)} · {v.method}</option>)}</select></label>
     <label>Reviewer note<input name="note" aria-label="Valuation reviewer note" minLength={1} maxLength={400} required/></label>
     <button type="submit" className="primary-button" disabled={busy}>Accept internal valuation</button>
    </form>}
   </Panel>
   <Panel title="Record financing facility">
    <form key={'facility-'+asset.recordVersion} className="server-econ-form" onSubmit={e=>submitForm(e,'/financing',f=>({
     financierLabel:formValue(f,'financierLabel'),originalPrincipal:formValue(f,'originalPrincipal'),interestRatePct:formValue(f,'interestRatePct'),
     startedOn:formValue(f,'startedOn'),maturesOn:formValue(f,'maturesOn')||null,frequency:formValue(f,'frequency'),reference:formValue(f,'reference'),notes:formValue(f,'notes')
    }))}>
     <label>Lender display label<input name="financierLabel" aria-label="Lender display label" maxLength={160} required/></label>
     {moneyField('originalPrincipal','Original principal')}
     <label>Annual interest rate (%)<input name="interestRatePct" aria-label="Annual interest rate (%)" type="text" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,4})?" maxLength={9} placeholder="0.0000" required/></label>
     {dateField('startedOn','Facility start date')}
     <label>Maturity date (optional)<input name="maturesOn" aria-label="Maturity date (optional)" type="date"/></label>
     <label>Payment frequency<select name="frequency" aria-label="Payment frequency"><option>MONTHLY</option><option>QUARTERLY</option><option>ANNUALLY</option><option>OTHER</option></select></label>
     <label>Reference label<input name="reference" aria-label="Facility reference label" maxLength={140}/></label>
     <label>Notes<textarea name="notes" aria-label="Facility notes" maxLength={800}/></label>
     <button type="submit" className="primary-button" disabled={busy}>Record financing facility</button>
    </form>
   </Panel>
   <Panel title="Observe outstanding balance">
    {!financing.items.length?<p>Record a financing facility first.</p>:
    <form key={'balance-'+asset.recordVersion} className="server-econ-form" onSubmit={e=>{const data=new FormData(e.currentTarget);submitForm(e,'/financing/'+formValue(data,'facilityId')+'/balances',f=>({
     observedOn:formValue(f,'observedOn'),outstanding:formValue(f,'outstanding'),sourceLabel:formValue(f,'sourceLabel'),notes:formValue(f,'notes')
    }))}}>
     <label>Facility<select name="facilityId" aria-label="Financing facility">{financing.items.map(f=><option key={f.id} value={f.id}>{f.financierLabel} · {f.startedOn}</option>)}</select></label>
     {dateField('observedOn','Balance observation date')}{moneyField('outstanding','Observed outstanding balance')}
     <label>Balance source description<input name="sourceLabel" aria-label="Balance source description" maxLength={160} required/></label>
     <label>Notes<textarea name="notes" aria-label="Balance notes" maxLength={800}/></label>
     <button type="submit" className="primary-button" disabled={busy}>Record balance observation</button>
    </form>}
   </Panel>
   <Panel title="Record manual cash flow">
    <form key={'cash-'+asset.recordVersion} className="server-econ-form" onSubmit={e=>submitForm(e,'/cash-flows',f=>({
     kind:formValue(f,'kind'),category:formValue(f,'category'),amount:formValue(f,'amount'),occurredOn:formValue(f,'occurredOn'),
     counterpartyLabel:formValue(f,'counterpartyLabel'),notes:formValue(f,'notes')
    }))}>
     <label>Cash-flow kind<select name="kind" aria-label="Cash-flow kind">{['INCOME','EXPENSE','CAPEX','FINANCING_INFLOW','FINANCING_OUTFLOW'].map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label>
     <label>Category<input name="category" aria-label="Cash-flow category" maxLength={120} required/></label>
     {moneyField('amount','Cash-flow amount')}{dateField('occurredOn','Cash-flow effective date')}
     <label>Counterparty label<input name="counterpartyLabel" aria-label="Counterparty label" maxLength={160}/></label>
     <label>Notes<textarea name="notes" aria-label="Cash-flow notes" maxLength={800}/></label>
     <button type="submit" className="primary-button" disabled={busy}>Record cash-flow observation</button>
    </form>
   </Panel>
   <Panel title="Attach unverified external reference">
    {!flows.items.length?<p>Record a manual cash flow before adding a reference label.</p>:
    <form key={'reference-'+asset.recordVersion} className="server-econ-form" onSubmit={e=>submitForm(e,'/reconciliation-references',f=>({
     flowId:formValue(f,'flowId'),system:formValue(f,'system'),externalReference:formValue(f,'externalReference'),note:formValue(f,'note')
    }))}>
     <label>Cash-flow observation<select name="flowId" aria-label="Cash-flow observation">{flows.items.map(f=><option key={f.id} value={f.id}>{f.occurredOn} · {f.kind} · {money(f.amount,asset.currency)}</option>)}</select></label>
     <label>Reference system<select name="system" aria-label="Reference system"><option>FINANCE_OS</option><option>BANK</option><option>OTHER</option></select></label>
     <label>External reference label<input name="externalReference" aria-label="External reference label" maxLength={180} required/></label>
     <label>Note<textarea name="note" aria-label="Reference note" maxLength={600}/></label>
     <button type="submit" className="primary-button" disabled={busy}>Record unverified reference</button>
    </form>}
   </Panel>
  </section>}
  {!canWrite(auth)&&<div className="server-boundary"><ShieldAlert size={18}/><p>Your verified tenant role is read-only. All financial mutation controls are withheld.</p></div>}
  {canWrite(auth)&&!writableLifecycle(asset.lifecycle)&&<div className="server-boundary"><ShieldAlert size={18}/><p>This asset is {asset.lifecycle}. Economic changes require ACQUIRED, ACTIVE or SUSPENDED; historical evidence remains readable.</p></div>}
  <div className="server-econ-foot"><button type="button" className="secondary-button" onClick={()=>navigate('server-registry/asset/'+id+'/lifecycle')}><Landmark size={16}/> Lifecycle &amp; acquisition</button><button type="button" className="secondary-button" onClick={()=>navigate('server-registry/asset/'+id)}><FileText size={16}/> Verified asset details</button><span><TrendingUp size={16}/> Server-derived financial indicators only</span></div>
 </div>
}
export function ServerEconomicsExperience({auth,path,navigate}:Props){
 const match=path.match(routeId)
 return match?<AssetEconomics key={auth.tenantId+'|'+match[1]} auth={auth} id={match[1]} navigate={navigate}/>:<AssetSelection auth={auth} navigate={navigate}/>
}
