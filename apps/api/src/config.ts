import {z} from 'zod'
const Port=z.coerce.number().int().min(1).max(65535)
export function serverConfig(env:NodeJS.ProcessEnv=process.env){
 const url=env.DATABASE_URL
 if(!url)throw new Error('DATABASE_URL is required; use restricted asset_os_app role.')
 let parsed:URL
 try{parsed=new URL(url)}catch{throw new Error('DATABASE_URL must be a valid PostgreSQL URL.')}
 if(!['postgresql:','postgres:'].includes(parsed.protocol))throw new Error('PostgreSQL connection required.')
 if(decodeURIComponent(parsed.username)!=='asset_os_app')throw new Error('DATABASE_URL must use restricted asset_os_app identity, not migration owner.')
 if(env.NODE_ENV==='production'&&!['verify-full','verify-ca','require'].includes(parsed.searchParams.get('sslmode')||''))
  throw new Error('Production DATABASE_URL must require TLS.')
 return {databaseUrl:url,host:env.HOST||'127.0.0.1',port:Port.parse(env.PORT||'3001')}
}
export function migrationDatabaseUrl(env:NodeJS.ProcessEnv=process.env){
 if(!env.MIGRATION_DATABASE_URL)throw new Error('MIGRATION_DATABASE_URL is required; no runtime credential fallback.')
 let url:URL
 try{url=new URL(env.MIGRATION_DATABASE_URL)}catch{throw new Error('MIGRATION_DATABASE_URL is invalid.')}
 if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('Migration database must be PostgreSQL.')
 if(decodeURIComponent(url.username)==='asset_os_app')throw new Error('Runtime credentials may not execute schema migrations.')
 return env.MIGRATION_DATABASE_URL
}
