const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const{pathToFileURL}=require('node:url');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const output=path.resolve(process.env.EPICMAP_CHECK_OUTPUT||path.join(root,'work/browser-check'));
fs.mkdirSync(output,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.EPICMAP_BROWSER_CHANNEL||undefined});
  const errors=[],requests=[],checks=[];
  try{
    const context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    page.on('requestfailed',r=>errors.push(r.url()+': '+r.failure()?.errorText));
    page.on('request',r=>requests.push(r.url()));
    const url=pathToFileURL(path.join(root,'EpicMap/index.html')).href;
    await page.goto(url);await page.waitForFunction(()=>window.EPICMAP&&window.EpicWorldMap);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>EPICMAP.S.worldStyle),'illustrated');
    await page.waitForFunction(()=>[...document.images].length===0&&IMG.get(baseIllustrated)?.ok);
    assert.equal(requests.some(s=>/elanthia_(?:hd|night)\.jpg/.test(s)),false);
    await page.screenshot({path:path.join(output,'world-clean.png')});
    checks.push('Default illustrated overview loads without the old world JPEGs');

    await page.locator('[data-tab="layers"]').click();
    await page.locator('#worldStyle').selectOption('original');
    await page.waitForTimeout(650);
    await page.screenshot({path:path.join(output,'world-original.png')});
    await page.reload();
    assert.equal(await page.evaluate(()=>EPICMAP.S.worldStyle),'original');
    await page.locator('[data-tab="layers"]').click();
    await page.locator('#worldStyle').selectOption('atlas');
    await page.waitForTimeout(650);await page.reload();
    assert.equal(await page.evaluate(()=>EPICMAP.S.worldStyle),'atlas');
    await page.locator('[data-tab="layers"]').click();
    await page.locator('#worldStyle').selectOption('illustrated');
    await page.waitForTimeout(650);await page.reload();
    assert.equal(await page.evaluate(()=>EPICMAP.S.worldStyle),'illustrated');
    checks.push('All three background styles survive a real browser reload');

    const ids=await page.evaluate(()=>{
      const a=EPICMAP,first=a.rooms.find(r=>r.xy&&!r.ax),next=a.rooms.find(r=>r.xy&&!r.ax&&r.im!==first.im),third=a.rooms.find(r=>r.xy&&!r.ax&&r.im!==first.im&&r.im!==next.im);
      a.live.pinned=a.live.host='Map test';a.setCharPos('Map test',first.id,first.t);a.S.autoArea=false;a.setFollow(true);
      a.restoreView({x:first.xy[0],y:first.xy[1],z:.17});
      return[first.id,next.id,third.id];
    });
    await page.mouse.move(1000,450);await page.mouse.down();await page.mouse.move(1120,490,{steps:6});
    assert.equal(await page.evaluate(()=>EPICMAP.S.follow),true);
    const panned=await page.evaluate(()=>EPICMAP.viewDestination());
    await page.evaluate(id=>{const a=EPICMAP,r=a.rooms[a.byId.get(id)];a.setCharPos('Map test',id,r.t)},ids[1]);
    assert.deepEqual(await page.evaluate(()=>EPICMAP.viewDestination()),panned);
    await page.mouse.up();
    await page.evaluate(id=>{const a=EPICMAP,r=a.rooms[a.byId.get(id)];a.setCharPos('Map test',id,r.t)},ids[2]);
    assert.equal((await page.evaluate(()=>EPICMAP.viewDestination())).z,.17);
    assert.equal(await page.evaluate(()=>EPICMAP.S.follow),true);
    await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('f');
    assert.equal(await page.evaluate(()=>EPICMAP.S.follow),false);
    checks.push('Real mouse drag retains Follow, gesture ownership and zoom; F still pauses');

    await page.evaluate(id=>EPICMAP.openArea(EPICMAP.rooms[EPICMAP.byId.get(id)].im),ids[0]);
    await page.waitForTimeout(100);
    await page.locator('#areaCanvas').hover();await page.mouse.wheel(0,-250);await page.waitForTimeout(100);
    const localZoom=await page.evaluate(()=>A.z);
    await page.evaluate(id=>{const a=EPICMAP,r=a.rooms[a.byId.get(id)];a.openArea(r.im,r.id)},ids[1]);
    await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>A.z),localZoom);
    await page.locator('#areaClose').click();
    checks.push('Area-map transition retains actual wheel-selected zoom');

    await page.evaluate(()=>{EPICMAP.S.follow=false;EPICMAP.live.chars.clear();EPICMAP.live.pinned=null;EPICMAP.live.host=null;EPICMAP.updateFollowControls();EPICMAP.restoreView(EPICMAP.defaultView());});
    await page.locator('[data-tab="hunt"]').click();await page.waitForTimeout(150);
    await page.mouse.move(800,950);
    await page.screenshot({path:path.join(output,'world-clean.png')});
    await page.locator('#btnTilt').click();await page.waitForTimeout(700);
    await page.screenshot({path:path.join(output,'world-tilted.png')});
    checks.push('Flat and tilted overview render successfully');

    const retina=await browser.newContext({viewport:{width:1200,height:800},deviceScaleFactor:2});
    const hi=await retina.newPage();hi.on('pageerror',e=>errors.push(e.message));
    await hi.goto(url);await hi.waitForTimeout(300);
    assert.equal(await hi.evaluate(()=>document.getElementById('map').width),2400);
    const timing=await hi.evaluate(()=>{
      const c=document.createElement('canvas');c.width=1600;c.height=1000;const ctx=c.getContext('2d');
      EpicWorldMap.draw(ctx,1600,1000);const start=performance.now();
      for(let i=0;i<60;i++)EpicWorldMap.draw(ctx,1600,1000);
      return(performance.now()-start)/60;
    });
    checks.push('DPR 2 uses native-resolution canvas drawing');
    assert.deepEqual(errors,[]);
    const report={passed:true,checks,pageErrors:errors,vectorDrawAverageMs:timing,output};
    fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
