#!/usr/bin/env node
// Opt-in STAGING-ONLY workflow certification. Never run against production.
import assert from 'node:assert/strict'
import {readFile,stat} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
const env=process.env
for(const key of ['B21_STAGING_API_URL','B21_STAGING_TENANT_ID','B21_STAGING_TOKEN_FILE'])
 if(!env[key])throw Error('Missing staging setting: '+key)
if(env.B21_STAGING_ENVIRONMENT!=='staging'||env.B21_STAGING_APPROVED!=='yes-testing-only')
 throw Error('Explicit staging-only approval required; production mutations refused.')
const origin=new URL(env.B21_STAGING_API_URL)
if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash)
 throw Error('Staging API must be an exact HTTPS origin.')
const file=await stat(env.B21_STAGING_TOKEN_FILE)
if(!file.isFile()||(process.platform!=='win32'&&(file.mode&0o077)!==0))throw Error('Token file requires chmod 600.')
const token=(await readFile(env.B21_STAGING_TOKEN_FILE,'utf8')).trim()
if(token.length<20||token.length>10000)throw Error('Real signed OIDC access token required.')
const tenant=env.B21_STAGING_TENANT_ID
if(!/^[0-9a-f-]{36}$/i.test(tenant))throw Error('Invalid staging tenant UUID.')
const base=origin.origin
const log=[]
async function request(method,endpoint,{body,key,version}={}){
 const headers={Authorization:'Bearer '+token,'X-Tenant-Id':tenant}
 if(body)headers['Content-Type']='application/json'
 if(key)headers['Idempotency-Key']=key
 if(version)headers['If-Match']='"'+version+'"'
 const result=await fetch(base+endpoint,{method,headers,body:body?JSON.stringify(body):undefined,
  redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)})
 return {status:result.status,body:await result.json(),etag:result.headers.get('etag')}
}
function check(result,status,step){
 assert.equal(result.status,status,step+' HTTP status mismatch: '+JSON.stringify(result.body).slice(0,260))
 log.push(step)
 return result.body
}
const actor=check(await request('GET','/v1/me'),200,'verified issuer/member')
assert.equal(actor.tenantId,tenant)
assert.ok(['WORKSPACE_OWNER','OPERATIONS'].includes(actor.role))
check(await request('GET','/v1/assets?limit=1'),200,'read tenant registry')
const prefix='b21-cert-'+randomUUID().slice(0,18)
const asset=check(await request('POST','/v1/assets',{key:prefix+'-create',body:{
 name:'B2.1 certification fixture '+prefix,category:'Vehicles',currency:'KES',
 description:'STAGING ONLY, never a production holding',tags:['staging-certification']
}}),201,'create test asset')
let version=asset.recordVersion
const date=new Date().toISOString().slice(0,10)
async function command(path,body,key,status){
 const res=await request('POST','/v1/assets/'+asset.id+path,{body,key:prefix+'-'+key,version})
 const result=check(res,status,key)
 version=result.asset.recordVersion
 assert.equal(res.etag,'"'+version+'"')
 return result
}
await command('/lifecycle-actions',{action:'START_ACQUISITION',reason:'B2.1 staging review'},'begin',200)
const acquisition=await command('/acquisitions',{method:'PURCHASE',effectiveOn:date,
 costs:{purchase:'1234.56',taxes:'5.44',fees:'0',installation:'0',improvements:'0',other:'0'},
 evidenceReference:'STAGING-NOT-PAYMENT'},'acquisition',201)
assert.equal(acquisition.acquisition.costBasis,'1240.00')
const assignment=await command('/ownership-interests',{dimension:'ECONOMIC',partyRef:prefix+':source',
 partyLabel:'Certification source',percentage:'100.00',effectiveOn:date},'ownership',201)
const transfer=await command('/ownership-transfers',{sourceInterestId:assignment.interest.id,
 toPartyRef:prefix+':target',toPartyLabel:'Certification target',percentage:'40.00',effectiveOn:date},'transfer',201)
assert.equal(transfer.transfer.remainingPercentage,'60.00')
await command('/lifecycle-actions',{action:'ACTIVATE',reason:'Staging activation'},'activate',200)
await command('/lifecycle-actions',{action:'SUSPEND',reason:'Staging suspension'},'suspend',200)
await command('/lifecycle-actions',{action:'REACTIVATE',reason:'Staging reactivation'},'reactivate',200)
await command('/disposition',{kind:'WRITE_OFF',effectiveOn:date,
 proceeds:'0',costs:'0',reason:'Staging fixture closed',confirm:'DISPOSE'},'disposition',201)
await command('/lifecycle-actions',{action:'ARCHIVE',reason:'End staging evidence'},'archive',200)
const history=check(await request('GET','/v1/assets/'+asset.id+'/lifecycle'),200,'reload lifecycle')
assert.equal(history.asset.lifecycle,'ARCHIVED')
assert.equal(history.acquisition.costBasis,'1240.00')
assert.ok(history.ownershipChanges.some(event=>event.kind==='TRANSFER'))
assert.equal(history.disposition.costBasis,'1240.00')
const blocked=await request('POST','/v1/assets/'+asset.id+'/lifecycle-actions',{
 key:prefix+'-blocked',version,body:{action:'ACTIVATE',reason:'Must be denied'}})
assert.equal(blocked.status,409)
log.push('terminal archive guard')
console.info(JSON.stringify({result:'B2.1_STAGING_API_CERTIFIED',origin:origin.origin,
 tenantId:tenant,assetId:asset.id,verifiedAt:new Date().toISOString(),checks:log},null,2))
