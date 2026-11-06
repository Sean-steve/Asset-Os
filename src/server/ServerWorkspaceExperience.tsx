import {useCallback,useEffect,useState} from 'react'
import {ArrowRight,Layers3,ShieldCheck,Landmark,Wrench,RefreshCw,LockKeyhole} from 'lucide-react'
import {type AuthState,type PageResult,type ServerAsset,ServerError,serverRequest} from './identity'

const route=(id:string,area:string)=>'server-registry/asset/'+id+(area?'/'+area:'')
export function ServerWorkspaceExperience({auth,navigate}:{auth:AuthState;navigate:(route:string)=>void}){
 const [assets,setAssets]=useState<ServerAsset[]>([])
 const [cursor,setCursor]=useState<string|null>(null)
 const [busy,setBusy]=useState(true)
 const [error,setError]=useState('')
 const load=useCallback(async(next:string|null)=>{
  setBusy(true);setError('')
  try{
   const q=new URLSearchParams({limit:'25'})
   if(next)q.set('cursor',next)
   const page=await serverRequest<PageResult>(auth,'/v1/assets?'+q)
   if(page.items.some(a=>a.tenantId!==auth.tenantId))throw Error('Tenant mismatch: server data withheld.')
   setAssets(prev=>next?[...prev,...page.items]:page.items)
   setCursor(page.nextCursor)
  }catch(e){
   setError(e instanceof ServerError?e.code+': '+e.message:e instanceof Error?e.message:'Request failed.')
   if(!next){setAssets([]);setCursor(null)}
  }finally{setBusy(false)}
 },[auth])
 useEffect(()=>{void load(null)},[load])
 return <section className="server-workspace">
  <div className="page-intro"><div><span className="eyebrow">B4.4 · AUTHENTICATED ASSET WORKSPACE</span>
   <h1>Connected Asset Workspace</h1>
   <p>Registry, ownership, financial evidence and operations sharing one authenticated PostgreSQL asset identity.</p></div></div>
  <div className="server-boundary"><LockKeyhole size={20}/><p><strong>Authoritative workspace:</strong> every asset below comes from the verified tenant API. Browser-preview records are not synchronized. Portfolio and Kernel modules remain previews until their backend phases.</p></div>
  <div className="server-panel">
   <div className="server-heading"><div><h2>Tenant records</h2><p>Role: {auth.membership?.role.replaceAll('_',' ')} · source: PostgreSQL</p></div>
    <button type="button" className="secondary-button" disabled={busy} onClick={()=>void load(null)}><RefreshCw size={16}/> Refresh</button>
   </div>
   {busy&&!assets.length&&<p role="status">Loading tenant assets…</p>}
   {error&&<p role="alert" className="server-error">{error}</p>}
   {!busy&&!error&&!assets.length&&<p className="server-empty">No registered tenant assets yet. Use Secure Registry to create your first real asset.</p>}
   <p><button type="button" className="primary-button" onClick={()=>navigate('server-registry')}>Open Secure Registry <ArrowRight size={16}/></button></p>
   {!!assets.length&&<div className="table-scroll"><table className="asset-table">
    <thead><tr><th>Asset</th><th>Lifecycle</th><th>Registry</th><th>Ownership</th><th>Economics</th><th>Operations</th></tr></thead>
    <tbody>{assets.map(a=><tr key={a.id}>
     <td><strong>{a.name}</strong><small style={{display:'block'}}>{a.assetNumber} · {a.currency} · v{a.recordVersion}</small></td>
     <td>{a.lifecycle.replaceAll('_',' ')}</td>
     <td><button className="link-button" onClick={()=>navigate(route(a.id,''))}><Layers3 size={15}/> Asset</button></td>
     <td><button className="link-button" onClick={()=>navigate(route(a.id,'lifecycle'))}><ShieldCheck size={15}/> Lifecycle</button></td>
     <td><button className="link-button" onClick={()=>navigate(route(a.id,'economics'))}><Landmark size={15}/> Economics</button></td>
     <td><button className="link-button" onClick={()=>navigate(route(a.id,'operations'))}><Wrench size={15}/> Operations</button></td>
    </tr>)}</tbody>
   </table></div>}
   {cursor&&<button className="secondary-button" type="button" disabled={busy} onClick={()=>void load(cursor)}>Load more server assets</button>}
  </div>
  <p className="server-note">Real asset records persist across browser sessions. Access tokens are kept in memory and must be reissued on browser reload.</p>
 </section>
}
