import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addCategory, addSubcategory, createAsset, createTag, deleteTag, distinctCurrencies,
  initialRegistry, loadRegistry, renameTag, saveRegistry, searchAssets,
  sumInCurrency, updateAsset, validateAsset, EMPTY_SEARCH, STORE_KEY
} from '../src/registry/core.ts'
import { screens } from '../src/inventory.ts'

const asInput = (record) => {
  const { id, number, createdAt, updatedAt, origin, ...input } = record
  void id; void number; void createdAt; void updatedAt; void origin
  return structuredClone(input)
}
const today='2026-10-31T12:00:00.000Z'

test('phases one and two have 20 implemented screens and 40 planned',()=>{
  assert.equal(screens.length,60)
  assert.deepEqual(screens.slice(0,10).map(s=>s.id),[1,2,3,4,5,6,7,8,9,10])
  assert.equal(screens.filter(s=>s.status==='implemented').length,20)
  assert.equal(screens.filter(s=>s.status==='planned').length,40)
})

test('synthetic seed contains five distinct assets, KES totals reconcile',()=>{
  const state=initialRegistry()
  assert.equal(state.records.length,5)
  assert.equal(new Set(state.records.map(r=>r.id)).size,5)
  assert.equal(sumInCurrency(state.records,'value','KES'),24850000)
  assert.equal(sumInCurrency(state.records,'equity','KES'),17800000)
  assert.ok(state.records.every(r=>r.origin==='sample'))
})

test('asset create creates immutable identifier and real local activity record',()=>{
  const before=initialRegistry()
  const input={...asInput(before.records[0]),lifecycle:'PLANNED',operational:'IDLE',name:'Test warehouse',value:1000000,equity:500000}
  const after=createAsset(before,input,today)
  assert.equal(before.records.length,5)
  assert.equal(after.records.length,6)
  assert.equal(after.records[0].name,'Test warehouse')
  assert.equal(after.records[0].number,'AST-006')
  assert.equal(after.records[0].origin,'local')
  assert.equal(after.activity[0].event,'REGISTERED')
  assert.equal(after.activity[0].assetId,after.records[0].id)
  assert.notEqual(after.records[0].id,before.records[0].id)
})

test('update preserves ID, asset number, origin, createdAt while writing timeline',()=>{
  const before=initialRegistry(),record=before.records[1]
  const updated=updateAsset(before,record.id,{...asInput(record),name:'Updated Hilux',tags:['Priority']},today)
  const found=updated.records.find(r=>r.id===record.id)
  assert.equal(found.id,record.id)
  assert.equal(found.number,record.number)
  assert.equal(found.createdAt,record.createdAt)
  assert.equal(found.origin,'sample')
  assert.equal(found.name,'Updated Hilux')
  assert.equal(updated.activity[0].event,'TAGGED')
})

test('unchanged asset edits do not create fabricated audit events',()=>{
  const before=initialRegistry()
  assert.equal(updateAsset(before,before.records[0].id,asInput(before.records[0])),before)
})

test('bad amounts, categories, subcategories and dates are rejected',()=>{
  const state=initialRegistry(),input=asInput(state.records[0])
  assert.ok(validateAsset({...input,value:-1},state).value)
  assert.ok(validateAsset({...input,value:Infinity},state).value)
  assert.ok(validateAsset({...input,equity:NaN},state).equity)
  assert.ok(validateAsset({...input,category:'Imaginary'},state).category)
  assert.ok(validateAsset({...input,subcategory:'Imaginary'},state).subcategory)
  assert.ok(validateAsset({...input,valuationAsOf:'2026-02-31'},state).valuationAsOf)
  assert.throws(()=>createAsset(state,{...input,value:-10}),/non-negative/)
})

test('registry totals are currency-scoped and do not convert other currencies',()=>{
  const before=initialRegistry()
  const after=createAsset(before,{...asInput(before.records[0]),lifecycle:'PLANNED',currency:'USD',value:200,equity:175},today)
  assert.deepEqual(distinctCurrencies(after.records),['KES','USD'])
  assert.equal(sumInCurrency(after.records,'value','KES'),24850000)
  assert.equal(sumInCurrency(after.records,'value','USD'),0) // PLANNED, not held
  assert.equal(after.records.find(a=>a.currency==='USD').value,200)
})

test('adding and renaming tags updates all matching asset references',()=>{
  const first=initialRegistry()
  const withTag=createTag(first,'Critical')
  assert.ok(withTag.tags.includes('Critical'))
  const after=renameTag(withTag,'Income producing','Cash generating')
  assert.equal(after.records.filter(r=>r.tags.includes('Cash generating')).length,2)
  assert.ok(!after.tags.includes('Income producing'))
  assert.throws(()=>createTag(after,'critical'),/already exists/)
  const cleaned=deleteTag(after,'Cash generating')
  assert.equal(cleaned.records.filter(r=>r.tags.includes('Cash generating')).length,0)
  assert.equal(cleaned.records.length,5)
})

test('custom classifications and subtypes are available for asset creation',()=>{
  const first=initialRegistry()
  const second=addCategory(first,'Collectibles','Collection assets')
  const third=addSubcategory(second,'Collectibles','Art pieces')
  const category=third.categories.find(c=>c.name==='Collectibles')
  assert.deepEqual(category.subcategories,['General','Art pieces'])
  assert.equal(category.system,false)
  assert.throws(()=>addCategory(third,'collectibles'),/unique/)
  assert.throws(()=>addSubcategory(third,'Collectibles','art pieces'),/unique/)
})

test('advanced search combines text, category, tag and lifecycle filters',()=>{
  const state=initialRegistry()
  const hits=searchAssets(state.records,{...EMPTY_SEARCH,query:'toyota',category:'Vehicles',tag:'Vehicle',lifecycle:'ACTIVE'})
  assert.equal(hits.length,1)
  assert.equal(hits[0].number,'AST-002')
  assert.equal(searchAssets(state.records,{...EMPTY_SEARCH,query:'no-such-asset'}).length,0)
  assert.equal(searchAssets(state.records,{...EMPTY_SEARCH,order:'value_high'})[0].number,'AST-001')
})

test('local persistence works with an isolated storage implementation',()=>{
  const values=new Map()
  const storage={getItem:(key)=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value)}}
  const first=initialRegistry()
  const state=createAsset(first,{...asInput(first.records[0]),lifecycle:'PLANNED',name:'Only in browser'},today)
  assert.equal(saveRegistry(state,storage),true)
  assert.ok(values.has(STORE_KEY))
  assert.equal(loadRegistry(storage).records.length,6)
  assert.equal(loadRegistry({getItem:()=>'{bad-json'}).records.length,5)
  assert.equal(saveRegistry(state,{setItem:()=>{throw new Error('storage unavailable')}}),false)
})

test('prototype does not write over existing caller-supplied state',()=>{
  const first=initialRegistry()
  const next=createTag(first,'New label')
  assert.equal(first.tags.includes('New label'),false)
  assert.equal(first.records.length,next.records.length)
})
