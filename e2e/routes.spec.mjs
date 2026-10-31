import {test,expect} from '@playwright/test'

/**
 * Every primary inventory entry is opened from the real in-app roadmap.
 * On detail screens with missing entered data, an explicit empty state is
 * acceptable; a blank/error/crashed screen or planned placeholder is not.
 */
for(let id=1;id<=60;id++){
  test('Screen '+String(id).padStart(2,'0')+' opens from the canonical roadmap',async({page})=>{
    const exceptions=[]
    page.on('pageerror',error=>exceptions.push(error.message))
    await page.goto('./#/roadmap')
    const entries=page.locator('.roadmap-item')
    await expect(entries).toHaveCount(60)
    await entries.nth(id-1).click()
    await expect(page).not.toHaveURL(/#\/roadmap$/)
    const content=page.locator('#main-content')
    await expect(content).toBeVisible()
    await expect.poll(async()=>{
      const text=await content.innerText()
      return text.length
    }).toBeGreaterThan(70)
    const text=await content.innerText()
    expect(text).not.toMatch(/This destination is intentionally marked as planned|This screen is reserved for Phase/i)
    expect(text).not.toMatch(/Uncaught TypeError|Something went wrong|Internal Server Error/i)
    expect(exceptions,'Browser errors for screen '+id).toEqual([])
  })
}

test('direct route deep links survive reload with the Pages base path',async({page})=>{
  for(const route of ['dashboard','assets','acquisitions','valuations','maintenance','insurance',
    'portfolios','allocation','performance','risk-center','integrations','wealth-interface',
    'reports','team-access','security-audit','settings','onboarding']){
    await page.goto('./#/'+route)
    await expect(page.locator('#main-content')).toBeVisible()
    await expect.poll(()=>page.locator('#main-content').innerText().then(x=>x.length)).toBeGreaterThan(70)
    await page.reload()
    await expect(page).toHaveURL(new RegExp('#/'+route+'$'))
    await expect(page.locator('#main-content')).toBeVisible()
  }
})

test('dashboard never renders the obsolete synthetic trend, alerts or activity',async({page})=>{
  await page.goto('./#/dashboard')
  await expect(page.getByText('No historical valuation series yet')).toBeVisible()
  await expect(page.getByText('No upcoming events have been recorded.')).toBeVisible()
  await expect(page.getByText('No local activity recorded yet.')).toBeVisible()
  await expect(page.getByText('Illustrative portfolio trend')).toHaveCount(0)
  await expect(page.getByText('+12.8% this year')).toHaveCount(0)
})

test('keyboard skip control moves focus into main content without changing the hash route',async({page})=>{
  await page.goto('./#/dashboard')
  await page.keyboard.press('Tab')
  const skip=page.getByRole('button',{name:'Skip to main content'})
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
  await expect(page).toHaveURL(/#\/dashboard$/)
})

test('responsive layouts do not overflow the viewport at mobile, tablet and desktop widths',async({page})=>{
  for(const width of [390,768,1440]){
    await page.setViewportSize({width,height:900})
    for(const route of ['dashboard','assets','maintenance','insurance','portfolios','risk-center',
      'integrations','reports','settings','onboarding']){
      await page.goto('./#/'+route)
      await expect(page.locator('#main-content')).toBeVisible()
      const layout=await page.evaluate(()=>({body:document.documentElement.scrollWidth,view:document.documentElement.clientWidth}))
      expect(layout.body,'Horizontal overflow on '+route+' @ '+width).toBeLessThanOrEqual(layout.view+2)
    }
  }
})

test('mobile menu remains keyboard-accessible and closes after navigation',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await page.goto('./#/dashboard')
  const toggle=page.getByRole('button',{name:'Toggle navigation'})
  await toggle.click()
  await expect(page.locator('.sidebar')).toHaveClass(/sidebar-open/)
  await page.locator('.sidebar .nav-item').filter({hasText:'My Assets'}).first().click()
  await expect(page).toHaveURL(/#\/assets$/)
  await expect(page.locator('.sidebar')).not.toHaveClass(/sidebar-open/)
})
