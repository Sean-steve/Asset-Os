import {buildApp} from './app.js'
import {createPool} from './database.js'
import {serverConfig} from './config.js'

async function start(){
 const config=serverConfig()
 const app=buildApp(createPool())
 const close=async()=>{await app.close();process.exit(0)}
 process.once('SIGINT',()=>{void close()})
 process.once('SIGTERM',()=>{void close()})
 await app.listen({host:config.host,port:config.port})
}
start().catch(()=>{console.error('Asset OS API startup failed. Validate DB role, connection and listening address.');process.exitCode=1})
