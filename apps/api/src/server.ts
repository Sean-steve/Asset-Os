import {buildApp} from './app.js'
import {createPool} from './database.js'
import {serverConfig} from './config.js'
import {createOidcVerifier} from './identity.js'

async function start(){
 const config=serverConfig()
 const verifier=createOidcVerifier(process.env)
 const app=buildApp(createPool(),verifier)
 const close=async()=>{await app.close();process.exit(0)}
 process.once('SIGINT',()=>{void close()})
 process.once('SIGTERM',()=>{void close()})
 await app.listen({host:config.host,port:config.port})
}
start().catch(()=>{console.error('Asset OS API startup failed. Validate restricted DB credentials, OIDC configuration and listener.');process.exitCode=1})
