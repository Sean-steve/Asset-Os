import {useCallback,useEffect,useState} from 'react'

export type RuntimeConfig={
 apiBaseUrl:string;issuer:string;authorizationEndpoint:string;tokenEndpoint:string;
 clientId:string;audience:string
}
export type ServerAsset={
 id:string;tenantId:string;assetNumber:string;name:string;description:string;
 category:string;subcategory:string;currency:string;registryValue:string|null;
 valueAsOf:string|null;tags:string[];lifecycle:string;recordVersion:number;
 locationLabel:string;createdAt:string;updatedAt:string
}
export type Membership={tenantId:string;identityId:string;role:string;issuer:string;authenticated:true}
export type PageResult={items:ServerAsset[];nextCursor:string|null;limit:number}
export class ServerError extends Error{
 constructor(public readonly status:number,public readonly code:string,message:string){super(message)}
}
const STORE_PENDING='asset-os:oidc-pkce:v1'
const STORE_TENANT='asset-os:tenant-selection:v1'
const ORIGIN=()=>window.location.origin
const path=()=>window.location.origin+import.meta.env.BASE_URL
const browserReturn=()=>path()
const isLoopback=(hostname:string)=>['localhost','127.0.0.1'].includes(hostname)
export function validateRuntimeConfig(value:unknown,siteOrigin:string):RuntimeConfig|null{
 if(!value||typeof value!=='object')throw Error('Asset OS identity configuration is invalid.')
 const v=value as Record<string,unknown>
 const fields=['apiBaseUrl','issuer','authorizationEndpoint','tokenEndpoint','clientId','audience'] as const
 if(fields.every(f=>!v[f]))return null
 if(fields.some(f=>typeof v[f]!=='string'||!(v[f] as string).trim()))
  throw Error('Incomplete OIDC/API configuration: all six public settings are required.')
 const c=Object.fromEntries(fields.map(f=>[f,(v[f] as string).trim()])) as RuntimeConfig
 const base=new URL(c.apiBaseUrl),issuer=new URL(c.issuer),authorize=new URL(c.authorizationEndpoint),token=new URL(c.tokenEndpoint)
 const devSite=isLoopback(new URL(siteOrigin).hostname)
 for(const u of [base,issuer,authorize,token]){
  if(u.username||u.password||u.hash)throw Error('Identity endpoints may not contain URL credentials.')
  if(u.protocol!=='https:'&&!(devSite&&isLoopback(u.hostname)&&u.protocol==='http:'))
   throw Error('OIDC and API endpoints must use HTTPS (localhost development exception only).')
 }
 if(base.pathname!=='/'||base.search)throw Error('API URL must be an origin, without path or query.')
 if(authorize.origin!==issuer.origin||token.origin!==issuer.origin)
  throw Error('Authorization and token endpoints must share the exact issuer origin.')
 if(c.clientId.length>150||c.audience.length>200)throw Error('Invalid OIDC public client settings.')
 if(!c.clientId||!c.audience)throw Error('OIDC client and audience are required.')
 return c
}
export async function loadRuntimeConfig(fetcher:typeof fetch=fetch):Promise<RuntimeConfig|null>{
 const response=await fetcher(import.meta.env.BASE_URL+'asset-runtime.json',{cache:'no-store'})
 if(!response.ok)throw Error('The public connection configuration could not be loaded.')
 return validateRuntimeConfig(await response.json(),ORIGIN())
}
export function base64url(input:Uint8Array):string{
 let binary=''
 for(const b of input)binary+=String.fromCharCode(b)
 return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')
}
export async function pkceChallenge(verifier:string):Promise<string>{
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))
 return base64url(new Uint8Array(digest))
}
export function beginAuthorization(config:RuntimeConfig){
 const verifier=base64url(crypto.getRandomValues(new Uint8Array(32)))
 const state=base64url(crypto.getRandomValues(new Uint8Array(32)))
 const nonce=base64url(crypto.getRandomValues(new Uint8Array(32)))
 const url=new URL(config.authorizationEndpoint)
 url.searchParams.set('response_type','code')
 url.searchParams.set('client_id',config.clientId)
 url.searchParams.set('redirect_uri',browserReturn())
 url.searchParams.set('scope','openid')
 url.searchParams.set('audience',config.audience)
 url.searchParams.set('code_challenge_method','S256')
 url.searchParams.set('state',state)
 url.searchParams.set('nonce',nonce)
 sessionStorage.setItem(STORE_PENDING,JSON.stringify({verifier,state,created:Date.now()}))
 return {url,verifier}
}
export type AuthPhase='loading'|'disabled'|'signedOut'|'tokenReady'|'signedIn'|'error'
export type AuthState={
 phase:AuthPhase;config:RuntimeConfig|null;token:string|null;
 expiresAt:number;tenantId:string;membership:Membership|null;error:string
}
const empty:AuthState={phase:'loading',config:null,token:null,expiresAt:0,tenantId:'',membership:null,error:''}
async function api<T>(config:RuntimeConfig,token:string,tenantId:string,endpoint:string,options:RequestInit={}):Promise<T>{
 if(!/^\/v1\/[a-zA-Z0-9/?&=_+%-]+$/.test(endpoint))throw Error('Invalid API endpoint.')
 const headers=new Headers(options.headers)
 headers.set('Authorization','Bearer '+token)
 headers.set('X-Tenant-Id',tenantId)
 if(options.body)headers.set('Content-Type','application/json')
 const response=await fetch(config.apiBaseUrl+endpoint,{
  ...options,headers,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store',mode:'cors'
 })
 if(!response.ok){
  const body=await response.json().catch(()=>null) as {error?:{code?:string;message?:string}}|null
  throw new ServerError(response.status,body?.error?.code||'API_REQUEST_FAILED',
   body?.error?.message||'Server request failed; no browser preview data was substituted.')
 }
 return response.json() as Promise<T>
}
export async function serverRequest<T>(state:AuthState,endpoint:string,options:RequestInit={}):Promise<T>{
 if(!state.config||!state.token||!state.membership||!state.tenantId||state.phase!=='signedIn'||state.expiresAt<Date.now()+1000)
  throw new ServerError(401,'SESSION_REQUIRED','Sign in and verify your tenant before using the server registry.')
 return api<T>(state.config,state.token,state.tenantId,endpoint,options)
}
export function useServerIdentity(){
 const [state,setState]=useState<AuthState>(empty)
 const logout=useCallback(()=>{
  sessionStorage.removeItem(STORE_PENDING)
  setState(s=>({...s,phase:s.config?'signedOut':'disabled',token:null,expiresAt:0,membership:null,error:''}))
 },[])
 useEffect(()=>{
  let cancelled=false
  async function init(){
   let config:RuntimeConfig|null=null
   try{
    config=await loadRuntimeConfig()
    if(cancelled)return
    if(!config){setState({...empty,phase:'disabled'});return}
    const query=new URLSearchParams(location.search)
    const code=query.get('code'),oauthError=query.get('error')
    if(!code&&!oauthError){setState({...empty,phase:'signedOut',config});return}
    // Remove short-lived authorization code from URL before exchanging or reporting errors.
    history.replaceState(null,'',browserReturn()+'#/server-registry')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    const raw=sessionStorage.getItem(STORE_PENDING)
    sessionStorage.removeItem(STORE_PENDING)
    if(oauthError)throw Error('Identity provider did not complete authorization.')
    if(!code||!raw)throw Error('OIDC callback has no matching local authorization request.')
    const pending=JSON.parse(raw) as {verifier:string;state:string;created:number}
    if(!pending.verifier||!pending.state||query.get('state')!==pending.state||
       Date.now()-pending.created>10*60*1000||Date.now()<pending.created)
      throw Error('The OIDC state expired or does not match this browser session.')
    const form=new URLSearchParams({
     grant_type:'authorization_code',client_id:config.clientId,code,code_verifier:pending.verifier,
     redirect_uri:browserReturn()
    })
    const result=await fetch(config.tokenEndpoint,{
     method:'POST',body:form,credentials:'omit',cache:'no-store',redirect:'error',
     referrerPolicy:'no-referrer',headers:{'Content-Type':'application/x-www-form-urlencoded'}
    })
    if(!result.ok)throw Error('OIDC token exchange failed.')
    const body=await result.json() as {access_token?:unknown;token_type?:unknown;expires_in?:unknown}
    if(typeof body.access_token!=='string'||body.access_token.length<20||
      typeof body.expires_in!=='number'||body.expires_in<30||body.expires_in>86400||
      typeof body.token_type!=='string'||body.token_type.toLowerCase()!=='bearer')
      throw Error('Unexpected authorization server token response.')
    if(cancelled)return
    setState({...empty,phase:'tokenReady',config,token:body.access_token,
      expiresAt:Date.now()+body.expires_in*1000,
      tenantId:sessionStorage.getItem(STORE_TENANT)||''})
   }catch{
    if(!cancelled)setState({...empty,phase:'error',config,error:'Secure sign-in could not be completed. Restart authentication.'})
   }
  }
  void init()
  return()=>{cancelled=true}
 },[])
 useEffect(()=>{
  if(!state.token)return
  const ms=state.expiresAt-Date.now()
  if(ms<=0){logout();return}
  const timer=setTimeout(logout,ms)
  return()=>clearTimeout(timer)
 },[state.token,state.expiresAt,logout])
 const signIn=useCallback(async()=>{
  if(!state.config)return
  try{
   const next=beginAuthorization(state.config)
   const challenge=await pkceChallenge(next.verifier)
   next.url.searchParams.set('code_challenge',challenge)
   window.location.assign(next.url.href)
  }catch{setState(s=>({...s,phase:'error',error:'Unable to start secure sign-in.'}))}
 },[state.config])
 const selectMembership=useCallback(async(tenantId:string)=>{
  if(!state.config||!state.token||state.expiresAt<Date.now()+1000)throw Error('Access token has expired.')
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId))
   throw Error('Enter a valid tenant UUID.')
  try{
   const member=await api<Membership>(state.config,state.token,tenantId,'/v1/me')
   if(!member.authenticated||member.tenantId!==tenantId)throw Error('Tenant membership response invalid.')
   sessionStorage.setItem(STORE_TENANT,tenantId)
   setState(s=>({...s,tenantId,membership:member,phase:'signedIn',error:''}))
  }catch(error){
   setState(s=>({...s,phase:'tokenReady',membership:null,error:
    error instanceof ServerError?error.message:'Tenant verification failed.'}))
  }
 },[state.config,state.token,state.expiresAt])
 return {state,logout,signIn,selectMembership}
}
