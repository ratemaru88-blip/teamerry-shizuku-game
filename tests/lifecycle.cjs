const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
function policyTest() {
  let time = 0, serial = 0;
  const timers = new Map(), frames = new Map();
  class Audio {
    constructor() { this.paused = true; this.loop = false; this.currentTime = 0; }
    addEventListener() {}
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const window = {performance:{now:()=>time}, Audio,
    setTimeout:(fn,ms)=>{ const id=++serial; timers.set(id,{fn,due:time+ms}); return id; },
    clearTimeout:id=>timers.delete(id),
    requestAnimationFrame:fn=>{const id=++serial; frames.set(id,fn);return id;},
    cancelAnimationFrame:id=>frames.delete(id), addEventListener(){}};
  const document = {hidden:false, addEventListener(){}, getElementById:()=>null};
  const originalTimeout = window.setTimeout;
  vm.runInNewContext(fs.readFileSync(path.join(root,'game-lifecycle.js'),'utf8'), {window,document,URL,location:{href:'https://test/index.html'}});
  const life = window.ShizukuLifecycle;
  const advance = ms => {
    const end = time + ms;
    while (true) {
      const next = [...timers].sort((a,b)=>a[1].due-b[1].due)[0];
      if (!next || next[1].due > end) break;
      time=next[1].due; timers.delete(next[0]); next[1].fn();
    }
    time=end;
  };
  let calls=0;
  life.setTimeout(()=>calls++,100);
  const loop = new life.Audio(); loop.loop=true; loop.play();
  life.requestAnimationFrame(()=>calls++);
  advance(40); life.pauseGame('hidden');
  assert.equal(timers.size,0); assert.equal(frames.size,0); assert(loop.paused);
  const pausedNow=life.performance.now();
  advance(3600000); assert.equal(calls,0); assert.equal(life.performance.now(),pausedNow);
  loop.play(); assert(loop.paused, 'late audio callbacks cannot play while paused');
  life.pauseGame('help'); life.resumeGame('hidden'); assert.equal(timers.size,0);
  life.resumeGame('help'); life.resumeGame('help');
  assert.equal(timers.size,1); assert.equal(frames.size,1); assert(!loop.paused);
  advance(59); assert.equal(calls,0); advance(1); assert.equal(calls,1);
  life.stopGame(); assert.equal(timers.size,0); assert.equal(frames.size,0); assert(loop.paused);
  advance(999999); assert.equal(calls,1);
  life.bind({restart:()=>life.setTimeout(()=>calls++,100),
    resume:()=>life.setTimeout(()=>calls++,200)});
  life.startGame(); life.startGame();
  assert.equal(timers.size,2, 'resume must not arm newly-created timers twice');
  advance(200); assert.equal(calls,3);
  assert.equal(window.setTimeout,originalTimeout,'native/Forest scheduler is untouched');
  let intervalTicks=0;
  const interval=life.setInterval(()=>intervalTicks++,20);
  advance(20); assert.equal(intervalTicks,1);
  life.pauseGame('hidden'); advance(1000); assert.equal(intervalTicks,1);
  life.resumeGame('hidden'); advance(20); assert.equal(intervalTicks,2);
  life.clearInterval(interval); advance(100); assert.equal(intervalTicks,2);
  const ambient = new window.Audio(); ambient.loop=true; ambient.play();
  let ambientTick=false;
  window.setTimeout(()=>{ambientTick=true;},10);
  life.pauseGame(); advance(20);
  assert.equal(ambient.paused,false,'non-game audio remains playing');
  assert(ambientTick,'non-game timers remain running');
  console.log('Policy: timers / RAF / audio / pause reasons / frozen time / restart / idempotence PASS');
}
async function browserTest() {
  let server, browser;
  try {
    let base=process.env.SHIZUKU_TEST_BASE_URL;
    if (!base) {
      server=http.createServer((req,res)=>{
        const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname === '/' ? '/index.html' : new URL(req.url,'http://local').pathname));
        if (!file.startsWith(root+path.sep)) return res.writeHead(403).end();
        res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.mp3':'audio/mpeg','.png':'image/png','.webp':'image/webp'})[path.extname(file)] || 'application/octet-stream');
        fs.createReadStream(file).on('error',()=>res.writeHead(404).end()).pipe(res);
      });
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      base='http://127.0.0.1:'+server.address().port;
    }
    browser=await chromium.launch({channel:'msedge',headless:true});
    for (const mobile of [false,true]) {
      const context=await browser.newContext({viewport:mobile?{width:375,height:667}:{width:1366,height:900},isMobile:mobile,hasTouch:mobile});
      const page=await context.newPage();
      const errors=[]; page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/game-lifecycle.js*',async route=>{
        const response=await route.fetch();
        await route.fulfill({response,body:await response.text()+`
          const originalRun = Matter.Runner.run;
          Matter.Runner.run = function(runner, engine) {
            window.__runner = runner; window.__engine = engine;
            return originalRun(runner,engine);
          };
          const originalRender = Matter.Render.run;
          Matter.Render.run = function(render) {
            window.__render = render; return originalRender(render);
          };
        `});
      });
      await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.__engine && window.ShizukuLifecycle.snapshot().timers>=4);
      const state=()=>page.evaluate(()=>ShizukuLifecycle.snapshot());
      const engineTime=()=>page.evaluate(()=>__engine.timing.timestamp);
      await page.waitForTimeout(150);
      assert((await engineTime())>0);
      await page.locator('#helpBtn').click();
      assert.equal((await state()).active,false);
      const frozen=await engineTime();
      await page.waitForTimeout(250); assert.equal(await engineTime(),frozen);
      assert.equal((await state()).runningTimers,0);
      assert.equal((await state()).runningFrames,0);
      await page.locator('#helpCloseBtn').click();
      await page.waitForTimeout(150); assert((await engineTime())>frozen);
      await page.evaluate(()=>document.getElementById('game-wrapper').hidden=true);
      assert.equal((await state()).active,false, 'hidden game view pauses');
      assert.equal((await state()).runningTimers,0);
      await page.evaluate(()=>document.getElementById('game-wrapper').hidden=false);
      assert.equal((await state()).active,true);
      await page.evaluate(async()=>{
        window.__testSound=new ShizukuLifecycle.Audio('assets/sounds/drop.mp3');
        __testSound.loop=true; await __testSound.play();
      });
      assert((await state()).playingAudio>0);
      // A real second browser page makes the original document hidden.
      const other=await context.newPage(); await other.goto('about:blank'); await other.bringToFront();
      // Headless browsers may keep every page visible: also exercise the exact event handler.
      await page.evaluate(()=>{
        Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
        document.dispatchEvent(new Event('visibilitychange'));
      });
      assert.equal((await state()).active,false); assert.equal((await state()).playingAudio,0);
      const hiddenTime=await engineTime();
      await page.waitForTimeout(200); assert.equal(await engineTime(),hiddenTime);
      await page.bringToFront();
      await page.evaluate(()=>{
        delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));
      });
      await other.close();
      await page.waitForTimeout(100); assert.equal((await state()).active,true);
      await page.keyboard.press('b');
      await page.waitForFunction(()=>BonusGame.isRunning());
      await page.locator('.bns-play-area').waitFor({state:'visible',timeout:15000});
      await page.evaluate(async()=>{
        window.__cloneSound=ShizukuLifecycle.trackAudio(__testSound.cloneNode(true));
        __cloneSound.loop=true; await __cloneSound.play();
      });
      assert((await state()).playingAudio>0, 'bonus BGM is playing');
      await page.evaluate(()=>ShizukuLifecycle.pauseGame('view'));
      const bonusClock=await page.evaluate(()=>ShizukuLifecycle.performance.now());
      assert.equal((await state()).playingAudio,0);
      assert.equal(await page.evaluate(()=>__cloneSound.paused),true,'cloned SE/bee audio is owned too');
      assert.equal((await state()).runningFrames,0);
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(()=>ShizukuLifecycle.performance.now()),bonusClock);
      await page.evaluate(()=>ShizukuLifecycle.resumeGame('view'));
      assert((await state()).runningFrames>0);
      await page.evaluate(()=>ShizukuLifecycle.stopGame());
      assert.equal((await state()).playingAudio,0); assert.equal((await state()).timers,0);
      assert.equal((await state()).frames,0);
      assert.equal(await page.evaluate(()=>BonusGame.isRunning()),false);
      await page.waitForTimeout(300);
      assert.equal((await state()).active,false, 'bonus callback must not restart main game');
      for (let i=0;i<5;i++) {
        await page.evaluate(()=>ShizukuLifecycle.startGame());
        await page.waitForTimeout(50);
        assert.equal((await state()).runningTimers,4,'one of each spawn timer');
        const frames=await page.evaluate(()=>[__runner.frameRequestId,__render.frameRequestId]);
        await page.evaluate(()=>{ ShizukuLifecycle.startGame(); ShizukuLifecycle.resumeGame(); });
        assert.deepEqual(await page.evaluate(()=>[__runner.frameRequestId,__render.frameRequestId]),frames);
        await page.evaluate(()=>ShizukuLifecycle.stopGame());
        assert.equal((await state()).runningTimers,0);
      }
      await page.evaluate(()=>ShizukuLifecycle.startGame());
      await page.locator('#gameCanvas').click({position:{x:100,y:100}});
      await page.waitForTimeout(100);
      assert.equal((await state()).active,true);
      await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
      assert.equal((await state()).timers,0);
      assert.equal((await state()).playingAudio,0);
      for (const target of ['https://ratemaru88-blip.github.io/teamerry-forest/','https://ratemaru88-blip.github.io/teamerry-forest/observatory.html']) {
        await page.evaluate(()=>ShizukuLifecycle.startGame());
        assert.equal((await state()).active,true);
        await page.evaluate(target=>{
          const a=document.createElement('a'); a.href=target; a.id='test-exit'; a.textContent='exit'; document.body.append(a);
          a.addEventListener('click',e=>e.preventDefault());
          // Simulate a real navigation interception after Lifecycle's document handler.
          document.addEventListener('click',e=>{if(e.target.id==='test-exit') e.preventDefault();},{once:true});
        },target);
        // Avoid prevention before Lifecycle; the late document listener keeps the test page inspectable.
        await page.evaluate(()=>{const a=document.querySelector('#test-exit');const clone=a.cloneNode(true);a.replaceWith(clone);clone.click();clone.remove();});
        assert.equal((await state()).active,false); assert.equal((await state()).playingAudio,0);
        await page.evaluate(()=>ShizukuLifecycle.startGame());
      }
      await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
      assert.equal((await state()).active,false);
      await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
      assert.equal((await state()).active,true);
      if (process.env.SHIZUKU_TEST_ARTIFACTS) {
        fs.mkdirSync(process.env.SHIZUKU_TEST_ARTIFACTS,{recursive:true});
        await page.screenshot({path:path.join(process.env.SHIZUKU_TEST_ARTIFACTS,mobile?'game-mobile.png':'game-pc.png')});
      }
      assert.deepEqual(errors,[]);
      console.log((mobile?'Mobile':'PC')+': physics / help / hidden tab / audio silence / bonus exit / five restarts / navigation / BFCache PASS');
      await context.close();
    }
  } finally {
    await browser?.close();
    if(server) await new Promise(resolve=>server.close(resolve));
  }
}
policyTest();
browserTest().catch(e=>{console.error(e);process.exitCode=1;});
