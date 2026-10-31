import {test,expect} from '@playwright/test'
const origin='https://identity.asset-os.test'
const api='https://api.asset-os.test'
const config={
 apiBaseUrl:api,issuer:origin+'/realm',authorizationEndpoint:origin+'/oauth/authorize',
 tokenEndpoint:origin+'/oauth/token',clientId:'asset-os-public',audience:'asset-os-api'
}
const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const member={tenantId:tenant,identityId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 role:'WORKSPACE_OWNER',issuer:config.issuer,authenticated:true}
const record={
 id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',tenantId:tenant,assetNumber:'AST-TEST-001',
 name:'Server certified car',description:'Test server asset',category:'Vehicles',subcategory:'Fleet',
 lifecycle:'PLANNED',operationalState:'IDLE',riskLabel:'NORMAL',currency:'KES',
 registryValue:'1250000.00',valueAsOf:'2026-10-31',locationLabel:'Nairobi',
 customFields:{},recordVersion:1,createdAt:'2026-10-31T12:00:00.000Z',updatedAt:'2026-10-31T12:00:00.000Z',tags:['Fleet']
}
async function setup(page,{membership=member,assets=[record]}={}){
 await page.route('**/Asset-Os/asset-runtime.json',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(config)}))
 await page.route(origin+'/**',async r=>{
  if(r.request().url().startsWith(config.tokenEndpoint)){
   return r.fulfill({status:200,contentType:'application/json',
    headers:{'access-control-allow-origin':'*'},body:JSON.stringify({
     access_token:'test-access-token-verified-1234567890',token_type:'Bearer',expires_in:300
    })})
  }
  return r.fulfill({status:200,contentType:'text/html',body:'<h1>Test identity provider authorization</h1>'})
 })
 await page.route(api+'/**',r=>{
  const url=new URL(r.request().url()),method=r.request().method()
  const common={status:200,contentType:'application/json',headers:{
   'access-control-allow-origin':'*','access-control-expose-headers':'etag, idempotent-replayed'}}
  if(method==='OPTIONS')return r.fulfill({status:204,headers:{
   'access-control-allow-origin':'*',
   'access-control-allow-methods':'GET, POST, PATCH, OPTIONS',
   'access-control-allow-headers':'authorization,x-tenant-id,idempotency-key,if-match,content-type'}})
  if(!r.request().headers().authorization?.startsWith('Bearer test-access-token-'))
   return r.fulfill({...common,status:401,body:JSON.stringify({error:{code:'INVALID_ACCESS_TOKEN',message:'Token invalid'}})})
  if(url.pathname==='/v1/me'){
   if(membership===null)return r.fulfill({...common,status:403,body:JSON.stringify({
    error:{code:'TENANT_ACCESS_DENIED',message:'No active membership'}})})
   return r.fulfill({...common,body:JSON.stringify(membership)})
  }
  if(url.pathname==='/v1/assets'&&method==='GET')
   return r.fulfill({...common,body:JSON.stringify({items:assets,nextCursor:null,limit:20})})
  if(url.pathname==='/v1/assets'&&method==='POST')
   return r.fulfill({...common,status:201,headers:{...common.headers,etag:'"1"'},body:JSON.stringify({
    ...record,...JSON.parse(r.request().postData()||'{}'),id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',recordVersion:1})})
  if(url.pathname.startsWith('/v1/assets/')&&method==='PATCH')
   return r.fulfill({...common,headers:{...common.headers,etag:'"2"'},body:JSON.stringify({
    ...record,...JSON.parse(r.request().postData()||'{}'),recordVersion:2})})
  if(url.pathname.startsWith('/v1/assets/')&&method==='GET')
   return r.fulfill({...common,headers:{...common.headers,etag:'"1"'},body:JSON.stringify(record)})
  return r.fulfill({...common,status:404,body:'{}'})
 })
}
async function authenticate(page){
 await page.goto('./#/server-registry')
 await expect(page.getByRole('button',{name:/Sign in securely/})).toBeVisible()
 await page.getByRole('button',{name:/Sign in securely/}).click()
 await expect(page).toHaveURL(/identity\.asset-os\.test\/oauth\/authorize/)
 const authUrl=new URL(page.url())
 expect(authUrl.searchParams.get('response_type')).toBe('code')
 expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256')
 expect(authUrl.searchParams.get('code_challenge')?.length).toBeGreaterThan(30)
 expect(authUrl.searchParams.get('client_id')).toBe(config.clientId)
 expect(authUrl.searchParams.get('audience')).toBe(config.audience)
 expect(authUrl.searchParams.get('redirect_uri')).toContain('/Asset-Os/')
 const state=authUrl.searchParams.get('state')
 expect(state).toBeTruthy()
 await page.goto('./?code=temporary-one-time-code&state='+state+'#/dashboard')
 await expect(page.getByRole('textbox',{name:'Tenant UUID'})).toBeVisible()
 expect(page.url()).not.toContain('temporary-one-time-code')
 await page.getByRole('textbox',{name:'Tenant UUID'}).fill(tenant)
 await page.getByRole('button',{name:'Verify membership'}).click()
}
test('default deployment refuses production identity until public connection settings exist',async({page})=>{
 await page.goto('./#/server-registry')
 await expect(page.getByText('Production identity is not activated')).toBeVisible()
 await expect(page.getByRole('button',{name:/Sign in securely/})).toHaveCount(0)
 await page.getByRole('button',{name:'Use clearly labeled browser preview'}).click()
 await expect(page).toHaveURL(/#\/assets/)
 await expect(page.getByText(/LOCAL PREVIEW/).first()).toBeVisible()
})
test('PKCE authorization code and S256 challenge lead to membership-verified server registry; token remains memory-only',async({page})=>{
 await setup(page)
 await authenticate(page)
 await expect(page.getByText('Server certified car')).toBeVisible()
 await expect(page.locator('.server-status')).toContainText('Verified tenant')
 const storage=await page.evaluate(()=>Object.entries(localStorage).concat(Object.entries(sessionStorage)))
 expect(JSON.stringify(storage)).not.toContain('test-access-token-verified')
 await page.reload()
 await expect(page.getByRole('button',{name:/Sign in securely/})).toBeVisible()
})
test('tenant membership refusal never displays local or server assets',async({page})=>{
 await setup(page,{membership:null})
 await page.goto('./#/server-registry')
 await page.getByRole('button',{name:/Sign in securely/}).click()
 await expect(page).toHaveURL(/identity\.asset-os\.test\/oauth\/authorize/)
 const state=new URL(page.url()).searchParams.get('state')
 await page.goto('./?code=code&state='+state)
 await page.getByRole('textbox',{name:'Tenant UUID'}).fill(tenant)
 await page.getByRole('button',{name:'Verify membership'}).click()
 await expect(page.getByRole('alert')).toContainText('No active membership')
 await expect(page.getByText('Server certified car')).toHaveCount(0)
})
test('server-registry create/edit requests send token, tenant and idempotency/version headers, never localStore writes',async({page})=>{
 const writes=[]
 await setup(page)
 await page.route(api+'/**',async(route)=>{
  const req=route.request()
  if(['POST','PATCH'].includes(req.method()))writes.push({
   method:req.method(),headers:req.headers(),body:JSON.parse(req.postData()||'{}')
  })
  await route.fallback()
 })
 await authenticate(page)
 await expect(page.getByText('Server certified car')).toBeVisible()
 await page.getByRole('button',{name:'Register asset'}).click()
 await page.getByLabel('Asset name').fill('Authenticated server van')
 await page.getByLabel('Registry value (KES, decimal string)').fill('222000.00')
 await page.getByLabel('Value effective date').fill('2026-10-31')
 await page.getByRole('button',{name:'Register asset'}).click()
 await expect.poll(()=>writes.length).toBe(1)
 expect(writes[0].headers.authorization).toMatch(/^Bearer /)
 expect(writes[0].headers['x-tenant-id']).toBe(tenant)
 expect(writes[0].headers['idempotency-key']?.length).toBeGreaterThan(8)
 expect(writes[0].body.currency).toBe('KES')
 const store=await page.evaluate(()=>JSON.parse(localStorage.getItem('asset-os:registry:v1')||'null'))
 expect(store?.records?.some(a=>a.name==='Authenticated server van')).not.toBe(true)
 await page.goto('./#/server-registry/asset/'+record.id)
 await page.getByRole('button',{name:/Edit asset/}).click()
 await page.getByLabel('Asset name').fill('Updated server car')
 await page.getByRole('button',{name:'Save versioned changes'}).click()
 await expect.poll(()=>writes.length).toBe(2)
 expect(writes[1].headers['if-match']).toBe('"1"')
 expect(writes[1].headers['idempotency-key']).toBeTruthy()
})


test('B2.1 secured lifecycle: acquisition, cost basis and ownership write carry version and idempotency; local preview unchanged',async({page})=>{
 const calls=[]
 let version=1, lifecycle='PLANNED',acquisition=null,interests=[],changes=[],disposition=null
 const transitions=[]
 await setup(page)
 await page.route(api+'/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,method=req.method()
  const headers={'access-control-allow-origin':'*','access-control-expose-headers':'etag, idempotent-replayed'}
  if(method==='OPTIONS')return route.fallback()
  if(path==='/v1/assets/'+record.id+'/lifecycle'&&method==='GET'){
   return route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify({
    asset:{...record,lifecycle,recordVersion:version},transitions,acquisition,
    ownershipInterests:interests,ownershipChanges:changes,disposition
   })})
  }
  if(path==='/v1/assets/'+record.id+'/lifecycle-actions'&&method==='POST'){
   calls.push({method,path,headers:req.headers(),body:JSON.parse(req.postData()||'{}')})
   const body=JSON.parse(req.postData()||'{}')
   const prev=lifecycle
   lifecycle=body.action==='START_ACQUISITION'?'ACQUISITION_PENDING':body.action==='ACTIVATE'?'ACTIVE':body.action==='SUSPEND'?'SUSPENDED':body.action==='REACTIVATE'?'ACTIVE':body.action==='ARCHIVE'?'ARCHIVED':lifecycle
   transitions.push({id:'event-'+version,from:prev,to:lifecycle,reason:body.reason,occurredAt:'2026-10-31T12:00:00.000Z'})
   version++
   return route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify({asset:{...record,lifecycle,recordVersion:version},action:body.action})})
  }
  if(path==='/v1/assets/'+record.id+'/acquisitions'&&method==='POST'){
   calls.push({method,path,headers:req.headers(),body:JSON.parse(req.postData()||'{}')})
   const body=JSON.parse(req.postData()||'{}')
   acquisition={...body,id:'acq-id',currency:'KES',costBasis:'1265.00',
     costs:body.costs}
   transitions.push({id:'event-'+version,from:lifecycle,to:'ACQUIRED',reason:'Acquisition evidence recorded',occurredAt:'2026-10-31T12:00:00.000Z'})
   lifecycle='ACQUIRED';version++
   return route.fulfill({status:201,contentType:'application/json',headers,body:JSON.stringify({asset:{...record,lifecycle,recordVersion:version},acquisition})})
  }
  if(path==='/v1/assets/'+record.id+'/ownership-interests'&&method==='POST'){
   calls.push({method,path,headers:req.headers(),body:JSON.parse(req.postData()||'{}')})
   const body=JSON.parse(req.postData()||'{}')
   interests=[...interests,{...body,id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    partyRef:body.partyRef,partyLabel:body.partyLabel,dimension:body.dimension,percentage:body.percentage,
    effectiveFrom:body.effectiveOn,effectiveTo:null,source:'ASSIGNMENT'}]
   changes=[...changes,{id:'owner-event',kind:'ASSIGNMENT',dimension:body.dimension,fromPartyRef:null,toPartyRef:body.partyRef,percentage:body.percentage,effectiveOn:body.effectiveOn}]
   version++
   return route.fulfill({status:201,contentType:'application/json',headers,body:JSON.stringify({asset:{...record,lifecycle,recordVersion:version}})})
  }
  return route.fallback()
 })
 await authenticate(page)
 await expect(page.getByText('Server certified car')).toBeVisible()
 await page.goto('./#/server-registry/asset/'+record.id)
 await expect(page.getByRole('button',{name:/Acquisition, lifecycle & ownership/})).toBeVisible()
 await page.getByRole('button',{name:/Acquisition, lifecycle & ownership/}).click()
 await expect(page.getByRole('heading',{name:'Verified Asset Operations'})).toBeVisible()
 await expect(page.getByText('No authenticated initial acquisition has been recorded.')).toBeVisible()
 await page.getByLabel('Lifecycle reason').fill('Purchasing vehicle')
 await page.getByRole('button',{name:'Begin acquisition'}).click()
 await expect(page.getByRole('heading',{name:'Complete initial acquisition'})).toBeVisible()
 await page.getByLabel('Acquisition purchase').fill('1200.25')
 await page.getByLabel('Acquisition taxes').fill('50.10')
 await page.getByLabel('Acquisition fees').fill('5.01')
 await page.getByLabel('Acquisition improvements').fill('9.64')
 await page.getByRole('button',{name:'Record acquisition'}).click()
 await expect(page.getByText('1265.00 KES')).toBeVisible()
 await expect(page.getByRole('heading',{name:'Assign recorded ownership interest'})).toBeVisible()
 await page.getByLabel('Ownership party reference').fill('party:one')
 await page.getByLabel('Ownership party label').fill('Registered party one')
 await page.getByLabel('Ownership percentage').fill('60.00')
 await page.getByRole('button',{name:'Record ownership claim'}).click()
 await expect(page.getByText('Registered party one').first()).toBeVisible()
 expect(calls.map(v=>v.path.split('/').at(-1))).toEqual(['lifecycle-actions','acquisitions','ownership-interests'])
 expect(calls.map(v=>v.headers['if-match'])).toEqual(['"1"','"2"','"3"'])
 expect(calls.every(v=>v.headers['idempotency-key']?.length>=8)).toBe(true)
 expect(calls.every(v=>v.headers.authorization?.startsWith('Bearer test-access-token-'))).toBe(true)
 expect(calls.every(v=>v.headers['x-tenant-id']===tenant)).toBe(true)
 expect(calls[1].body.costs.purchase).toBe('1200.25')
 const before=await page.evaluate(()=>localStorage.getItem('asset-os:registry:v1'))
 expect(String(before||'')).not.toContain('Registered party one')
})
test('B2.1 denied Viewer role hides mutating controls but permits authenticated lifecycle evidence',async({page})=>{
 await setup(page,{membership:{...member,role:'VIEWER'}})
 await page.route(api+'/v1/assets/'+record.id+'/lifecycle',route=>route.fulfill({
  status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},
  body:JSON.stringify({asset:record,transitions:[],acquisition:null,ownershipInterests:[],ownershipChanges:[],disposition:null})
 }))
 await authenticate(page)
 await expect(page.getByText('Server certified car')).toBeVisible()
 await page.goto('./#/server-registry/asset/'+record.id)
 await expect(page.getByRole('button',{name:/Acquisition, lifecycle & ownership/})).toBeVisible()
 await page.getByRole('button',{name:/Acquisition, lifecycle & ownership/}).click()
 await expect(page.getByText('Your verified role is read-only.')).toBeVisible()
 await expect(page.getByRole('button',{name:'Begin acquisition'})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Record acquisition'})).toHaveCount(0)
})
test('B2.1 lifecycle server failure never falls back to browser-local preview records',async({page})=>{
 await setup(page)
 await page.route(api+'/v1/assets/'+record.id+'/lifecycle',route=>route.fulfill({
  status:503,contentType:'application/json',
  headers:{'access-control-allow-origin':'*'},body:JSON.stringify({
   error:{code:'DATABASE_NOT_READY',message:'Protected staging backend unavailable',requestId:'ci-id'}
  })
 }))
 await authenticate(page)
 await expect(page.getByText('Server certified car')).toBeVisible()
 await page.goto('./#/server-registry/asset/'+record.id)
 await expect(page.getByRole('button',{name:/Acquisition, lifecycle & ownership/})).toBeVisible()
 await page.getByRole('button',{name:/Acquisition, lifecycle & ownership/}).click()
 await expect(page.getByRole('alert')).toContainText('DATABASE_NOT_READY')
 await expect(page.getByRole('heading',{name:'Complete initial acquisition'})).toHaveCount(0)
 await expect(page.getByText('No authenticated initial acquisition has been recorded.')).toHaveCount(0)
})
