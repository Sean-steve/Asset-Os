import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 initialRegistry,loadRegistry,saveRegistry,createAsset,STORE_KEY
} from '../src/registry/core.ts'
import {beginAcquisition,completeAcquisition,EMPTY_COSTS} from '../src/lifecycle/core.ts'
import {createFacility,observeBalance,recordFlow,recordValuation} from '../src/economics/core.ts'
import {createPlan,addEvidence} from '../src/operations/core.ts'
import {createPortfolio,addMember,assessRisk,DEFAULT_RISK_SCORES} from '../src/intelligence/core.ts'
import {
 DEFAULT_SETTINGS,emptyGovernanceData,validGovernanceData,SYSTEM_IDS,ROLES,ROLE_IDS,
 netWorthPreview,wealthHandoffPreview,saveSettings,requestConnectionPlan,
 cancelConnectionPlan,integrationView,kernelCandidates,draftKernelAction,
 setDraftStatus,alertsFor,setAlertDisposition,reportPreview,csvCell,reportCsv,
 auditRows,onboardingSteps
} from '../src/governance/core.ts'
import {screens} from '../src/inventory.ts'

const AT='2026-10-31T12:00:00Z'
const noGenerated=a=>{const {id,number,createdAt,updatedAt,origin,...fields}=a;void id;void number;void createdAt;void updatedAt;void origin;return structuredClone(fields)}
function acquired(){
 let s=initialRegistry()
 s=createAsset(s,{...noGenerated(s.records[0]),name:'Phase 6 asset',lifecycle:'PLANNED',operational:'IDLE',acquiredOn:'',value:1200,equity:1000,location:'Sample'},AT)
 const id=s.records[0].id
 s=completeAcquisition(beginAcquisition(s,id,AT),{assetId:id,method:'PURCHASE',acquiredOn:'2026-10-01',counterparty:'Example',reference:'',notes:'',costs:{...EMPTY_COSTS,purchase:900}},AT)
 return {s,id}
}
const withPlan=(s,id,when='2026-11-04')=>createPlan(s,{assetId:id,title:'Inspection',description:'Browser reminder',interval:1,unit:'MONTHS',nextDue:when},AT)
test('Screens 51–60 have dedicated Phase 6 routes, no screen is marked planned',()=>{
 assert.equal(screens.length,60)
 assert.deepEqual(screens.slice(50).map(s=>s.id),[51,52,53,54,55,56,57,58,59,60])
 assert.equal(screens.filter(s=>s.status==='implemented').length,60)
 assert.equal(screens.filter(s=>s.status==='planned').length,0)
 const ui=readFileSync(new URL('../src/governance/GovernanceExperience.tsx',import.meta.url),'utf8')
 const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
 for(const name of ['wealth-interface','kernel-actions','notifications','reports','integrations','integrations/','team-access','security-audit','settings','onboarding'])
  assert.ok(ui.includes("'"+name),name)
 assert.ok(app.includes("GovernanceExperience"))
 assert.ok(app.includes("const localAlerts=alertsFor(store)"))
 assert.ok(!app.includes('Show demo notifications'))
})
test('v1–v5 snapshots migrate to v6 without losing earlier phase arrays or asset IDs',()=>{
 const {s,id}=acquired()
 const p=withPlan(s,id)
 const portfolio=createPortfolio(p,{name:'Test portfolio',currency:'KES',description:''},AT)
 const withValue=recordValuation(portfolio,{assetId:id,date:'2026-10-12',amount:1250,source:'Sample',method:'MANUAL_ESTIMATE',confidence:'LOW',notes:''},AT)
 for(const version of [1,2,3,4,5]){
  const legacy=structuredClone(withValue);legacy.version=version
  if(version<6)delete legacy.phase6
  if(version<5)delete legacy.phase5
  if(version<4)delete legacy.phase4
  if(version<3)delete legacy.phase3
  if(version<2)delete legacy.phase2
  const upgraded=loadRegistry({getItem:key=>{assert.equal(key,STORE_KEY);return JSON.stringify(legacy)}})
  assert.equal(upgraded.version,6)
  assert.equal(upgraded.records[0].id,id)
  assert.deepEqual(upgraded.phase6,emptyGovernanceData())
  if(version>=2)assert.equal(upgraded.phase2.acquisitions.length,1)
  if(version>=3)assert.equal(upgraded.phase3.valuations.length,1)
  if(version>=4)assert.equal(upgraded.phase4.plans.length,1)
  if(version>=5)assert.equal(upgraded.phase5.portfolios.length,1)
  const persisted=new Map()
  assert.equal(saveRegistry(upgraded,{setItem:(k,value)=>persisted.set(k,value)}),true)
  assert.equal(JSON.parse(persisted.get(STORE_KEY)).version,6)
 }
})
test('invalid v6 governance state is rejected rather than treated as authenticated',()=>{
 const s=initialRegistry()
 assert.equal(validGovernanceData(s.phase6),true)
 assert.equal(validGovernanceData({settings:{},drafts:[],dispositions:[],integrationRequests:[]}),false)
 const invalid={...s,phase6:{...s.phase6,settings:{...s.phase6.settings,previewRole:'SUPER_ADMIN'}}}
 const recovered=loadRegistry({getItem:()=>JSON.stringify(invalid)})
 assert.equal(recovered.phase6.settings.previewRole,DEFAULT_SETTINGS.previewRole)
})
test('initial governance state is empty with no identities, integration handshakes or notifications',()=>{
 const s=initialRegistry()
 assert.deepEqual(s.phase6,emptyGovernanceData())
 assert.equal(kernelCandidates(s,'2026-10-31').length,0)
 assert.equal(alertsFor(s,'2026-10-31').length,0)
 assert.ok(!('connectedAccounts' in s.phase6))
 assert.ok(!('credentials' in s.phase6))
})
test('net worth preview is per-currency and excludes planned, disposed, other-currency assets',()=>{
 const {s,id}=acquired()
 const expected=s.records.filter(a=>a.currency==='KES'&&['ACQUIRED','ACTIVE','SUSPENDED'].includes(a.lifecycle))
  .reduce((sum,a)=>sum+a.value,0)
 const result=netWorthPreview(s,'KES')
 assert.equal(result.registryValue,expected)
 assert.ok(result.debtFacts.some(x=>x.assetId===id))
 assert.ok(result.assets.every(a=>a.currency==='KES'))
 assert.ok(!netWorthPreview(s,'USD').assets.some(a=>a.currency==='KES'))
 assert.throws(()=>netWorthPreview(s,'invalid'),/reporting currency/)
})
test('missing loan balance does not become zero liability or asserted net equity',()=>{
 const {s,id}=acquired()
 const f=createFacility(s,{assetId:id,financierLabel:'Example',principal:700,interestRatePct:10,startOn:'2026-10-02',maturesOn:null,frequency:'MONTHLY',reference:'',notes:''},AT)
 const unknown=netWorthPreview(f,'KES')
 assert.equal(unknown.unknownDebtAssets,1)
 assert.equal(unknown.indicativeNetEquity,null)
 const facilityId=f.phase3.facilities[0].id
 const measured=observeBalance(f,{facilityId,observedOn:'2026-10-24',balance:705,sourceLabel:'Manual statement',notes:''},AT)
 const complete=netWorthPreview(measured,'KES')
 assert.equal(complete.unknownDebtAssets,0)
 assert.equal(complete.indicativeNetEquity,complete.registryValue-complete.debtObserved)
 assert.ok(complete.debtObserved>=705)
})
test('Wealth OS projection is minimum-necessary, read-only, and explicitly disconnected',()=>{
 const {s}=acquired()
 const handoff=wealthHandoffPreview(s,'KES','2026-10-31')
 assert.equal(handoff.transport,'NOT_CONNECTED')
 assert.equal(handoff.authority,'ASSET_OS_BROWSER_PROJECTION_ONLY')
 assert.equal(handoff.quality,'UNVERIFIED_USER_ENTRY')
 assert.equal(handoff.currency,'KES')
 const json=JSON.stringify(handoff)
 for(const key of ['ownerLabel','counterparty','policyReference','tenantSecret','credentials','documents'])assert.ok(!json.includes(key))
 assert.ok(handoff.restrictions.includes('Never posted to Wealth OS'))
 assert.equal(s.phase6.integrationRequests.length,0)
})
test('changing preview settings affects only local settings and appends a non-authoritative event',()=>{
 const s=initialRegistry()
 const n=saveSettings(s,{reportCurrency:'USD',reminderHorizonDays:7,notificationsEnabled:false,previewRole:'VIEWER',welcomeDismissed:true},AT)
 assert.equal(n.phase6.settings.reportCurrency,'USD')
 assert.equal(n.phase6.settings.previewRole,'VIEWER')
 assert.equal(n.activity[0].event,'PREVIEW_SETTINGS_CHANGED')
 assert.equal(s.phase6.settings.reportCurrency,'KES')
 assert.ok(!('kernelPolicy' in n))
 assert.throws(()=>saveSettings(s,{...s.phase6.settings,reminderHorizonDays:2},AT),/Invalid settings/)
})
test('integration hub has six contract entries, none can be marked connected',()=>{
 const s=initialRegistry()
 assert.equal(SYSTEM_IDS.length,6)
 for(const id of SYSTEM_IDS){
  const view=integrationView(s,id)
  assert.equal(view.status,'NOT_CONNECTED')
  assert.equal(view.credentialsPresent,false)
  assert.equal(view.handshakeVerified,false)
 }
 assert.throws(()=>integrationView(s,'FAKE_OS'),/Unknown integration/)
})
test('integration planning intent is local and never opens a network connection',()=>{
 const s=initialRegistry()
 const p=requestConnectionPlan(s,'FINANCE_OS','Only retrieve reconciled allocations',AT)
 assert.equal(p.phase6.integrationRequests.length,1)
 assert.equal(p.phase6.integrationRequests[0].status,'REQUESTED')
 assert.equal(integrationView(p,'FINANCE_OS').status,'NOT_CONNECTED')
 assert.ok(integrationView(p,'FINANCE_OS').request)
 assert.throws(()=>requestConnectionPlan(p,'FINANCE_OS','Duplicate',AT),/already recorded/)
 assert.throws(()=>requestConnectionPlan(s,'FINANCE_OS','',AT),/Integration purpose/)
 const withdrawn=cancelConnectionPlan(p,'FINANCE_OS',AT)
 assert.equal(integrationView(withdrawn,'FINANCE_OS').request,null)
 assert.equal(withdrawn.activity[0].event,'INTEGRATION_PLAN_RECORDED')
})
test('operational candidates are generated only from entered dates and local horizon',()=>{
 const {s,id}=acquired()
 const withDates=withPlan(s,id,'2026-11-04')
 const c=kernelCandidates(withDates,'2026-10-31')
 assert.equal(c.length,1)
 assert.equal(c[0].title,'Inspection')
 assert.equal(c[0].assetId,id)
 const short=saveSettings(withDates,{...withDates.phase6.settings,reminderHorizonDays:7},AT)
 assert.equal(kernelCandidates(short,'2026-10-31').length,1)
 const earlier=withPlan(s,id,'2026-12-12')
 assert.equal(kernelCandidates(earlier,'2026-10-31').length,0)
})
test('local action drafts do not issue a Kernel mission or schedule write',()=>{
 const {s,id}=acquired()
 const ready=withPlan(s,id)
 const candidate=kernelCandidates(ready,'2026-10-31')[0]
 let drafted=draftKernelAction(ready,candidate.key,AT)
 assert.equal(drafted.phase6.drafts.length,1)
 assert.equal(drafted.phase6.drafts[0].status,'DRAFT')
 assert.equal(drafted.phase6.drafts[0].assetId,id)
 assert.ok(!('kernelSchedules' in drafted))
 assert.ok(!('missionTasks' in drafted))
 assert.throws(()=>draftKernelAction(drafted,candidate.key,AT),/already exists/)
 drafted=setDraftStatus(drafted,drafted.phase6.drafts[0].id,'REVIEWED_LOCALLY',AT)
 assert.equal(drafted.phase6.drafts[0].status,'REVIEWED_LOCALLY')
 assert.throws(()=>setDraftStatus(drafted,drafted.phase6.drafts[0].id,'DISMISSED',AT),/Only draft/)
 assert.ok(drafted.activity.some(a=>a.event==='KERNEL_ACTION_DRAFT_CHANGED'))
})
test('dismissing an action draft permits a new local draft while retaining history',()=>{
 const {s,id}=acquired()
 const ready=withPlan(s,id),key=kernelCandidates(ready,'2026-10-31')[0].key
 let next=draftKernelAction(ready,key,AT)
 next=setDraftStatus(next,next.phase6.drafts[0].id,'DISMISSED',AT)
 next=draftKernelAction(next,key,AT)
 assert.equal(next.phase6.drafts.length,2)
 assert.equal(next.phase6.drafts.filter(d=>d.status==='DISMISSED').length,1)
})
test('notifications are derived, acknowledge/snooze/reset without delivery',()=>{
 const {s,id}=acquired()
 const ready=withPlan(s,id,'2026-11-01')
 const all=alertsFor(ready,'2026-10-31')
 assert.equal(all.length,1)
 assert.equal(all[0].state,'UNREAD')
 assert.equal(all[0].severity,'SOON')
 const checked=setAlertDisposition(ready,all[0].key,'ACKNOWLEDGED',null,AT)
 assert.equal(alertsFor(checked,'2026-10-31')[0].state,'ACKNOWLEDGED')
 const snoozed=setAlertDisposition(checked,all[0].key,'SNOOZED','2026-11-05',AT)
 assert.equal(alertsFor(snoozed,'2026-10-31')[0].state,'SNOOZED')
 assert.equal(alertsFor(snoozed,'2026-11-06')[0].state,'UNREAD')
 assert.throws(()=>setAlertDisposition(ready,all[0].key,'SNOOZED','2026-10-30',AT),/future date/)
 const reset=setAlertDisposition(snoozed,all[0].key,'UNREAD',null,AT)
 assert.equal(reset.phase6.dispositions.length,0)
 assert.ok(!('pushReceipts' in reset))
})
test('disabling reminders hides derived cards but does not erase recorded events',()=>{
 const {s,id}=acquired()
 const ready=withPlan(s,id)
 assert.equal(alertsFor(ready,'2026-10-31').length,1)
 const disabled=saveSettings(ready,{...ready.phase6.settings,notificationsEnabled:false},AT)
 assert.equal(alertsFor(disabled,'2026-10-31').length,0)
 assert.equal(disabled.phase4.plans.length,1)
})
test('CSV cells protect formula prefixes even with leading whitespace, quotes and line breaks',()=>{
 for(const s of ['=1+2','+cmd','-cmd','@SUM(A1:A2)','  =HYPERLINK("https://example.com")','\t=2+2','\n+1'])
  assert.ok(csvCell(s).startsWith("\"'"),'formula escaped: '+s)
 assert.equal(csvCell('Normal "asset"'),'"Normal ""asset"""')
 const report={name:'sample',headings:['Name','Value'],rows:[['=SUM(A1:A2)','1200']],warning:'preview'}
 const csv=reportCsv(report)
 assert.ok(csv.includes("\"'=SUM(A1:A2)\""))
 assert.ok(csv.includes('\r\n'))
})
test('report exports use explicit minimal allowlist, never owner fields or document references',()=>{
 const {s,id}=acquired()
 const leaked=addEvidence(s,{assetId:id,kind:'OWNERSHIP',title:'Confidential doc label',reference:'SECRET_DOC_314',issuedOn:null,expiresOn:null,notes:'Sensitive note'},AT)
 const p=reportPreview(leaked,'ASSET_REGISTER','KES')
 assert.ok(p.rows.length>0)
 assert.deepEqual(p.headings,['Asset ID','Asset name','Category','Lifecycle','Currency','Registry value','Valuation review status'])
 const content=reportCsv(p)
 for(const secret of ['ownerLabel','SECRET_DOC_314','Confidential doc label','policyReference'])assert.ok(!content.includes(secret))
 assert.throws(()=>reportPreview(s,'UNKNOWN','KES'),/Unknown report/)
})
test('operational and portfolio summary reports use only current entered facts in selected currency',()=>{
 const {s,id}=acquired()
 let next=withPlan(s,id,'2026-11-05')
 next=createPortfolio(next,{name:'Local portfolio',description:'',currency:'KES'},AT)
 next=addMember(next,next.phase5.portfolios[0].id,id,AT)
 const ops=reportPreview(next,'OPERATIONS_CALENDAR','KES')
 assert.ok(ops.rows.some(r=>r.includes('2026-11-05')))
 const port=reportPreview(next,'PORTFOLIO_SUMMARY','KES')
 assert.equal(port.rows.length,1)
 assert.ok(port.rows[0].includes('Local portfolio'))
 assert.equal(reportPreview(next,'PORTFOLIO_SUMMARY','USD').rows.length,0)
})
test('audit search reads only local domain activity and never asserts trusted identities',()=>{
 const {s,id}=acquired()
 const next=withPlan(s,id)
 const result=auditRows(next,'Maintenance','MAINTENANCE_PLAN_CREATED')
 assert.equal(result.length,1)
 assert.match(result[0].details,/Recurring maintenance/)
 assert.equal(auditRows(next,'nonexistent').length,0)
 assert.ok(!('signature' in result[0]))
 assert.ok(!('trustedActor' in result[0]))
})
test('roles are explanatory templates, not registered accounts or permissions',()=>{
 const s=initialRegistry()
 assert.equal(ROLE_IDS.length,4)
 assert.ok(ROLES.VIEWER.illustrativeCapabilities.some(x=>x.includes('No asset mutation')))
 assert.ok(!('teamMembers' in s.phase6))
 assert.ok(!('roleAssignments' in s.phase6))
})
test('onboarding counts only user-created asset records and actual steps',()=>{
 const initial=initialRegistry()
 const todo=onboardingSteps(initial)
 assert.equal(todo.length,6)
 assert.equal(todo[0].complete,false)
 assert.ok(todo.every(x=>!x.complete))
 const {s}=acquired()
 const changed=onboardingSteps(s)
 assert.equal(changed[0].complete,true)
 assert.equal(changed[1].complete,true)
 assert.equal(changed[2].complete,false)
 assert.equal(changed[3].complete,false)
})
test('no Phase 6 flow performs an external write or claims verified connections',()=>{
 const {s,id}=acquired()
 const state=requestConnectionPlan(withPlan(s,id),'WEALTH_OS','Review a future projection contract',AT)
 const candidate=kernelCandidates(state,'2026-10-31')[0]
 const drafted=draftKernelAction(state,candidate.key,AT)
 assert.equal(integrationView(drafted,'WEALTH_OS').status,'NOT_CONNECTED')
 assert.equal(wealthHandoffPreview(drafted,'KES').transport,'NOT_CONNECTED')
 assert.ok(!('identityService' in drafted))
 assert.ok(!('financeLedger' in drafted))
 assert.ok(!('missionApiResult' in drafted))
})
