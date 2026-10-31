/**
 * Explicit browser origin boundary. Bearer tokens are never sent to a wildcard
 * origin, cookies are never used and CORS never substitutes for JWT/RLS.
 */
export const METHODS='GET, POST, PATCH, OPTIONS'
export const REQUEST_HEADERS=['authorization','content-type','x-tenant-id','idempotency-key','if-match']
export const EXPOSE_HEADERS='ETag, Idempotent-Replayed'
export function allowedBrowserOrigins(env:NodeJS.ProcessEnv=process.env):Set<string>{
 const parts=(env.CORS_ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean)
 const unique=new Set<string>()
 for(const raw of parts){
  let parsed:URL
  try{parsed=new URL(raw)}catch{throw Error('CORS_ALLOWED_ORIGINS contains an invalid origin.')}
  const loopback=(parsed.hostname==='127.0.0.1'||parsed.hostname==='localhost')&&env.NODE_ENV!=='production'
  if((parsed.protocol!=='https:'&&!loopback)||parsed.origin!==raw||parsed.username||parsed.password||raw==='*'){
   throw Error('CORS origins must be exact HTTPS origins (localhost HTTP only outside production).')
  }
  unique.add(raw)
 }
 return unique
}
export function preflightAllowed(requested:string|undefined){
 if(!requested)return true
 return requested.split(',').every(h=>REQUEST_HEADERS.includes(h.trim().toLowerCase()))
}
