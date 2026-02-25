(() => {
 // ===== 応急：壊れた画像でもdrawImageで落ちない =====
(() => {
  const _draw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (...args) {
    try { return _draw.apply(this, args); } catch (e) { /* ignore */ }
  };
})();

  /* =========================================================
     森のしずくゲーム（整理版・完全最新版）
     - unlockAudioOnce 構文エラー修正
     - ミノムシKO：倒れる/星追従/救助アリ/起床/上昇
     - KO着地SE：mino_rakka.mp3 追加（着地瞬間に1回）
     - ミノムシ移動SE：状態管理で鳴る/止まるを安定化
     - z-index：JS注入で cup-line の裏に潜らない
     - dropletTypes 7種保持（必須）
  ========================================================= */

  /* ===== Matter aliases ===== */
  const { Engine, Render, Runner, World, Bodies, Body, Events, Constraint } = Matter;

  /* ===== DOM参照 ===== */
  const canvas = document.getElementById("gameCanvas");
  const leafWrapperEl = document.getElementById("leafWrapper");
  const previewDropletEl = document.getElementById("previewDroplet");
  const resetBtn = document.getElementById("resetBtn");
  const antsLayer = document.getElementById("antsLayer");
  const minoFxLayer = document.getElementById("minoFxLayer");
  const cupLineEl = document.getElementById("cupLine");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const overlayRestartBtn = document.getElementById("overlayRestartBtn");
  const finalScoreText = document.getElementById("finalScoreText");
  const scoreText = document.getElementById("scoreText");
  const gaugeFill = document.getElementById("gaugeFill");

  if (!canvas) {
    console.error("[game.js] canvas が見つかりません（id=gameCanvas）");
    return;
  }

  /* ===== レイヤー安定化（style.cssは触らずJS注入）===== */
  (function injectLayerCss() {
    const id = "tm_layer_fix_v2";
    if (document.getElementById(id)) return;
    const st = document.createElement("style");
    st.id = id;
    st.textContent = `
      /* canvasを常に上に（cup-lineに負けない） */
      #gameCanvas{ position: relative !important; z-index: 50 !important; }

      /* 板(cup-line)はcanvasより下へ */
      #cupLine{ position:absolute !important; z-index: 20 !important; }

      /* アリは板より上 */
      #antsLayer{ position:absolute !important; z-index: 80 !important; pointer-events:none; }

      /* 星・FXは最前 */
      #minoFxLayer{ position:absolute !important; z-index: 120 !important; pointer-events:none; }

      /* KO星の見た目（回転しないでパルス） */
      .mino-stars{
        position:absolute;
        width: 56px;
        height: 56px;
        transform: translate(-50%, -50%);
        opacity: 0.95;
        filter: drop-shadow(0 2px 2px rgba(0,0,0,0.20));
        animation: minoStarPulse 0.9s ease-in-out infinite;
      }
      @keyframes minoStarPulse{
        0%   { transform: translate(-50%,-50%) scale(0.98); opacity:0.85; }
        50%  { transform: translate(-50%,-50%) scale(1.06); opacity:1.0; }
        100% { transform: translate(-50%,-50%) scale(0.98); opacity:0.85; }
      }
      .mino-stars img{
        width: 56px; height: 56px;
        object-fit: contain;
        display:block;
      }

      /* 救助アリは少し前感 */
      .ant.rescue-ant{ filter: drop-shadow(0 1px 1px rgba(0,0,0,0.18)); }
    `;
    document.head.appendChild(st);
  })();

  /* ===== サイズ（canvasはCSS 100%なので、内部解像度を固定） ===== */
  const worldWidth = 360;
  const worldHeight = 580;
  canvas.width = worldWidth;
  canvas.height = worldHeight;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  /* ===== 物理パラメータ ===== */
  const LEFT_MARGIN = 34;
  const RIGHT_MARGIN = 26;

  const DROPLET_GAMEOVER_Y = worldHeight * 0.28;
  const DROPLET_GAMEOVER_COUNT = 4;

  /* ===== 半径/合体段階 ===== */
  const BASE_SIZE = worldWidth;
  const STAGE_RADIUS = [BASE_SIZE * 0.055, BASE_SIZE * 0.085, BASE_SIZE * 0.12];
  const NUM_STAGES = 3;
  const STAGE_KEYS = ["small", "medium", "large"];
  const VISUAL_SCALE = 1.0;

  /* ===== 画像（あなたの既存）===== */
  const LEAF_OBS_TEX = "https://static.wixstatic.com/media/e0436a_3390aa571a914ab086b2db00a8c76def~mv2.png";
  const BEE_TEX_L = "https://static.wixstatic.com/media/e0436a_750ead96817a40618e8cf9aa30a07192~mv2.png";
  const BEE_TEX_R = "https://static.wixstatic.com/media/e0436a_810f0f4624bb4807bdc0a97652bf3d18~mv2.webp";

  const MINO_TEX_NORMAL = "https://static.wixstatic.com/media/e0436a_bd2aa3d132364f9d83a9eb4bdabce505~mv2.webp";
  const MINO_TEX_FAIL   = "https://static.wixstatic.com/media/e0436a_1c7df1f465164bdeba93ac98ce62b9aa~mv2.webp";
  const MINO_TEX_AWAKE  = "https://static.wixstatic.com/media/e0436a_f97b18842a08467cb278f6c742324cdd~mv2.webp";
  const LADY_TEX        = "https://static.wixstatic.com/media/e0436a_e909e47044fe4710aacf24a377710ec8~mv2.webp";
  const MINO_STAR_TEX   = "https://static.wixstatic.com/media/e0436a_79b105a5d8ab45f69f349e31177e9654~mv2.png";

  /* =========================================================
     ✅ 雫7種（保持必須）
     ※ここは絶対に消さない
  ========================================================= */
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
    }
  ];

  /* =========================================================
     効果音
  ========================================================= */
  const sounds = {
    drop: [new Audio("https://static.wixstatic.com/mp3/e0436a_5181dcf5fcc2452688cb0c4d5b5550e1.mp3")],
    merge: [
      new Audio("https://static.wixstatic.com/mp3/e0436a_0aa91b4db66743a6802a9ddb15de5b13.mp3"),
      new Audio("https://static.wixstatic.com/mp3/e0436a_53429b721be5486999461954b945f362.mp3")
    ],
    buzz: [new Audio("https://static.wixstatic.com/mp3/e0436a_9fe5aba4787c4830b15ae80c6dd5a7d9.mp3")],
    beeBreak: [new Audio("https://static.wixstatic.com/mp3/e0436a_a22b94fdb260457d8be3479466d11421.mp3")]
  };

  sounds.drop.forEach(a => (a.volume = 0.35));
  sounds.merge.forEach(a => (a.volume = 0.45));
  sounds.buzz.forEach(a => { a.volume = 0.22; a.loop = true; });
  sounds.beeBreak.forEach(a => (a.volume = 0.70));

  function playRandom(list) {
    if (!list || !list.length) return;
    const a = list[Math.floor(Math.random() * list.length)];
    try { a.currentTime = 0; a.play(); } catch (e) {}
  }

  /* ===== ミノムシ移動SE（降下〜上昇中に鳴るwav）===== */
  const MINO_DOWN_SFX_URL = "https://static.wixstatic.com/mp3/e0436a_01f90882f58c4f5ea1d3d0f48b5e30a1.wav";
  const minoDownSE = new Audio(MINO_DOWN_SFX_URL);
  minoDownSE.loop = true;
  minoDownSE.volume = 0.28;

  /* ===== KO着地SE（mino_rakka.mp3）===== */
  const MINO_RAKKA_URL = "https://static.wixstatic.com/mp3/e0436a_cdb3c62613f24a7fa4d77a8c5cf2dd9f.mp3";
  const minoRakkaSE = new Audio(MINO_RAKKA_URL);
  minoRakkaSE.loop = false;
  minoRakkaSE.volume = 0.55;

  /* ===== スマホ対策：最初のタップでAudio解放（※構文エラー絶対出さない） ===== */
  let audioUnlocked = false;
  function unlockAudioOnce() {
    if (audioUnlocked) return;
    audioUnlocked = true;

    const all = [
      ...(sounds.drop || []),
      ...(sounds.merge || []),
      ...(sounds.buzz || []),
      ...(sounds.beeBreak || []),
      minoDownSE,
      minoRakkaSE
    ];

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
      } catch (e) {}
    });
  }
  window.addEventListener("pointerdown", unlockAudioOnce, { once: true, passive: true });

  function playMinoDownSE() {
    if (!audioUnlocked) return;
    try {
      if (minoDownSE.paused) {
        minoDownSE.currentTime = 0;
        minoDownSE.play().catch(()=>{});
      }
    } catch (e) {}
  }
  function stopMinoDownSE() {
    try {
      if (!minoDownSE.paused) {
        minoDownSE.pause();
        minoDownSE.currentTime = 0;
      }
    } catch (e) {}
  }

  function playMinoRakkaOnce() {
    if (!audioUnlocked) return;
    try {
      minoRakkaSE.currentTime = 0;
      minoRakkaSE.play().catch(()=>{});
    } catch (e) {}
  }
  function stopMinoRakka() {
    try {
      minoRakkaSE.pause();
      minoRakkaSE.currentTime = 0;
    } catch (e) {}
  }

  /* =========================================================
     Engine/World
  ========================================================= */
  const engine = Engine.create();
  const world = engine.world;
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
      background: "transparent"
    }
  });
  Render.run(render);

  const runner = Runner.create();
  Runner.run(runner, engine);

  /* ===== 壁 ===== */
  const wallThickness = 80;
  const floorY = worldHeight + 60;
  const leftWall = Bodies.rectangle(-wallThickness / 2, worldHeight / 2, wallThickness, worldHeight * 2, { isStatic: true, render: { visible: false } });
  const rightWall = Bodies.rectangle(worldWidth + wallThickness / 2, worldHeight / 2, wallThickness, worldHeight * 2, { isStatic: true, render: { visible: false } });
  const floor = Bodies.rectangle(worldWidth / 2, floorY, worldWidth * 2, 120, { isStatic: true, render: { visible: false } });
  World.add(world, [leftWall, rightWall, floor]);

  /* =========================================================
     cup-line（物理床）をDOM板に同期
     CSS: .cup-line { bottom:50px; height:46px; }
  ========================================================= */
  const CUPLINE_BOTTOM_PX = 50;
  const CUPLINE_HEIGHT_PX = 46;

  function getScale() {
    const rect = canvas.getBoundingClientRect();
    return rect.width / worldWidth;
  }
  function screenToWorldY(screenY) {
    const rect = canvas.getBoundingClientRect();
    const s = getScale();
    return (screenY - rect.top) / s;
  }
  function worldToScreen(x, y) {
    const rect = canvas.getBoundingClientRect();
    const s = getScale();
    return { sx: rect.left + x * s, sy: rect.top + y * s };
  }

  let cupRimYWorld = worldHeight - 92;
  let cupRim = Bodies.rectangle(worldWidth / 2, cupRimYWorld, worldWidth * 0.88, 18, {
    isStatic: true,
    render: { visible: false }
  });
  cupRim.isCupRim = true;
  World.add(world, cupRim);

 function syncCupRimToVisual() {
  const rect = canvas.getBoundingClientRect();
  const bottomPx = rect.bottom - CUPLINE_BOTTOM_PX; // 板の下端

  // 板の上面寄り（0.80推奨）
  const k = 0.80;
  let rimScreenY = bottomPx - CUPLINE_HEIGHT_PX * k;

  // 念のため：板の範囲内に収める（端末差でズレない）
  const topOfBoard = bottomPx - CUPLINE_HEIGHT_PX;
  rimScreenY = Math.max(topOfBoard + 2, Math.min(bottomPx - 2, rimScreenY));

  cupRimYWorld = screenToWorldY(rimScreenY);
  Body.setPosition(cupRim, { x: worldWidth / 2, y: cupRimYWorld });
}

  window.addEventListener("resize", () => requestAnimationFrame(syncCupRimToVisual), { passive: true });
  requestAnimationFrame(syncCupRimToVisual);

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

  /* =========================================================
     雫：生成 / ホールド / 落下 / 合体
  ========================================================= */
  let holding = null;
  let nextCharIndex = 0;

  function pickNextDroplet() {
    nextCharIndex = Math.floor(Math.random() * dropletTypes.length);
  }

  function setHoldingDroplet(charIndex) {
    const type = dropletTypes[charIndex];
    const tex = (type && type.sprites && type.sprites.small) || (type && type.dropSmall) || "";
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

  function createDropletBody({ charIndex, stage, x, y, radius, texture, isTear }) {
    const body = Bodies.circle(x, y, radius, {
      restitution: 0.08,
      friction: 0.01,
      frictionAir: 0.03,
      density: 0.0012,
      render: {
        fillStyle: "transparent",
        sprite: texture ? { texture, xScale: 1, yScale: 1 } : undefined
      }
    });

    body.isDroplet = true;
    body.charIndex = charIndex;
    body.stage = stage;
    body.isTear = !!isTear;
    body.isMerging = false;
    body.spawnAt = performance.now();

    droplets.add(body);
    World.add(world, body);
    updateSpriteScaleDroplet(body);
    return body;
  }

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

  function dropFromPlate(charIndex, x) {
    const stage = 0;
    const radius = STAGE_RADIUS[0];
    const type = dropletTypes[charIndex];

    const roundTex = type.sprites && type.sprites[STAGE_KEYS[stage]];
    const tearTex = type.dropSmall || null;
    const texture = tearTex || roundTex;
    const isTear = !!tearTex;

    const minX = LEFT_MARGIN + radius;
    const maxX = worldWidth - RIGHT_MARGIN - radius;
    const clampedX = clamp(x, minX, maxX);
    const startY = worldHeight * 0.22;

    const d = createDropletBody({ charIndex, stage, x: clampedX, y: startY, radius, texture, isTear });
    Body.setVelocity(d, { x: 0, y: 0.2 });
    return d;
  }

  function mergeDroplets(a, b) {
    if (!a || !b) return;
    if (a.isMerging || b.isMerging) return;
    if (a.charIndex !== b.charIndex) return;
    if (a.stage !== b.stage) return;
    if (a.stage >= NUM_STAGES - 1) return;

    a.isMerging = true;
    b.isMerging = true;

    playRandom(sounds.merge);

    const newStage = a.stage + 1;
    const type = dropletTypes[a.charIndex];
    const tex = type.sprites && type.sprites[STAGE_KEYS[newStage]];
    const r = STAGE_RADIUS[newStage];

    const x = (a.position.x + b.position.x) / 2;
    const y = (a.position.y + b.position.y) / 2;

    droplets.delete(a);
    droplets.delete(b);
    World.remove(world, a);
    World.remove(world, b);

    createDropletBody({ charIndex: a.charIndex, stage: newStage, x, y, radius: r, texture: tex, isTear: false });
  }

  /* =========================================================
     🐜 アリ（DOM） + KO救助アリ
  ========================================================= */
  const ANT_CFG = {
    maxAnts: 2,
    spawnIntervalMin: 2500,
    spawnIntervalMax: 5200,
    speedMin: 14,
    speedMax: 26,
    texL: [
      "https://static.wixstatic.com/media/e0436a_ba5c533006c943d2bb48e6209835bd54~mv2.png",
      "https://static.wixstatic.com/media/e0436a_fbafd110f97c44c690d0079442b060c4~mv2.png"
    ],
    texR: [
      "https://static.wixstatic.com/media/e0436a_1573066bada849c49f463c4e94c31e80~mv2.png",
      "https://static.wixstatic.com/media/e0436a_9d8b26a5b7ad40c68669691dd0155141~mv2.png"
    ]
  };

  let ants = [];
  let antSpawnTimer = null;
  let antsRAF = 0;
  let antsLastT = 0;

  let rescueAnts = [];
  const RESCUE_ANT_SPEED = 70;
  const RESCUE_ANT_POKE_DELAY = 380;

  function clearAnts() {
    if (!antsLayer) return;
    ants.forEach(a => a.el.remove());
    ants = [];
    if (antSpawnTimer) { clearTimeout(antSpawnTimer); antSpawnTimer = null; }
    if (antsRAF) { cancelAnimationFrame(antsRAF); antsRAF = 0; }
    antsLastT = 0;

    rescueAnts.forEach(a => { try { a.el.remove(); } catch(e){} });
    rescueAnts = [];
  }

  function scheduleAntSpawn() {
    if (gameOver) return;
    if (!antsLayer) return;

    const delay = ANT_CFG.spawnIntervalMin + Math.random() * (ANT_CFG.spawnIntervalMax - ANT_CFG.spawnIntervalMin);
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
      el, img,
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
    el.className = "ant rescue-ant";

    const img = document.createElement("img");
    img.alt = "ant";
    img.src = frames[0];
    el.appendChild(img);

    const w = 22;
    const startX = fromLeft ? -w : (layerRect.width + w);
    el.style.bottom = `10px`;
    el.style.transform = `translateX(${startX}px)`;
    antsLayer.appendChild(el);

    const targetScreen = worldToScreen(mino.position.x, cupRimYWorld);
    const targetX = targetScreen.sx - layerRect.left;

    rescueAnts.push({
      el, img,
      x: startX,
      fromLeft,
      speed: RESCUE_ANT_SPEED,
      frames,
      frameIndex: 0,
      nextFrameTime: performance.now() + 120,
      targetX,
      arrived: false,
      pokeAt: 0,
      minoId: mino.id
    });

    startAntsLoop();
  }

  function startAntsLoop() {
    if (antsRAF) return;
    antsLastT = performance.now();
    antsRAF = requestAnimationFrame(updateAnts);
  }

  function clearRescueAnts(minoId) {
    rescueAnts = rescueAnts.filter(a => {
      const keep = a.minoId !== minoId;
      if (!keep) { try { a.el.remove(); } catch(e){} }
      return keep;
    });
  }

  function updateAnts(t) {
    antsRAF = 0;
    if (gameOver) return;
    if (!antsLayer) return;

    const dt = Math.min(0.05, (t - antsLastT) / 1000);
    antsLastT = t;

    const layerW = antsLayer.getBoundingClientRect().width;

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
      a.x += dir * a.speed * dt;

      if (t >= a.nextFrameTime) {
        a.frameIndex = (a.frameIndex + 1) % a.frames.length;
        a.img.src = a.frames[a.frameIndex];
        a.nextFrameTime = t + 120;
      }

      if (!a.arrived) {
        const dist = Math.abs(a.x - a.targetX);
        if (dist < 12) {
          a.arrived = true;
          a.pokeAt = t + RESCUE_ANT_POKE_DELAY;
        }
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
          if (targetMino) tryRescueWake(targetMino);
        }
      });
    }

    if (ants.length > 0 || rescueAnts.length > 0) {
      antsRAF = requestAnimationFrame(updateAnts);
    }
  }

  /* =========================================================
     🐛 ミノムシ（Matter） + KO演出
  ========================================================= */
  const MINO_CFG = {
    sizePx: 78,
    downSpeed: 2.6,
    upSpeed: -2.6,
    cooldownMs: 6500,
    delayMin: 1200,
    delayMax: 2400,
    dropFailRate: 0.35
  };

  const minos = new Set();
  let minoTimer = null;
  let minoCooldownUntil = performance.now() + 3500;

  function setMinoTexture(mino, tex) {
    if (!mino || !mino.render || !mino.render.sprite) return;
    mino.render.sprite.texture = tex;
    setSpriteScaleByPx(mino, MINO_CFG.sizePx);
  }

  function spawnMino() {
    if (gameOver) return;

    const x = worldWidth * (0.35 + Math.random() * 0.30);
    const y = -60;

    const mino = Bodies.rectangle(x, y, 70, 70, {
      isSensor: true,
      frictionAir: 0.02,
      render: { sprite: { texture: MINO_TEX_NORMAL, xScale: 1, yScale: 1 } }
    });

    mino.isMino = true;
    mino.state = "down";        // down -> pause -> lift -> (carry) -> off / fail -> ko -> liftAfterKo -> off
    mino.spawnAt = performance.now();
    mino.windSeed = Math.random() * 10;
    mino._koAt = 0;
    mino._rescueWaking = false;

    setSpriteScaleByPx(mino, MINO_CFG.sizePx);

    // ロープ（見た目用）
    const anchor = { x, y: 10 };
    mino.ropeAnchor = anchor;
    mino.rope = Constraint.create({
      pointA: anchor,
      bodyB: mino,
      pointB: { x: 0, y: -20 },
      length: 120,
      stiffness: 0.05,
      render: { visible: false }
    });

    World.add(world, [mino, mino.rope]);
    minos.add(mino);
  }

  function scheduleMino() {
    const now = performance.now();
    if (now < minoCooldownUntil) return;

    minoCooldownUntil = now + MINO_CFG.cooldownMs;
    const delay = MINO_CFG.delayMin + Math.random() * (MINO_CFG.delayMax - MINO_CFG.delayMin);

    if (minoTimer) clearTimeout(minoTimer);
    minoTimer = setTimeout(() => { if (!gameOver) spawnMino(); }, delay);
  }

  function cleanupMinos() {
    minos.forEach(m => {
      if (m.position.y < -200 || m.position.y > worldHeight + 260) {
        removeMinoStars(m);
        stopMinoDownSE();
        stopMinoRakka();
        if (m.rope) World.remove(world, m.rope);
        World.remove(world, m);
        minos.delete(m);
      }
    });
  }

  /* ===== KO星（DOM）===== */
  const minoStarsMap = new Map(); // id -> el

  function createMinoStars(mino) {
    if (!minoFxLayer || !mino) return;
    if (minoStarsMap.has(mino.id)) return;

    const el = document.createElement("div");
    el.className = "mino-stars";
    const img = document.createElement("img");
    img.alt = "stars";
    img.src = MINO_STAR_TEX;
    el.appendChild(img);

    minoFxLayer.appendChild(el);
    minoStarsMap.set(mino.id, el);
  }

  function removeMinoStars(mino) {
    const el = minoStarsMap.get(mino.id);
    if (el) { try { el.remove(); } catch(e){} }
    minoStarsMap.delete(mino.id);
  }

  function updateMinoStarsPosition(mino) {
    const el = minoStarsMap.get(mino.id);
    if (!el) return;

    // canvasスケールを使って毎フレ追従（github/wixどちらでもズレない）
    const headOffsetY = 46;
    const p = worldToScreen(mino.position.x, mino.position.y - headOffsetY);

    const layerRect = minoFxLayer.getBoundingClientRect();
    el.style.left = `${(p.sx - layerRect.left).toFixed(2)}px`;
    el.style.top = `${(p.sy - layerRect.top).toFixed(2)}px`;
  }

  function enterKO(mino) {
    if (!mino || mino.state === "ko") return;

    // 移動SE停止
    stopMinoDownSE();

    // KOへ
    mino.state = "ko";
    mino._koAt = performance.now();
    mino._rescueWaking = false;

    // 見た目：KO（倒れ）
    setMinoTexture(mino, MINO_TEX_FAIL);
    Body.setAngle(mino, (Math.random() < 0.5 ? -1 : 1) * 0.9);
    Body.setVelocity(mino, { x: 0, y: 0 });
    Body.setAngularVelocity(mino, 0);
    Body.setStatic(mino, true); // cup-lineで「倒れて静止」

    // 星
    createMinoStars(mino);
    updateMinoStarsPosition(mino);

    // KO着地SE（ここで鳴らす：”地面に着地したとき”）
    playMinoRakkaOnce();

    // 救助アリ（左右）
    spawnRescueAnt(mino, true);
    spawnRescueAnt(mino, false);
  }

  const RESCUE_WAKE_DELAY = 780;

  function tryRescueWake(mino) {
    if (!mino || mino.state !== "ko") return;
    if (mino._rescueWaking) return;
    mino._rescueWaking = true;

    setTimeout(() => {
      if (!mino || !minos.has(mino)) return;
      if (mino.state !== "ko") return;

      // 起床：ビヨーン → 上昇
      Body.setStatic(mino, false);
      Body.setAngle(mino, 0);
      setMinoTexture(mino, MINO_TEX_AWAKE);

      // 星は少し残してすぐ消す（演出）
      setTimeout(() => removeMinoStars(mino), 420);

      // 上昇中だけ移動SE再開
      mino.state = "liftAfterKo";
      playMinoDownSE();
      Body.setVelocity(mino, { x: 0, y: -2.2 });

      clearRescueAnts(mino.id);
    }, RESCUE_WAKE_DELAY);
  }

  function updateMinoSEByState(m) {
    // down / lift / carry / liftAfterKo だけ鳴らす
    const on = (m.state === "down" || m.state === "lift" || m.state === "carry" || m.state === "liftAfterKo");
    if (on) playMinoDownSE();
    else stopMinoDownSE();
  }

  function updateMinosAI() {
    if (gameOver) return;

    const now = performance.now();
    const SWAY_START_Y = worldHeight * 0.30;
    const SWAY_PX = 8;

    minos.forEach(m => {
      // 常にSEを状態追従
      updateMinoSEByState(m);

      if (m.state === "ko") {
        // KO：星追従だけ
        updateMinoStarsPosition(m);
        return;
      }

      // ロープ揺れ
      if (m.rope && m.ropeAnchor) {
        if (m.position.y >= SWAY_START_Y) {
          const t = (now - (m.spawnAt || now)) * 0.001;
          const sway = Math.sin(t * 1.2 + m.windSeed) * SWAY_PX;
          m.rope.pointA.x = clamp(m.ropeAnchor.x + sway, LEFT_MARGIN + 30, worldWidth - RIGHT_MARGIN - 30);
        } else {
          m.rope.pointA.x = m.ropeAnchor.x;
        }
      }

      if (m.state === "down") {
        if (m.position.y >= SWAY_START_Y) {
          Body.setPosition(m, { x: m.position.x, y: SWAY_START_Y });
          Body.setVelocity(m, { x: 0, y: 0 });
          m.state = "pause";
          m.pauseUntil = now + 520 + Math.random() * 380;
        } else {
          Body.setVelocity(m, { x: 0, y: MINO_CFG.downSpeed });
        }
        return;
      }

      if (m.state === "pause") {
        Body.setVelocity(m, { x: 0, y: 0 });
        if (now >= m.pauseUntil) {
          m.state = "lift";
        }
        return;
      }

      if (m.state === "lift") {
        Body.setAngle(m, 0);
        if (m.rope) {
          m.rope.stiffness = 0.06;
          m.rope.length = Math.max(120, m.rope.length - 1.6);
        }
        Body.setVelocity(m, { x: 0, y: MINO_CFG.upSpeed });

        // 上の方で失敗抽選 → failへ
        if (m.position.y < worldHeight * 0.18) {
          const fail = Math.random() < MINO_CFG.dropFailRate;
          if (fail) {
            m.state = "fail";
            m.isSensor = false;
            setMinoTexture(m, MINO_TEX_FAIL);
            Body.setVelocity(m, { x: (Math.random() - 0.5) * 2.0, y: 1.0 });
          } else {
            // 成功扱い：そのまま上へ消える
            m.state = "carry";
          }
        }
        return;
      }

      if (m.state === "carry") {
        // 上へ消える
        Body.setVelocity(m, { x: 0, y: -3.0 });
        return;
      }

      if (m.state === "fail") {
        // 落下中は物理任せ（cupRim衝突でKOへ）
        return;
      }

      if (m.state === "liftAfterKo") {
        Body.setVelocity(m, { x: 0, y: -2.6 });
        return;
      }
    });
  }

  /* =========================================================
     🐝 ハチ（最低限：表示と当たりだけ、必要なら拡張OK）
  ========================================================= */
  const bees = new Set();
  const BEE_CFG = {
    sizePx: 86,
    speedMin: 1.8,
    speedMax: 2.7,
    cooldownMs: 5200,
    delayMin: 1000,
    delayMax: 1800,
    passRate: 0.35
  };
  let beeTimer = null;
  let beeCooldownUntil = performance.now() + 3000;

  function startBeeBuzz(bee) {
    try {
      const base = sounds.buzz[0];
      if (!base) return;
      const buzz = base.cloneNode(true);
      buzz.loop = true;
      buzz.volume = base.volume;
      bee._buzz = buzz;
      if (audioUnlocked) buzz.play().catch(()=>{});
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
      render: { sprite: { texture: tex, xScale: 1, yScale: 1 } }
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

  /* =========================================================
     ゲーム状態/UI
  ========================================================= */
  let gameOver = false;
  let canDrop = true;
  let score = 0;

  function updateScoreGauge() {
    if (scoreText) scoreText.textContent = `SCORE ${score}`;
    if (gaugeFill) {
      const t = clamp(score / 3000, 0, 1);
      gaugeFill.style.width = `${(t * 100).toFixed(1)}%`;
    }
  }

  function triggerGameOver() {
    if (gameOver) return;
    gameOver = true;
    canDrop = false;

    stopMinoDownSE();
    stopMinoRakka();

    if (gameOverOverlay) gameOverOverlay.classList.add("visible");
    if (finalScoreText) finalScoreText.textContent = `SCORE : ${score}`;

    if (beeTimer) { clearTimeout(beeTimer); beeTimer = null; }
    if (minoTimer) { clearTimeout(minoTimer); minoTimer = null; }
    if (antSpawnTimer) { clearTimeout(antSpawnTimer); antSpawnTimer = null; }
  }

  function stopAllTimers() {
    if (beeTimer) { clearTimeout(beeTimer); beeTimer = null; }
    if (minoTimer) { clearTimeout(minoTimer); minoTimer = null; }
    if (antSpawnTimer) { clearTimeout(antSpawnTimer); antSpawnTimer = null; }
  }

  /* =========================================================
     入力（葉っぱトレイ）
  ========================================================= */
  let plateX = worldWidth / 2;
  let moveTiltDeg = 0;

  function setPlatePositionByClientX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const s = getScale();
    const x = (clientX - rect.left) / s;
    plateX = clamp(x, LEFT_MARGIN, worldWidth - RIGHT_MARGIN);

    if (leafWrapperEl) {
      const pct = (plateX / worldWidth) * 100;
      leafWrapperEl.style.left = `${pct}%`;
      moveTiltDeg = (plateX - worldWidth / 2) / (worldWidth / 2) * 10;
      leafWrapperEl.style.transform = `translateX(-50%) rotate(${moveTiltDeg.toFixed(2)}deg)`;
    }
  }

  function tryDrop() {
    if (!canDrop || gameOver) return;
    if (!holding) return;

    dropFromPlate(holding.charIndex, plateX);
    playRandom(sounds.drop);

    pickNextDroplet();
    setHoldingDroplet(nextCharIndex);
  }

  canvas.addEventListener("pointermove", (e) => setPlatePositionByClientX(e.clientX), { passive: true });
  canvas.addEventListener("pointerdown", (e) => {
    unlockAudioOnce();
    setPlatePositionByClientX(e.clientX);
    tryDrop();
  }, { passive: true });

  /* =========================================================
     衝突処理
  ========================================================= */
  Events.on(engine, "collisionStart", (event) => {
    for (const pair of event.pairs) {
      const bodyA = pair.bodyA;
      const bodyB = pair.bodyB;

      // 涙型→丸 + SE
      if (bodyA.isDroplet && bodyA.isTear) { makeRoundIfTear(bodyA); playRandom(sounds.drop); }
      if (bodyB.isDroplet && bodyB.isTear) { makeRoundIfTear(bodyB); playRandom(sounds.drop); }

      // 雫同士の合体
      if (bodyA.isDroplet && bodyB.isDroplet) {
        mergeDroplets(bodyA, bodyB);
        continue;
      }

      // ミノムシがcup-line床に触れたらKO（failの時だけ）
      if ((bodyA.isMino && bodyB.isCupRim) || (bodyB.isMino && bodyA.isCupRim)) {
        const mino = bodyA.isMino ? bodyA : bodyB;
        if (mino && mino.state === "fail") {
          enterKO(mino);
        }
      }
    }
  });

  /* =========================================================
     毎フレーム
  ========================================================= */
  Events.on(engine, "beforeUpdate", () => {
    if (gameOver) return;

    // cupRim同期（ズレ防止）
    syncCupRimToVisual();

    // ハチ：ふわふわ
    bees.forEach(b => {
      const wobble = Math.sin(performance.now() * 0.003 + b.id) * 0.22;
      Body.setVelocity(b, { x: b.velocity.x, y: wobble });
    });

    // 雫が溜まりすぎたらゲームオーバー
    let danger = 0;
    droplets.forEach(d => {
      if (!d.isDroplet) return;
      if (d.isMerging) return;
      if (d.position.y < DROPLET_GAMEOVER_Y) danger++;
    });
    if (danger >= DROPLET_GAMEOVER_COUNT) triggerGameOver();

    cleanupBees();
    cleanupMinos();
    updateMinosAI();

    maybeScheduleBee();
    scheduleMino();
  });

  /* =========================================================
     リセット
  ========================================================= */
  function resetGame() {
    gameOver = false;
    canDrop = true;

    stopMinoDownSE();
    stopMinoRakka();

    if (gameOverOverlay) gameOverOverlay.classList.remove("visible");

    score = 0;
    updateScoreGauge();

    stopAllTimers();

    droplets.forEach(b => World.remove(world, b));
    droplets.clear();

    bees.forEach(b => { stopBeeBuzz(b); World.remove(world, b); });
    bees.clear();

    minos.forEach(m => {
      removeMinoStars(m);
      if (m.rope) World.remove(world, m.rope);
      World.remove(world, m);
    });
    minos.clear();

    clearAnts();

    plateX = worldWidth / 2;
    if (leafWrapperEl) { leafWrapperEl.style.left = "50%"; leafWrapperEl.style.transform = "translateX(-50%) rotate(0deg)"; }
    if (previewDropletEl) previewDropletEl.style.left = "50%";
    moveTiltDeg = 0;

    pickNextDroplet();
    setHoldingDroplet(nextCharIndex);

    scheduleAntSpawn();

    beeCooldownUntil = performance.now() + 3500;
    minoCooldownUntil = performance.now() + 4500;

    requestAnimationFrame(syncCupRimToVisual);
  }

  if (resetBtn) resetBtn.addEventListener("click", resetGame);
  if (overlayRestartBtn) overlayRestartBtn.addEventListener("click", resetGame);

  /* ===== 初期化 ===== */
  resetGame();
})();
