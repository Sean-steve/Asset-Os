import pg from 'pg'
import {readdir,readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {migrationDatabaseUrl} from './config.js'
export type Migration={version:string;sha256:string;sql:string}
export async function readMigrations(directory=path.resolve(fileURLToPath(new URL('../migrations/',import.meta.url)))){
 const filenames=(await readdir(directory)).filter(f=>/^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort()
 const migrations:Migration[]=[]
 for(const name of filenames){
  const sql=await readFile(path.join(directory,name),'utf8')
  migrations.push({version:name.replace(/\.sql$/,''),sha256:createHash('sha256').update(sql).digest('hex'),sql})
 }
 if(!migrations.length)throw new Error('No SQL migration files found.')
 return migrations
}
/** Apply all pending migrations in one advisory-locked transaction. */
export async function applyMigrations(client:Pick<pg.Client,'query'>,migrations:Migration[],checkOnly=false){
 await client.query('BEGIN')
 try{
  await client.query("SELECT pg_advisory_xact_lock(hashtext('asset-os-schema-migrations'))")
  if(!checkOnly){
   await client.query('CREATE SCHEMA IF NOT EXISTS asset_os')
   await client.query("CREATE TABLE IF NOT EXISTS asset_os.schema_migrations (version text PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())")
  }
  const existing=await client.query('SELECT version,checksum FROM asset_os.schema_migrations')
  const applied=new Map<string,string>(existing.rows.map((row:{version:string;checksum:string})=>[row.version,row.checksum.trim()]))
  const known=new Set(migrations.map(m=>m.version))
  for(const prior of applied.keys())if(!known.has(prior))throw new Error('Unknown applied migration: '+prior)
  let count=0
  for(const migration of migrations){
   const checksum=applied.get(migration.version)
   if(checksum&&checksum!==migration.sha256)throw new Error('Migration drift detected: '+migration.version)
   if(checksum)continue
   if(checkOnly)throw new Error('Pending migration: '+migration.version)
   await client.query(migration.sql)
   await client.query('INSERT INTO asset_os.schema_migrations(version,checksum) VALUES($1,$2)',[migration.version,migration.sha256])
   count++
  }
  await client.query('COMMIT')
  return count
 }catch(error){await client.query('ROLLBACK');throw error}
}
async function main(){
 const client=new pg.Client({connectionString:migrationDatabaseUrl(),application_name:'asset-os-migrator-b0'})
 try{
  await client.connect()
  const count=await applyMigrations(client,await readMigrations(),process.argv.includes('--check'))
  console.info(count===0?'Asset OS schema is current.':count+' Asset OS migration(s) applied.')
 }finally{await client.end()}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 main().catch(()=>{console.error('Asset OS database migration failed. Check DB role and schema migration status.');process.exitCode=1})
}
