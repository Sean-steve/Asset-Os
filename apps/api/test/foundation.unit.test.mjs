import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {readMigrations,applyMigrations} from '../dist/migrate.js'
import {serverConfig,migrationDatabaseUrl} from '../dist/config.js'
import {
 DecimalMoney,Currency,CreateAssetRequest,CreatePortfolioRequest,AssetListQuery,
 RequestContext,IdempotencyKey,API_VERSION,CONTRACT_VERSION,identityNotConfigured
} from '../dist/contracts.js'
import {buildApp} from '../dist/app.js'
import {withTenantTransaction} from '../dist/database.js'

const contract=JSON.parse(readFileSync(new URL('../openapi/openapi.json',import.meta.url),'utf8'))
const events=JSON.parse(readFileSync(new URL('../openapi/events.json',import.meta.url),'utf8'))
const migration=(name)=>readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8')
const poolStub=(role='asset_os_app',applied=5,restricted=true)=>({
 query:async()=>({rows:[{role,applied,restricted}]}),
 end:async()=>{}
})

test('B1 OpenAPI is versioned, identifies implemented registry and future routes',()=>{
 assert.equal(contract.openapi,'3.1.0')
 assert.equal(contract.info.version,'0.3.0-b2')
 assert.equal(contract.paths['/health/ready'].get.security.length,0)
 assert.equal(contract.paths['/v1/openapi.json'].get.security.length,0)
 assert.equal(contract.paths['/v1/assets'].get['x-runtime-status'],'IMPLEMENTED_B1')
 assert.deepEqual(contract.paths['/v1/assets'].post.security,[{KernelBearer:[]}])
 assert.ok(contract.components.securitySchemes.KernelBearer)
 assert.equal(contract.paths['/v1/assets'].post.parameters.some(x=>x.name==='Idempotency-Key'&&x.required),true)
 assert.ok(Object.keys(contract.paths).length>=16)
 assert.equal(API_VERSION,'1')
 assert.equal(CONTRACT_VERSION,'2026-10-31.b2')
})

test('unconfigured OIDC fails closed regardless of client headers',async()=>{
 const app=buildApp(poolStub())
 try{
  for(const headers of [{},{'x-tenant-id':'00000000-0000-4000-8000-000000000000'},
    {authorization:'Bearer allegedly-valid'},{'x-user-id':'fake-user',cookie:'session=fake'}]){
   const r=await app.inject({method:'GET',url:'/v1/assets',headers})
   assert.equal(r.statusCode,503)
   assert.equal(r.json().error.code,'IDENTITY_NOT_CONFIGURED')
   assert.ok(!r.body.includes('DATABASE_URL'))
  }
  const c=await app.inject('/v1/openapi.json')
  assert.equal(c.statusCode,200)
  assert.equal(c.json().openapi,'3.1.0')
 }finally{await app.close()}
})

test('liveness public but readiness demands restricted role and all five applied migrations',async()=>{
 const good=buildApp(poolStub())
 assert.equal((await good.inject('/health/live')).json().status,'ok')
 assert.equal((await good.inject('/health/ready')).statusCode,200)
 assert.equal((await good.inject('/v1/meta')).json().runtimeDomainAccess,'IDENTITY_NOT_CONFIGURED')
 await good.close()
 for(const fake of [poolStub('asset_os_owner'),poolStub('asset_os_app',2),poolStub('asset_os_app',3,false),{query:async()=>{throw Error('private-db-url')},end:async()=>{}}]){
  const app=buildApp(fake)
  const response=await app.inject('/health/ready')
  assert.equal(response.statusCode,503)
  assert.equal(response.json().database,'unavailable')
  assert.ok(!response.body.includes('private-db-url'))
  await app.close()
 }
})

test('runtime and migration credentials are mutually exclusive, TLS is mandatory in production',()=>{
 const good={DATABASE_URL:'postgresql://asset_os_app:password@localhost:5435/asset_os',PORT:'3001',NODE_ENV:'development'}
 assert.equal(serverConfig(good).port,3001)
 assert.throws(()=>serverConfig({DATABASE_URL:'postgres://asset_os_owner:pass@localhost/db'}),/asset_os_app/)
 assert.throws(()=>serverConfig({DATABASE_URL:'postgres://asset_os_app:pass@localhost/db',NODE_ENV:'production'}),/TLS/)
 assert.equal(serverConfig({DATABASE_URL:'postgres://asset_os_app:pass@db/asset_os?sslmode=require',NODE_ENV:'production'}).host,'127.0.0.1')
 assert.throws(()=>migrationDatabaseUrl({MIGRATION_DATABASE_URL:'postgres://asset_os_app:pass@db/asset_os'}),/Runtime credentials/)
 assert.equal(migrationDatabaseUrl({MIGRATION_DATABASE_URL:'postgres://asset_os_owner:pass@db/asset_os'}),'postgres://asset_os_owner:pass@db/asset_os')
})

test('API monetary DTOs are decimal strings, scoped categories and no client-assigned tenant/asset ID',()=>{
 assert.equal(DecimalMoney.safeParse('500.00').success,true)
 assert.equal(DecimalMoney.safeParse(500).success,false)
 assert.equal(DecimalMoney.safeParse('5e6').success,false)
 assert.equal(DecimalMoney.safeParse('-50').success,false)
 assert.equal(Currency.safeParse('KES').success,true)
 assert.equal(Currency.safeParse('kes').success,false)
 const draft=CreateAssetRequest.parse({name:'Rented workshop',category:'Real Estate',currency:'KES',registryValue:'100000.00'})
 assert.equal(draft.registryValue,'100000.00')
 assert.equal(draft.description,'')
 assert.equal(CreateAssetRequest.safeParse({...draft,tenantId:'another-tenant'}).success,false)
 assert.equal(CreatePortfolioRequest.safeParse({name:'Property',currency:'KES'}).success,true)
 assert.equal(AssetListQuery.parse({limit:'20'}).limit,20)
 assert.equal(AssetListQuery.safeParse({limit:'1000'}).success,false)
 assert.equal(IdempotencyKey.safeParse('request-asset-123').success,true)
 assert.equal(RequestContext.safeParse({tenantId:'invalid',subjectId:'invalid',requestId:'invalid',scopes:[]}).success,false)
 assert.equal(identityNotConfigured('x').error.code,'IDENTITY_NOT_CONFIGURED')
})

test('event contracts respect separate authorities, schema version and delivery boundary',()=>{
 assert.equal(events.transport,'NOT_CONFIGURED')
 assert.ok(events.allowedEmissions.some(e=>e.type==='asset.valuation.accepted.v1'&&e.recipient.includes('WEALTH_OS')))
 assert.ok(events.allowedConsumption.some(e=>e.producer==='FINANCE_OS'&&e.owner==='FINANCE_OS'))
 assert.ok(events.controls.includes('idempotent inbox'))
 const envelope=contract.components.schemas.EventEnvelope
 assert.ok(envelope.required.includes('tenantId'))
 assert.ok(envelope.required.includes('correlationId'))
 assert.ok(envelope.required.includes('schemaVersion'))
})

test('five checksummed migrations cover registry, RLS and B2 immutable lifecycle evidence',async()=>{
 const migrations=await readMigrations()
 assert.deepEqual(migrations.map(m=>m.version),['0001_tenants_registry','0002_domain_tables','0003_governance_rls','0004_b1_registry_security','0005_b2_lifecycle_integrity'])
 assert.ok(migrations.every(m=>m.sha256.length===64))
 const sql=migrations.map(m=>m.sql).join('\n')
 assert.ok((sql.match(/CREATE TABLE asset_os\./g)||[]).length>=30)
 assert.match(sql,/FORCE ROW LEVEL SECURITY/)
 assert.match(sql,/CREATE POLICY tenant_isolation/)
 assert.match(sql,/current_setting\('app\.tenant_id'/)
 assert.match(sql,/asset_os\.outbox_events/)
 assert.match(sql,/asset_os\.inbox_dedup/)
 assert.match(sql,/asset_os\.idempotency_keys/)
 assert.match(sql,/numeric\(20,2\)/i)
 assert.ok(!sql.includes('CREATE TABLE asset_os.ledger_entries'))
 assert.match(migration('0003_governance_rls.sql'),/CHECK\(connection_state='NOT_CONNECTED'\)/)
})

test('migration runner rolls back and rejects changed checksums',async()=>{
 const calls=[]
 const client={query:async(sql,args=[])=>{
  calls.push([sql,args])
  if(sql==='SELECT version,checksum FROM asset_os.schema_migrations')
   return {rows:[{version:'0001_tenants_registry',checksum:'x'.repeat(64)}]}
  return {rows:[]}
 }}
 await assert.rejects(()=>applyMigrations(client,[{version:'0001_tenants_registry',sha256:'a'.repeat(64),sql:'SELECT 1'}]),/Migration drift/)
 assert.ok(calls.some(x=>x[0]==='ROLLBACK'))
 assert.ok(!calls.some(x=>x[0]==='COMMIT'))
})

test('tenant transaction starts, scopes with set_config local, commits; errors roll back',async()=>{
 const calls=[]
 const client={query:async(sql)=>{calls.push(sql);return {rows:[]}},release:()=>calls.push('RELEASE')}
 const pool={connect:async()=>client}
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 const result=await withTenantTransaction(pool,id,async()=>42)
 assert.equal(result,42)
 assert.equal(calls[0],'BEGIN')
 assert.match(calls[1],/set_config\('app\.tenant_id',\$1,true\)/)
 assert.deepEqual(calls.slice(-2),['COMMIT','RELEASE'])
 calls.length=0
 await assert.rejects(()=>withTenantTransaction(pool,id,async()=>{throw Error('rollback-now')}),/rollback-now/)
 assert.ok(calls.includes('ROLLBACK'))
 assert.ok(!calls.includes('COMMIT'))
 await assert.rejects(()=>withTenantTransaction(pool,'invalid',async()=>null),/Invalid UUID|uuid/i)
})
