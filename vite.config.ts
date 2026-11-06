import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {readFileSync} from 'node:fs'
import path from 'node:path'

// Runtime config exists ONLY in the Vite dev server when explicitly enabled.
// Production vite build/GitHub Pages never receives local endpoints or hints.
function localRuntime():Plugin{
 return {
  name:'asset-os-loopback-dev-runtime',
  configureServer(server){
   server.middlewares.use((req,res,next)=>{
    if(process.env.ASSET_OS_LOCAL_MODE!=='yes'||(req.url||'').split('?')[0]!=='/Asset-Os/asset-runtime.json')
     return next()
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||'')){
     res.writeHead(403).end();return
    }
    let id=''
    try{id=readFileSync(path.resolve('.local/tenant-id'),'utf8').trim()}catch{/* first owner not enrolled yet */}
    const config:Record<string,string>={
     apiBaseUrl:'http://127.0.0.1:3001',issuer:'http://127.0.0.1:3003',
     authorizationEndpoint:'http://127.0.0.1:3003/authorize',
     tokenEndpoint:'http://127.0.0.1:3003/token',
     clientId:'asset-os-local-spa',audience:'asset-os-api'
    }
    if(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
     config.localDefaultTenantId=id
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
     'X-Content-Type-Options':'nosniff'}).end(JSON.stringify(config))
   })
  }
 }
}
export default defineConfig({
  plugins: [localRuntime(),react(),tailwindcss()],
  base: '/Asset-Os/',
  build: { outDir: 'dist', sourcemap: false },
})
