import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {generateKeyPair,exportJWK,SignJWT} from 'jose'
import {
 oidcConfiguration,createOidcVerifier,bearerToken,selectTenant,requireRole,ApiFault
} from '../dist/identity.js'
import {
 requestFingerprint,normalizedTags,parseCursor,etag,validateValuationDate
} from '../dist/registry.js'
import {PatchAssetRequest} from '../dist/contracts.js'
import {parseBootstrapArgs} from '../dist/bootstrap.js'

test('OIDC rejects absent, partial, non-HTTPS and off-origin authorities',()=>{
 assert.equal(oidcConfiguration({}),null)
 assert.equal(createOidcVerifier({}),null)
 assert.throws(()=>oidcConfiguration({OIDC_ISSUER:'https://issuer.example',OIDC_AUDIENCE:'asset-os-api'}),/all be configured/)
 assert.throws(()=>oidcConfiguration({OIDC_ISSUER:'http://example.com',OIDC_AUDIENCE:'asset-os-api',OIDC_JWKS_URL:'http://example.com/jwks'}),/HTTPS/)
 assert.throws(()=>oidcConfiguration({OIDC_ISSUER:'https://issuer.example',OIDC_AUDIENCE:'asset-os-api',OIDC_JWKS_URL:'https://other.example/keys'}),/share the pinned issuer origin/)
 assert.throws(()=>oidcConfiguration({OIDC_ISSUER:'https://user:pass@issuer.example',OIDC_AUDIENCE:'asset-os-api',OIDC_JWKS_URL:'https://issuer.example/keys'}),/credentials/)
})
test('OIDC verifies signed RS256 tokens with pinned issuer/audience and lifetime',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256')
 const jwk={...await exportJWK(publicKey),kid:'unit-test-key',use:'sig',alg:'RS256'}
 const server=createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({keys:[jwk]}))})
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 try{
  const address=server.address()
  assert.ok(address&&typeof address==='object')
  const issuer='http://127.0.0.1:'+address.port+'/issuer'
  const verifier=createOidcVerifier({NODE_ENV:'test',OIDC_ALLOW_TEST_LOOPBACK:'true',
   OIDC_ISSUER:issuer,OIDC_AUDIENCE:'asset-os-api',OIDC_JWKS_URL:'http://127.0.0.1:'+address.port+'/jwks'})
  assert.ok(verifier)
  const sign=(options={})=>new SignJWT({scope:'asset:read'})
   .setProtectedHeader({alg:'RS256',kid:'unit-test-key'})
   .setIssuer(options.issuer||issuer).setAudience(options.audience||'asset-os-api')
   .setSubject('test-subject').setIssuedAt()
   .setExpirationTime(options.expiry||'15m').sign(privateKey)
  assert.deepEqual(await verifier.verify(await sign()),{issuer,subject:'test-subject'})
  await assert.rejects(()=>verifier.verify(await sign({audience:'wrong-api'})))
  await assert.rejects(()=>verifier.verify(await sign({issuer:'http://127.0.0.1:'+address.port+'/other'})))
  await assert.rejects(()=>verifier.verify(await sign({expiry:'-1h'})))
  await assert.rejects(()=>verifier.verify('aaa.bbb.ccc'))
 }finally{await new Promise((r,j)=>server.close(e=>e?j(e):r()))}
})
test('tenant selection and roles are not inferred from unverified client strings',()=>{
 assert.throws(()=>selectTenant('fake-tenant'),ApiFault)
 assert.equal(selectTenant('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
 assert.throws(()=>bearerToken('Bearer bad token'),ApiFault)
 assert.equal(bearerToken('Bearer aaa.bbb.ccc'),'aaa.bbb.ccc')
 const role={issuer:'https://issuer',subject:'verified',tenantId:'t',identityId:'i',role:'VIEWER'}
 assert.throws(()=>requireRole(role,'write'),/cannot modify/)
 assert.doesNotThrow(()=>requireRole(role,'read'))
 assert.doesNotThrow(()=>requireRole({...role,role:'OPERATIONS'},'write'))
})
test('fingerprints are order-independent and tag/date validations fail closed',()=>{
 assert.equal(requestFingerprint({b:2,a:{z:1,x:2}}),requestFingerprint({a:{x:2,z:1},b:2}))
 assert.notEqual(requestFingerprint({name:'a'}),requestFingerprint({name:'b'}))
 assert.deepEqual(normalizedTags(['Fleet','A']),['A','Fleet'])
 assert.throws(()=>normalizedTags(['Fleet','fleet']),/unique/)
 assert.throws(()=>validateValuationDate({registryValue:'50.00',valueAsOf:null}),/valuation effective date/)
 assert.equal(etag(4),'"4"')
 assert.throws(()=>parseCursor('invalid'),/cursor/)
 assert.equal(PatchAssetRequest.safeParse({tenantId:'fake'}).success,false)
 assert.equal(PatchAssetRequest.safeParse({lifecycle:'ACTIVE'}).success,false)
 assert.equal(PatchAssetRequest.safeParse({name:'Test'}).success,true)
})
test('operator bootstrap requires an actual private token file and explicit confirm',()=>{
 assert.throws(()=>parseBootstrapArgs(['--tenant-slug','my-company','--tenant-name','My company','--token-file','/tmp/token']),/confirm/)
 assert.deepEqual(parseBootstrapArgs(['--tenant-slug','my-company','--tenant-name','My company','--token-file','/tmp/token','--confirm']),{
  slug:'my-company',name:'My company',tokenFile:'/tmp/token',confirm:true
 })
})
