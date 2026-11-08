const { chromium } = require(process.cwd() + '/apps/desktop/node_modules/playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true});
 const results=[];
 for (const lang of ['en','zh-Hant','ja']) {
  for (const width of [375,1200]) {
   for (const theme of ['light','dark']) {
    const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme,permissions:['clipboard-read','clipboard-write']});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:4321/${lang}/download/`);
    await page.evaluate(()=>document.fonts.ready);
    const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.scheme,headings:[...document.querySelectorAll('main h1, main h2, main h3, main h4')].map(x=>({level:Number(x.tagName.slice(1)),text:x.textContent})),anchor:!!document.getElementById('verify-download')}));
    assert.equal(metrics.width,width);assert.ok(metrics.scrollWidth<=width,JSON.stringify(metrics));assert.equal(metrics.theme,theme);assert.ok(metrics.anchor);
    for (const detailsOpen of [false,true]) {
      await page.locator('#verify-download').evaluate((el,open)=>el.open=open,detailsOpen);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    await page.locator('#verify-download').evaluate(el=>el.open=false);
    const buttons=page.locator('[data-install-copy]');
    assert.equal(await buttons.count(),3);
    for (let i=0;i<await buttons.count();i++) {
     const button=buttons.nth(i);
     const expected=await button.locator('..').locator('code').textContent();
     await button.focus();await page.keyboard.press('Enter');
     await page.waitForFunction(expected=>document.querySelector('[data-install-status]').textContent===expected,{en:'Copied','zh-Hant':'已複製',ja:'コピーしました'}[lang]);
     assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),expected);
    }
    await page.evaluate(()=>scrollTo(0,0));
    const screenshot=`docs/evidence/download-guide/${lang}-${width}-${theme}.png`;
    await page.screenshot({path:screenshot,fullPage:true});
    assert.deepEqual(errors,[]);
    results.push({lang,width,theme,...metrics,copyButtons:3,keyboardCopy:true,overflow:false,expandedVerificationOverflow:false,errors,screenshot});
    await context.close();
   }
  }
 }
 await browser.close();
 fs.writeFileSync('docs/evidence/download-guide/browser.json',JSON.stringify(results,null,2)+'\n');
 console.log('PASS. 12 locale, viewport, and theme combinations. No overflow, including expanded verification. All 36 clipboard contents match after keyboard activation. No page errors.');
})().catch(e=>{console.error(e);process.exitCode=1});
