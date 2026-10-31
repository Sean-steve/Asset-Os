import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('GitHub Pages base path matches the repository name',()=>{
  assert.match(read('vite.config.ts'),/base:\s*['"]\/Asset-Os\/['"]/)
})

test('project has a strictly enumerated 60-screen roadmap',()=>{
  const inventory=read('src/inventory.ts')
  const expected=read('docs/SCREEN_MATRIX.md')
  assert.match(inventory,/phaseIndex \* 10 \+ screenIndex \+ 1/)
  assert.match(expected,/60 screens/)
})

test('public prototype explicitly labels sample financial information',()=>{
  assert.match(read('src/App.tsx'),/BROWSER DATA/)
  assert.match(read('src/demo.ts'),/Illustrative records only/)
})

test('Pages deployment and CI workflows are present',()=>{
  assert.match(read('.github/workflows/pages.yml'),/deploy-pages@/)
  assert.match(read('.github/workflows/ci.yml'),/npm run build/)
})
