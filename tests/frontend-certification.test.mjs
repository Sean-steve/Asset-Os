import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {screens} from '../src/inventory.ts'
import {initialRegistry,loadRegistry,STORE_KEY} from '../src/registry/core.ts'
import {netWorthPreview} from '../src/governance/core.ts'

const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
const browserSpec=readFileSync(new URL('../e2e/routes.spec.mjs',import.meta.url),'utf8')
test('release inventory is exactly 60 implemented primary experiences',()=>{
 assert.equal(screens.length,60)
 assert.equal(new Set(screens.map(s=>s.id)).size,60)
 assert.equal(screens.filter(s=>s.status==='implemented').length,60)
 assert.equal(screens.filter(s=>s.status==='planned').length,0)
 assert.deepEqual(screens.map(s=>s.id),Array.from({length:60},(_,i)=>i+1))
})
test('real Chromium gate exercises all roadmap entries, reloads, navigation and viewports',()=>{
 assert.match(browserSpec,/id<=60/)
 assert.match(browserSpec,/390,768,1440/)
 assert.match(browserSpec,/page\.reload\(\)/)
 assert.match(browserSpec,/page\.on\('pageerror'/)
})
test('dashboard no longer hardcodes fictitious asset trends and activity',()=>{
 assert.ok(app.includes('No historical valuation series yet'))
 assert.ok(app.includes('operationalEvents(store)'))
 assert.ok(app.includes('const notifications=alertsFor(store)'))
 assert.ok(app.includes('const recent=store.activity.slice(0,5)'))
 assert.ok(!app.includes('+12.8% this year'))
 assert.ok(!app.includes('Illustrative portfolio trend'))
 assert.ok(!app.includes('const trendData'))
 assert.ok(!app.includes('onPlanned(4,'))
})
test('main navigation supports keyboard skip without breaking hash routes',()=>{
 assert.ok(app.includes('Skip to main content'))
 assert.ok(app.includes('id="main-content" tabIndex={-1}'))
 assert.ok(!app.includes('href="#main-content"'))
})
test('dashboard never converts an unknown financed asset into asserted aggregate equity',()=>{
 assert.match(app,/const missingDebt=equityObservations\.filter\(v=>v\.method==='UNKNOWN'\)\.length/)
 assert.match(app,/equity===null\?'Unknown'/)
 const state=initialRegistry()
 const stored=loadRegistry({getItem:key=>key===STORE_KEY?JSON.stringify(state):null})
 assert.equal(stored.version,6)
 assert.equal(netWorthPreview(stored,'USD').indicativeNetEquity,0)
})
