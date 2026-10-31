import {defineConfig,devices} from '@playwright/test'

/**
 * Phase 7 release gate: run against a Vite *production preview* at the
 * exact /Asset-Os/ base path used on GitHub Pages.
 */
export default defineConfig({
  testDir:'./e2e',
  timeout:30000,
  expect:{timeout:10000},
  fullyParallel:true,
  retries:process.env.CI?1:0,
  workers:process.env.CI?3:undefined,
  reporter:[['list'],['html',{open:'never',outputFolder:'playwright-report'}]],
  use:{
    baseURL:'http://127.0.0.1:4173/Asset-Os/',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'retain-on-failure'
  },
  projects:[
    {name:'desktop-chromium',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}}},
    {name:'mobile-chromium',use:{...devices['Pixel 7']}}
  ],
  webServer:{
    command:'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url:'http://127.0.0.1:4173/Asset-Os/',
    reuseExistingServer:!process.env.CI,
    timeout:120000
  }
})
