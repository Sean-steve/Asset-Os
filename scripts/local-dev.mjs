#!/usr/bin/env node
// B4.2/B4.3 local run only. Existing Ubuntu PostgreSQL is not modified here.
import {spawn} from 'node:child_process'
import {readFileSync,writeFileSync,existsSync,unlinkSync,lstatSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import path from 'node:path'

const root=path.resolve(import.meta.dirname,'..')
process.chdir(root)
const file='.local/asset-os.env'
if(!existsSync(file))throw Error('Run npm run local:setup first; no local database credentials found.')
if(lstatSync(file).isSymbolicLink())throw Error('Refusing symlinked local credentials.')
const config=Object.fromEntries(readFileSync(file,'utf8').split(/\r?\n/)
 .filter(line=>line&&!line.startsWith('#')).map(line=>{
  const i=line.indexOf('=');if(i<1)throw Error('Invalid local env file.')
  return [line.slice(0,i),line.slice(i+1)]
 }))
if(config.NODE_ENV!=='development'||config.ASSET_OS_ALLOW_LOCAL_OIDC!=='yes'||
 config.LOCAL_IDP_ENABLED!=='yes'||config.ASSET_OS_LOCAL_MODE!=='yes')
 throw Error('Incomplete explicit local-only security configuration.')
const env={...process.env,...config}
for(const executable of ['apps/api/dist/server.js','apps/api/dist/bootstrap.js','apps/api/dist/local-idp.js'])
 if(!existsSync(executable))throw Error('API not built. Run npm run local:setup.')
const children=[]
let shuttingDown=false
function stop(){
 if(shuttingDown)return
 shuttingDown=true
 for(const p of children)if(!p.killed)p.kill('SIGTERM')
}
process.on('SIGINT',()=>{stop();process.exit(0)})
process.on('SIGTERM',()=>{stop();process.exit(0)})
process.on('exit',stop)
function start(label,command,args){
 const proc=spawn(command,args,{cwd:root,env,stdio:['ignore','pipe','pipe']})
 children.push(proc)
 for(const stream of [proc.stdout,proc.stderr]){
  let partial=''
  stream.on('data',data=>{
   partial+=String(data)
   const lines=partial.split(/\r?\n/);partial=lines.pop()||''
   for(const line of lines)if(line.trim())console.log('['+label+'] '+line)
  })
 }
 proc.on('error',e=>{console.error(label+' could not start: '+e.message);stop();process.exitCode=1})
 proc.on('exit',code=>{
  if(!shuttingDown){console.error(label+' unexpectedly exited ('+code+').');stop();process.exitCode=1}
 })
 return proc
}
async function ready(url){
 for(let i=0;i<70;i++){
  if(shuttingDown)throw Error('Local process exited during startup.')
  try{
   const resp=await fetch(url,{signal:AbortSignal.timeout(850)})
   if(resp.ok)return
  }catch{/* not ready */}
  await new Promise(resolve=>setTimeout(resolve,300))
 }
 throw Error('Local service failed health probe: '+url)
}
async function enrollment(){
 const tenantPath='.local/tenant-id'
 if(existsSync(tenantPath)){
  if(lstatSync(tenantPath).isSymbolicLink())throw Error('Refusing symlinked tenant file.')
  const id=readFileSync(tenantPath,'utf8').trim()
  if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('Invalid previously enrolled tenant ID.')
  return id
 }
 const response=await fetch('http://127.0.0.1:3003/dev/owner-token',{
  method:'POST',headers:{'x-local-admin-secret':config.LOCAL_IDP_ADMIN_SECRET},
  signal:AbortSignal.timeout(5000)
 })
 if(!response.ok)throw Error('Local issuer refused privileged owner enrollment.')
 const issued=await response.json()
 const temp='.local/owner-'+randomUUID()+'.jwt'
 writeFileSync(temp,String(issued.access_token),{mode:0o600,flag:'wx'})
 try{
  const args=['apps/api/dist/bootstrap.js','--tenant-slug','local-asset-workspace',
   '--tenant-name','Local Asset Workspace','--token-file',path.resolve(temp),'--confirm']
  const output=await new Promise((resolve,reject)=>{
   const p=spawn(process.execPath,args,{cwd:root,env,stdio:['ignore','pipe','pipe']})
   let out=''
   p.stdout.on('data',chunk=>out+=String(chunk))
   p.on('error',reject)
   p.on('exit',code=>code===0?resolve(out):reject(Error('Bootstrap failed. Check database migration and owner credentials.')))
  })
  const id=String(output).match(/Select X-Tenant-Id:\s*([0-9a-f-]{36})/i)?.[1]
  if(!id)throw Error('Bootstrap did not return a verified tenant UUID.')
  writeFileSync(tenantPath,id+'\n',{mode:0o600,flag:'wx'})
  console.log('Created verified local tenant '+id+'.')
  return id
 }finally{unlinkSync(temp)}
}
try{
 start('idp',process.execPath,['apps/api/dist/local-idp.js'])
 await ready('http://127.0.0.1:3003/health/live')
 const tenant=await enrollment()
 start('api',process.execPath,['apps/api/dist/server.js'])
 await ready('http://127.0.0.1:3001/health/ready')
 start('web','npm',['run','dev','--','--host','127.0.0.1','--port','5173','--strictPort'])
 await ready('http://127.0.0.1:5173/Asset-Os/')
 console.log('\nAsset OS local stack is READY.')
 console.log('Frontend: http://127.0.0.1:5173/Asset-Os/#/server-registry')
 console.log('API: http://127.0.0.1:3001/health/ready')
 console.log('OIDC: http://127.0.0.1:3003/.well-known/openid-configuration')
 console.log('Account: owner')
 console.log('Password: grep ^LOCAL_IDP_PASSWORD= .local/asset-os.env')
 console.log('Tenant: '+tenant+' (membership still verified by the API after login)')
 console.log('Ctrl+C stops local services. PostgreSQL and its data remain running.\n')
}catch(error){
 console.error(error instanceof Error?error.message:'Local stack start failed.')
 stop()
 process.exitCode=1
}
