import {test,expect} from '@playwright/test'
const issuer='https://identity.asset-os.test'
const api='https://api.asset-os.test'
const config={apiBaseUrl:api,issuer:issuer+'/realm',authorizationEndpoint:issuer+'/oauth/authorize',
 tokenEndpoint:issuer+'/oauth/token',clientId:'asset-os-public',audience:'asset-os-api'}
const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const other='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const record={id,tenantId:tenant,assetNumber:'AST-B4-CERT',name:'Verified fleet car',
 description:'Authenticated operational asset',category:'Vehicles',subcategory:'Fleet',currency:'KES',
 registryValue:'1200000.00',valueAsOf:'2026-10-30',locationLabel:'Nairobi',
 tags:[],recordVersion:7,lifecycle:'ACTIVE',createdAt:'2026-11-01T10:00:00.000Z',
 updatedAt:'2026-11-01T10:00:00.000Z'}
const second={...record,id:other,assetNumber:'AST-B4-OTHER',name:'Verified related asset'}
const member=role=>({tenantId:tenant,identityId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',role,
 issuer:config.issuer,authenticated:true})
const listKinds=['maintenance-plans','service-jobs','insurance-policies','utilization-readings','evidence-references','location-events','asset-relationships']
const planId='11111111-1111-4111-8111-111111111111'
const jobId='22222222-2222-4222-8222-222222222222'
const policyId='33333333-3333-4333-8333-333333333333'
function fixture(role='WORKSPACE_OWNER'){
 const rows=Object.fromEntries(listKinds.map(kind=>[kind,[]]))
 rows['maintenance-plans']=[{id:planId,title:'Engine inspection',intervalValue:1,intervalUnit:'MONTHS',
  nextDue:'2026-11-30',lastCompletedOn:null,status:'ACTIVE',recordedAt:'2026-11-01T10:00:00.000Z'}]
 rows['service-jobs']=[{id:jobId,title:'Oil change',planId,status:'SCHEDULED',scheduledFor:'2026-10-31',
  providerLabel:'Not dispatched',completedOn:null,recordedCost:null,completionNotes:'',recordedAt:'2026-11-01T10:00:00.000Z'}]
 rows['insurance-policies']=[{id:policyId,insurerLabel:'User-entered insurer',policyReference:'POL-001',
  policyType:'Motor',startOn:'2026-10-30',endOn:'2027-10-30',status:'RECORDED',coverageAmount:'500000.00',
  premiumAmount:null,recordedAt:'2026-11-01T10:00:00.000Z'}]
 rows['utilization-readings']=[{id:'44444444-4444-4444-8444-444444444444',metric:'ODOMETER_KM',
  observedOn:'2026-11-01',reading:'9000.25',sourceLabel:'Manual',recordedAt:'2026-11-01T10:00:00.000Z'}]
 const data={version:7,role,rows,writes:[],denySummary:false,failVersion:false}
 return data
}
async function setup(page,{role='WORKSPACE_OWNER',denySummary=false}={}){
 const state=fixture(role)
 state.denySummary=denySummary
 await page.route('**/Asset-Os/asset-runtime.json',r=>r.fulfill({
  contentType:'application/json',body:JSON.stringify(config)}))
 await page.route(issuer+'/**',r=>{
  if(r.request().url().startsWith(config.tokenEndpoint))
   return r.fulfill({status:200,contentType:'application/json',
    headers:{'access-control-allow-origin':'*'},body:JSON.stringify({
     access_token:'test-b4-verified-opaque-token',token_type:'Bearer',expires_in:300})})
  return r.fulfill({contentType:'text/html',body:'<h1>Test signed identity provider</h1>'})
 })
 await page.route(api+'/**',route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method()
  const headers={'access-control-allow-origin':'*','access-control-expose-headers':'etag, idempotent-replayed'}
  const send=(body,status=200,extra={})=>route.fulfill({status,contentType:'application/json',
   headers:{...headers,...extra},body:JSON.stringify(body)})
  const fail=(status,code,message)=>send({error:{code,message}},status)
  if(method==='OPTIONS')return route.fulfill({status:204,headers:{...headers,
   'access-control-allow-methods':'GET, POST, PATCH, OPTIONS',
   'access-control-allow-headers':'authorization,x-tenant-id,idempotency-key,if-match,content-type'}})
  if(!req.headers().authorization?.startsWith('Bearer test-b4-verified-opaque-token'))return fail(401,'INVALID_ACCESS_TOKEN','Untrusted token')
  if(req.headers()['x-tenant-id']!==tenant)return fail(403,'TENANT_ACCESS_DENIED','No active tenant membership')
  if(path==='/v1/me')return send(member(role))
  if(path==='/v1/assets'&&method==='GET')return send({items:[{...record,recordVersion:state.version},second],nextCursor:null,limit:20})
  if(path==='/v1/assets/'+id&&method==='GET')return send({...record,recordVersion:state.version})
  if(path==='/v1/assets/'+id+'/operations'&&method==='GET'){
   if(state.denySummary)return fail(404,'ASSET_NOT_FOUND','Asset not found in this tenant')
   return send({
    assetId:id,recordVersion:state.version,lifecycle:'ACTIVE',currency:'KES',
    maintenance:{plans:state.rows['maintenance-plans'].length,activePlans:state.rows['maintenance-plans'].filter(p=>p.status==='ACTIVE').length,
     nextDue:state.rows['maintenance-plans'][0]?.nextDue||null,jobs:state.rows['service-jobs'].length,
     openJobs:state.rows['service-jobs'].filter(j=>['SCHEDULED','IN_PROGRESS'].includes(j.status)).length},
    insurance:{recordCount:state.rows['insurance-policies'].length,
     recordedDateActive:state.rows['insurance-policies'].filter(p=>p.status==='RECORDED').length,
     expiredDate:0,nextExpiry:'2027-10-30',coverageVerified:false,insurerConnected:false},
    utilization:{latest:state.rows['utilization-readings'].slice(0,1).map(r=>({
      metric:r.metric,reading:r.reading,observedOn:r.observedOn})),sourceAuthority:'USER_ENTRY'},
    location:{toLabel:state.rows['location-events'][0]?.toLabel||'Nairobi',effectiveOn:state.rows['location-events'][0]?.effectiveOn||null},
    evidence:{count:state.rows['evidence-references'].length,verified:false},
    relationships:{count:state.rows['asset-relationships'].length,verified:false},
    interpretation:'Operator-entered facts only'
   })
  }
  if(path==='/v1/assets/'+id+'/operations-calendar'&&method==='GET')return send({
   assetId:id,limit:100,notificationDelivered:false,calendarSynced:false,
   items:[{id:planId,kind:'MAINTENANCE_DUE',dueOn:'2026-11-30',label:'Engine inspection'}],
   note:'No external dispatch or notification'})
  const prefix='/v1/assets/'+id+'/'
  if(!path.startsWith(prefix))return fail(404,'ASSET_NOT_FOUND','Asset not found')
  const sub=path.slice(prefix.length)
  const kind=listKinds.find(x=>sub===x||sub.startsWith(x+'/'))
  if(!kind)return fail(404,'NOT_FOUND','Unknown operation')
  if(method==='GET'&&sub===kind)return send({items:state.rows[kind],nextCursor:null,limit:20,sourceAuthority:'USER_ENTERED_UNVERIFIED'})
  if(method!=='POST')return fail(405,'METHOD_NOT_ALLOWED','Method not allowed')
  if(role!=='WORKSPACE_OWNER'&&role!=='OPERATIONS')return fail(403,'INSUFFICIENT_ROLE','Read-only role')
  const body=JSON.parse(req.postData()||'{}')
  const entry={path,body,headers:req.headers()}
  state.writes.push(entry)
  if(!req.headers()['idempotency-key']||!req.headers()['if-match'])return fail(428,'IF_MATCH_REQUIRED','Precondition missing')
  if(req.headers()['if-match']!=='"'+state.version+'"')return fail(412,'RECORD_VERSION_CONFLICT','Asset version changed')
  if(sub===kind){
   const written={id:'99999999-9999-4999-8999-'+String(state.writes.length).padStart(12,'0'),
    recordedAt:new Date().toISOString(),status:kind==='insurance-policies'?'RECORDED':kind==='service-jobs'?'SCHEDULED':kind==='maintenance-plans'?'ACTIVE':undefined,
    ...body}
   if(kind==='maintenance-plans')written.lastCompletedOn=null
   if(kind==='service-jobs')written.completedOn=null
   state.rows[kind].unshift(written)
  }else if(sub.endsWith('/actions')){
   const resourceId=sub.split('/')[1]
   const row=state.rows[kind].find(r=>r.id===resourceId)
   if(!row)return fail(404,'OPERATION_RECORD_NOT_FOUND','Record not found')
   if(kind==='maintenance-plans')row.status=body.action==='PAUSE'?'PAUSED':'ACTIVE'
   if(kind==='service-jobs'){
    row.status=body.action==='COMPLETE'?'COMPLETED':body.action==='START'?'IN_PROGRESS':'CANCELLED'
    if(body.action==='COMPLETE'){row.completedOn=body.completedOn;row.recordedCost=body.recordedCost}
   }
   if(kind==='insurance-policies')row.status='CANCELLED'
  }
  state.version+=1
  return send({asset:{...record,recordVersion:state.version},saved:true},sub===kind?201:200,{'etag':'"'+state.version+'"'})
 })
 return state
}
async function authenticate(page){
 await page.goto('./#/server-registry/operations')
 await page.getByRole('button',{name:/Sign in securely/}).click()
 await expect(page).toHaveURL(/identity\.asset-os\.test\/oauth\/authorize/)
 const state=new URL(page.url()).searchParams.get('state')
 await page.goto('./?code=secure-b4-test-code&state='+state+'#/server-registry')
 await page.getByRole('textbox',{name:'Tenant UUID'}).fill(tenant)
 await page.getByRole('button',{name:'Verify membership'}).click()
 await expect(page.getByText('Server certified car')).toHaveCount(0)
}
async function openAsset(page){
 await page.goto('./#/server-registry/operations')
 await expect(page.getByRole('heading',{name:'Secure Operations'})).toBeVisible()
 await page.getByRole('button',{name:/Open operations/}).first().click()
 await expect(page.getByRole('heading',{name:'Verified fleet car'})).toBeVisible()
}
test('B4.1 defaults to closed identity gate; no operational data appears in browser-only mode',async({page})=>{
 await page.goto('./#/server-registry/operations')
 await expect(page.getByText('Production identity is not activated')).toBeVisible()
 await expect(page.getByRole('button',{name:'Record maintenance plan'})).toHaveCount(0)
 await expect(page.getByText('Verified fleet car')).toHaveCount(0)
})
test('B4.1 OIDC operator views PostgreSQL-only summary, seven tabs and performs versioned recurring maintenance write',async({page})=>{
 const state=await setup(page)
 await authenticate(page)
 await openAsset(page)
 await expect(page.getByText(/coverage unverified/i).first()).toBeVisible()
 await expect(page.getByText(/Notifications delivered: No/)).toBeVisible()
 await page.getByRole('tab',{name:'Maintenance'}).click()
 await expect(page.getByRole('heading',{name:'Maintenance plans'})).toBeVisible()
 await expect(page.getByText('Engine inspection').first()).toBeVisible()
 await page.getByLabel('Plan title').fill('Service battery checks')
 await page.getByLabel('Interval (1–365)').fill('2')
 await page.getByLabel('Cycle unit').selectOption('MONTHS')
 await page.getByLabel('Next due date').fill('2026-12-01')
 await page.getByRole('button',{name:'Record maintenance plan'}).click()
 await expect.poll(()=>state.writes.length).toBe(1)
 const write=state.writes[0]
 expect(write.path).toBe('/v1/assets/'+id+'/maintenance-plans')
 expect(write.headers.authorization).toBe('Bearer test-b4-verified-opaque-token')
 expect(write.headers['x-tenant-id']).toBe(tenant)
 expect(write.headers['if-match']).toBe('"7"')
 expect(write.headers['idempotency-key']?.length).toBeGreaterThan(7)
 expect(write.body).toMatchObject({title:'Service battery checks',intervalValue:2,intervalUnit:'MONTHS',nextDue:'2026-12-01'})
 expect(write.body).not.toHaveProperty('tenantId')
 expect(write.body).not.toHaveProperty('status')
 await expect(page.getByText('Service battery checks').first()).toBeVisible()
 await page.getByRole('button',{name:'Pause plan'}).first().click()
 await expect.poll(()=>state.writes.length).toBe(2)
 expect(state.writes[1].body).toEqual({action:'PAUSE'})
 expect(state.writes[1].headers['if-match']).toBe('"8"')
 const local=await page.evaluate(()=>JSON.stringify(localStorage))
 expect(local).not.toContain('Service battery checks')
 expect(local).not.toContain('test-b4-verified-opaque-token')
})
test('B4.1 operator can record insurance, utilization, evidence, location and relation through guarded B4 commands',async({page})=>{
 const state=await setup(page)
 await authenticate(page)
 await openAsset(page)
 await page.getByRole('tab',{name:'Insurance'}).click()
 await page.getByLabel('Insurer display label').fill('Manual cover note')
 await page.getByLabel('Policy reference').fill('NOTE-2026-01')
 await page.getByLabel('Policy type').fill('Comprehensive')
 await page.getByLabel('Recorded coverage (KES)').fill('560000.50')
 await page.getByLabel('Policy start date').fill('2026-11-01')
 await page.getByLabel('Policy expiry date').fill('2027-11-01')
 await page.getByRole('button',{name:'Record unverified policy'}).click()
 await expect.poll(()=>state.writes.length).toBe(1)
 expect(state.writes[0].body).toMatchObject({coverageAmount:'560000.50',premiumAmount:null,insurerLabel:'Manual cover note'})
 await page.getByRole('tab',{name:'Utilization'}).click()
 await page.getByLabel('Reading date').fill('2026-11-02')
 await page.getByLabel('Cumulative reading').fill('9100.50')
 await page.getByLabel('Reading source description').fill('Owner manual dashboard')
 await page.getByRole('button',{name:'Save utilization observation'}).click()
 await expect.poll(()=>state.writes.length).toBe(2)
 expect(state.writes[1].body).toMatchObject({metric:'ODOMETER_KM',reading:'9100.50',sourceLabel:'Owner manual dashboard'})
 await page.getByRole('tab',{name:'Evidence'}).click()
 await page.getByLabel('Reference title').fill('Stored maintenance report')
 await page.getByLabel('Opaque evidence reference').fill('ARCHIVE-2026-ONE')
 await page.getByRole('button',{name:'Record evidence label'}).click()
 await expect.poll(()=>state.writes.length).toBe(3)
 expect(state.writes[2].body).not.toHaveProperty('documentUploaded')
 await page.getByRole('tab',{name:'Locations'}).click()
 await page.getByLabel('New location label').fill('Workshop garage')
 await page.getByLabel('Effective date').fill('2026-11-02')
 await page.getByRole('button',{name:'Record location change'}).click()
 await expect.poll(()=>state.writes.length).toBe(4)
 expect(state.writes[3].body).toMatchObject({toLabel:'Workshop garage',effectiveOn:'2026-11-02'})
 await page.getByRole('tab',{name:'Relationships'}).click()
 await page.getByLabel('Related verified tenant asset').selectOption(other)
 await page.getByLabel('Relationship type').selectOption('DEPENDS_ON')
 await page.getByRole('button',{name:'Record asset relationship'}).click()
 await expect.poll(()=>state.writes.length).toBe(5)
 expect(state.writes[4].body).toMatchObject({relatedAssetId:other,type:'DEPENDS_ON'})
 for(let i=0;i<5;i++)expect(state.writes[i].headers['if-match']).toBe('"'+(7+i)+'"')
})
test('B4.1 read-only tenant member sees evidence but cannot create, pause or cancel',async({page})=>{
 const state=await setup(page,{role:'VIEWER'})
 await authenticate(page)
 await openAsset(page)
 await page.getByRole('tab',{name:'Maintenance'}).click()
 await expect(page.getByText('Your verified tenant role is read-only.')).toBeVisible()
 await expect(page.getByRole('button',{name:'Record maintenance plan'})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Pause plan'})).toHaveCount(0)
 await page.getByRole('tab',{name:'Insurance'}).click()
 await expect(page.getByText('User-entered insurer').first()).toBeVisible()
 await expect(page.getByRole('button',{name:'Mark cancelled'})).toHaveCount(0)
 expect(state.writes).toHaveLength(0)
})
test('B4.1 cross-tenant asset refusal and stale ETag fail closed without local-data fallback',async({page})=>{
 const state=await setup(page,{denySummary:true})
 await authenticate(page)
 await openAssetFromError(page)
 await expect(page.getByRole('alert')).toContainText('ASSET_NOT_FOUND')
 await expect(page.getByRole('tab',{name:'Maintenance'})).toHaveCount(0)
 state.denySummary=false
 await page.getByRole('button',{name:'Retry'}).click()
 await expect(page.getByRole('heading',{name:'Verified fleet car'})).toBeVisible()
 state.version=8
 await page.getByRole('tab',{name:'Maintenance'}).click()
 await page.getByLabel('Plan title').fill('Stale maintenance action')
 await page.getByRole('button',{name:'Record maintenance plan'}).click()
 await expect(page.getByRole('alert')).toContainText('RECORD_VERSION_CONFLICT')
 expect(state.rows['maintenance-plans'].some(p=>p.title==='Stale maintenance action')).toBe(false)
})
async function openAssetFromError(page){
 await page.goto('./#/server-registry/operations')
 await expect(page.getByRole('heading',{name:'Secure Operations'})).toBeVisible()
 await page.getByRole('button',{name:/Open operations/}).first().click()
}
