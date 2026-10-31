import pg from 'pg'
import type {PoolClient} from 'pg'
import {Uuid} from './contracts.js'
import {serverConfig} from './config.js'
export function createPool(env:NodeJS.ProcessEnv=process.env){
 const config=serverConfig(env)
 return new pg.Pool({connectionString:config.databaseUrl,max:10,
  connectionTimeoutMillis:5000,idleTimeoutMillis:30000,application_name:'asset-os-api-b1'})
}
export type TenantSqlClient=Pick<PoolClient,'query'>
/** Use ONLY after a trusted issuer validates subject, tenant and scope. */
export async function withTenantTransaction<T>(
 pool:Pick<pg.Pool,'connect'>,verifiedTenantId:string,
 work:(client:TenantSqlClient)=>Promise<T>
):Promise<T>{
 const tenantId=Uuid.parse(verifiedTenantId)
 const client=await pool.connect()
 try{
  await client.query('BEGIN')
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId])
  const result=await work(client)
  await client.query('COMMIT')
  return result
 }catch(error){try{await client.query('ROLLBACK')}catch{/* preserve original error */}throw error}
 finally{client.release()}
}
export async function checkReadiness(pool:Pick<pg.Pool,'query'>){
 const result=await pool.query("SELECT current_user AS role, (SELECT NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS restricted, (SELECT count(*)::integer FROM asset_os.schema_migrations WHERE version IN ('0001_tenants_registry','0002_domain_tables','0003_governance_rls','0004_b1_registry_security')) AS applied")
 const row=result.rows[0] as {role:string;restricted:boolean;applied:number}|undefined
 return Boolean(row&&row.role==='asset_os_app'&&row.restricted===true&&row.applied===4)
}
