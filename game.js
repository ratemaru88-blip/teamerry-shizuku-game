(() => {
  const { Engine, Render, Runner, World, Bodies, Body, Events, Constraint } = Matter;

  /* ===== DOM ===== */
  const canvas            = document.getElementById("gameCanvas");
  const cupLineEl         = document.getElementById("cupLine");
  const resetBtn          = document.getElementById("resetBtn");
  const previewDropletEl  = document.getElementById("previewDroplet");
  const leafWrapperEl     = document.getElementById("leafWrapper");
  const gameOverOverlay   = document.getElementById("gameOverOverlay");
  const finalScoreText    = document.getElementById("finalScoreText");
  const overlayRestartBtn = document.getElementById("overlayRestartBtn");
  const helpBtn           = document.getElementById("helpBtn");
  const antsLayer         = document.getElementById("antsLayer");

  // スコアUI（残っててもOK）
  const scoreLabel     = document.getElementById("scoreLabel");
  const scoreGaugeFill = document.getElementById("scoreGaugeFill");
  const scoreGaugeText = document.getElementById("scoreGaugeText");

  if (!canvas) {
    console.error("gameCanvas が見つかりません");
    return;
  }

  /* ===== FX layer（星など）===== */
  let minoFxLayer = document.getElementById("minoFxLayer");
  if (!minoFxLayer) {
    minoFxLayer = document.createElement("div");
    minoFxLayer.id = "minoFxLayer";
    document.body.appendChild(minoFxLayer);
  }

  /* ===== CSSをJSで注入（星演出用）===== */
  (function injectMinoFxCss() {
    const id = "minoFxCss";
    if (document.getElementById(id)) return;

    const st = document.createElement("style");
    st.id = id;
    st.textContent = `
      #minoFxLayer{
        position: fixed;
        left:0; top:0;
        width:100vw; height:100vh;
        pointer-events:none;
        z-index: 10050;
      }
      .mino-stars{
        position:absolute;
        width:1px; height:1px;
        transform: translate(-50%,-50%);
        animation: minoStarSpin 1.0s linear infinite;
        opacity: 0.95;
        filter: drop-shadow(0 1px 2px rgba(0,0,0,.15));
      }
      .mino-stars img.star{
        position:absolute;
        width:18px; height:18px;
        transform: translate(-50%,-50%);
      }
      @keyframes minoStarSpin{
        from { transform: translate(-50%,-50%) rotate(0deg); }
        to   { transform: translate(-50%,-50%) rotate(360deg); }
      }
    `;
    document.head.appendChild(st);
  })();

  /* ===== Matter.js 基本設定 ===== */
  const worldWidth  = 360;
  const worldHeight = 580;

  canvas.width  = worldWidth;
  canvas.height = worldHeight;

  const LEFT_MARGIN  = 34;
  const RIGHT_MARGIN = 26;

  // ===== ゲームオーバー判定（雫：上部に溜まりすぎ）=====
  const DROPLET_GAMEOVER_Y = worldHeight * 0.28; // この高さより上に溜まると危険
  const DROPLET_GAMEOVER_COUNT = 4;              // この個数以上でGAME OVER

  const engine = Engine.create();
  const world  = engine.world;
  world.gravity.y = 1.05;

  engine.positionIterations = 10;
  engine.velocityIterations = 8;

  const render = Render.create({
    canvas,
    engine,
    options: {
      width: worldWidth,
      height: worldHeight,
      wireframes: false,
      background: "transparent",
    },
  });

  Render.run(render);
  const runner = Runner.create();
  Runner.run(runner, engine);

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  /* =========================================================
     cup-line（見た目）と床（物理）を同期
  ========================================================= */
  const RIM_FROM_BOTTOM = 1.20;
  const RIM_EXTRA_UP_PX = 8;

  function getWorldToScreenScale() {
    const rect = canvas.getBoundingClientRect();
    return rect.width / worldWidth;
  }
  function screenToWorldY(screenY) {
    const rect = canvas.getBoundingClientRect();
    const s = getWorldToScreenScale();
    return (screenY - rect.top) / s;
  }
  function worldToScreen(x, y) {
    const rect = canvas.getBoundingClientRect();
    const s = getWorldToScreenScale();
    return { sx: rect.left + x * s, sy: rect.top + y * s };
  }

  let rimFloorA = null;
  let rimFloorB = null;
  let topSensor = null;
  let cupRimYWorld = worldHeight - 90;

  function buildBoundsOnce() {
    const centerX = (LEFT_MARGIN + (worldWidth - RIGHT_MARGIN)) / 2;
    const width = (worldWidth - LEFT_MARGIN - RIGHT_MARGIN);

    const thickA = 44;
    const thickB = 18;

    rimFloorA = Bodies.rectangle(
      centerX,
      cupRimYWorld + thickA * 0.5,
      width,
      thickA,
      { isStatic:true, friction: 0.22, restitution: 0.20, render:{ visible:false } }
    );
    rimFloorA.isCupRim = true;

    rimFloorB = Bodies.rectangle(
      centerX,
      cupRimYWorld + 16 + thickB * 0.5,
      width,
      thickB,
      { isStatic:true, friction: 0.22, restitution: 0.20, render:{ visible:false } }
    );
    rimFloorB.isCupRim = true;

    const leftWall = Bodies.rectangle(
      LEFT_MARGIN,
      worldHeight / 2,
      20,
      worldHeight * 2,
      { isStatic: true, render: { visible: false } }
    );

    const rightWall = Bodies.rectangle(
      worldWidth - RIGHT_MARGIN,
      worldHeight / 2,
      20,
      worldHeight * 2,
      { isStatic: true, render: { visible: false } }
    );

    topSensor = Bodies.rectangle(
      worldWidth / 2,
      worldHeight * 0.12,
      worldWidth * 0.82,
      10,
      { isStatic: true, isSensor: true, render: { visible: false } }
    );
    topSensor.isTopSensor = true;

    World.add(world, [rimFloorA, rimFloorB, leftWall, rightWall, topSensor]);
  }

  function syncCupRimToVisual() {
    if (!cupLineEl) return;
    const cupRect = cupLineEl.getBoundingClientRect();
    const s = getWorldToScreenScale();

    const rimScreenY = cupRect.bottom - (cupRect.height * RIM_FROM_BOTTOM) - (RIM_EXTRA_UP_PX * s);
    const rimWorldY = screenToWorldY(rimScreenY);

    cupRimYWorld = clamp(rimWorldY, worldHeight * 0.45, worldHeight - 18);

    const centerX = (LEFT_MARGIN + (worldWidth - RIGHT_MARGIN)) / 2;

    if (rimFloorA) {
      const thickA = rimFloorA.bounds.max.y - rimFloorA.bounds.min.y;
      Body.setPosition(rimFloorA, { x: centerX, y: cupRimYWorld + thickA * 0.5 });
    }
    if (rimFloorB) {
      const thickB = rimFloorB.bounds.max.y - rimFloorB.bounds.min.y;
      Body.setPosition(rimFloorB, { x: centerX, y: cupRimYWorld + 16 + thickB * 0.5 });
    }
  }

  buildBoundsOnce();
  requestAnimationFrame(() => syncCupRimToVisual());
  window.addEventListener("resize", () => requestAnimationFrame(() => syncCupRimToVisual()));

  /* ===== スコア＆ゲージ ===== */
  let score = 0;

  // “渋め” 調整
  const STAGE_SCORES = [15, 35, 70, 120];
  const STAGE_CLEAR_SCORE = 3800;

  function updateScoreGauge() {
    if (scoreLabel) scoreLabel.textContent = String(score);

    if (scoreGaugeFill) {
      const p = Math.max(0, Math.min(1, score / STAGE_CLEAR_SCORE));
      scoreGaugeFill.style.width = `${(p * 100).toFixed(1)}%`;
    }
    if (scoreGaugeText) scoreGaugeText.textContent = String(score);
  }

  function addScoreForStage(stageIndex, bonus = 0) {
    const base = STAGE_SCORES[Math.min(stageIndex, STAGE_SCORES.length - 1)] || 0;
    score += base + bonus;
    updateScoreGauge();
  }

  /* ===== ゲーム状態 ===== */
  let nextCharIndex = 0;
  let canDrop       = true;
  let gameOver      = false;

  let plateX = worldWidth / 2;
  let holding = null;

  let moveTiltDeg = 0;
  let tiltRAF = 0;

  function updateMoveTilt() {
    if (leafWrapperEl) leafWrapperEl.style.transform = `translateX(-50%) rotate(${moveTiltDeg.toFixed(2)}deg)`;
    tiltRAF = 0;
  }

  function playLeafDropKick() {
    if (!leafWrapperEl || !leafWrapperEl.animate) return;
    const base = moveTiltDeg;
    leafWrapperEl.animate(
      [
        { transform: `translateX(-50%) rotate(${base}deg) translateY(0px)` },
        { transform: `translateX(-50%) rotate(${base - 8}deg) translateY(2px)` },
        { transform: `translateX(-50%) rotate(${base + 3}deg) translateY(-1px)` },
        { transform: `translateX(-50%) rotate(${base}deg) translateY(0px)` }
      ],
      { duration: 320, easing: "cubic-bezier(.2,.9,.2,1)" }
    );
  }

  /* ===== 半径/合体段階 ===== */
  const BASE_SIZE = worldWidth;
  const STAGE_RADIUS = [
    BASE_SIZE * 0.055,
    BASE_SIZE * 0.085,
    BASE_SIZE * 0.12
  ];
  const NUM_STAGES = 3;
  const STAGE_KEYS = ["small", "medium", "large"];
  const VISUAL_SCALE = 1.0;

  /* ===== 画像 ===== */
  const LEAF_OBS_TEX = "https://static.wixstatic.com/media/e0436a_3390aa571a914ab086b2db00a8c76def~mv2.png";
  const BEE_TEX_L = "https://static.wixstatic.com/media/e0436a_750ead96817a40618e8cf9aa30a07192~mv2.png";
  const BEE_TEX_R = "https://static.wixstatic.com/media/e0436a_810f0f4624bb4807bdc0a97652bf3d18~mv2.webp";

  const MINO_TEX_AWAKE  = "https://static.wixstatic.com/media/e0436a_f97b18842a08467cb278f6c742324cdd~mv2.webp";
  const LADY_TEX        = "https://static.wixstatic.com/media/e0436a_e909e47044fe4710aacf24a377710ec8~mv2.webp";
  const MINO_STAR_TEX   = "https://static.wixstatic.com/media/e0436a_79b105a5d8ab45f69f349e31177e9654~mv2.png";

  const MINO_TEX_NORMAL = "https://static.wixstatic.com/media/e0436a_bd2aa3d132364f9d83a9eb4bdabce505~mv2.webp";
  const MINO_TEX_FAIL   = "https://static.wixstatic.com/media/e0436a_1c7df1f465164bdeba93ac98ce62b9aa~mv2.webp";

  /* ===== 雫画像定義（7種）===== */
  const dropletTypes = [
    {
      name: "雫 カカオ",
      sprites: {
        small:  "https://static.wixstatic.com/media/e0436a_483f6f6d811f492792a065f4d133cfa6~mv2.webp",
        medium: "https://static.wixstatic.com/media/e0436a_586cd771473f4b53bc12338dddd4dba3~mv2.webp",
        large:  "https://static.wixstatic.com/media/e0436a_cbb0dbce0f3e40c9b3baecb9e9072888~mv2.webp"
      },
      dropSmall: "https://static.wixstatic.com/media/e0436a_bb3c5da4639149d3a9345b4565d349c9~mv2.webp"
    },
    {
      name: "雫 パック",
      sprites: {
        small:  "https://static.wixstatic.com/media/e0436a_fa3e427a6ef944fdbb05739f84eb176b~mv2.webp",
        medium: "https://static.wixstatic.com/media/e0436a_3c2cb1deb380451c9e92d90631809589~mv2.webp",
        large:  "https://static.wixstatic.com/media/e0436a_0ead8a3ab6e94c67890ce3e4b3a7c266~mv2.webp"
      },
      dropSmall: "https://static.wixstatic.com/media/e0436a_fe05ae20409848c5970df1385d7bdcff~mv2.webp"
    },
    {
      name: "雫 ペアペア",
      sprites: {
        small:  "https://static.wixstatic.com/media/e0436a_6c813d3c192142ea8651248d6fdf8134~mv2.webp",
        medium: "https://static.wixstatic.com/media/e0436a_a9e5181bc9e146d5ad81c8b645a03056~mv2.webp",
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

  /* ===== 効果音 ===== */
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

  /* ===== オーディオ解放（スマホ対策）===== */
  let audioUnlocked = false;
  function unlockAudioOnce() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    const all = [
      ...sounds.drop, ...sounds.merge, ...sounds.buzz, ...sounds.beeBreak,
      // ミノムシSEもここに入れる（後で定義されるので関数内では参照しない）
    ];
    all.forEach(a => {
      try { a.volume = a.volume ?? 0.3; } catch(e){}
      try { a.muted = true; a.play().then(()=>{ a.pause(); a.currentTime = 0; a.muted = false; }).catch(()=>{ a.muted = false; }); }
      catch(e){}
    });
  }

  // ===== ミノムシ移動SE（降下〜上昇中）=====
  const MINO_DOWN_SFX_URL = "https://static.wixstatic.com/mp3/e0436a_01f90882f58c4f5ea1d3d0f48b5e30a1.wav";
  const minoDownSE = new Audio(MINO_DOWN_SFX_URL);
  minoDownSE.loop = true;  // ✅移動中はループ
  minoDownSE.volume = 0.28;

  function playMinoDownSE(){
    if (!audioUnlocked) return;
    try {
      if (minoDownSE.paused) {
        minoDownSE.currentTime = 0;
        minoDownSE.play();
      }
    } catch(e){}
  }
  function stopMinoDownSE(){
    try {
      if (!minoDownSE.paused) {
        minoDownSE.pause();
        minoDownSE.currentTime = 0;
      }
    } catch(e){}
  }

  /* ===== helpボタン（ゲーム説明）===== */
  if (helpBtn) {
    helpBtn.addEventListener("click", () => {
      window.open("https://static.wixstatic.com/media/e0436a_5eca3cb13f9947bd86a0ae6bc1553895~mv2.jpg", "_blank");
    });
  }

  /* ===== Spriteスケール補正 ===== */
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

    function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      let mul;
      if (t < 0.5) mul = 1 + (maxMul - 1) * easeInOut(t * 2);
      else         mul = maxMul + (1 - maxMul) * easeInOut((t - 0.5) * 2);

      sprite.xScale = baseX * mul;
      sprite.yScale = baseY * mul;

      if (t < 1) requestAnimationFrame(step);
      else {
        sprite.xScale = body.baseSpriteScale || baseX;
        sprite.yScale = body.baseSpriteScale || baseY;
        body.isSquishing = false;
      }
    }
    requestAnimationFrame(step);
  }

  /* ===== お邪魔落ち葉 ===== */
  const obstacleLeaves = new Set();
  let leafTimer = null;

  const OBSTACLE_LEAF = {
    radius: 18,
    density: 0.00055,
    restitution: 0.35,
    friction: 0.02,
    frictionAir: 0.06,
  };

  function spawnObstacleLeaf() {
    if (gameOver) return;

    const r = OBSTACLE_LEAF.radius;
    const minX = LEFT_MARGIN + r;
    const maxX = worldWidth - RIGHT_MARGIN - r;

    const x = minX + Math.random() * (maxX - minX);
    const y = -30;

    const leaf = Bodies.circle(x, y, r, {
      density: OBSTACLE_LEAF.density,
      restitution: OBSTACLE_LEAF.restitution,
      friction: OBSTACLE_LEAF.friction,
      frictionAir: OBSTACLE_LEAF.frictionAir,
      render: {
        fillStyle: "transparent",
        sprite: { texture: LEAF_OBS_TEX, xScale: 1, yScale: 1 }
      }
    });

    leaf.isObstacleLeaf = true;
    obstacleLeaves.add(leaf);
    World.add(world, leaf);
    setSpriteScaleByPx(leaf, r * 2);
  }

  function scheduleNextLeaf() {
    if (gameOver) return;
    const delay = 7000 + Math.random() * 6000;

    if (leafTimer) clearTimeout(leafTimer);
    leafTimer = setTimeout(() => {
      if (!gameOver && Math.random() < 0.6) spawnObstacleLeaf();
      scheduleNextLeaf();
    }, delay);
  }

  function cleanupObstacleLeaves() {
    obstacleLeaves.forEach(l => {
      if (l.position.y > worldHeight + 120) {
        World.remove(world, l);
        obstacleLeaves.delete(l);
      }
    });
  }

  /* =========================================================
     🐝 ハチ
  ========================================================= */
  const bees = new Set();
  let beeTimer = null;
  let beeCooldownUntil = 0;

  const BEE_CFG = {
    sizePx: 42,
    speedMin: 1.15,
    speedMax: 1.75,
    delayMin: 900,
    delayMax: 1900,
    passRate: 0.35,
    cooldownMs: 9000,
  };

  function startBeeBuzz(bee) {
    try {
      const base = sounds.buzz[0];
      if (!base) return;
      const buzz = base.cloneNode(true);
      buzz.loop = true;
      buzz.volume = base.volume;
      bee._buzz = buzz;
      buzz.play().catch(()=>{});
    } catch (e) {}
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

    const speedMag =
      Math.random() * (BEE_CFG.speedMax - BEE_CFG.speedMin) + BEE_CFG.speedMin;

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

    droplets.delete(targetDroplet);
    World.remove(world, targetDroplet);

    const newStage = 1;
    const r = STAGE_RADIUS[newStage];
    const tex = type.sprites && type.sprites[STAGE_KEYS[newStage]];

    const newBody = createDropletBody({
      charIndex: targetDroplet.charIndex,
      stage: newStage,
      x: centerX,
      y: centerY,
      radius: r,
      texture: tex,
      isTear: false
    });

    Body.setVelocity(newBody, { x: (Math.random() - 0.5) * 1.2, y: -2 });
    squish(newBody, 1.12, 220);
  }

  /* =========================================================
     🐛 ミノムシ
  ========================================================= */
  const minos = new Set();
  let minoTimer = null;
  let minoCooldownUntil = 0;

  const SWAY_START_Y = worldHeight * 0.58;
  const MINO_CFG = {
    sizePx: 41,
    downSpeed: 1.35,
    upSpeed: -1.05,
    fallSpeed: 1.8,
    delayMin: 1100,
    delayMax: 2400,
    cooldownMs: 14000,
    dropFailRate: 0.22
  };

  // ★KO星エフェクト
  const minoStarsMap = new Map(); // mino.id -> { wrap }
  function createMinoStars(mino){
    if (!mino || minoStarsMap.has(mino.id)) return;
    const wrap = document.createElement("div");
    wrap.className = "mino-stars";
    // 3つくらい星
    const angles = [0, 130, 240];
    angles.forEach((deg, i) => {
      const img = document.createElement("img");
      img.className = "star";
      img.src = MINO_STAR_TEX;
      const r = 22;
      const rad = (deg * Math.PI) / 180;
      img.style.left = `${Math.cos(rad) * r}px`;
      img.style.top  = `${Math.sin(rad) * r}px`;
      wrap.appendChild(img);
    });
    minoFxLayer.appendChild(wrap);
    minoStarsMap.set(mino.id, { wrap });
  }
  function updateMinoStarsPosition(mino){
    const obj = minoStarsMap.get(mino.id);
    if (!obj) return;
    const p = worldToScreen(mino.position.x, mino.position.y - 22);
    obj.wrap.style.left = `${p.sx}px`;
    obj.wrap.style.top  = `${p.sy}px`;
  }
  function removeMinoStars(mino){
    const obj = minoStarsMap.get(mino.id);
    if (!obj) return;
    try { obj.wrap.remove(); } catch(e){}
    minoStarsMap.delete(mino.id);
  }

  function spawnMino() {
    if (gameOver) return;

    const x = worldWidth * (0.35 + Math.random() * 0.30);
    const y = -70;

    const mino = Bodies.rectangle(x, y, 60, 76, {
      isSensor: true,
      frictionAir: 0.0,
      render: { sprite: { texture: MINO_TEX_NORMAL, xScale: 1, yScale: 1 } }
    });

    mino.isMino = true;
    mino.state = "down";
    mino.grab = null;
    mino.carryRope = null;

    mino.isSensor = true;

    mino._inertiaOrig = mino.inertia;
    Body.setInertia(mino, Infinity);
    Body.setAngle(mino, 0);

    mino.spawnAt = performance.now();
    mino.windSeed = Math.random() * 1000;

    setSpriteScaleByPx(mino, MINO_CFG.sizePx);
    Body.setVelocity(mino, { x: 0, y: MINO_CFG.downSpeed });

    World.add(world, mino);
    minos.add(mino);

    const anchor = { x, y: -180 };
    const ropeLen = (SWAY_START_Y - anchor.y) + 12;
    const rope = Constraint.create({
      pointA: anchor,
      bodyB: mino,
      pointB: { x: 0, y: -18 },
      length: ropeLen,
      stiffness: 0.02,
      damping: 0.18,
      render: { visible: true, strokeStyle: "rgba(255,255,255,0.55)", lineWidth: 2 }
    });

    mino.rope = rope;
    mino.ropeAnchor = anchor;
    World.add(world, rope);

    playMinoDownSE(); // ✅降下開始で鳴らす
  }

  function maybeScheduleMino() {
    if (minos.size >= 1) return;

    const now = performance.now();
    if (now < minoCooldownUntil) return;

    const hasAny = droplets.size >= 5 || obstacleLeaves.size >= 1;
    if (!hasAny) return;
    if (Math.random() > 0.22) return;

    minoCooldownUntil = now + MINO_CFG.cooldownMs;

    const delay = MINO_CFG.delayMin + Math.random() * (MINO_CFG.delayMax - MINO_CFG.delayMin);
    if (minoTimer) clearTimeout(minoTimer);
    minoTimer = setTimeout(() => { if (!gameOver) spawnMino(); }, delay);
  }

  function pickMinoTarget() {
    const leaves = Array.from(obstacleLeaves).filter(b => b && !b.isStatic && !b.isGrabbedByMino);
    if (leaves.length > 0) return leaves[Math.floor(Math.random() * leaves.length)];

    const ds = Array.from(droplets).filter(d => d && d.isDroplet && !d.isGrabbedByMino);
    if (ds.length > 0) return ds[Math.floor(Math.random() * ds.length)];

    return null;
  }

  function attachToMino(mino, target) {
    if (!mino || !target) return;
    if (target.isGrabbedByMino) return;

    target._densityOrig = target.density;
    target._sensorOrig = target.isSensor;

    try { Body.setDensity(target, Math.max(0.0002, target.density * 0.35)); } catch(e) {}
    target.isSensor = false;
    target.isGrabbedByMino = true;

    const carry = Constraint.create({
      bodyA: mino,
      pointA: { x: 0, y: 18 },
      bodyB: target,
      pointB: { x: 0, y: 0 },
      length: 18,
      stiffness: 0.25,
      damping: 0.12,
      render: { visible: true, strokeStyle: "rgba(255,255,255,0.35)", lineWidth: 2 }
    });

    mino.grab = target;
    mino.carryRope = carry;
    World.add(world, carry);
  }

  function detachMino(mino, makeFailFace = false) {
    if (!mino) return;

    if (mino.carryRope) {
      World.remove(world, mino.carryRope);
      mino.carryRope = null;
    }

    if (mino.grab) {
      const g = mino.grab;
      g.isGrabbedByMino = false;

      if (g._densityOrig != null) { try { Body.setDensity(g, g._densityOrig); } catch(e) {} }
      if (g._sensorOrig != null) g.isSensor = g._sensorOrig;

      mino.grab = null;
    }

    if (makeFailFace) {
      if (mino.render && mino.render.sprite) {
        mino.render.sprite.texture = MINO_TEX_FAIL;
        setSpriteScaleByPx(mino, MINO_CFG.sizePx);
      }
      mino.isSensor = true;
    } else {
      mino.isSensor = true;
      Body.setInertia(mino, Infinity);
    }
  }

  function cleanupMinos() {
    minos.forEach(m => {
      if (m.position.y > worldHeight + 240) {
        stopMinoDownSE();
        removeMinoStars(m);
        if (m.rope) World.remove(world, m.rope);
        if (m.carryRope) World.remove(world, m.carryRope);
        World.remove(world, m);
        minos.delete(m);
      }
    });
  }

  function updateMinosAI() {
    if (gameOver) return;

    const now = performance.now();
    const SWAY_PX = 8;

    minos.forEach(m => {
      // 星位置更新（KO中）
      if (m.state === "ko") updateMinoStarsPosition(m);

      if (m.rope && m.ropeAnchor) {
        if (m.position.y >= SWAY_START_Y) {
          const t = (now - (m.spawnAt || now)) * 0.001;
          const sway = Math.sin(t * 1.2 + m.windSeed) * SWAY_PX;
          m.rope.pointA.x = clamp(m.ropeAnchor.x + sway, LEFT_MARGIN + 30, worldWidth - RIGHT_MARGIN - 30);
        } else {
          m.rope.pointA.x = m.ropeAnchor.x;
        }
      }

      // ---- DOWN（降下）----
      if (m.state === "down") {
        playMinoDownSE(); // ✅降下中鳴らす（保険）
        if (m.position.y >= SWAY_START_Y) {
          stopMinoDownSE(); // ✅止まるので止める
          Body.setPosition(m, { x: m.position.x, y: SWAY_START_Y });
          Body.setVelocity(m, { x: 0, y: 0 });
          m.state = "pause";
          m.pauseUntil = now + 520 + Math.random() * 380;
        } else {
          Body.setVelocity(m, { x: 0, y: MINO_CFG.downSpeed });
        }
        return;
      }

      // ---- PAUSE（止まる）----
      if (m.state === "pause") {
        stopMinoDownSE();
        Body.setVelocity(m, { x: 0, y: 0 });
        if (now >= m.pauseUntil) {
          const t = pickMinoTarget();
          if (t) attachToMino(m, t);
          m.state = "lift";
          playMinoDownSE(); // ✅上昇開始で鳴らす（ここが重要！）
        }
        return;
      }

      // ---- LIFT（上昇）----
      if (m.state === "lift") {
        playMinoDownSE();
        Body.setAngle(m, 0);

        if (m.rope) {
          m.rope.stiffness = 0.06;
          m.rope.length = Math.max(120, m.rope.length - 1.6);
        }

        Body.setVelocity(m, { x: 0, y: MINO_CFG.upSpeed });

        if (m.position.y < worldHeight * 0.18) {
          const fail = Math.random() < MINO_CFG.dropFailRate && !!m.grab;

          if (fail) {
            stopMinoDownSE(); // ✅失敗落下は鳴らさない
            const g = m.grab;
            detachMino(m, true);

            if (g && g.position) {
              Body.setVelocity(g, { x: (Math.random() - 0.5) * 1.0, y: MINO_CFG.fallSpeed });
            }

            if (m.rope) { World.remove(world, m.rope); m.rope = null; }

            m.state = "fail";
            m.isSensor = true;
            Body.setVelocity(m, { x: (Math.random() - 0.5) * 0.6, y: MINO_CFG.fallSpeed });
          } else {
            m.state = "carry";
            playMinoDownSE(); // ✅carryも鳴らす（保険）
          }
        }
        return;
      }

      // ---- CARRY（回収して上昇）----
      if (m.state === "carry") {
        playMinoDownSE();
        Body.setAngle(m, 0);

        if (m.rope) {
          m.rope.stiffness = 0.07;
          m.rope.length = Math.max(90, m.rope.length - 1.9);
        }

        Body.setVelocity(m, { x: 0, y: MINO_CFG.upSpeed });

        if (m.position.y < -130) {
          // 成功：掴んでたものは回収（消す）
          if (m.grab) {
            const g = m.grab;
            detachMino(m, false);

            if (g) {
              if (obstacleLeaves.has(g)) obstacleLeaves.delete(g);
              if (droplets.has(g)) droplets.delete(g);
              World.remove(world, g);
            }
          }

          stopMinoDownSE(); // ✅消える直前で必ず止める
          removeMinoStars(m);
          if (m.rope) World.remove(world, m.rope);
          World.remove(world, m);
          minos.delete(m);
        }
        return;
      }

      // ---- FAIL（失敗落下）----
      if (m.state === "fail") {
        stopMinoDownSE();
        m.isSensor = true;

        Body.setVelocity(m, {
          x: clamp(m.velocity.x, -1.2, 1.2),
          y: Math.max(m.velocity.y, MINO_CFG.fallSpeed)
        });

        if (m.position.y > worldHeight + 240) {
          removeMinoStars(m);
          World.remove(world, m);
          minos.delete(m);
        }
        return;
      }

      // ---- KO（cup-lineで倒れる）----
      if (m.state === "ko") {
        stopMinoDownSE();
        Body.setVelocity(m, { x: 0, y: 0 });
        Body.setAngularVelocity(m, 0);

        if (now >= (m.koUntil || 0)) {
          // 復帰：上がって消える
          m.state = "liftAfterKo";
          Body.setStatic(m, false);
          Body.setAngle(m, 0);

          if (m.render && m.render.sprite) {
            m.render.sprite.texture = MINO_TEX_NORMAL;
            setSpriteScaleByPx(m, MINO_CFG.sizePx);
          }

          playMinoDownSE(); // ✅復帰上昇でも鳴らす
          Body.setVelocity(m, { x: 0, y: -2.2 });
          squish(m, 1.25, 220);
        }
        return;
      }

      // ---- liftAfterKo（復帰上昇）----
      if (m.state === "liftAfterKo") {
        playMinoDownSE();
        Body.setVelocity(m, { x: 0, y: -2.1 });

        if (m.position.y < -130) {
          stopMinoDownSE();
          removeMinoStars(m);
          World.remove(world, m);
          minos.delete(m);
        }
        return;
      }
    });
  }

  /* ===== タイマー停止 ===== */
  function stopAllTimers() {
    if (leafTimer) { clearTimeout(leafTimer); leafTimer = null; }
    if (beeTimer)  { clearTimeout(beeTimer);  beeTimer = null; }
    if (minoTimer) { clearTimeout(minoTimer); minoTimer = null; }
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

  /* ===== 次の雫 ===== */
  function pickNextDroplet() {
    nextCharIndex = Math.floor(Math.random() * dropletTypes.length);
  }

  /* ===== 皿の上の雫 ===== */
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

  /* ===== 合体 ===== */
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

  /* ===== GameOver ===== */
  const topLeafTouchMap = new Map(); // leaf.id -> firstTouchTime
  const TOP_LEAF_TOUCH_MS = 1400;

  function triggerGameOver() {
    if (gameOver) return;
    gameOver = true;
    canDrop = false;
    stopAllTimers();
    stopMinoDownSE();

    if (finalScoreText) finalScoreText.textContent = `SCORE：${score}`;
    if (gameOverOverlay) gameOverOverlay.classList.add("visible");
  }

  /* ===== 衝突判定 ===== */
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

      // ミノムシがcup-line床に触れたらKO（failの時だけ）
      if ((bodyA.isMino && bodyB.isCupRim) || (bodyB.isMino && bodyA.isCupRim)) {
        const mino = bodyA.isMino ? bodyA : bodyB;
        if (mino && mino.state === "fail") {
          mino.state = "ko";
          mino.koUntil = performance.now() + 4500;

          // cup-line上に固定
          try { Body.setPosition(mino, { x: mino.position.x, y: cupRimYWorld - 8 }); } catch(e){}

          stopMinoDownSE();
          mino.isSensor = true;
          Body.setVelocity(mino, { x: 0, y: 0 });
          Body.setAngularVelocity(mino, 0);
          Body.setAngle(mino, 1.57);
          Body.setStatic(mino, true);

          createMinoStars(mino);
          updateMinoStarsPosition(mino);
          mino.needsHelp = true;
        }
        continue;
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

  /* ===== 毎フレーム ===== */
  Events.on(engine, "beforeUpdate", () => {
    if (gameOver) return;

    // ハチ：ふわふわ（必要なら削除OK）
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

  /* ===== 入力 ===== */
  function setPlatePositionByClientX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const ratioX = (clientX - rect.left) / rect.width;

    const radius = STAGE_RADIUS[0];
    const minX = LEFT_MARGIN + radius;
    const maxX = worldWidth - RIGHT_MARGIN - radius;

    const prevX = plateX;
    plateX = Math.max(minX, Math.min(maxX, ratioX * worldWidth));

    const percent = (plateX / worldWidth) * 100;
    if (leafWrapperEl) leafWrapperEl.style.left = percent + "%";
    if (previewDropletEl) previewDropletEl.style.left = percent + "%";

    const dx = plateX - prevX;
    const target = clamp(dx * 0.25, -2.5, 2.5);
    moveTiltDeg = moveTiltDeg * 0.75 + target * 0.25;
    if (!tiltRAF) tiltRAF = requestAnimationFrame(updateMoveTilt);
  }

  function dropCurrentDroplet() {
    if (!canDrop || gameOver) return;
    if (!holding) return;

    playLeafDropKick();
    dropFromPlate(holding.charIndex, plateX);

    // 落としただけ点（渋め）
    addScoreForStage(0, -5);

    pickNextDroplet();
    setHoldingDroplet(nextCharIndex);

    canDrop = false;
    setTimeout(() => { if (!gameOver) canDrop = true; }, 260);

    maybeScheduleBee();
    maybeScheduleMino();
  }

  canvas.addEventListener("pointermove", (e) => setPlatePositionByClientX(e.clientX));
  canvas.addEventListener("pointerdown", (e) => {
    unlockAudioOnce();
    setPlatePositionByClientX(e.clientX);
    dropCurrentDroplet();
  });

  /* =========================================================
     🐜 アリ（DOM：2コマ歩行）
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

  function clearAnts() {
    if (!antsLayer) return;
    ants.forEach(a => a.el.remove());
    ants = [];
    if (antSpawnTimer) { clearTimeout(antSpawnTimer); antSpawnTimer = null; }
    if (antsRAF) { cancelAnimationFrame(antsRAF); antsRAF = 0; }
    antsLastT = 0;
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

  function startAntsLoop() {
    if (antsRAF) return;
    antsLastT = performance.now();
    antsRAF = requestAnimationFrame(updateAnts);
  }

  function updateAnts(t) {
    antsRAF = 0;
    if (gameOver) return;
    if (!antsLayer) return;

    const dt = Math.min(0.05, (t - antsLastT) / 1000);
    antsLastT = t;

    const layerW = antsLayer.getBoundingClientRect().width;

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

    if (ants.length > 0) antsRAF = requestAnimationFrame(updateAnts);
  }

  /* ===== リセット ===== */
  function resetGame() {
    gameOver = false;
    canDrop  = true;

    stopMinoDownSE();
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
      if (m.rope) World.remove(world, m.rope);
      if (m.carryRope) World.remove(world, m.carryRope);
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

    requestAnimationFrame(()=>syncCupRimToVisual());
  }

  if (resetBtn) resetBtn.addEventListener("click", resetGame);
  if (overlayRestartBtn) overlayRestartBtn.addEventListener("click", resetGame);

  // 初期化
  resetGame();
})();
