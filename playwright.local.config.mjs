import {defineConfig,devices} from '@playwright/test'
export default defineConfig({
 testDir:'./local-e2e',
 timeout:45000,
 expect:{timeout:12000},
 fullyParallel:false,
 workers:1,
 retries:process.env.CI?1:0,
 reporter:[['list']],
 use:{baseURL:'http://127.0.0.1:5173/Asset-Os/',trace:'retain-on-failure'},
 projects:[{name:'local-chromium',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}}}]
})
