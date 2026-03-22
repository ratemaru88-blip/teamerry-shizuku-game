(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const leafWrapperEl = document.getElementById("leafWrapper");
  const previewDropletEl = document.getElementById("previewDroplet");

  const gameOverOverlayEl = document.getElementById("gameOverOverlay");
  const finalScoreTextEl = document.getElementById("finalScoreText");
  const overlayRestartBtnEl = document.getElementById("overlayRestartBtn");
  const resetBtnEl = document.getElementById("resetBtn");
  const helpBtnEl = document.getElementById("helpBtn");
  const helpOverlayEl = document.getElementById("helpOverlay");
  const helpCloseBtnEl = document.getElementById("helpCloseBtn");
  const scoreLabelEl =
    document.getElementById("scoreGaugeText") ||
    document.getElementById("scoreText") ||
    document.getElementById("scoreLabel");

  const gaugeFillEl =
    document.getElementById("scoreGaugeFill") ||
    document.getElementById("gaugeFill");

  const minoFxLayer = document.getElementById("minoFxLayer");
  const antsLayer = document.getElementById("antsLayer");
  if (!canvas) {
    console.error("[game.js] #gameCanvas が見つかりません");
    return;
  }

  if (!leafWrapperEl) {
    console.error("[game.js] #leafWrapper が見つかりません");
    return;
  }

  if (!previewDropletEl) {
    console.error("[game.js] #previewDroplet が見つかりません");
    return;
  }

  if (!window.createDropletEngine) {
    console.error(
      "[game.js] createDropletEngine が見つかりません。index.html の script 順を確認してください。"
    );
    return;
  }

  function updateGauge(score) {
    if (!gaugeFillEl) return;

    const p = Math.max(0, Math.min(1, score / 260));
    gaugeFillEl.style.transformOrigin = "left center";
    gaugeFillEl.style.transform = `scaleX(${p.toFixed(3)})`;
  }

  function handleScoreChange(score) {
    if (scoreLabelEl) {
      scoreLabelEl.textContent = String(score);
    }
    updateGauge(score);
  }

  function handleGameOver(score) {
    if (finalScoreTextEl) {
      finalScoreTextEl.textContent = `SCORE : ${score}`;
    }

    if (gameOverOverlayEl) {
      gameOverOverlayEl.style.display = "flex";
      gameOverOverlayEl.classList.add("visible");
    }
  }

  function hideGameOver() {
    if (gameOverOverlayEl) {
      gameOverOverlayEl.style.display = "";
      gameOverOverlayEl.classList.remove("visible");
    }
  }
function openHelp() {
  if (!helpOverlayEl) return;
  helpOverlayEl.style.display = "flex";
  helpOverlayEl.classList.add("visible");
}

function closeHelp() {
  if (!helpOverlayEl) return;
  helpOverlayEl.style.display = "";
  helpOverlayEl.classList.remove("visible");
}
  hideGameOver();
  handleScoreChange(0);

  const dropletEngine = window.createDropletEngine({
    canvas,
    leafWrapperEl,
    previewDropletEl,
    scoreLabelEl,
    gameOverOverlayEl,
    finalScoreTextEl,
    overlayRestartBtnEl,
    resetBtnEl,
    onScoreChange: handleScoreChange,
    onGameOver: handleGameOver,
  });

  dropletEngine.start();
  const { Bodies, Body, World, Events, Constraint } = window.Matter;
  const matterWorld = dropletEngine.debug.world;

  /* =========================================================
     落ち葉（邪魔オブジェクト）
     - 上からたまに落ちる
     - 落ちても消えない
     - リセット時だけ消す
  ========================================================= */
  /* =========================================================
     アリ（常時歩行）
     - cup-line の上を 1〜2匹がゆっくり歩く
     - 左右画像を使う
     - 端まで行ったら消える
     - 少し待ってまた出る
  ========================================================= */

  const ANT_TEX = {
  L1: "assets/images/ant_L_1.png",
  L2: "assets/images/ant_L_2.png",
  R1: "assets/images/ant_R_1.png",
  R2: "assets/images/ant_R_2.png",
};

  const ants = new Set();
  let antTimer = null;

 const ANT_CFG = {
  minCount: 1,
  maxCount: 2,
  speedMin: 0.18,
  speedMax: 0.34,
  spawnDelayMin: 2200,
  spawnDelayMax: 5200,
  yBottomPx: 74,
};
  function getAntTargetCount() {
    return ANT_CFG.minCount + Math.floor(Math.random() * (ANT_CFG.maxCount - ANT_CFG.minCount + 1));
  }

function createAntDom(fromLeft) {
  if (!antsLayer) return null;

  const ant = document.createElement("div");
  ant.className = "ant";

  const img = document.createElement("img");
  img.src = fromLeft ? ANT_TEX.R1 : ANT_TEX.L1;
  img.alt = "ant";

  ant.appendChild(img);
  antsLayer.appendChild(ant);

  const areaWidth = antsLayer.clientWidth || canvas.getBoundingClientRect().width || 360;
  const startX = fromLeft ? -28 : areaWidth + 28;
  const speed =
    (Math.random() * (ANT_CFG.speedMax - ANT_CFG.speedMin) + ANT_CFG.speedMin) *
    (fromLeft ? 1 : -1);

  const antObj = {
    el: ant,
    img,
    fromLeft,
    x: startX,
    speed,
    yBottom: ANT_CFG.yBottomPx + Math.random() * 2,
    frame: 0,
    lastFrameAt: performance.now(),
    frameInterval: 120,
  };

  ant.style.left = `${antObj.x}px`;
  ant.style.bottom = `${antObj.yBottom}px`;

  ants.add(antObj);
  return antObj;
}

  function removeAnt(antObj) {
    if (!antObj) return;
    ants.delete(antObj);
    if (antObj.el && antObj.el.parentNode) {
      antObj.el.parentNode.removeChild(antObj.el);
    }
  }

  function clearAnts() {
    [...ants].forEach(removeAnt);
  }

  function spawnAntIfNeeded() {
    const state = dropletEngine.getState();
    if (state.gameOver) return;
    if (!antsLayer) return;

    const targetCount = getAntTargetCount();
    if (ants.size >= targetCount) return;

    const fromLeft = Math.random() < 0.5;
    createAntDom(fromLeft);
  }

  function scheduleNextAnt() {
    const state = dropletEngine.getState();
    if (state.gameOver) return;

    const delay =
      ANT_CFG.spawnDelayMin +
      Math.random() * (ANT_CFG.spawnDelayMax - ANT_CFG.spawnDelayMin);

    if (antTimer) clearTimeout(antTimer);
    antTimer = setTimeout(() => {
      spawnAntIfNeeded();
      scheduleNextAnt();
    }, delay);
  }

  function stopAntLoop() {
    if (antTimer) {
      clearTimeout(antTimer);
      antTimer = null;
    }
  }

function updateAnts() {
  if (!antsLayer) return;

  const areaWidth = antsLayer.clientWidth || canvas.getBoundingClientRect().width || 360;
  const now = performance.now();

  ants.forEach((antObj) => {
    antObj.x += antObj.speed;
    antObj.el.style.left = `${antObj.x}px`;

    const sway = Math.sin(now * 0.012 + antObj.x * 0.03) * 0.4;
    antObj.el.style.transform =
  `translate(${Math.sin(now * 0.02) * 0.5}px, ${sway}px)`;

    if (now - antObj.lastFrameAt >= antObj.frameInterval) {
      antObj.frame = antObj.frame === 0 ? 1 : 0;
      antObj.lastFrameAt = now;

      if (antObj.speed > 0) {
        antObj.img.src = antObj.frame === 0 ? ANT_TEX.R1 : ANT_TEX.R2;
      } else {
        antObj.img.src = antObj.frame === 0 ? ANT_TEX.L1 : ANT_TEX.L2;
      }
    }

    if (antObj.speed > 0 && antObj.x > areaWidth + 40) {
      removeAnt(antObj);
    } else if (antObj.speed < 0 && antObj.x < -40) {
      removeAnt(antObj);
    }
  });
}

  function startAntLoop() {
    stopAntLoop();
    clearAnts();

    const initialCount = getAntTargetCount();
    for (let i = 0; i < initialCount; i++) {
      createAntDom(Math.random() < 0.5);
    }

    scheduleNextAnt();
  }

  function bindAntFrameLoop() {
    let antFrameBound = false;
    if (bindAntFrameLoop._bound) return;
    bindAntFrameLoop._bound = true;

    Events.on(dropletEngine.debug.engine, "beforeUpdate", () => {
      updateAnts();
    });
  }

  bindAntFrameLoop();
  startAntLoop();
 
  
  const obstacleLeaves = new Set();

    /* =========================================================
     ハチ
     - 大雫がある時だけ出現候補
     - ない時は何もしない
     - 出ても一部はスルー
     - 攻撃時は大雫を中雫に割る
  ========================================================= */

  const BEE_TEX_L = "https://static.wixstatic.com/media/e0436a_750ead96817a40618e8cf9aa30a07192~mv2.png";
  const BEE_TEX_R = "https://static.wixstatic.com/media/e0436a_810f0f4624bb4807bdc0a97652bf3d18~mv2.webp";

  const beeSounds = {
    buzz: [new Audio("assets/sounds/buzz.mp3")],
    beeBreak: [new Audio("assets/sounds/bee_break.mp3")],
  };
  beeSounds.buzz.forEach((a) => {
    a.volume = 0.22;
    a.loop = true;
  });
  beeSounds.beeBreak.forEach((a) => {
    a.volume = 0.70;
  });

  function playBeeRandom(list) {
    if (!list || !list.length) return;
    const a = list[(Math.random() * list.length) | 0];
    try {
      a.currentTime = 0;
      a.play();
    } catch (_) {}
  }

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

  function setSpriteScaleByPx(body, desiredPx, basePx = 512) {
    const sprite = body.render && body.render.sprite;
    if (!sprite || !sprite.texture) return;
    const s = desiredPx / basePx;
    sprite.xScale = s;
    sprite.yScale = s;
  }

  function startBeeBuzz(bee) {
    try {
      const base = beeSounds.buzz[0];
      if (!base) return;
      const buzz = base.cloneNode(true);
      buzz.loop = true;
      buzz.volume = base.volume;
      bee._buzz = buzz;
      buzz.play().catch(() => {});
    } catch (_) {}
  }

  function stopBeeBuzz(bee) {
    if (bee && bee._buzz) {
      try {
        bee._buzz.pause();
        bee._buzz.currentTime = 0;
      } catch (_) {}
      bee._buzz = null;
    }
  }

  function spawnBee() {
    const state = dropletEngine.getState();
    if (state.gameOver) return;

    const worldWidth = dropletEngine.debug.config.worldWidth;
    const worldHeight = dropletEngine.debug.config.worldHeight;

    const fromLeft = Math.random() < 0.5;
    const x = fromLeft ? -80 : worldWidth + 80;
    const y = worldHeight * (0.30 + Math.random() * 0.38);

    const tex = fromLeft ? BEE_TEX_R : BEE_TEX_L;

    const bee = Bodies.rectangle(x, y, 90, 52, {
      isSensor: true,
      frictionAir: 0.0,
      render: {
        fillStyle: "transparent",
        strokeStyle: "rgba(0,0,0,0)",
        lineWidth: 0,
        sprite: { texture: tex, xScale: 1, yScale: 1 },
      },
    });

    bee.isBee = true;
    bee.fromLeft = fromLeft;
    bee.willPass = Math.random() < BEE_CFG.passRate;
    bee.hasStung = false;

    setSpriteScaleByPx(bee, BEE_CFG.sizePx);

    const speedMag =
      Math.random() * (BEE_CFG.speedMax - BEE_CFG.speedMin) + BEE_CFG.speedMin;

    Body.setVelocity(bee, { x: fromLeft ? speedMag : -speedMag, y: 0 });

    bees.add(bee);
    World.add(matterWorld, bee);
    startBeeBuzz(bee);
  }

  function maybeScheduleBee() {
    const state = dropletEngine.getState();
    if (state.gameOver) return;

    const now = performance.now();
    if (now < beeCooldownUntil) return;

    const largeList = dropletEngine.getLargeDroplets();
    const hasLarge = largeList && largeList.length > 0;
    if (!hasLarge) return;

    if (Math.random() > 0.35) return;

    beeCooldownUntil = now + BEE_CFG.cooldownMs;

    const delay =
      BEE_CFG.delayMin + Math.random() * (BEE_CFG.delayMax - BEE_CFG.delayMin);

    if (beeTimer) clearTimeout(beeTimer);
    beeTimer = setTimeout(() => {
      const latest = dropletEngine.getState();
      if (!latest.gameOver) {
        spawnBee();
      }
    }, delay);
  }

  function cleanupBees() {
    const worldWidth = dropletEngine.debug.config.worldWidth;

    bees.forEach((bee) => {
      if (!bee) return;

      if (bee.position.x < -220 || bee.position.x > worldWidth + 220) {
        stopBeeBuzz(bee);
        World.remove(matterWorld, bee);
        bees.delete(bee);
      }
    });
  }

  Events.on(dropletEngine.debug.engine, "beforeUpdate", () => {
    bees.forEach((bee) => {
      const wobble = Math.sin(performance.now() * 0.003 + bee.id) * 0.22;
      Body.setVelocity(bee, { x: bee.velocity.x, y: wobble });
    });

    cleanupBees();
  });

  Events.on(dropletEngine.debug.engine, "collisionStart", (event) => {
    for (const pair of event.pairs) {
      const bodyA = pair.bodyA;
      const bodyB = pair.bodyB;

      if ((bodyA?.isBee && bodyB?.isDroplet) || (bodyB?.isBee && bodyA?.isDroplet)) {
        const bee = bodyA.isBee ? bodyA : bodyB;
        const droplet = bodyA.isDroplet ? bodyA : bodyB;

        if (!bee || !droplet) continue;
        if (bee.willPass) continue;
        if (bee.hasStung) continue;
        if (droplet.stage !== 2) continue;

        bee.hasStung = true;
        playBeeRandom(beeSounds.beeBreak);

        dropletEngine.breakLargeDroplet(droplet, {
          vx: (Math.random() - 0.5) * 1.2,
          vy: -2,
        });
      }
    }
  });

  function stopBeeTimer() {
    if (beeTimer) {
      clearTimeout(beeTimer);
      beeTimer = null;
    }
  }

  function clearBees() {
    bees.forEach((bee) => {
      stopBeeBuzz(bee);
      World.remove(matterWorld, bee);
    });
    bees.clear();
  }

  function startBeeLoop() {
    stopBeeTimer();

    const loop = () => {
      const state = dropletEngine.getState();
      if (state.gameOver) return;

      maybeScheduleBee();

      beeTimer = setTimeout(loop, 1800);
    };

    beeTimer = setTimeout(loop, 1800);
  }

  startBeeLoop();
  /* =========================================================
     ミノムシ v1
     - 上から降りる
     - 落ち葉をつかむ
     - 上に持ち上げる
     - たまに失敗して落下
     - cup-line で気絶して止まる
  ========================================================= */

  const MINO_TEX_NORMAL = "assets/images/minomusi_1.webp";
  const MINO_TEX_FAIL   = "assets/images/minomusi_2.webp";

  const minoSounds = {
    move: new Audio("assets/sounds/mino_move.wav"),
    rakka: new Audio("assets/sounds/mino_rakka.mp3"),
  };
  minoSounds.move.loop = true;
  minoSounds.move.volume = 0.18;
  minoSounds.rakka.volume = 0.65;

  const minos = new Set();
  let minoTimer = null;
  let minoCooldownUntil = 0;

  const MINO_CFG = {
    sizePx: 42,
    downSpeed: 1.05,
    upSpeed: -1.0,
    failFallSpeed: 1.9,
    delayMin: 2800,
    delayMax: 5200,
    cooldownMs: 12000,
    failRate: 0.35,
    swayStartYRatio: 0.56,
    stopTopY: 120,
  };

  function setMinoSpriteScaleByPx(body, desiredPx, basePx = 512) {
    const sprite = body.render && body.render.sprite;
    if (!sprite || !sprite.texture) return;
    const s = desiredPx / basePx;
    sprite.xScale = s;
    sprite.yScale = s;
  }

  function playMinoMove() {
    try {
      minoSounds.move.currentTime = 0;
      minoSounds.move.play();
    } catch (_) {}
  }

  function stopMinoMove() {
    try {
      minoSounds.move.pause();
      minoSounds.move.currentTime = 0;
    } catch (_) {}
  }

  function playMinoRakka() {
    try {
      minoSounds.rakka.currentTime = 0;
      minoSounds.rakka.play();
    } catch (_) {}
  }

  function spawnMino() {
    const state = dropletEngine.getState();
    if (state.gameOver) return;

    const worldWidth = dropletEngine.debug.config.worldWidth;
    const worldHeight = dropletEngine.debug.config.worldHeight;

    const x = worldWidth * (0.34 + Math.random() * 0.32);
    const y = -70;

    const mino = Bodies.rectangle(x, y, 60, 78, {
      isSensor: true,
      frictionAir: 0.0,
      render: {
        fillStyle: "transparent",
        strokeStyle: "rgba(0,0,0,0)",
        lineWidth: 0,
        sprite: { texture: MINO_TEX_NORMAL, xScale: 1, yScale: 1 },
      },
    });

    mino.isMino = true;
    mino.state = "down";
    mino.grab = null;
    mino.carryRope = null;
    mino.spawnAt = performance.now();
    mino.windSeed = Math.random() * 1000;

    mino._inertiaOrig = mino.inertia;
    Body.setInertia(mino, Infinity);
    Body.setAngle(mino, 0);
    setMinoSpriteScaleByPx(mino, MINO_CFG.sizePx);

    World.add(matterWorld, mino);
    minos.add(mino);

    const swayStartY = worldHeight * MINO_CFG.swayStartYRatio;
    const anchor = { x, y: -180 };

    const rope = Constraint.create({
      pointA: anchor,
      bodyB: mino,
      pointB: { x: 0, y: -18 },
      length: (swayStartY - anchor.y) + 8,
      stiffness: 0.02,
      damping: 0.18,
      render: {
        visible: true,
        strokeStyle: "rgba(255,255,255,0.55)",
        lineWidth: 2,
      },
    });

    mino.rope = rope;
    mino.ropeAnchor = anchor;
    World.add(matterWorld, rope);

    playMinoMove();
  }

  function pickMinoTarget() {
    const leafTargets = [...obstacleLeaves].filter(
      (leaf) => leaf && !leaf.isGrabbedByMino
    );
    if (leafTargets.length === 0) return null;
    return leafTargets[Math.floor(Math.random() * leafTargets.length)];
  }

  function attachLeafToMino(mino, target) {
    if (!mino || !target) return;
    if (target.isGrabbedByMino) return;

    target.isGrabbedByMino = true;
    target._densityOrig = target.density;

    try {
      Body.setDensity(target, Math.max(0.0002, target.density * 0.45));
    } catch (_) {}

    const carry = Constraint.create({
      bodyA: mino,
      pointA: { x: 0, y: 16 },
      bodyB: target,
      pointB: { x: 0, y: 0 },
      length: 18,
      stiffness: 0.24,
      damping: 0.12,
      render: {
        visible: true,
        strokeStyle: "rgba(255,255,255,0.35)",
        lineWidth: 2,
      },
    });

    mino.grab = target;
    mino.carryRope = carry;
    World.add(matterWorld, carry);
  }

  function detachMinoGrab(mino) {
    if (!mino) return null;

    if (mino.carryRope) {
      World.remove(matterWorld, mino.carryRope);
      mino.carryRope = null;
    }

    const g = mino.grab;
    if (g) {
      g.isGrabbedByMino = false;
      if (g._densityOrig != null) {
        try {
          Body.setDensity(g, g._densityOrig);
        } catch (_) {}
      }
      mino.grab = null;
    }

    return g || null;
  }

 function knockOutMino(m) {
  if (!m || m.state === "ko") return;

  m.state = "ko";
  // ★ここで鳴らす（cup-lineに着地した瞬間）
  function playMinoFailSE() {
  const se = new Audio("assets/sounds/mino_rakka.mp3");
  se.volume = 0.6;
  se.currentTime = 0;
  se.play();
}

  stopMinoMove();

  const rimY = dropletEngine.debug.cupRimY;

  // cup-line の上に置く
  const minX = 42;
  const maxX = dropletEngine.debug.config.worldWidth - 42;
  const safeX = Math.max(minX, Math.min(maxX, m.position.x));

  // 先に位置を決める
  Body.setPosition(m, {
    x: safeX,
    y: rimY - 16
  });

  Body.setVelocity(m, { x: 0, y: 0 });
  Body.setAngularVelocity(m, 0);
  Body.setAngle(m, Math.PI / 2);

  m.isSensor = false;

  if (m.render && m.render.sprite) {
    m.render.sprite.texture = MINO_TEX_FAIL;
    setMinoSpriteScaleByPx(m, MINO_CFG.sizePx);
  }

  // ★ここが重要：完全にその場で止める
  Body.setStatic(m, true);

  World.remove(matterWorld, m);
  World.add(matterWorld, m);
}
  function clearMinos() {
    stopMinoMove();

    minos.forEach((m) => {
      if (m.rope) World.remove(matterWorld, m.rope);
      if (m.carryRope) World.remove(matterWorld, m.carryRope);

      if (m.grab) {
        const g = detachMinoGrab(m);
        if (g) {
          g.isGrabbedByMino = false;
        }
      }

      World.remove(matterWorld, m);
    });

    minos.clear();
  }

  function stopMinoTimer() {
    if (minoTimer) {
      clearTimeout(minoTimer);
      minoTimer = null;
    }
  }

  function maybeScheduleMino() {
    const state = dropletEngine.getState();
    if (state.gameOver) return;
    if (minos.size >= 1) return;

    const now = performance.now();
    if (now < minoCooldownUntil) return;

    const hasLeaf = obstacleLeaves.size > 0;
    if (!hasLeaf) return;

    if (Math.random() > 0.26) return;

    minoCooldownUntil = now + MINO_CFG.cooldownMs;

    const delay =
      MINO_CFG.delayMin + Math.random() * (MINO_CFG.delayMax - MINO_CFG.delayMin);

    stopMinoTimer();
    minoTimer = setTimeout(() => {
      const latest = dropletEngine.getState();
      if (!latest.gameOver) {
        spawnMino();
      }
    }, delay);
  }

  function startMinoLoop() {
    stopMinoTimer();

    const loop = () => {
      const state = dropletEngine.getState();
      if (state.gameOver) return;

      maybeScheduleMino();
      minoTimer = setTimeout(loop, 1800);
    };

    minoTimer = setTimeout(loop, 1800);
  }

  function cleanupMinos() {
    const worldHeight = dropletEngine.debug.config.worldHeight;

    minos.forEach((m) => {
      if (!m) return;

      if (m.state === "carry" && m.position.y < -130) {
        if (m.rope) World.remove(matterWorld, m.rope);

        if (m.grab) {
          const g = detachMinoGrab(m);
          if (g) {
            if (obstacleLeaves.has(g)) obstacleLeaves.delete(g);
            World.remove(matterWorld, g);
          }
        }

        World.remove(matterWorld, m);
        minos.delete(m);
      }

      if (m.position.y > worldHeight + 220) {
        if (m.rope) World.remove(matterWorld, m.rope);
        if (m.carryRope) World.remove(matterWorld, m.carryRope);
        World.remove(matterWorld, m);
        minos.delete(m);
      }
    });

    if (minos.size === 0) {
      stopMinoMove();
    }
  }

  function updateMinosAI() {
    const state = dropletEngine.getState();
    if (state.gameOver) return;

    const now = performance.now();
    const worldHeight = dropletEngine.debug.config.worldHeight;
    const swayStartY = worldHeight * MINO_CFG.swayStartYRatio;
    const SWAY_PX = 8;

    minos.forEach((m) => {
      if (!m) return;

      if (m.rope && m.ropeAnchor) {
        if (m.position.y >= swayStartY) {
          const t = (now - (m.spawnAt || now)) * 0.001;
          const sway = Math.sin(t * 1.2 + m.windSeed) * SWAY_PX;
          m.rope.pointA.x = m.ropeAnchor.x + sway;
        } else {
          m.rope.pointA.x = m.ropeAnchor.x;
        }
      }

      if (m.state === "down") {
        if (m.position.y >= swayStartY) {
          Body.setPosition(m, { x: m.position.x, y: swayStartY });
          Body.setVelocity(m, { x: 0, y: 0 });
          m.state = "pause";
          m.pauseUntil = now + 500 + Math.random() * 400;
        } else {
          Body.setVelocity(m, { x: 0, y: MINO_CFG.downSpeed });
        }
        return;
      }

      if (m.state === "pause") {
        Body.setVelocity(m, { x: 0, y: 0 });

        if (now >= m.pauseUntil) {
          const target = pickMinoTarget();
          if (target) {
            attachLeafToMino(m, target);
            m.state = "lift";
          } else {
            m.state = "return";
          }
        }
        return;
      }

      if (m.state === "lift") {
        Body.setAngle(m, 0);

        if (m.rope) {
          m.rope.stiffness = 0.06;
          m.rope.length = Math.max(120, m.rope.length - 1.5);
        }

        Body.setVelocity(m, { x: 0, y: MINO_CFG.upSpeed });

        if (m.position.y < MINO_CFG.stopTopY) {
          const fail = Math.random() < MINO_CFG.failRate && !!m.grab;

          if (fail) {
            const g = detachMinoGrab(m);

            if (g && g.position) {
              Body.setVelocity(g, {
                x: (Math.random() - 0.5) * 0.8,
                y: MINO_CFG.failFallSpeed,
              });
            }

            if (m.rope) {
              World.remove(matterWorld, m.rope);
              m.rope = null;
            }

            m.state = "fail";

           // 雫には当たらず、cup-line まで落とす
           m.isSensor = true;

             Body.setVelocity(m, {
           x: (Math.random() - 0.5) * 0.3,
           y: MINO_CFG.failFallSpeed,
          });

            playMinoRakka();
            stopMinoMove();
          } else {
            m.state = "carry";
          }
        }
        return;
      }

      if (m.state === "carry") {
        Body.setAngle(m, 0);

        if (m.rope) {
          m.rope.stiffness = 0.07;
          m.rope.length = Math.max(90, m.rope.length - 1.8);
        }

        Body.setVelocity(m, { x: 0, y: MINO_CFG.upSpeed });
        return;
      }

      if (m.state === "return") {
        if (m.rope) {
          m.rope.stiffness = 0.06;
          m.rope.length = Math.max(90, m.rope.length - 1.8);
        }

        Body.setVelocity(m, { x: 0, y: MINO_CFG.upSpeed });
        return;
      }

   if (m.state === "fail") {
  const rimY = dropletEngine.debug.cupRimY;

  Body.setVelocity(m, {
    x: m.velocity.x * 0.98,
    y: MINO_CFG.failFallSpeed,
  });

  if (m.position.y >= rimY - 10) {
    knockOutMino(m);
  }
  return;
}

if (m.state === "ko") {
  return;
}
    });
  }

  Events.on(dropletEngine.debug.engine, "beforeUpdate", () => {
    updateMinosAI();
    cleanupMinos();
  });

  Events.on(dropletEngine.debug.engine, "collisionStart", (event) => {
    for (const pair of event.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;

      if (a?.isMino && a.state === "fail" && (b?.isCupRim || b?.isStatic)) {
        knockOutMino(a);
      } else if (b?.isMino && b.state === "fail" && (a?.isCupRim || a?.isStatic)) {
        knockOutMino(b);
      }
    }
  });

  startMinoLoop();


  // いまは葉っぱ皿画像を流用
  // 専用画像を入れたらここだけ差し替えればOK
  const OBSTACLE_LEAF_TEXTURE = "assets/images/leaf_BB.png";

  let leafSpawnTimer = null;

  function setSpriteScaleByPx(body, desiredPx, basePx = 512) {
    const sprite = body.render && body.render.sprite;
    if (!sprite || !sprite.texture) return;

    const s = desiredPx / basePx;
    sprite.xScale = s;
    sprite.yScale = s;
  }

  function spawnObstacleLeaf() {
    const state = dropletEngine.getState();
    if (state.gameOver) return;

    const worldWidth = dropletEngine.debug.config.worldWidth;
    const leftMargin = dropletEngine.debug.config.leftMargin;
    const rightMargin = dropletEngine.debug.config.rightMargin;

    const radius = 18;
    const minX = leftMargin + radius;
    const maxX = worldWidth - rightMargin - radius;

    const x = minX + Math.random() * (maxX - minX);
    const y = -32;

    const leaf = Bodies.circle(x, y, radius, {
  density: 0.00025,       // 軽くする
  restitution: 0.25,      // 跳ねすぎない
  friction: 0.04,
  frictionAir: 0.12,      // 空気抵抗を強くする（ふわふわ）

  render: {
    fillStyle: "transparent",
    strokeStyle: "rgba(0,0,0,0)",
    lineWidth: 0,
    sprite: {
      texture: OBSTACLE_LEAF_TEXTURE,
      xScale: 1,
      yScale: 1,
    },
  },
});

    leaf.isObstacleLeaf = true;

    obstacleLeaves.add(leaf);
    World.add(matterWorld, leaf);

    // 見た目サイズ
    setSpriteScaleByPx(leaf, 32);

    // 少しだけ自然な揺れ
    Body.setAngularVelocity(leaf, (Math.random() - 0.5) * 0.06);
  }

  function clearObstacleLeaves() {
    obstacleLeaves.forEach((leaf) => {
      World.remove(matterWorld, leaf);
    });
    obstacleLeaves.clear();
  }

  function stopLeafSpawnLoop() {
    if (leafSpawnTimer) {
      clearTimeout(leafSpawnTimer);
      leafSpawnTimer = null;
    }
  }

  function scheduleNextLeaf() {
    const state = dropletEngine.getState();
    if (state.gameOver) return;

    // 6〜11秒に1回くらい、ぽとり
    const delay = 6000 + Math.random() * 5000;

    stopLeafSpawnLoop();
    leafSpawnTimer = setTimeout(() => {
      const latest = dropletEngine.getState();
      if (!latest.gameOver) {
        spawnObstacleLeaf();
        scheduleNextLeaf();
      }
    }, delay);
  }

  scheduleNextLeaf();

  function handleReset() {
  hideGameOver();
  dropletEngine.resetGame();

  if (minoFxLayer) {
    minoFxLayer.innerHTML = "";
  }

  stopLeafSpawnLoop();
  clearObstacleLeaves();

  stopBeeTimer();
  clearBees();

  stopAntLoop();
  clearAnts();

  stopMinoTimer();
  clearMinos();

  scheduleNextLeaf();
  startBeeLoop();
  startAntLoop();
  startMinoLoop();

  handleScoreChange(0);
}

  if (resetBtnEl) {
    resetBtnEl.addEventListener("click", handleReset);
  }

  if (overlayRestartBtnEl) {
    overlayRestartBtnEl.addEventListener("click", handleReset);
  }

  // デバッグ用
  window.tmDropletEngine = dropletEngine;
})();
