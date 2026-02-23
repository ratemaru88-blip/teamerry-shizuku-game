(() => {
  "use strict";

  /* =========================================================
     森のしずくゲーム（整理版）
     - unlockAudioOnce の構文エラー修正
     - ミノムシKO時SE（mino_rakka.mp3）追加
  ========================================================= */

  // Matter aliases
  const {
    Engine,
    Render,
    Runner,
    World,
    Bodies,
    Body,
    Events,
    Constraint,
  } = Matter;

  /* ===== DOM参照 ===== */
  const canvas = document.getElementById("gameCanvas");
  const leafWrapperEl = document.getElementById("leafWrapper");
  const previewDropletEl = document.getElementById("previewDroplet");
  const resetBtn = document.getElementById("resetBtn");
  const helpBtn = document.getElementById("helpBtn");
  const antsLayer = document.getElementById("antsLayer");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const overlayRestartBtn = document.getElementById("overlayRestartBtn");
  const finalScoreText = document.getElementById("finalScoreText");

  const scoreText = document.getElementById("scoreText"); // "SCORE 0"など
  const gaugeFill = document.getElementById("gaugeFill"); // 森シルエットゲージ

  if (!canvas) {
    console.error("[game.js] canvas が見つかりません（id=gameCanvas）");
    return;
  }

  /* ===== サイズ ===== */
  const worldWidth = canvas.width || 360;
  const worldHeight = canvas.height || 640;

  // 見た目調整
  const VISUAL_SCALE = 1.0;

  // 壁マージン（落下ラインの左右余白）
  const LEFT_MARGIN = 28;
  const RIGHT_MARGIN = 28;
// ===== レイヤー安定化（style.cssは触らずJS注入）=====
(function injectLayerCss(){
  const id = "tm_layer_fix";
  if (document.getElementById(id)) return;
  const st = document.createElement("style");
  st.id = id;
  st.textContent = `
    /* canvasは基準 */
    #gameCanvas{ position: relative; z-index: 10; }

    /* cup-lineは“板”だけど、ミノムシ/ハチを隠さないように少し後ろへ */
    #cupLine{ position: absolute; z-index: 6; }

    /* アリは板より前 */
    #antsLayer{ position: absolute; z-index: 20; pointer-events:none; }

    /* 星やFXはさらに前 */
    #minoFxLayer{ position: absolute; z-index: 30; pointer-events:none; }
  `;
  document.head.appendChild(st);
})();
  /* =========================================================
     ✅ 雫 7種類（保持必須）
  ========================================================= */
  const STAGE_KEYS = ["small", "medium", "large"];
  const NUM_STAGES = 3;
  const STAGE_RADIUS = [18, 30, 44]; // 小/中/大（Matter当たり判定）

  const dropletTypes = [
    {
      name: "雫 カカオ",
      sprites: {
        small:  "https://static.wixstatic.com/media/e0436a_9cfbb787cfe649ee9d6dd0c5487b6a49~mv2.webp",
        medium: "https://static.wixstatic.com/media/e0436a_8c22fce1ee8248cfabcf8be02b84b6ea~mv2.webp",
        large:  "https://static.wixstatic.com/media/e0436a_3dc5b2f11f2b44c9b5f1f6b2a10b2d1a~mv2.webp"
      },
      dropSmall: "https://static.wixstatic.com/media/e0436a_0c2a35b3e45a48a2a76f5ddf0ff2f84b~mv2.webp"
    },
    {
      name: "雫 パック",
      sprites: {
        small:  "https://static.wixstatic.com/media/e0436a_4ce35b733d4b4c8a9b18b28b6da7a6e4~mv2.webp",
        medium: "https://static.wixstatic.com/media/e0436a_33c6bfc248f944edb6a2b6f1a69fda54~mv2.webp",
        large:  "https://static.wixstatic.com/media/e0436a_3b7d5d4c3c2a45f58a8f9bfe72f7a1ac~mv2.webp"
      },
      dropSmall: "https://static.wixstatic.com/media/e0436a_36d6dce08dbb4f3c9dd88d2f2b1f1c08~mv2.webp"
    },
    {
      name: "雫 ペアペア",
      sprites: {
        small:  "https://static.wixstatic.com/media/e0436a_3f5dfb12d56c4f3ba67a00a3f5d4b653~mv2.webp",
        medium: "https://static.wixstatic.com/media/e0436a_0f18f0f49b5e4c3d98d0d7fd2fd18e62~mv2.webp",
        large:  "https://static.wixstatic.com/media/e0436a_0e28a123f25e44eb8bc20a38ba8c2a98~mv2.webp"
      },
      dropSmall: "https://static.wixstatic.com/media/e0436a_1efc366c7a8845c293c63cc4a602652e~mv2.webp"
    },
    {
      name: "雫 チョコパ",
      sprites: {
        small:  "https://static.wixstatic.com/media/e0436a_9080353f505c400bb7ee922c63b08ef6~mv2.webp",
        medium: "https://static.wixstatic.com/media/e0436a_3e13f607965f4370968b9595ced36eef~mv2.webp",
        large:  "https://static.wixstatic.com/media/e0436a_47113d4466eef4b1ab15e82de87434b6a~mv2.webp"
      },
      dropSmall: "https://static.wixstatic.com/media/e0436a_1a530cff0bc34b598da9d047ca1c90a8~mv2.webp"
    },
    {
      name: "雫 ホイップ",
      sprites: {
        small:  "https://static.wixstatic.com/media/e0436a_c6f9df734a1c4a6a98a7b90c8bdb04e6~mv2.webp",
        medium: "https://static.wixstatic.com/media/e0436a_7ed9ba0bf98440fd9c95f92d67de1b16~mv2.webp",
        large:  "https://static.wixstatic.com/media/e0436a_81fef1472a3644b096cb765c8daca042~mv2.webp"
      },
      dropSmall: "https://static.wixstatic.com/media/e0436a_70085ee9c7a644a49113a96489051b07~mv2.webp"
    },
    {
      name: "雫 ちゃちゃじい",
      sprites: {
        small:  "https://static.wixstatic.com/media/e0436a_547fbaf6d7fe4cf4ab9d4de1ad8036d0~mv2.webp",
        medium: "https://static.wixstatic.com/media/e0436a_ba743232606c42628240df2202d77239~mv2.webp",
        large:  "https://static.wixstatic.com/media/e0436a_aa495d4a1aa640bd85673109e01eee2c~mv2.webp"
      },
      dropSmall: "https://static.wixstatic.com/media/e0436a_394527199653474da346c29410aa3d2c~mv2.webp"
    },
    {
      name: "雫 ミント",
      sprites: {
        small:  "https://static.wixstatic.com/media/e0436a_0082a7c95f514756b31e3d51176de94e~mv2.webp",
        medium: "https://static.wixstatic.com/media/e0436a_4465406692174916b178857c6c5b4c28~mv2.webp",
        large:  "https://static.wixstatic.com/media/e0436a_5dc7da1c55fc447ba06a93c770b98a5b~mv2.webp"
      },
      dropSmall: "https://static.wixstatic.com/media/e0436a_0c6c34cf923b402d8223b54f61f1c7fa~mv2.webp"
    },
  ];

  /* =========================================================
     効果音
  ========================================================= */
  const sounds = {
    drop: [ new Audio("https://static.wixstatic.com/mp3/e0436a_5181dcf5fcc2452688cb0c4d5b5550e1.mp3") ],
    merge: [
      new Audio("https://static.wixstatic.com/mp3/e0436a_0aa91b4db66743a6802a9ddb15de5b13.mp3"),
      new Audio("https://static.wixstatic.com/mp3/e0436a_53429b721be5486999461954b945f362.mp3"),
    ],
    buzz: [ new Audio("https://static.wixstatic.com/mp3/e0436a_9fe5aba4787c4830b15ae80c6dd5a7d9.mp3") ],
    beeBreak: [ new Audio("https://static.wixstatic.com/mp3/e0436a_a22b94fdb260457d8be3479466d11421.mp3") ],
  };

  sounds.drop.forEach(a => a.volume = 0.35);
  sounds.merge.forEach(a => a.volume = 0.45);
  sounds.buzz.forEach(a => { a.volume = 0.22; a.loop = true; });
  sounds.beeBreak.forEach(a => a.volume = 0.70);

  function playRandom(list) {
    if (!list || list.length === 0) return;
    const a = list[Math.floor(Math.random() * list.length)];
    try { a.currentTime = 0; a.play(); } catch (e) {}
  }

  /* ===== スマホ対策：最初のタップでAudio解放 ===== */
  let audioUnlocked = false;
  function unlockAudioOnce() {
    if (audioUnlocked) return;
    audioUnlocked = true;

    // ✅ 構文エラーの元だった「.sounds～」を完全に排除し、
    //    配列をちゃんとフラット化して処理する
    const all = [
      ...(sounds.drop || []),
      ...(sounds.merge || []),
      ...(sounds.buzz || []),
      ...(sounds.beeBreak || []),
    ];

    // ミノムシSEもここで一緒に解放
    all.push(minoDownSE, minoRakkaSE);

    all.forEach(a => {
      if (!a) return;
      try {
        a.muted = true;
        const p = a.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            a.pause();
            a.currentTime = 0;
            a.muted = false;
          }).catch(() => { a.muted = false; });
        } else {
          a.pause();
          a.currentTime = 0;
          a.muted = false;
        }
      } catch(e){}
    });
  }

  // pointerdownで解放（Wix/スマホ向け）
  window.addEventListener("pointerdown", unlockAudioOnce, { once: true, passive: true });

  /* =========================================================
     ✅ ミノムシSE
  ========================================================= */
  const MINO_DOWN_SFX_URL = "https://static.wixstatic.com/mp3/e0436a_01f90882f58c4f5ea1d3d0f48b5e30a1.wav";
  const minoDownSE = new Audio(MINO_DOWN_SFX_URL);
  minoDownSE.loop = true;
  minoDownSE.volume = 0.28;

  function playMinoDownSE() {
    if (!audioUnlocked) return;
    try {
      if (minoDownSE.paused) {
        minoDownSE.currentTime = 0;
        minoDownSE.play();
      }
    } catch(e){}
  }
  function stopMinoDownSE() {
    try {
      if (!minoDownSE.paused) {
        minoDownSE.pause();
        minoDownSE.currentTime = 0;
      }
    } catch(e){}
  }

 // ★追加：ミノムシ失敗落下→cup-lineでKO時のSE（1回だけ）
const MINO_RAKKA_SFX_URL = "https://static.wixstatic.com/mp3/e0436a_cdb3c62613f24a7fa4d77a8c5cf2dd9f.mp3";
const minoRakkaSE = new Audio(MINO_RAKKA_SFX_URL);
minoRakkaSE.loop = false;
minoRakkaSE.volume = 0.70;

function playMinoRakkaSE(){
  if (!audioUnlocked) return;
  try {
    minoRakkaSE.pause();
    minoRakkaSE.currentTime = 0;
    minoRakkaSE.play().catch(()=>{});
  } catch(e){}
}
  function stopMinoRakka() {
    try { minoRakkaSE.pause(); minoRakkaSE.currentTime = 0; } catch(e){}
  }

  /* ===== helpボタン（ゲーム説明）===== */
  if (helpBtn) {
    helpBtn.addEventListener("click", () => {
      window.open(
        "https://static.wixstatic.com/media/e0436a_5eca3cb13f9947bd86a0ae6bc1553895~mv2.jpg",
        "_blank"
      );
    });
  }

  /* =========================================================
     Engine/World
  ========================================================= */
  const engine = Engine.create();
  const world = engine.world;
  world.gravity.y = 1.0;

  const render = Render.create({
    canvas,
    engine,
    options: {
      width: worldWidth,
      height: worldHeight,
      wireframes: false,
      background: "transparent",
    }
  });

  Render.run(render);

  const runner = Runner.create();
  Runner.run(runner, engine);

  /* ===== 壁 ===== */
  const wallThickness = 80;
  const floorY = worldHeight + 60;

  const leftWall = Bodies.rectangle(-wallThickness/2, worldHeight/2, wallThickness, worldHeight*2, { isStatic: true, render: { visible: false }});
  const rightWall = Bodies.rectangle(worldWidth + wallThickness/2, worldHeight/2, wallThickness, worldHeight*2, { isStatic: true, render: { visible: false }});
  const floor = Bodies.rectangle(worldWidth/2, floorY, worldWidth*2, 120, { isStatic: true, render: { visible: false }});

  World.add(world, [leftWall, rightWall, floor]);

  /* =========================================================
     cup-line（当たり判定用の床：見た目の板に同期）
  ========================================================= */
  let cupRim = Bodies.rectangle(worldWidth/2, worldHeight - 90, worldWidth*0.88, 18, {
    isStatic: true,
    render: { visible: false }
  });
  cupRim.isCupRim = true;
  World.add(world, cupRim);

  function syncCupRimToVisual() {
    // 見た目がDOMにある場合、そこに合わせたいが
    // ここでは「とにかく安定」優先で、Canvas基準の固定位置を採用
    // （既存のsync関数がある場合は、ここを置き換えてOK）
    Body.setPosition(cupRim, { x: worldWidth/2, y: worldHeight - 92 });
  }

  /* =========================================================
     Spriteスケール補正
  ========================================================= */
  const droplets = new Set();
  const textureSizeCache = new Map();

  function getTextureInfo(url) {
    if (!url) return null;
    const cached = textureSizeCache.get(url);
    if (cached) return cached;

    const info = { w: 512, h: 512, pending: true };
    textureSizeCache.set(url, info);

    const img = new Image();
    img.onload = () => {
      info.w = img.naturalWidth || 512;
      info.h = img.naturalHeight || 512;
      info.pending = false;

      droplets.forEach(d => {
        const sp = d.render && d.render.sprite;
        if (sp && sp.texture === url) updateSpriteScaleDroplet(d);
      });
    };
    img.src = url;
    return info;
  }

  function updateSpriteScaleDroplet(body) {
    const sprite = body.render && body.render.sprite;
    if (!sprite || !body.circleRadius || !sprite.texture) return;

    const info = getTextureInfo(sprite.texture);
    const baseW = (info && info.w) ? info.w : 512;

    const diameter = body.circleRadius * 2;
    const baseScale = (diameter / baseW) * VISUAL_SCALE;

    sprite.xScale = baseScale;
    sprite.yScale = baseScale;
    body.baseSpriteScale = sprite.xScale;
  }

  function setSpriteScaleByPx(body, desiredPx, basePx = 512) {
    const sprite = body.render && body.render.sprite;
    if (!sprite || !sprite.texture) return;
    const s = desiredPx / basePx;
    sprite.xScale = s;
    sprite.yScale = s;
  }

  function squish(body, power = 1.1, duration = 220) {
    if (!body || body.isStatic || body.isSquishing) return;
    const sprite = body.render && body.render.sprite;
    if (!sprite) return;

    body.isSquishing = true;
    const baseX = sprite.xScale || 1;
    const baseY = sprite.yScale || 1;

    const p = Math.max(1.0, Math.min(power, 1.6));
    const maxMul = 1 + 0.18 * (p - 1);
    const start = performance.now();

    function easeInOut(t) { return t < 0.5 ? (2*t*t) : (1 - Math.pow(-2*t+2, 2)/2); }

    function tick() {
      const t = (performance.now() - start) / duration;
      if (t >= 1) {
        sprite.xScale = baseX;
        sprite.yScale = baseY;
        body.isSquishing = false;
        return;
      }
      const e = easeInOut(t);
      sprite.xScale = baseX * (1 + (maxMul - 1) * (1 - e));
      sprite.yScale = baseY * (1 - 0.12 * (1 - e));
      requestAnimationFrame(tick);
    }
    tick();
  }

  /* =========================================================
     雫：次の雫／ホールド
  ========================================================= */
  let holding = null;
  let nextCharIndex = 0;

  function pickNextDroplet() {
    nextCharIndex = Math.floor(Math.random() * dropletTypes.length);
  }

  function setHoldingDroplet(charIndex) {
    const type = dropletTypes[charIndex];
    const tex =
      (type && type.sprites && type.sprites.small) ||
      (type && type.dropSmall) ||
      "";

    holding = { charIndex, stage: 0, radius: STAGE_RADIUS[0], texture: tex };

    if (!previewDropletEl) return;

    if (!tex) {
      previewDropletEl.removeAttribute("src");
      previewDropletEl.style.display = "none";
      previewDropletEl.style.opacity = "0";
      return;
    }

    previewDropletEl.src = tex;
    previewDropletEl.style.display = "block";
    previewDropletEl.style.opacity = "1";
  }

  /* ===== 涙型 → 丸 ===== */
  function makeRoundIfTear(body) {
    if (!body || !body.isDroplet || !body.isTear) return;
    const type = dropletTypes[body.charIndex];
    const tex = type.sprites && type.sprites[STAGE_KEYS[body.stage]];
    if (!tex) { body.isTear = false; return; }

    if (!body.render.sprite) body.render.sprite = { texture: tex, xScale: 1, yScale: 1 };
    else body.render.sprite.texture = tex;

    body.isTear = false;
    updateSpriteScaleDroplet(body);
  }

  /* ===== 雫生成 ===== */
  function createDropletBody({ charIndex, stage, x, y, radius, texture, isTear }) {
    const body = Bodies.circle(x, y, radius, {
      restitution: 0.08,
      friction: 0.01,
      frictionAir: 0.03,
      density: 0.0012,
      render: {
        fillStyle: "transparent",
        sprite: texture ? { texture: texture, xScale: 1, yScale: 1 } : undefined
      }
    });

    body.isDroplet      = true;
    body.charIndex      = charIndex;
    body.stage          = stage;
    body.lastBounceTime = 0;
    body.isTear         = !!isTear;
    body.isMerging      = false;
    body.justBrokenAt   = 0;
    body.spawnAt        = performance.now();

    droplets.add(body);
    World.add(world, body);
    updateSpriteScaleDroplet(body);
    return body;
  }

  function dropFromPlate(charIndex, x) {
    const stage  = 0;
    const radius = STAGE_RADIUS[0];
    const type   = dropletTypes[charIndex];

    const roundTex = type.sprites && type.sprites[STAGE_KEYS[stage]];
    const tearTex  = type.dropSmall || null;
    const texture  = tearTex || roundTex;
    const isTear   = !!tearTex;

    const minX = LEFT_MARGIN + radius;
    const maxX = worldWidth - RIGHT_MARGIN - radius;
    const clampedX = Math.max(minX, Math.min(maxX, x));
    const startY = worldHeight * 0.22;

    createDropletBody({ charIndex, stage, x: clampedX, y: startY, radius, texture, isTear });
  }

  /* =========================================================
     合体
  ========================================================= */
  function addScoreForStage(stage) {
    // お好みで調整
    const add = stage === 0 ? 2 : stage === 1 ? 6 : 14;
    score += add;
    updateScoreGauge();
  }

  function mergeDroplets(bodyA, bodyB) {
    if (!bodyA.isDroplet || !bodyB.isDroplet) return;
    if (bodyA.isMerging || bodyB.isMerging) return;
    if (bodyA.charIndex !== bodyB.charIndex) return;
    if (bodyA.stage     !== bodyB.stage)     return;

    bodyA.isMerging = true;
    bodyB.isMerging = true;

    const stage = bodyA.stage;
    const type  = dropletTypes[bodyA.charIndex];

    const centerX = (bodyA.position.x + bodyB.position.x) / 2;
    const centerY = (bodyA.position.y + bodyB.position.y) / 2;

    const vx = (bodyA.velocity.x + bodyB.velocity.x) / 2;
    const vy = (bodyA.velocity.y + bodyB.velocity.y) / 2;

    droplets.delete(bodyA);
    droplets.delete(bodyB);
    World.remove(world, bodyA);
    World.remove(world, bodyB);

    if (stage < NUM_STAGES - 1) {
      const newStage = stage + 1;
      const r = STAGE_RADIUS[newStage];
      const tex = type.sprites && type.sprites[STAGE_KEYS[newStage]];

      const newBody = createDropletBody({
        charIndex: bodyA.charIndex,
        stage: newStage,
        x: centerX,
        y: centerY,
        radius: r,
        texture: tex,
        isTear: false
      });

      Body.setVelocity(newBody, {
        x: vx * 0.20,
        y: Math.min(-3.4, vy * 0.10 - 2.2)
      });

      squish(newBody, 1.25, 220);
      addScoreForStage(newStage);
      playRandom(sounds.merge);

      if (newStage === 2) {
        maybeScheduleBee();
        maybeScheduleMino();
      }
    } else {
      addScoreForStage(3);
      playRandom(sounds.merge);
      maybeScheduleBee();
      maybeScheduleMino();
    }
  }

  /* =========================================================
     GameOver 判定
  ========================================================= */
  let gameOver = false;
  let canDrop = true;
  let score = 0;

  // 雫詰まり
  const DROPLET_GAMEOVER_Y = worldHeight * 0.12;
  const DROPLET_GAMEOVER_COUNT = 8;

  // 落ち葉GO（元ロジック互換のため残す）
  const topLeafTouchMap = new Map();
  const TOP_LEAF_TOUCH_MS = 1400;

  function updateScoreGauge() {
    if (scoreText) scoreText.textContent = `SCORE  ${score}`;
    if (!gaugeFill) return;
    const p = Math.max(0, Math.min(1, score / 260)); // 目安
    gaugeFill.style.transform = `scaleX(${p.toFixed(3)})`;
  }

  function stopAllTimers() {
    if (leafTimer) { clearTimeout(leafTimer); leafTimer = null; }
    if (beeTimer) { clearTimeout(beeTimer); beeTimer = null; }
    if (minoTimer) { clearTimeout(minoTimer); minoTimer = null; }
    if (antSpawnTimer) { clearTimeout(antSpawnTimer); antSpawnTimer = null; }
  }

  function triggerGameOver() {
    if (gameOver) return;
    gameOver = true;
    canDrop = false;

    stopAllTimers();
    stopMinoDownSE();
    stopMinoRakka();

    if (finalScoreText) finalScoreText.textContent = `SCORE：${score}`;
    if (gameOverOverlay) gameOverOverlay.classList.add("visible");
  }

  /* =========================================================
     🐝 ハチ（大雫を分裂）
  ========================================================= */
  const bees = new Set();
  let beeTimer = null;
  let beeCooldownUntil = 0;

  const BEE_TEX_L = "https://static.wixstatic.com/media/e0436a_44e076b0100c4fddaffbe2d0b4d5f319~mv2.png";
  const BEE_TEX_R = "https://static.wixstatic.com/media/e0436a_0b0a5f4f9a2c4f4d96f4a6d0a1f6f9d9~mv2.png";
  const BEE_CFG = {
    speedMin: 2.3,
    speedMax: 3.8,
    sizePx: 90,
    delayMin: 500,
    delayMax: 1100,
    cooldownMs: 3800,
    passRate: 0.35,
  };

  function startBeeBuzz(bee) {
    try {
      if (!audioUnlocked) return;
      const base = sounds.buzz && sounds.buzz[0];
      if (!base) return;
      const buzz = base.cloneNode(true);
      buzz.loop = true;
      buzz.volume = base.volume;
      bee._buzz = buzz;
      buzz.play().catch(()=>{});
    } catch(e){}
  }
  function stopBeeBuzz(bee) {
    if (bee && bee._buzz) {
      try { bee._buzz.pause(); bee._buzz.currentTime = 0; } catch(e){}
      bee._buzz = null;
    }
  }

  function spawnBee() {
    if (gameOver) return;

    const fromLeft = Math.random() < 0.5;
    const x = fromLeft ? -80 : worldWidth + 80;
    const y = worldHeight * (0.30 + Math.random() * 0.38);

    const tex = fromLeft ? BEE_TEX_R : BEE_TEX_L;

    const bee = Bodies.rectangle(x, y, 90, 52, {
      isSensor: true,
      frictionAir: 0.0,
      render: { sprite: { texture: tex, xScale: 1, yScale: 1 } },
    });

    bee.isBee = true;
    bee.fromLeft = fromLeft;
    bee.willPass = Math.random() < BEE_CFG.passRate;
    bee.hasStung = false;

    setSpriteScaleByPx(bee, BEE_CFG.sizePx);

    const speedMag = Math.random() * (BEE_CFG.speedMax - BEE_CFG.speedMin) + BEE_CFG.speedMin;
    Body.setVelocity(bee, { x: fromLeft ? +speedMag : -speedMag, y: 0 });

    World.add(world, bee);
    bees.add(bee);
    startBeeBuzz(bee);
  }

  function maybeScheduleBee() {
    const now = performance.now();
    if (now < beeCooldownUntil) return;

    const hasLarge = Array.from(droplets).some(d => d && d.isDroplet && d.stage === 2);
    if (!hasLarge) return;
    if (Math.random() > 0.35) return;

    beeCooldownUntil = now + BEE_CFG.cooldownMs;

    const delay = BEE_CFG.delayMin + Math.random() * (BEE_CFG.delayMax - BEE_CFG.delayMin);
    if (beeTimer) clearTimeout(beeTimer);
    beeTimer = setTimeout(() => { if (!gameOver) spawnBee(); }, delay);
  }

  function cleanupBees() {
    bees.forEach(b => {
      if (b.position.x < -200 || b.position.x > worldWidth + 200) {
        stopBeeBuzz(b);
        World.remove(world, b);
        bees.delete(b);
      }
    });
  }

  function breakLargeToMedium(targetDroplet) {
    if (!targetDroplet || !targetDroplet.isDroplet) return;
    if (targetDroplet.stage !== 2) return;

    const now = performance.now();
    if ((now - (targetDroplet.justBrokenAt || 0)) < 900) return;
    targetDroplet.justBrokenAt = now;

    playRandom(sounds.beeBreak);

    const type = dropletTypes[targetDroplet.charIndex];
    const centerX = targetDroplet.position.x;
    const centerY = targetDroplet.position.y;

    // remove big
    droplets.delete(targetDroplet);
    World.remove(world, targetDroplet);

    // spawn two mediums
    const r = STAGE_RADIUS[1];
    const tex = type.sprites && type.sprites.medium;

    const a = createDropletBody({
      charIndex: targetDroplet.charIndex,
      stage: 1,
      x: centerX - r * 0.75,
      y: centerY,
      radius: r,
      texture: tex,
      isTear: false
    });

    const b = createDropletBody({
      charIndex: targetDroplet.charIndex,
      stage: 1,
      x: centerX + r * 0.75,
      y: centerY,
      radius: r,
      texture: tex,
      isTear: false
    });

    Body.setVelocity(a, { x: -1.1, y: -1.4 });
    Body.setVelocity(b, { x: +1.1, y: -1.4 });

    squish(a, 1.18, 200);
    squish(b, 1.18, 200);
  }

  /* =========================================================
     🐜 アリ（DOM：2コマ歩行）+ KO救助アリ
  ========================================================= */
  const ANT_CFG = {
    maxAnts: 2,
    spawnIntervalMin: 2500,
    spawnIntervalMax: 5200,
    speedMin: 14,
    speedMax: 26,
    yJitter: 0,
    texL: [
      "https://static.wixstatic.com/media/e0436a_ba5c533006c943d2bb48e6209835bd54~mv2.png",
      "https://static.wixstatic.com/media/e0436a_fbafd110f97c44c690d0079442b060c4~mv2.png"
    ],
    texR: [
      "https://static.wixstatic.com/media/e0436a_1573066bada849c49f463c4e94c31e80~mv2.png",
      "https://static.wixstatic.com/media/e0436a_9d8b26a5b7ad40c68669691dd0155141~mv2.png"
    ],
  };

  let ants = [];
  let antSpawnTimer = null;
  let antsRAF = 0;
  let antsLastT = 0;

  let rescueAnts = []; // KO救助専用アリ
  const RESCUE_ANT_SPEED = 70;
  const RESCUE_ANT_POKE_DELAY = 380;
  const RESCUE_LADY_RATE = 0.10; // レア演出確率（ロジックだけ）

  function clearAnts() {
    if (!antsLayer) return;
    ants.forEach(a => a.el.remove());
    ants = [];
    if (antSpawnTimer) { clearTimeout(antSpawnTimer); antSpawnTimer = null; }
    if (antsRAF) { cancelAnimationFrame(antsRAF); antsRAF = 0; }
    antsLastT = 0;

    // KO救助アリも全消し
    rescueAnts.forEach(a => { try { a.el.remove(); } catch(e){} });
    rescueAnts = [];
  }

  function scheduleAntSpawn() {
    if (gameOver) return;
    if (!antsLayer) return;

    const delay =
      ANT_CFG.spawnIntervalMin +
      Math.random() * (ANT_CFG.spawnIntervalMax - ANT_CFG.spawnIntervalMin);

    antSpawnTimer = setTimeout(() => {
      if (!gameOver && ants.length < ANT_CFG.maxAnts) spawnAnt();
      scheduleAntSpawn();
    }, delay);
  }

  function spawnAnt() {
    if (!antsLayer) return;

    const layerRect = antsLayer.getBoundingClientRect();
    const fromLeft = Math.random() < 0.5;
    const frames = fromLeft ? ANT_CFG.texR : ANT_CFG.texL;

    const el = document.createElement("div");
    el.className = "ant";

    const img = document.createElement("img");
    img.alt = "ant";
    img.src = frames[0];
    el.appendChild(img);

    const w = 22;
    const startX = fromLeft ? -w : (layerRect.width + w);

    el.style.bottom = `10px`;
    el.style.transform = `translateX(${startX}px)`;

    antsLayer.appendChild(el);

    const speed = ANT_CFG.speedMin + Math.random() * (ANT_CFG.speedMax - ANT_CFG.speedMin);

    ants.push({
      el,
      img,
      x: startX,
      fromLeft,
      speed,
      frames,
      frameIndex: 0,
      nextFrameTime: performance.now() + 180 + Math.random() * 120
    });

    startAntsLoop();
  }

  function spawnRescueAnt(mino, fromLeft) {
    if (!antsLayer || !mino) return;

    const layerRect = antsLayer.getBoundingClientRect();
    const frames = fromLeft ? ANT_CFG.texR : ANT_CFG.texL;

    const el = document.createElement("div");
    el.className = "ant rescue";

    const img = document.createElement("img");
    img.alt = "ant";
    img.src = frames[0];
    el.appendChild(img);

    const w = 22;
    const startX = fromLeft ? -w : (layerRect.width + w);
    el.style.bottom = `10px`;
    el.style.transform = `translateX(${startX}px)`;
    antsLayer.appendChild(el);

    const targetX = layerRect.width * 0.5; // ざっくり中央へ

    rescueAnts.push({
      el,
      img,
      x: startX,
      fromLeft,
      speed: RESCUE_ANT_SPEED,
      frames,
      frameIndex: 0,
      nextFrameTime: performance.now() + 90,
      arrived: false,
      pokeAt: 0,
      targetX,
      minoId: mino.id
    });

    startAntsLoop();
  }

  function clearRescueAnts(minoId) {
    rescueAnts = rescueAnts.filter(a => {
      const keep = (minoId != null) ? (a.minoId !== minoId) : false;
      if (!keep) {
        try { a.el.remove(); } catch(e){}
      }
      return keep;
    });
  }

  function startAntsLoop() {
    if (antsRAF) return;
    antsLastT = 0;
    antsRAF = requestAnimationFrame(updateAnts);
  }

  function updateAnts(t) {
    if (!antsLayer) { antsRAF = 0; return; }
    if (gameOver) { antsRAF = 0; return; }

    if (!antsLastT) antsLastT = t;
    const dt = Math.min(0.050, (t - antsLastT) / 1000);
    antsLastT = t;

    const layerRect = antsLayer.getBoundingClientRect();
    const layerW = layerRect.width;

    // 通常アリ
    ants.forEach(a => {
      const dir = a.fromLeft ? 1 : -1;
      a.x += dir * a.speed * dt;

      if (t >= a.nextFrameTime) {
        a.frameIndex = (a.frameIndex + 1) % a.frames.length;
        a.img.src = a.frames[a.frameIndex];
        a.nextFrameTime = t + 220 + Math.random() * 80;
      }

      a.el.style.transform = `translateX(${a.x.toFixed(2)}px)`;
    });

    ants = ants.filter(a => {
      const out = a.fromLeft ? (a.x > layerW + 30) : (a.x < -30);
      if (out) a.el.remove();
      return !out;
    });

    // KO救助アリ
    rescueAnts.forEach(a => {
      const dir = a.fromLeft ? 1 : -1;
      const goalDir = a.fromLeft ? 1 : -1;

      // 目標位置へ寄せる
      if (!a.arrived) {
        const target = a.targetX + (a.fromLeft ? -26 : +26);
        const dist = Math.abs(a.x - target);
        a.x += goalDir * a.speed * dt;

        if (dist < 12) {
          a.arrived = true;
          a.pokeAt = t + RESCUE_ANT_POKE_DELAY;
        }
      }

      if (t >= a.nextFrameTime) {
        a.frameIndex = (a.frameIndex + 1) % a.frames.length;
        a.img.src = a.frames[a.frameIndex];
        a.nextFrameTime = t + 120;
      }

      a.el.style.transform = `translateX(${a.x.toFixed(2)}px)`;
    });

    // つつき完了 → 起こす
    if (rescueAnts.length > 0) {
      const byMino = new Map();
      rescueAnts.forEach(a => {
        if (!byMino.has(a.minoId)) byMino.set(a.minoId, []);
        byMino.get(a.minoId).push(a);
      });

      byMino.forEach((arr, minoId) => {
        const allArrived = arr.every(a => a.arrived);
        const allPoke = arr.every(a => a.arrived && t >= a.pokeAt);

        if (allArrived && allPoke) {
          const targetMino = Array.from(minos).find(m => m.id === minoId);
          if (targetMino) tryRescueWake(targetMino, "ants");
        }
      });
    }

    // まだ残ってるなら継続
    if (ants.length > 0 || rescueAnts.length > 0) {
      antsRAF = requestAnimationFrame(updateAnts);
    } else {
      antsRAF = 0;
    }
  }

  /* ===== ミノムシ救助：レディー（見た目は後で） ===== */
  function maybeLadyRescue(mino) {
    if (!mino || mino.state !== "ko") return;
    if (Math.random() >= RESCUE_LADY_RATE) return;
    setTimeout(() => {
      tryRescueWake(mino, "lady");
    }, 900);
  }

  /* =========================================================
     🐛 ミノムシ（fail→KO→救助→起床→上昇）
  ========================================================= */
  const minos = new Set();
  let minoTimer = null;
  let minoCooldownUntil = 0;

  const MINO_TEX_NORMAL = "https://static.wixstatic.com/media/e0436a_bd2aa3d132364f9d83a9eb4bdabce505~mv2.webp";
  const MINO_TEX_FAIL   = "https://static.wixstatic.com/media/e0436a_1c7df1f465164bdeba93ac98ce62b9aa~mv2.webp";
  const MINO_TEX_AWAKE  = "https://static.wixstatic.com/media/e0436a_f97b18842a08467cb278f6c742324cdd~mv2.webp";
  const MINO_TEX_LADY   = "https://static.wixstatic.com/media/e0436a_e909e47044fe4710aacf24a377710ec8~mv2.webp";

  const MINO_STAR_RING = "https://static.wixstatic.com/media/e0436a_79b105a5d8ab45f69f349e31177e9654~mv2.png";

  const MINO_CFG = {
    sizePx: 78,
    downSpeed: 1.55,
    upSpeed: -2.2,
    fallSpeed: 3.3,
    delayMin: 1200,
    delayMax: 2600,
    cooldownMs: 4200,
    dropFailRate: 0.35,
  };

  const SWAY_START_Y = worldHeight * 0.62;

  function createMinoStars(mino) {
    if (!mino || mino._starsEl || !antsLayer) return;

    const el = document.createElement("div");
    el.className = "mino-stars";
    el.style.position = "absolute";
    el.style.left = "0px";
    el.style.bottom = "0px";
    el.style.pointerEvents = "none";
    el.style.width = "56px";
    el.style.height = "56px";
    el.style.opacity = "0.95";

    const img = document.createElement("img");
    img.src = MINO_STAR_RING;
    img.alt = "stars";
    img.style.width = "56px";
    img.style.height = "56px";
    img.style.display = "block";
    img.style.animation = "minoStarsPulse 0.85s ease-in-out infinite";

    el.appendChild(img);
    antsLayer.appendChild(el);

    mino._starsEl = el;
  }

  function removeMinoStars(mino) {
    if (!mino) return;
    if (mino._starsEl) {
      try { mino._starsEl.remove(); } catch(e){}
      mino._starsEl = null;
    }
  }

  function updateMinoStarsPosition(mino) {
  if (!mino || !minoStarsMap || !minoStarsMap.has(mino.id)) return;

  const item = minoStarsMap.get(mino.id);
  if (!item || !item.el) return;

  const canvasRect = canvas.getBoundingClientRect();
  const fxRect = minoFxLayer.getBoundingClientRect();

  // canvas内のworld座標 → 画面座標
  const sx = (mino.position.x / worldWidth) * canvasRect.width + canvasRect.left;
  const sy = (mino.position.y / worldHeight) * canvasRect.height + canvasRect.top;

  // FXレイヤー内のローカル座標に変換
  const localX = sx - fxRect.left;
  const localY = sy - fxRect.top;

  item.el.style.left = `${localX}px`;
  item.el.style.top  = `${localY - 34}px`; // 頭の上に少し
}
  function spawnMino() {
    if (gameOver) return;

    const x = worldWidth * (0.25 + Math.random() * 0.5);
    const y = -80;

    const mino = Bodies.rectangle(x, y, 56, 66, {
      frictionAir: 0.01,
      render: { sprite: { texture: MINO_TEX_NORMAL, xScale: 1, yScale: 1 } }
    });
    mino.isMino = true;

    // 状態
    mino.state = "down"; // down -> pause -> lift -> carry/fail -> ko -> liftAfterKo
    mino.pauseUntil = 0;
    mino._rescueWaking = false;

    setSpriteScaleByPx(mino, MINO_CFG.sizePx);

    World.add(world, mino);
    minos.add(mino);
  }

  function maybeScheduleMino() {
    const now = performance.now();
    if (now < minoCooldownUntil) return;

    // 中以上がある時だけ出す（過去互換：大/中が増えた頃）
    const hasMid = Array.from(droplets).some(d => d && d.isDroplet && d.stage >= 1);
    if (!hasMid) return;
    if (Math.random() > 0.35) return;

    minoCooldownUntil = now + MINO_CFG.cooldownMs;

    const delay = MINO_CFG.delayMin + Math.random() * (MINO_CFG.delayMax - MINO_CFG.delayMin);
    if (minoTimer) clearTimeout(minoTimer);
    minoTimer = setTimeout(() => { if (!gameOver) spawnMino(); }, delay);
  }

  function tryRescueWake(mino, mode = "ants") {
    if (!mino || mino.state !== "ko") return;
    if (mino._rescueWaking) return;
    mino._rescueWaking = true;

    removeMinoStars(mino);

    if (mino.render && mino.render.sprite) {
      mino.render.sprite.texture = (mode === "lady") ? MINO_TEX_LADY : MINO_TEX_AWAKE;
      setSpriteScaleByPx(mino, MINO_CFG.sizePx);
    }

    // ちょい溜めて「ビヨーン」起立 → 上昇
    setTimeout(() => {
      if (!mino || !minos.has(mino)) return;
      mino.state = "liftAfterKo";
      // KO救助アリ消す
      clearRescueAnts(mino.id);
      playMinoDownSE();
    }, 520);
  }

  function cleanupMinos() {
    minos.forEach(m => {
      // stars追従
      if (m.state === "ko") updateMinoStarsPosition(m);

      if (m.position.y > worldHeight + 240 || m.position.y < -260) {
        removeMinoStars(m);
        World.remove(world, m);
        minos.delete(m);
      }
    });

    // ミノが居ないなら移動SE止める
    if (minos.size === 0) stopMinoDownSE();
  }

  function updateMinosAI() {
    if (minos.size === 0) return;

    const now = performance.now();

    minos.forEach(m => {
      if (!m || !m.isMino) return;

      // down
      if (m.state === "down") {
        playMinoDownSE();
        if (m.position.y >= SWAY_START_Y) {
          stopMinoDownSE();
          Body.setPosition(m, { x: m.position.x, y: SWAY_START_Y });
          Body.setVelocity(m, { x: 0, y: 0 });
          m.state = "pause";
          m.pauseUntil = now + 520 + Math.random() * 380;
        } else {
          Body.setVelocity(m, { x: 0, y: MINO_CFG.downSpeed });
        }
        return;
      }

      // pause
      if (m.state === "pause") {
        stopMinoDownSE();
        Body.setVelocity(m, { x: 0, y: 0 });
        if (now >= m.pauseUntil) {
          m.state = "lift";
          playMinoDownSE();
        }
        return;
      }

      // lift（確率でfail落下へ）
      if (m.state === "lift") {
        playMinoDownSE();
        Body.setAngle(m, 0);
        Body.setVelocity(m, { x: 0, y: MINO_CFG.upSpeed });

        if (m.position.y < worldHeight * 0.18) {
          const fail = Math.random() < MINO_CFG.dropFailRate;

          if (fail) {
            stopMinoDownSE();
            if (m.render && m.render.sprite) {
              m.render.sprite.texture = MINO_TEX_FAIL;
              setSpriteScaleByPx(m, MINO_CFG.sizePx);
            }
            m.state = "fail";
            m.isSensor = true;
            Body.setVelocity(m, { x: (Math.random() - 0.5) * 0.6, y: MINO_CFG.fallSpeed });
          } else {
            m.state = "carry";
            playMinoDownSE();
          }
        }
        return;
      }

      // carry（上へ消える）
      if (m.state === "carry") {
        playMinoDownSE();
        Body.setAngle(m, 0);
        Body.setVelocity(m, { x: 0, y: MINO_CFG.upSpeed });
        return;
      }

      // ミノムシがcup-line床に触れたらKO（failの時だけ）
if ((bodyA.isMino && bodyB.isCupRim) || (bodyB.isMino && bodyA.isCupRim)) {
  const mino = bodyA.isMino ? bodyA : bodyB;

  if (mino && mino.state === "fail") {
    mino.state = "ko";
    mino._rescueWaking = false;

    // ★KO時SE（1回だけ）
    if (!mino._rakkaPlayed) {
      mino._rakkaPlayed = false; // ★KO SE 二重鳴り防止
      playMinoRakkaSE();
    }

    // ロープ系が残ってるなら外す（沈み/引っ張り事故防止）
    if (mino.rope) { World.remove(world, mino.rope); mino.rope = null; }
    if (mino.carryRope) { World.remove(world, mino.carryRope); mino.carryRope = null; }

    // KO姿勢：cupRimの少し上で固定＆横倒し
    const rimY = cupRim.position.y;
    Body.setPosition(mino, { x: mino.position.x, y: rimY - 12 });
    Body.setVelocity(mino, { x: 0, y: 0 });
    Body.setAngularVelocity(mino, 0);

    const dir = (mino.position.x < worldWidth * 0.5) ? -1 : 1;
    Body.setAngle(mino, dir * (Math.PI / 2));  // 横倒し

    Body.setStatic(mino, true);
    mino.isSensor = true;

    // KO画像に（fail画像を流用するなら不要だけど、明示して安定化）
    if (mino.render && mino.render.sprite) {
      mino.render.sprite.texture = MINO_TEX_FAIL;
    }

    // 星を出す（FX layer）
    createMinoStars(mino);
    updateMinoStarsPosition(mino);

    // 救助アリ（左右から）
    spawnRescueAnt(mino, true);
    spawnRescueAnt(mino, false);

    // レア：ミノムシレディー（必要なら）
    maybeLadyRescue(mino);
  }
}
    });
  }

  /* =========================================================
     落ち葉（ここでは最小限：既存と競合しないよう軽め）
  ========================================================= */
  const obstacleLeaves = new Set();
  let leafTimer = null;

  // 上部センサー（落ち葉でGO用）
  const topSensor = Bodies.rectangle(worldWidth/2, worldHeight*0.09, worldWidth, 24, {
    isStatic: true,
    isSensor: true,
    render: { visible: false }
  });
  topSensor.isTopSensor = true;
  World.add(world, topSensor);

  function spawnObstacleLeaf() {
    if (gameOver) return;

    const w = 70 + Math.random()*50;
    const h = 28 + Math.random()*20;

    const x = worldWidth*(0.20 + Math.random()*0.60);
    const y = -80;

    const leaf = Bodies.rectangle(x, y, w, h, {
      restitution: 0.05,
      friction: 0.06,
      frictionAir: 0.02,
      density: 0.0024,
      render: { fillStyle: "rgba(160,110,60,0.0)" } // 見た目はDOM側で別管理なら透明でOK
    });
    leaf.isObstacleLeaf = true;
    leaf.speed = 0.45 + Math.random()*0.65;

    Body.setVelocity(leaf, { x: (Math.random()-0.5)*0.5, y: leaf.speed });

    obstacleLeaves.add(leaf);
    World.add(world, leaf);
  }

  function scheduleNextLeaf() {
    if (gameOver) return;
    const delay = 900 + Math.random()*1200;
    leafTimer = setTimeout(() => {
      if (!gameOver) spawnObstacleLeaf();
      scheduleNextLeaf();
    }, delay);
  }

  function cleanupObstacleLeaves() {
    obstacleLeaves.forEach(b => {
      if (b.position.y > worldHeight + 240) {
        World.remove(world, b);
        obstacleLeaves.delete(b);
      }
    });
  }

  /* =========================================================
     入力（落下位置）
  ========================================================= */
  let plateX = worldWidth / 2;
  let moveTiltDeg = 0;

  function setPlatePositionByClientX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (worldWidth / rect.width);
    plateX = Math.max(LEFT_MARGIN, Math.min(worldWidth - RIGHT_MARGIN, x));

    if (leafWrapperEl) leafWrapperEl.style.left = `${(plateX / worldWidth) * 100}%`;
    if (previewDropletEl) previewDropletEl.style.left = `${(plateX / worldWidth) * 100}%`;

    const norm = (plateX - worldWidth/2) / (worldWidth/2);
    moveTiltDeg = norm * 6.0;
    if (leafWrapperEl) leafWrapperEl.style.transform = `translateX(-50%) rotate(${moveTiltDeg.toFixed(2)}deg)`;
  }

  function dropNow() {
    if (gameOver) return;
    if (!canDrop) return;
    if (!holding) return;

    dropFromPlate(holding.charIndex, plateX);

    pickNextDroplet();
    setHoldingDroplet(nextCharIndex);
  }

  canvas.addEventListener("pointermove", (e) => setPlatePositionByClientX(e.clientX), { passive: true });
  canvas.addEventListener("pointerdown", (e) => {
    unlockAudioOnce();
    setPlatePositionByClientX(e.clientX);
    dropNow();
  }, { passive: true });

  /* =========================================================
     衝突イベント
  ========================================================= */
  Events.on(engine, "collisionStart", (event) => {
    for (const pair of event.pairs) {
      const bodyA = pair.bodyA;
      const bodyB = pair.bodyB;

      // 涙型が何かに当たった瞬間だけ「丸へ＋SE」
      if (bodyA.isDroplet && bodyA.isTear) { makeRoundIfTear(bodyA); playRandom(sounds.drop); }
      if (bodyB.isDroplet && bodyB.isTear) { makeRoundIfTear(bodyB); playRandom(sounds.drop); }

      // topSensor × 落ち葉
      if ((bodyA.isTopSensor && bodyB.isObstacleLeaf) || (bodyB.isTopSensor && bodyA.isObstacleLeaf)) {
        const leaf = bodyA.isObstacleLeaf ? bodyA : bodyB;
        if (!topLeafTouchMap.has(leaf.id)) topLeafTouchMap.set(leaf.id, performance.now());
        continue;
      }

      // 雫同士の合体
      if (bodyA.isDroplet && bodyB.isDroplet) {
        mergeDroplets(bodyA, bodyB);
        continue;
      }

      // ハチ攻撃（大雫だけ）
      if ((bodyA.isBee && bodyB.isDroplet) || (bodyB.isBee && bodyA.isDroplet)) {
        const bee = bodyA.isBee ? bodyA : bodyB;
        const dro = bodyA.isDroplet ? bodyA : bodyB;

        if (!bee || !dro) continue;
        if (bee.willPass) continue;
        if (bee.hasStung) continue;
        if (!dro.isDroplet || dro.stage !== 2) continue;

        bee.hasStung = true;
        breakLargeToMedium(dro);
        continue;
      }

      // ✅ ミノムシがcup-line床に触れたらKO（failの時だけ）
      if ((bodyA.isMino && bodyB.isCupRim) || (bodyB.isMino && bodyA.isCupRim)) {
        const mino = bodyA.isMino ? bodyA : bodyB;
        if (mino && mino.state === "fail") {
          mino.state = "ko";
          mino._rescueWaking = false;

          // ✅ 追加SE：KO瞬間
          playMinoRakkaOnce();

          // 星を出す
          createMinoStars(mino);
          updateMinoStarsPosition(mino);

          // 救助アリ（左右から）
          spawnRescueAnt(mino, true);
          spawnRescueAnt(mino, false);

          // レア：ミノムシレディー（まずはロジックだけ）
          maybeLadyRescue(mino);
        }
      }
    }
  });

  Events.on(engine, "collisionEnd", (event) => {
    for (const pair of event.pairs) {
      const a = pair.bodyA, b = pair.bodyB;
      if ((a.isTopSensor && b.isObstacleLeaf) || (b.isTopSensor && a.isObstacleLeaf)) {
        const leaf = a.isObstacleLeaf ? a : b;
        topLeafTouchMap.delete(leaf.id);
      }
    }
  });

  /* =========================================================
     毎フレーム
  ========================================================= */
  Events.on(engine, "beforeUpdate", () => {
    if (gameOver) return;

    // ハチ：ふわふわ
    bees.forEach(b => {
      const wobble = Math.sin(performance.now() * 0.003 + b.id) * 0.22;
      Body.setVelocity(b, { x: b.velocity.x, y: wobble });
    });

    // 雫が溜まりすぎたらゲームオーバー
    let dangerDroplets = 0;
    droplets.forEach(d => {
      if (!d.isDroplet) return;
      if (d.isSensor) return;
      if (d.isMerging) return;
      if (d.position.y < DROPLET_GAMEOVER_Y) dangerDroplets++;
    });
    if (dangerDroplets >= DROPLET_GAMEOVER_COUNT) triggerGameOver();

    cleanupBees();
    cleanupObstacleLeaves();

    updateMinosAI();
    cleanupMinos();

    // topSensor（落ち葉でGO）
    const now = performance.now();
    for (const [id, t0] of topLeafTouchMap) {
      const leaf = Array.from(obstacleLeaves).find(x => x.id === id);
      if (!leaf) { topLeafTouchMap.delete(id); continue; }
      const slow = leaf.speed < 0.55;
      if (slow && (now - t0) >= TOP_LEAF_TOUCH_MS) { triggerGameOver(); break; }
    }
  });

  /* =========================================================
     リセット
  ========================================================= */
  function resetGame() {
    gameOver = false;
    canDrop  = true;

    stopMinoDownSE();
    stopMinoRakka();
    topLeafTouchMap.clear();

    if (gameOverOverlay) gameOverOverlay.classList.remove("visible");

    score = 0;
    updateScoreGauge();

    stopAllTimers();

    droplets.forEach((body) => World.remove(world, body));
    droplets.clear();

    obstacleLeaves.forEach((b) => World.remove(world, b));
    obstacleLeaves.clear();

    bees.forEach((b) => { stopBeeBuzz(b); World.remove(world, b); });
    bees.clear();

    minos.forEach((m) => {
      removeMinoStars(m);
      World.remove(world, m);
    });
    minos.clear();

    clearAnts();

    plateX = worldWidth / 2;
    if (leafWrapperEl) leafWrapperEl.style.left = "50%";
    if (previewDropletEl) previewDropletEl.style.left = "50%";
    moveTiltDeg = 0;
    if (leafWrapperEl) leafWrapperEl.style.transform = "translateX(-50%) rotate(0deg)";

    pickNextDroplet();
    setHoldingDroplet(nextCharIndex);

    scheduleNextLeaf();
    scheduleAntSpawn();

    beeCooldownUntil = performance.now() + 3500;
    minoCooldownUntil = performance.now() + 4500;

    requestAnimationFrame(() => syncCupRimToVisual());
  }

  if (resetBtn) resetBtn.addEventListener("click", resetGame);
  if (overlayRestartBtn) overlayRestartBtn.addEventListener("click", resetGame);

  /* ===== 初期化 ===== */
  resetGame();

  /* =========================================================
     追加：starsの簡易アニメ（CSSを触らずJS注入）
  ========================================================= */
  const injected = document.createElement("style");
  injected.textContent = `
    @keyframes minoStarsPulse {
      0%   { transform: scale(1.00); opacity: 0.85; }
      50%  { transform: scale(1.08); opacity: 1.00; }
      100% { transform: scale(1.00); opacity: 0.85; }
    }
    .ant.rescue { opacity: 0.95; }
    .mino-stars img { will-change: transform, opacity; }
  `;
  document.head.appendChild(injected);

})();
