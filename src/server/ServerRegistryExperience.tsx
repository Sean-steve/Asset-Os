import {useEffect,useRef,useState,type FormEvent} from 'react'
import {ArrowLeft,ArrowRight,CheckCircle2,KeyRound,LockKeyhole,Plus,RefreshCw,ShieldAlert} from 'lucide-react'
import {type AuthState,type ServerAsset,type PageResult,ServerError,serverRequest} from './identity'
import './server-registry.css'

type Props={
 path:string;auth:AuthState;signIn:()=>Promise<void>;logout:()=>void;
 selectMembership:(tenant:string)=>Promise<void>;navigate:(path:string)=>void
}
const root='server-registry'
const canWrite=(auth:AuthState)=>auth.membership?.role==='WORKSPACE_OWNER'||auth.membership?.role==='OPERATIONS'
const assetRoute=(id:string)=>root+'/asset/'+encodeURIComponent(id)
const humanError=(e:unknown)=>e instanceof ServerError?
 e.code+': '+e.message:e instanceof Error?e.message:'Server request failed. No browser data was substituted.'
const val=(asset:ServerAsset)=>asset.registryValue===null?'Not recorded':
 asset.registryValue+' '+asset.currency+' (unverified user entry)'
const emptyInput={name:'',description:'',category:'Vehicles',subcategory:'',locationLabel:'',
 registryValue:'',valueAsOf:'',tags:''}
type FormState=typeof emptyInput
const fromAsset=(a:ServerAsset):FormState=>({
 name:a.name,description:a.description,category:a.category,subcategory:a.subcategory,
 locationLabel:a.locationLabel,registryValue:a.registryValue||'',valueAsOf:a.valueAsOf||'',
 tags:a.tags.join(', ')
})
function formBody(f:FormState,editing:boolean){
 const base={
  name:f.name.trim(),description:f.description,category:f.category.trim(),
  subcategory:f.subcategory,locationLabel:f.locationLabel,
  registryValue:f.registryValue===''?null:f.registryValue,valueAsOf:f.valueAsOf||null,
  tags:f.tags.split(',').map(t=>t.trim()).filter(Boolean)
 }
 return editing?base:{...base,currency:'KES'}
}
function RegistryEditor({auth,asset,navigate}:{auth:AuthState;asset:ServerAsset|null;navigate:(path:string)=>void}){
 const editing=Boolean(asset)
 const [form,setForm]=useState<FormState>(asset?fromAsset(asset):emptyInput)
 const [message,setMessage]=useState('')
 const [submitting,setSubmitting]=useState(false)
 const prior=useRef<{body:string;key:string}|null>(null)
 const onChange=(key:keyof FormState,value:string)=>{
  setForm(s=>({...s,[key]:value}));setMessage('')
 }
 async function submit(e:FormEvent){
  e.preventDefault()
  if(!canWrite(auth))return setMessage('Your verified role cannot modify assets.')
  const data=formBody(form,editing)
  if(data.registryValue!==null&&!data.valueAsOf)return setMessage('A valuation date is required when entering a registry value.')
  const serialized=JSON.stringify(data)
  if(prior.current?.body!==serialized)prior.current={body:serialized,key:crypto.randomUUID()}
  setSubmitting(true);setMessage('')
  try{
   const response=await serverRequest<ServerAsset>(auth,editing?'/v1/assets/'+asset!.id:'/v1/assets',{
    method:editing?'PATCH':'POST',
    headers:{'Idempotency-Key':prior.current.key,...(editing?{'If-Match':'"'+asset!.recordVersion+'"'}:{})},
    body:serialized
   })
   prior.current=null
   navigate(assetRoute(response.id))
  }catch(e){setMessage(humanError(e)+(e instanceof ServerError&&e.status===412?' Refresh asset details to resolve the concurrent update.':''))}
  finally{setSubmitting(false)}
 }
 return <div className="server-panel">
  <div className="server-heading"><button type="button" className="secondary-button" onClick={()=>navigate(asset?assetRoute(asset.id):root)}><ArrowLeft size={16}/> Back</button><h2>{editing?'Edit server asset':'Register server asset'}</h2></div>
  <p className="server-note">Authoritative tenant records are stored in PostgreSQL; recorded values are still user-entered estimates. No payment or ownership transfer is performed.</p>
  <form onSubmit={e=>void submit(e)} className="server-form">
   <label>Asset name<input required maxLength={160} value={form.name} onChange={e=>onChange('name',e.target.value)}/></label>
   <label>Category<input required maxLength={120} value={form.category} onChange={e=>onChange('category',e.target.value)}/></label>
   <label>Subcategory<input maxLength={120} value={form.subcategory} onChange={e=>onChange('subcategory',e.target.value)}/></label>
   <label>Location label<input maxLength={160} value={form.locationLabel} onChange={e=>onChange('locationLabel',e.target.value)}/></label>
   <label>Registry value (KES, decimal string)<input inputMode="decimal" pattern="(0|[1-9][0-9]{0,17})(\.[0-9]{1,2})?" value={form.registryValue} onChange={e=>onChange('registryValue',e.target.value)} placeholder="1250000.00"/></label>
   <label>Value effective date<input type="date" value={form.valueAsOf} onChange={e=>onChange('valueAsOf',e.target.value)}/></label>
   <label>Tags (comma-separated)<input value={form.tags} onChange={e=>onChange('tags',e.target.value)}/></label>
   <label className="server-wide">Description<textarea rows={3} maxLength={1200} value={form.description} onChange={e=>onChange('description',e.target.value)}/></label>
   <div className="server-wide server-actions"><span>Currency: {asset?.currency||'KES'} · {editing?'Optimistic version '+asset?.recordVersion:'New asset starts PLANNED'}</span>
    <button className="primary-button" type="submit" disabled={submitting||!canWrite(auth)}>{submitting?'Saving…':editing?'Save versioned changes':'Register asset'} <ArrowRight size={16}/></button></div>
  </form>
  {message&&<p className="server-error" role="alert">{message}</p>}
 </div>
}
function RegistryData({auth,path,navigate}:{auth:AuthState;path:string;navigate:(path:string)=>void}){
 const detail=path.match(/^server-registry\/asset\/([0-9a-f-]{36})(\/edit)?$/i)
 const newRecord=path===root+'/new'
 const [asset,setAsset]=useState<ServerAsset|null>(null)
 const [rows,setRows]=useState<ServerAsset[]>([])
 const [nextCursor,setNextCursor]=useState<string|null>(null)
 const [loaded,setLoaded]=useState(false)
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [currency,setCurrency]=useState('')
 const [lifecycle,setLifecycle]=useState('')
 const reload=useRef(0)
 async function load(cursor:string|null=null){
  setLoading(true);setError('')
  try{
   if(detail){
    const value=await serverRequest<ServerAsset>(auth,'/v1/assets/'+detail[1])
    setAsset(value)
   }else if(!newRecord){
    const q=new URLSearchParams({limit:'20'})
    if(currency)q.set('currency',currency)
    if(lifecycle)q.set('lifecycle',lifecycle)
    if(cursor)q.set('cursor',cursor)
    const value=await serverRequest<PageResult>(auth,'/v1/assets?'+q)
    setRows(current=>cursor?[...current,...value.items]:value.items)
    setNextCursor(value.nextCursor)
   }
   setLoaded(true)
  }catch(e){setError(humanError(e));setLoaded(true)}
  finally{setLoading(false)}
 }
 useEffect(()=>{
  setLoaded(false);setRows([]);setAsset(null);setNextCursor(null)
  if(!newRecord)void load()
  // Intentionally key the data component by authenticated tenant+route.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[path,auth.tenantId,currency,lifecycle,auth.token])
 if(newRecord)return <RegistryEditor auth={auth} asset={null} navigate={navigate}/>
 if(detail){
  if(loading||!loaded)return <p className="server-note" role="status">Loading tenant asset from PostgreSQL…</p>
  if(error)return <div className="server-panel"><p className="server-error" role="alert">{error}</p><button onClick={()=>void load()} className="secondary-button">Retry</button></div>
  if(!asset)return <p className="server-note">No server asset found.</p>
  if(detail[2])return <RegistryEditor key={asset.id+'-'+asset.recordVersion} auth={auth} asset={asset} navigate={navigate}/>
  return <section className="server-panel">
   <div className="server-heading"><button className="secondary-button" onClick={()=>navigate(root)}><ArrowLeft size={16}/> All server assets</button><strong>Version {asset.recordVersion}</strong></div>
   <h2>{asset.name}</h2><div className="server-kpis"><div><small>Asset ID</small><strong>{asset.assetNumber}</strong></div><div><small>Lifecycle</small><strong>{asset.lifecycle}</strong></div><div><small>Registry value</small><strong>{val(asset)}</strong></div></div>
   <dl className="server-detail">
    <dt>Category</dt><dd>{asset.category} · {asset.subcategory||'Unspecified'}</dd>
    <dt>Location</dt><dd>{asset.locationLabel||'Unspecified'}</dd>
    <dt>Effective date</dt><dd>{asset.valueAsOf||'Not entered'}</dd>
    <dt>Tags</dt><dd>{asset.tags.join(', ')||'None'}</dd>
    <dt>Description</dt><dd>{asset.description||'None'}</dd>
    <dt>Server record ID</dt><dd>{asset.id}</dd>
   </dl>
   {canWrite(auth)&&<button className="primary-button" onClick={()=>navigate(assetRoute(asset.id)+'/edit')}>Edit asset <ArrowRight size={16}/></button>}
  </section>
 }
 return <section className="server-panel">
  <div className="server-heading"><div><h2>Server Asset Registry</h2><p>PostgreSQL records · verified tenant <code>{auth.tenantId}</code></p></div>
   {canWrite(auth)&&<button className="primary-button" onClick={()=>navigate(root+'/new')}><Plus size={16}/> Register asset</button>}</div>
  <div className="server-filters">
   <label>Currency<select value={currency} onChange={e=>{setCurrency(e.target.value);reload.current++}}><option value="">All currencies</option><option>KES</option><option>USD</option><option>EUR</option></select></label>
   <label>Lifecycle<select value={lifecycle} onChange={e=>setLifecycle(e.target.value)}><option value="">All statuses</option>{['PLANNED','ACQUISITION_PENDING','ACQUIRED','ACTIVE','SUSPENDED','DISPOSED','ARCHIVED'].map(x=><option key={x}>{x}</option>)}</select></label>
   <button className="secondary-button" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Refresh</button>
  </div>
  {loading&&!loaded&&<p role="status">Loading verified PostgreSQL records…</p>}
  {error&&<p className="server-error" role="alert">{error} <button onClick={()=>void load()}>Retry</button></p>}
  {loaded&&!error&&rows.length===0&&<p className="server-empty">No server assets match this tenant and filter. Browser-local sample records were not imported.</p>}
  {rows.length>0&&<div className="table-scroll"><table className="asset-table"><thead><tr><th>Asset</th><th>Category</th><th>Registry value</th><th>Lifecycle</th><th>Version</th></tr></thead><tbody>
   {rows.map(a=><tr key={a.id}><td><button className="link-button" onClick={()=>navigate(assetRoute(a.id))}>{a.name} <ArrowRight size={14}/></button><small>{a.assetNumber}</small></td><td>{a.category}</td><td>{val(a)}</td><td>{a.lifecycle}</td><td>v{a.recordVersion}</td></tr>)}
  </tbody></table></div>}
  {nextCursor&&!error&&<button type="button" className="secondary-button" disabled={loading} onClick={()=>void load(nextCursor)}>{loading?'Loading…':'Load next page'}</button>}
  <p className="server-note">This listing is exclusively from the protected API. The local Dashboard, Acquisition, Finance and other Phase 1–6 modules remain browser previews until their server APIs exist.</p>
 </section>
}
export function ServerRegistryExperience({path,auth,signIn,logout,selectMembership,navigate}:Props){
 const [tenantDraft,setTenantDraft]=useState(auth.tenantId)
 const [error,setError]=useState('')
 const [verifying,setVerifying]=useState(false)
 async function submitTenant(e:FormEvent){
  e.preventDefault();setError('');setVerifying(true)
  try{await selectMembership(tenantDraft)}
  catch(e){setError(humanError(e))}
  finally{setVerifying(false)}
 }
 return <div className="server-registry">
  <div className="page-intro"><div><span className="eyebrow">B1.1 · TRUSTED SERVER REGISTRY</span><h1>Secure Asset Registry</h1><p>Verified sign-in and server-side tenant authority. Kept separate from the illustrative browser workspace.</p></div>
   <div className="page-actions"><span className={'server-status server-'+auth.phase}>{auth.phase==='signedIn'?'Verified tenant':auth.phase==='disabled'?'Not configured':auth.phase==='loading'?'Checking configuration':auth.phase==='tokenReady'?'Verify membership':'Not signed in'}</span>{auth.token&&<button className="secondary-button" type="button" onClick={logout}>Sign out</button>}</div>
  </div>
  <div className="server-boundary"><LockKeyhole size={20}/><p><strong>Data boundary:</strong> no sample records are sent to the API. Access tokens exist only in memory and expire; reload requires a new OIDC sign-in. No cross-OS schedule, ledger, lifecycle or owner transfer writes are enabled.</p></div>
  {auth.phase==='loading'&&<section className="server-panel"><p role="status">Loading public connection settings…</p></section>}
  {auth.phase==='disabled'&&<section className="server-panel server-intro"><ShieldAlert size={29}/><h2>Production identity is not activated</h2><p>Configure a trusted HTTPS OIDC issuer, browser public client, API endpoint, audience and CORS allowlist. The GitHub Pages preview will not invent a login or tenant.</p><button className="secondary-button" type="button" onClick={()=>navigate('assets')}>Use clearly labeled browser preview <ArrowRight size={16}/></button></section>}
  {auth.phase==='error'&&<section className="server-panel"><p className="server-error" role="alert">{auth.error}</p><button className="secondary-button" onClick={()=>location.reload()}>Restart secure sign-in</button></section>}
  {auth.phase==='signedOut'&&<section className="server-panel server-intro"><KeyRound size={30}/><h2>Connect through your trusted identity provider</h2><p>Authorization Code + PKCE (S256). No password collection in Asset OS. The identity provider must be approved and tenant membership must already exist.</p><button className="primary-button" type="button" onClick={()=>void signIn()}>Sign in securely <ArrowRight size={16}/></button></section>}
  {auth.phase==='tokenReady'&&<section className="server-panel"><h2>Verify your tenant membership</h2><p>Sign-in succeeded. Enter the tenant UUID created by privileged owner enrollment. The backend will verify the active issuer/subject binding and role.</p><form className="server-membership" onSubmit={e=>void submitTenant(e)}><label>Tenant UUID<input aria-label="Tenant UUID" required value={tenantDraft} onChange={e=>setTenantDraft(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/></label><button className="primary-button" disabled={verifying} type="submit">{verifying?'Verifying…':'Verify membership'}</button></form>{(auth.error||error)&&<p className="server-error" role="alert">{error||auth.error}</p>}</section>}
  {auth.phase==='signedIn'&&<><div className="server-member"><CheckCircle2 size={17}/><strong>{auth.membership?.role.replaceAll('_',' ')}</strong><span>Issuer-verified tenant session · expires automatically</span><button onClick={()=>{logout()}}>Change tenant</button></div><RegistryData key={auth.tenantId+'|'+path} path={path} auth={auth} navigate={navigate}/></>}
 </div>
}
