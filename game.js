(() => {
  "use strict";

  /* =========================================================
     森のしずくゲーム（assets名前型対応 / UTF-8）
     - images: assets/images/{key}_{S|M|L}.webp, {key}_S_drop.webp
     - sounds: assets/sounds/*.mp3, *.wav
     - cupLine見た目位置に物理リム同期（すり抜け防止）
     - 次の雫（葉っぱ皿）が左右に動く（Pointer）
     - 透明雫対策：texture無い/404時でも白丸で生成（透明当たり判定を防ぐ）
     - 雫スケールは画像実サイズ(naturalWidth)から自動計算（巨大化防止）
  ========================================================= */

  if (!window.Matter) {
    console.error("[game.js] Matter.js が読み込まれていません");
    return;
  }

  const { Engine, Render, Runner, World, Bodies, Body, Events } = Matter;

  /* ===== DOM ===== */
  const canvas = document.getElementById("gameCanvas");
  const leafWrapperEl = document.getElementById("leafWrapper");
  const previewDropletEl = document.getElementById("previewDroplet");
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

  /* ===== 固定ワールドサイズ（CSSで縮放しても物理は一定） ===== */
  const worldWidth = 360;
  const worldHeight = 580;
  canvas.width = worldWidth;
  canvas.height = worldHeight;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  /* ===== レイヤー安定化CSS注入 ===== */
  (function injectLayerCss() {
    const id = "tm_layer_fix_assets_v1";
    if (document.getElementById(id)) return;

    const st = document.createElement("style");
    st.id = id;
    st.textContent = `
      #gameCanvas { position: relative !important; z-index: 10 !important; }

      /* cupLine（板）は canvas より上に */
      #cupLine { position:absolute !important; z-index: 25 !important; }

      /* 葉っぱ皿（次の雫）…cupLineより上 */
      #leafWrapper {
        position:absolute !important;
        z-index: 30 !important;
        left:50% !important;
        transform: translateX(-50%) !important;
        will-change:left !important;
      }
      #previewDroplet {
        position:absolute !important;
        left:50% !important;
        transform: translateX(-50%) !important;
        pointer-events:none !important;
      }
    `;
    document.head.appendChild(st);
  })();

  /* =========================================================
     ASSETS
  ========================================================= */
  const ASSETS = {
    se: {
      drop: "assets/sounds/drop.mp3",
      merge1: "assets/sounds/merge1.mp3",
      merge2: "assets/sounds/merge2.mp3",
    },
  };

  /* =========================================================
     雫 7種類（あなたの images 名称に一致）
       kakao / pakku / peapea / tyokopa / hoippu / tyatyajii / minto
  ========================================================= */
  const dropletTypes = [
    { key: "kakao", name: "雫 カカオ" },
    { key: "pakku", name: "雫 パック" },
    { key: "peapea", name: "雫 ペアペア" },
    { key: "tyokopa", name: "雫 チョコパ" },
    { key: "hoippu", name: "雫 ホイップ" },
    { key: "tyatyajii", name: "雫 ちゃちゃじい" },
    { key: "minto", name: "雫 ミント" },
  ].map((t) => ({
    ...t,
    sprites: {
      small: `assets/images/${t.key}_S.webp`,
      medium: `assets/images/${t.key}_M.webp`,
      large: `assets/images/${t.key}_L.webp`,
    },
    dropSmall: `assets/images/${t.key}_S_drop.webp`,
  }));

  /* =========================================================
     物理パラメータ
  ========================================================= */
  const STAGE_KEYS = ["small", "medium", "large"];
  const NUM_STAGES = 3;

  // 物理半径（見た目は画像スケールで合わせる）
  const STAGE_RADIUS = [18, 30, 44];

  // 左右マージン（壁にめり込み防止）
  const LEFT_MARGIN = 28;
  const RIGHT_MARGIN = 28;

  /* =========================================================
     Audio（スマホ対策：最初の操作で解除）
  ========================================================= */
  function makeAudio(url, { loop = false, volume = 0.5 } = {}) {
    const a = new Audio(url);
    a.loop = loop;
    a.volume = volume;
    a.preload = "auto";
    return a;
  }

  const sounds = {
    drop: [makeAudio(ASSETS.se.drop, { volume: 0.35 })],
    merge: [
      makeAudio(ASSETS.se.merge1, { volume: 0.45 }),
      makeAudio(ASSETS.se.merge2, { volume: 0.45 }),
    ],
  };

  let audioUnlocked = false;
  function unlockAudioOnce() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    const all = [...sounds.drop, ...sounds.merge];
    all.forEach((a) => {
      try {
        a.muted = true;
        a.play()
          .then(() => {
            a.pause();
            a.currentTime = 0;
            a.muted = false;
          })
          .catch(() => (a.muted = false));
      } catch {}
    });
  }

  function playRandom(list) {
    if (!list || !list.length) return;
    const a = list[(Math.random() * list.length) | 0];
    try {
      a.currentTime = 0;
      a.play();
    } catch {}
  }

  /* =========================================================
     Engine / Render
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
      pixelRatio: window.devicePixelRatio || 1,
    },
  });

  Render.run(render);
  const runner = Runner.create();
  Runner.run(runner, engine);

  /* =========================================================
     壁
  ========================================================= */
  const leftWall = Bodies.rectangle(-10, worldHeight / 2, 20, worldHeight * 2, {
    isStatic: true,
    render: { visible: false },
  });
  const rightWall = Bodies.rectangle(worldWidth + 10, worldHeight / 2, 20, worldHeight * 2, {
    isStatic: true,
    render: { visible: false },
  });
  const floor = Bodies.rectangle(worldWidth / 2, worldHeight + 60, worldWidth * 2, 120, {
    isStatic: true,
    render: { visible: false },
  });
  World.add(world, [leftWall, rightWall, floor]);

  /* =========================================================
     cup-line と同期する “物理リム”
  ========================================================= */
  let cupRim = Bodies.rectangle(worldWidth / 2, worldHeight * 0.86, worldWidth * 0.95, 18, {
    isStatic: true,
    render: { visible: false },
  });
  cupRim.isCupRim = true;
  World.add(world, cupRim);

  function screenToWorldY(screenY) {
    const rect = canvas.getBoundingClientRect();
    const t = (screenY - rect.top) / rect.height;
    return t * worldHeight;
  }

  function syncCupRimToVisual() {
    if (!cupLineEl) return;
    const cupRect = cupLineEl.getBoundingClientRect();

    // 板の「上面っぽい」位置
    const rimScreenY = cupRect.top + cupRect.height * 0.35;
    const yWorld = screenToWorldY(rimScreenY);

    Body.setPosition(cupRim, { x: worldWidth / 2, y: yWorld });
  }

  window.addEventListener("resize", () => requestAnimationFrame(syncCupRimToVisual), { passive: true });
  requestAnimationFrame(syncCupRimToVisual);

  /* =========================================================
     画像サイズキャッシュ（巨大化防止：naturalWidthでスケール）
  ========================================================= */
  const textureInfo = new Map(); // url -> {w,h,ok}
  function ensureTextureInfo(url) {
    if (!url) return null;
    const cached = textureInfo.get(url);
    if (cached) return cached;

    const info = { w: 512, h: 512, ok: false };
    textureInfo.set(url, info);

    const img = new Image();
    img.onload = () => {
      info.w = img.naturalWidth || 512;
      info.h = img.naturalHeight || 512;
      info.ok = true;
    };
    img.onerror = () => {
      info.ok = false; // 404等
    };
    img.src = url;

    return info;
  }

  function applySpriteScale(body) {
    const sp = body?.render?.sprite;
    if (!sp || !sp.texture || !body.circleRadius) return;

    const info = ensureTextureInfo(sp.texture);
    const base = (info && info.w) ? info.w : 512; // 画像実サイズ基準
    const diameter = body.circleRadius * 2;
    const s = diameter / base;

    sp.xScale = s;
    sp.yScale = s;
  }

  /* =========================================================
     雫
  ========================================================= */
  const droplets = new Set();

  function createDropletBody({ charIndex, stage, x, y, radius, texture, isTear }) {
    const hasTex = typeof texture === "string" && texture.length > 0;

    // 404でも “透明当たり判定” を避ける：texture無し扱いにして白丸
    ensureTextureInfo(texture);

    const body = Bodies.circle(x, y, radius, {
      restitution: 0.08,
      friction: 0.01,
      frictionAir: 0.03,
      density: 0.0012,
      render: hasTex
        ? { fillStyle: "transparent", sprite: { texture, xScale: 1, yScale: 1 } }
        : { fillStyle: "#ffffff" },
    });

    body.isDroplet = true;
    body.charIndex = charIndex;
    body.stage = stage;
    body.isTear = !!isTear;
    body.isMerging = false;

    droplets.add(body);
    World.add(world, body);

    if (hasTex) applySpriteScale(body);
    return body;
  }

  function makeRoundIfTear(body) {
    if (!body || !body.isDroplet || !body.isTear) return;

    const type = dropletTypes[body.charIndex];
    const tex = type?.sprites?.[STAGE_KEYS[body.stage]] || "";
    if (!tex) {
      body.isTear = false;
      return;
    }

    body.render.sprite = body.render.sprite || { texture: tex, xScale: 1, yScale: 1 };
    body.render.sprite.texture = tex;
    body.isTear = false;

    applySpriteScale(body);
  }

  function dropFromPlate(charIndex, xWorld) {
    const stage = 0;
    const radius = STAGE_RADIUS[0];
    const type = dropletTypes[charIndex];

    const roundTex = type?.sprites?.small || "";
    const tearTex = type?.dropSmall || "";
    const texture = tearTex || roundTex;
    const isTear = !!tearTex;

    const minX = LEFT_MARGIN + radius;
    const maxX = worldWidth - RIGHT_MARGIN - radius;
    const clampedX = clamp(xWorld, minX, maxX);

    const startY = worldHeight * 0.20;

    const d = createDropletBody({ charIndex, stage, x: clampedX, y: startY, radius, texture, isTear });
    Body.setVelocity(d, { x: 0, y: 0.2 });

    playRandom(sounds.drop);
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

    const newStage = a.stage + 1;
    const type = dropletTypes[a.charIndex];
    const tex = type?.sprites?.[STAGE_KEYS[newStage]] || "";
    const r = STAGE_RADIUS[newStage];

    const x = (a.position.x + b.position.x) / 2;
    const y = (a.position.y + b.position.y) / 2;

    droplets.delete(a);
    droplets.delete(b);
    World.remove(world, a);
    World.remove(world, b);

    const newborn = createDropletBody({ charIndex: a.charIndex, stage: newStage, x, y, radius: r, texture: tex, isTear: false });
    if (newborn?.render?.sprite) applySpriteScale(newborn);

    addScoreForStage(newStage);
    playRandom(sounds.merge);
  }

  /* =========================================================
     次の雫（葉っぱ皿）：左右に動く
  ========================================================= */
  let holding = null;
  let nextCharIndex = 0;

  let plateX = worldWidth / 2;
  let pointerActive = false;

  function pickNextDroplet() {
    nextCharIndex = (Math.random() * dropletTypes.length) | 0;
  }

  function setHoldingDroplet(charIndex) {
    const type = dropletTypes[charIndex];
    const tex = type?.sprites?.small || type?.dropSmall || "";
    holding = { charIndex, stage: 0, radius: STAGE_RADIUS[0], texture: tex };

    if (!previewDropletEl) return;
    if (!tex) {
      previewDropletEl.removeAttribute("src");
      previewDropletEl.style.display = "none";
      return;
    }
    previewDropletEl.src = tex;
    previewDropletEl.style.display = "block";
  }

  function screenToWorldX(screenX) {
    const rect = canvas.getBoundingClientRect();
    const t = (screenX - rect.left) / rect.width;
    return t * worldWidth;
  }

  function updatePlateDom() {
    if (!leafWrapperEl) return;
    const pct = (plateX / worldWidth) * 100;
    leafWrapperEl.style.left = `${pct}%`;
  }

  function setPlateXFromPointer(clientX) {
    const radius = holding?.radius ?? STAGE_RADIUS[0];
    const minX = LEFT_MARGIN + radius;
    const maxX = worldWidth - RIGHT_MARGIN - radius;
    plateX = clamp(screenToWorldX(clientX), minX, maxX);
    updatePlateDom();
  }

  function bindPlateControls() {
    const target = canvas;

    target.addEventListener(
      "pointerdown",
      (e) => {
        unlockAudioOnce();
        pointerActive = true;
        setPlateXFromPointer(e.clientX);
      },
      { passive: true }
    );

    window.addEventListener(
      "pointermove",
      (e) => {
        if (!pointerActive) return;
        setPlateXFromPointer(e.clientX);
      },
      { passive: true }
    );

    window.addEventListener(
      "pointerup",
      () => {
        pointerActive = false;
      },
      { passive: true }
    );

    // クリック（またはタップ）で落とす
    target.addEventListener("click", (e) => {
      unlockAudioOnce();
      if (!holding) return;
      const x = screenToWorldX(e.clientX);
      dropFromPlate(holding.charIndex, x);
      pickNextDroplet();
      setHoldingDroplet(nextCharIndex);
    });
  }

  bindPlateControls();
  pickNextDroplet();
  setHoldingDroplet(nextCharIndex);
  requestAnimationFrame(updatePlateDom);

  /* =========================================================
     スコア / ゲームオーバー（簡易）
  ========================================================= */
  let score = 0;
  let gameOver = false;

  const DROPLET_GAMEOVER_Y = worldHeight * 0.12;
  const DROPLET_GAMEOVER_COUNT = 8;

  function addScoreForStage(stage) {
    const add = stage === 1 ? 3 : stage === 2 ? 9 : 1;
    score += add;
    updateScoreUI();
  }

  function updateScoreUI() {
    if (scoreText) scoreText.textContent = `SCORE  ${score}`;
    if (gaugeFill) {
      const p = clamp(score / 260, 0, 1);
      gaugeFill.style.transform = `scaleX(${p.toFixed(3)})`;
    }
  }
  updateScoreUI();

  function setGameOver() {
    if (gameOver) return;
    gameOver = true;

    if (finalScoreText) finalScoreText.textContent = `SCORE : ${score}`;
    if (gameOverOverlay) gameOverOverlay.style.display = "block";
  }

  if (overlayRestartBtn) overlayRestartBtn.addEventListener("click", () => location.reload());

  /* =========================================================
     衝突：同種合体 / 涙→丸
  ========================================================= */
  Events.on(engine, "collisionStart", (evt) => {
    for (const pair of evt.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;

      if (a?.isDroplet) makeRoundIfTear(a);
      if (b?.isDroplet) makeRoundIfTear(b);

      if (a?.isDroplet && b?.isDroplet) {
        mergeDroplets(a, b);
      }
    }
  });

  /* =========================================================
     毎フレーム
  ========================================================= */
  Events.on(engine, "beforeUpdate", () => {
    if (gameOver) return;

    syncCupRimToVisual();

    // 危険判定（上に溜まったら終了）
    let cnt = 0;
    for (const d of droplets) {
      if (!d?.isDroplet) continue;
      if (d.isMerging) continue;
      if (d.position.y < DROPLET_GAMEOVER_Y) cnt++;
      if (cnt >= DROPLET_GAMEOVER_COUNT) break;
    }
    if (cnt >= DROPLET_GAMEOVER_COUNT) setGameOver();
  });
})();