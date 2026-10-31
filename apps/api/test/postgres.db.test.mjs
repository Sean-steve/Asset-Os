import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import pg from 'pg'
import {readMigrations,applyMigrations} from '../dist/migrate.js'
import {createPool,withTenantTransaction,checkReadiness} from '../dist/database.js'
import {buildApp} from '../dist/app.js'

const ownerUrl=process.env.MIGRATION_DATABASE_URL,appUrl=process.env.DATABASE_URL
if(!ownerUrl||!appUrl)throw Error('B0 database certification requires both migration and restricted runtime URLs.')
const owner=new pg.Client({connectionString:ownerUrl})
const pool=new pg.Pool({connectionString:appUrl,max:1,connectionTimeoutMillis:5000})
const tenantA=randomUUID(),tenantB=randomUUID(),assetA=randomUUID(),portfolioB=randomUUID()
const slug=()=>Math.random().toString(36).slice(2,12)
async function ownerInsertTenant(id){
 await owner.query('BEGIN')
 try{
  await owner.query("SELECT set_config('app.tenant_id',$1,true)",[id])
  await owner.query('INSERT INTO asset_os.tenants(id,slug,display_name) VALUES($1,$2,$3)',[id,'cert-'+slug(),'Certification tenant'])
  await owner.query('COMMIT')
 }catch(e){await owner.query('ROLLBACK');throw e}
}

test('PostgreSQL migration, schema checks, RLS and API readiness on real database',async()=>{
 await owner.connect()
 try{
  assert.equal(await applyMigrations(owner,await readMigrations(),true),0)
  assert.equal(await applyMigrations(owner,await readMigrations(),false),0)
  const table=await owner.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='asset_os' AND c.relkind='r' AND c.relname<>'schema_migrations'")
  assert.ok(table.rows.length>=30)
  assert.ok(table.rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity))
  const role=await pool.query('SELECT current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user')
  assert.equal(role.rows[0].role,'asset_os_app')
  assert.equal(role.rows[0].rolsuper,false)
  assert.equal(role.rows[0].rolbypassrls,false)
  assert.equal(await checkReadiness(pool),true)
  await ownerInsertTenant(tenantA)
  await ownerInsertTenant(tenantB)
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM asset_os.tenants')).rows[0].count,0)
  assert.equal((await withTenantTransaction(pool,tenantA,async c=>(await c.query('SELECT id FROM asset_os.tenants')).rows)).length,1)
  assert.equal((await withTenantTransaction(pool,tenantB,async c=>(await c.query('SELECT id FROM asset_os.tenants')).rows)).length,1)
  const app=buildApp(pool)
  try{
   assert.equal((await app.inject('/health/ready')).statusCode,200)
   const fake=await app.inject({method:'POST',url:'/v1/assets',headers:{
    authorization:'Bearer fake', 'x-tenant-id':tenantA,'idempotency-key':'request-asset-123'
   },payload:{name:'Fake data',currency:'KES',category:'Vehicles'}})
   assert.equal(fake.statusCode,503)
   assert.equal(fake.json().error.code,'IDENTITY_NOT_CONFIGURED')
   assert.equal((await withTenantTransaction(pool,tenantA,async c=>(await c.query('SELECT count(*)::int AS count FROM asset_os.assets')).rows[0].count)),0)
  }finally{
   // buildApp owns and closes injected pool; construct a fresh pool for RLS tests below.
   await app.close()
  }
 }finally{await owner.end()}
})
test('RLS isolates tenants, cross-tenant foreign keys, append-only audit and transaction resets',async()=>{
 const p=new pg.Pool({connectionString:appUrl,max:1})
 try{
  await withTenantTransaction(p,tenantA,async c=>{
   await c.query('INSERT INTO asset_os.assets(id,tenant_id,asset_number,name,category,currency,registry_value) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [assetA,tenantA,'CERT-001','Isolation demonstration','Vehicles','KES','1234.56'])
   await c.query('INSERT INTO asset_os.audit_events(tenant_id,request_id,event_kind,subject_kind,subject_id) VALUES($1,$2,$3,$4,$5)',
    [tenantA,randomUUID(),'ASSET_REGISTERED','ASSET',assetA])
   return true
  })
  const own=await withTenantTransaction(p,tenantA,async c=>(await c.query('SELECT id,registry_value FROM asset_os.assets')).rows)
  const foreign=await withTenantTransaction(p,tenantB,async c=>(await c.query('SELECT id FROM asset_os.assets')).rows)
  assert.equal(own.length,1)
  assert.equal(own[0].registry_value,'1234.56')
  assert.equal(foreign.length,0)
  assert.equal((await p.query('SELECT id FROM asset_os.assets')).rows.length,0)
  await assert.rejects(()=>withTenantTransaction(p,tenantB,async c=>
   c.query('INSERT INTO asset_os.asset_tags(tenant_id,asset_id,tag) VALUES($1,$2,$3)',[tenantB,assetA,'cross-tenant'])),/foreign key|violates/)
  await assert.rejects(()=>withTenantTransaction(p,tenantB,async c=>
   c.query('UPDATE asset_os.assets SET name=$1 WHERE id=$2 RETURNING id',['illegal',assetA]).then(r=>{if(r.rowCount!==0)throw Error('cross-tenant write succeeded');throw Error('tenant block verified')})),/tenant block verified/)
  await assert.rejects(()=>withTenantTransaction(p,tenantA,async c=>
   c.query('UPDATE asset_os.audit_events SET event_kind=$1',['tamper'])),/permission denied/)
  await assert.rejects(()=>withTenantTransaction(p,tenantA,async c=>
   c.query('INSERT INTO asset_os.assets(tenant_id,asset_number,name,category,currency,registry_value) VALUES($1,$2,$3,$4,$5,$6)',
   [tenantA,'BAD-NEG','Invalid','Business','KES','-1.00'])),/check constraint/)
  await assert.rejects(()=>withTenantTransaction(p,tenantA,async c=>{
   await c.query('SELECT 1')
   throw Error('forced rollback')
  }),/forced rollback/)
  assert.equal((await p.query("SELECT current_setting('app.tenant_id',true) AS tenant")).rows[0].tenant,'')
  // Asset can never be silently moved to a different tenant.
  await assert.rejects(()=>withTenantTransaction(p,tenantA,async c=>
   c.query('UPDATE asset_os.assets SET tenant_id=$1 WHERE id=$2',[tenantB,assetA])),/row-level security|foreign key|violates/)
  await withTenantTransaction(p,tenantB,async c=>{
   await c.query('INSERT INTO asset_os.portfolios(id,tenant_id,name,currency) VALUES($1,$2,$3,$4)',[portfolioB,tenantB,'Other tenant','KES'])
  })
  await assert.rejects(()=>withTenantTransaction(p,tenantA,async c=>
   c.query('INSERT INTO asset_os.portfolio_memberships(tenant_id,portfolio_id,asset_id) VALUES($1,$2,$3)',[tenantA,portfolioB,assetA])),/foreign key/)
  // No network delivery in B0: recorded event stays PENDING.
  await withTenantTransaction(p,tenantA,async c=>{
   await c.query("INSERT INTO asset_os.outbox_events(tenant_id,type,schema_version,aggregate_kind,aggregate_id,payload,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [tenantA,'asset.registered.v1',1,'ASSET',assetA,JSON.stringify({assetId:assetA}),randomUUID()])
  })
  const outbox=await withTenantTransaction(p,tenantA,async c=>(await c.query('SELECT delivery_state FROM asset_os.outbox_events')).rows)
  assert.deepEqual(outbox.map(x=>x.delivery_state),['PENDING'])
  assert.equal((await withTenantTransaction(p,tenantB,async c=>(await c.query('SELECT id FROM asset_os.outbox_events')).rows)).length,0)
 }finally{await p.end()}
})
