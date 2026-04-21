(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const leafWrapperEl = document.getElementById("leafWrapper");
  const previewDropletEl = document.getElementById("previewDroplet");
  const cupHandleEl = document.getElementById("cupHandle");

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

  // =========================================================
  // デバッグ
  // true ならレディ救助を毎回強制発火
  // =========================================================
  const DEBUG_FORCE_LADY = false;

  function updateGauge(score) {
    if (!gaugeFillEl) return;
    const p = Math.max(0, Math.min(1, score / 260));
    gaugeFillEl.style.transformOrigin = "left center";
    gaugeFillEl.style.transform = `scaleX(${p.toFixed(3)})`;
  }

  function handleScoreChange(score) {
    if (scoreLabelEl) scoreLabelEl.textContent = String(score);
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
    cupHandleEl,
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

  if (helpBtnEl) {
    helpBtnEl.addEventListener("click", openHelp);
  }
  if (helpCloseBtnEl) {
    helpCloseBtnEl.addEventListener("click", closeHelp);
  }
  if (helpOverlayEl) {
    helpOverlayEl.addEventListener("click", (e) => {
      if (e.target === helpOverlayEl) closeHelp();
    });
  }

  /* =========================================================
     アリ（常時歩行 + 救助アリ + タンカー）
  ========================================================= */

  const ANT_TEX = {
    L1: "assets/images/ant_L_1.png",
    L2: "assets/images/ant_L_2.png",
    R1: "assets/images/ant_R_1.png",
    R2: "assets/images/ant_R_2.png",
  };

  const TAN_CAR_SRC = "assets/images/tan_car.png";

  const ants = new Set();
  let antTimer = null;
  const tankerRescues = new Set();

  const ANT_CFG = {
    minCount: 1,
    maxCount: 2,
    speedMin: 0.18,
    speedMax: 0.34,
    spawnDelayMin: 2200,
    spawnDelayMax: 5200,
    yBottomPx: 74,

    rescueRunSpeed: 1.05,
    rescueStopOffset: 9,
    rescueTapInterval: 620,
    rescueTapCount: 4,
    rescueSpawnGapMs: 180,

    tankerChance: 0.28,
    tankerRunSpeed: 1.0,
    tankerCarrySpeed: 0.62,
    tankerLoadDelay: 520,
    tankerExitPadding: 140,
    tankerWidth: 116,
    tankerHeight: 44,
    tankerBobPx: 2.8,
    tankerSoundInterval: 900,
  };

  function getAntTargetCount() {
    return (
      ANT_CFG.minCount +
      Math.floor(Math.random() * (ANT_CFG.maxCount - ANT_CFG.minCount + 1))
    );
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

    const areaWidth =
      antsLayer.clientWidth || canvas.getBoundingClientRect().width || 360;
    const startX = fromLeft ? -28 : areaWidth + 28;
    const speed =
      (Math.random() * (ANT_CFG.speedMax - ANT_CFG.speedMin) + ANT_CFG.speedMin) *
      (fromLeft ? 1 : -1);

    const antObj = {
      role: "walker",
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

  function createRescueAntDom(mino, fromLeft) {
    if (!antsLayer || !mino) return null;

    const ant = document.createElement("div");
    ant.className = "ant ant-rescuer";

    const img = document.createElement("img");
    img.src = fromLeft ? ANT_TEX.R1 : ANT_TEX.L1;
    img.alt = "rescuer ant";

    ant.appendChild(img);
    antsLayer.appendChild(ant);

    const areaWidth =
      antsLayer.clientWidth || canvas.getBoundingClientRect().width || 360;

    const startX = fromLeft ? -28 : areaWidth + 28;
    const stopX =
      mino.position.x +
      (fromLeft ? -ANT_CFG.rescueStopOffset : ANT_CFG.rescueStopOffset);

    const antObj = {
      id: `rescue-${Math.random().toString(36).slice(2)}`,
      role: "rescuer",
      el: ant,
      img,
      fromLeft,
      x: startX,
      targetX: stopX,
      speed: fromLeft ? ANT_CFG.rescueRunSpeed : -ANT_CFG.rescueRunSpeed,
      yBottom: ANT_CFG.yBottomPx,
      frame: 0,
      lastFrameAt: performance.now(),
      frameInterval: 90,
      rescueState: "run",
      tapCount: 0,
      nextTapAt: 0,
      tapPhaseOffset: fromLeft ? 0 : 80,
      targetMino: mino,
    };

    ant.style.left = `${antObj.x}px`;
    ant.style.bottom = `${antObj.yBottom}px`;

    ants.add(antObj);
    mino.rescueAntIds?.add(antObj.id);

    return antObj;
  }

  function convertWalkerToRescuer(antObj, mino) {
    if (!antObj || !mino) return null;
    if (antObj.role === "rescuer") return antObj;

    antObj.role = "rescuer";
    antObj.id = antObj.id || `rescue-${Math.random().toString(36).slice(2)}`;
    antObj.targetMino = mino;
    antObj.rescueState = "run";
    antObj.tapCount = 0;
    antObj.nextTapAt = 0;
    antObj.frameInterval = 90;
    antObj.tapPhaseOffset = antObj.fromLeft ? 0 : 80;

    const stopOffset =
      antObj.x < mino.position.x
        ? -ANT_CFG.rescueStopOffset
        : ANT_CFG.rescueStopOffset;

    antObj.targetX = mino.position.x + stopOffset;
    antObj.speed =
      antObj.x < mino.position.x
        ? ANT_CFG.rescueRunSpeed
        : -ANT_CFG.rescueRunSpeed;

    mino.rescueAntIds?.add(antObj.id);

    return antObj;
  }

  function findNearbyWalkerAnts(mino, maxCount = 4, radius = 120) {
    if (!mino) return [];

    return [...ants]
      .filter((a) => a && a.role !== "rescuer")
      .filter((a) => Math.abs(a.x - mino.position.x) <= radius)
      .sort(
        (a, b) =>
          Math.abs(a.x - mino.position.x) - Math.abs(b.x - mino.position.x)
      )
      .slice(0, maxCount);
  }

  /* =========================================================
     ミノムシレディ
  ========================================================= */

  const LADY_TEX = "assets/images/minomusi_L1.webp";

  const LADY_CFG = {
    chance: 0.06,
    descendSpeed: 1.25,
    floatSpeed: -0.6,
    swayPx: 10,
    waitAfterTouchMs: 360,
  };

  const ladies = new Set();

  function spawnLadyHeart(x, y) {
    const layer = minoFxLayer || antsLayer;
    if (!layer) return;

    const heart = document.createElement("div");
    heart.textContent = "❤";
    heart.style.position = "absolute";
    heart.style.left = `${x}px`;
    heart.style.top = `${y}px`;
    heart.style.transform = "translate(-50%, -50%)";
    heart.style.fontSize = `${10 + Math.random() * 6}px`;
    heart.style.color = "rgba(255, 170, 190, 0.85)";
    heart.style.pointerEvents = "none";
    heart.style.zIndex = "28";
    heart.style.textShadow = "0 1px 2px rgba(255,255,255,0.35)";
    heart.style.opacity = "0.9";

    layer.appendChild(heart);

    const startX = x;
    const driftX = (Math.random() - 0.5) * 18;
    const rise = 18 + Math.random() * 16;
    const life = 700 + Math.random() * 300;
    const start = performance.now();

    function tick(now) {
      const t = Math.min(1, (now - start) / life);
      const ease = 1 - Math.pow(1 - t, 2);

      heart.style.left = `${startX + driftX * ease}px`;
      heart.style.top = `${y - rise * ease}px`;
      heart.style.opacity = `${0.9 * (1 - t)}`;
      heart.style.transform = `translate(-50%, -50%) scale(${1 + t * 0.25})`;

      if (t < 1) {
        requestAnimationFrame(tick);
      } else if (heart.parentNode) {
        heart.parentNode.removeChild(heart);
      }
    }

    requestAnimationFrame(tick);
  }

  function spawnLadyRescue(mino) {
    if (!mino || mino.rescueFinished) return null;
    if (!minoFxLayer && !antsLayer) return null;

    const layer = minoFxLayer || antsLayer;

    const el = document.createElement("img");
    el.src = LADY_TEX;
    el.alt = "lady rescue";
    el.style.position = "absolute";
    el.style.width = "22px";
    el.style.height = "auto";
    el.style.pointerEvents = "none";
    el.style.zIndex = "26";
    el.style.transform = "translate(-50%, -50%)";
    el.style.filter = "drop-shadow(0 2px 3px rgba(0,0,0,0.15))";

    layer.appendChild(el);

    const lady = {
      id: `lady-${Math.random().toString(36).slice(2)}`,
      el,
      mino,
      x: mino.position.x,
      y: -56,
      state: "descend",
      spawnAt: performance.now(),
      touchAt: 0,
      swaySeed: Math.random() * 1000,
      carryOffsetX: 6,
      carryOffsetY: 6,
      heartNextAt: 0,
      baseX: mino.position.x,
    };

    ladies.add(lady);
    return lady;
  }

  function removeLady(lady) {
    if (!lady) return;
    ladies.delete(lady);
    if (lady.el && lady.el.parentNode) {
      lady.el.parentNode.removeChild(lady.el);
    }
  }

  function clearLadies() {
    [...ladies].forEach(removeLady);
  }

  function updateLadies() {
    const now = performance.now();

    ladies.forEach((lady) => {
      const m = lady.mino;
      if (!m) {
        removeLady(lady);
        return;
      }

      if (lady.state === "descend") {
        lady.y += LADY_CFG.descendSpeed;
        lady.x =
          m.position.x +
          Math.sin(now * 0.004 + lady.swaySeed) * (LADY_CFG.swayPx * 0.45);

        const targetY = m.position.y - 20;
        if (lady.y >= targetY) {
          lady.y = targetY;
          lady.state = "touch";
          lady.touchAt = now;
          lady.baseX = lady.x;

          reviveMino(m, { force: true, silent: true });
          m.state = "ladyCarry";
          m.ladyCarry = true;
          m.ladyPartnerId = lady.id;
        }
      } else if (lady.state === "touch") {
        lady.x = lady.baseX + Math.sin(now * 0.005 + lady.swaySeed) * 1.5;
        lady.y = m.position.y - 20;

        if (m && m.state === "ladyCarry") {
          Body.setPosition(m, {
            x: lady.x + lady.carryOffsetX,
            y: lady.y + lady.carryOffsetY,
          });
          Body.setVelocity(m, { x: 0, y: 0 });
          Body.setAngle(m, -0.08);
        }

        if (now - lady.touchAt >= LADY_CFG.waitAfterTouchMs) {
          lady.state = "float";
        }
      } else if (lady.state === "float") {
        lady.y += LADY_CFG.floatSpeed;
        lady.x = lady.baseX + Math.sin(now * 0.004 + lady.swaySeed) * 3;

        if (m && m.state === "ladyCarry") {
          Body.setPosition(m, {
            x: lady.x + lady.carryOffsetX,
            y: lady.y + lady.carryOffsetY,
          });
          Body.setVelocity(m, { x: 0, y: 0 });
          Body.setAngle(m, -0.12 + Math.sin(now * 0.004 + lady.swaySeed) * 0.05);

          if (now >= (lady.heartNextAt || 0)) {
  const heartWorldX = lady.x + 10 + (Math.random() - 0.5) * 10;
  const heartWorldY = lady.y - 10 + (Math.random() - 0.5) * 4;
  const heartScreen = worldToOverlayPoint(heartWorldX, heartWorldY);

  spawnLadyHeart(heartScreen.x, heartScreen.y);
  lady.heartNextAt = now + 220 + Math.random() * 180;
}
        }

        if (lady.y < -90) {
          if (m && minos.has(m)) {
            clearMinoStars(m);

            if (m.rope) World.remove(matterWorld, m.rope);
            if (m.carryRope) World.remove(matterWorld, m.carryRope);

            World.remove(matterWorld, m);
            minos.delete(m);
          }

          removeLady(lady);
          return;
        }
      }

      const ladyScreen = worldToOverlayPoint(lady.x, lady.y);
      lady.el.style.left = `${ladyScreen.x}px`;
      lady.el.style.top = `${ladyScreen.y}px`;
    });
  }

  /* =========================================================
     葉っぱ音
  ========================================================= */

  let leafCarryAudio = null;

  function playLeafCarrySound(volume = 0.22) {
    try {
      if (leafCarryAudio) {
        leafCarryAudio.pause();
        leafCarryAudio.currentTime = 0;
      }
      leafCarryAudio = new Audio("assets/sounds/leaf_soft.mp3");
      leafCarryAudio.volume = volume;
      leafCarryAudio.play();
    } catch (_) {}
  }

  function stopLeafCarrySound() {
    try {
      if (!leafCarryAudio) return;
      leafCarryAudio.pause();
      leafCarryAudio.currentTime = 0;
    } catch (_) {}
  }

  function getTankerCarryVolume(obj, areaWidth) {
    const centerX = obj.x + obj.width / 2;
    const safeCenter = areaWidth * 0.5;
    const dist = Math.abs(centerX - safeCenter);
    const fadeStart = areaWidth * 0.18;
    const fadeEnd = areaWidth * 0.52;

    if (dist <= fadeStart) return 0.22;
    if (dist >= fadeEnd) return 0.08;

    const t = (dist - fadeStart) / (fadeEnd - fadeStart);
    return 0.22 - t * 0.14;
  }

  /* =========================================================
     タンカー
  ========================================================= */

  function createTankerRescueDom(mino, fromLeft) {
    if (!antsLayer || !mino) return null;

    const wrap = document.createElement("div");
    wrap.className = "ant-tanker-wrap";
    wrap.style.position = "absolute";
    wrap.style.left = "0px";
    wrap.style.bottom = `${ANT_CFG.yBottomPx - 2}px`;
    wrap.style.width = `${ANT_CFG.tankerWidth}px`;
    wrap.style.height = `${ANT_CFG.tankerHeight}px`;
    wrap.style.pointerEvents = "none";
    wrap.style.transformOrigin = "center bottom";
    wrap.style.display = "block";
    wrap.style.opacity = "1";
    wrap.style.zIndex = "18";

    const cart = document.createElement("img");
    cart.src = TAN_CAR_SRC;
    cart.alt = "leaf tanker";
    cart.style.position = "absolute";
    cart.style.left = "18px";
    cart.style.bottom = "6px";
    cart.style.width = "80px";
    cart.style.height = "auto";
    cart.style.pointerEvents = "none";
    cart.style.zIndex = "2";
    cart.style.filter = "drop-shadow(0 1px 1px rgba(0,0,0,0.12))";

    const minoImg = document.createElement("img");
    minoImg.src = "assets/images/minomusi_3.webp";
    minoImg.alt = "mino on tanker";
    minoImg.style.position = "absolute";
    minoImg.style.left = "34px";
    minoImg.style.bottom = "14px";
    minoImg.style.width = "44px";
    minoImg.style.height = "auto";
    minoImg.style.pointerEvents = "none";
    minoImg.style.zIndex = "5";
    minoImg.style.transformOrigin = "center center";
    minoImg.style.filter = "drop-shadow(0 1px 1px rgba(0,0,0,0.10))";
    minoImg.style.opacity = "0";

    const antLeft = document.createElement("img");
    antLeft.src = ANT_TEX.R1;
    antLeft.alt = "carrier ant";
    antLeft.style.position = "absolute";
    antLeft.style.left = "0px";
    antLeft.style.bottom = "0px";
    antLeft.style.width = "28px";
    antLeft.style.height = "auto";
    antLeft.style.pointerEvents = "none";
    antLeft.style.zIndex = "4";

    const antRight = document.createElement("img");
    antRight.src = ANT_TEX.L1;
    antRight.alt = "carrier ant";
    antRight.style.position = "absolute";
    antRight.style.right = "0px";
    antRight.style.bottom = "0px";
    antRight.style.width = "28px";
    antRight.style.height = "auto";
    antRight.style.pointerEvents = "none";
    antRight.style.zIndex = "4";

    wrap.appendChild(cart);
    wrap.appendChild(minoImg);
    wrap.appendChild(antLeft);
    wrap.appendChild(antRight);
    antsLayer.appendChild(wrap);

    const areaWidth =
      antsLayer.clientWidth || canvas.getBoundingClientRect().width || 360;

    const startX = fromLeft ? -ANT_CFG.tankerWidth - 24 : areaWidth + 24;
    const targetX = mino.position.x - ANT_CFG.tankerWidth / 2;
    const direction = fromLeft ? 1 : -1;

    const obj = {
      id: `tanker-${Math.random().toString(36).slice(2)}`,
      el: wrap,
      cartEl: cart,
      minoEl: minoImg,
      antLeftEl: antLeft,
      antRightEl: antRight,
      mino,
      fromLeft,
      x: startX,
      targetX,
      yBottom: ANT_CFG.yBottomPx - 2,
      width: ANT_CFG.tankerWidth,
      height: ANT_CFG.tankerHeight,
      speed: ANT_CFG.tankerRunSpeed * direction,
      direction,
      state: "run",
      loadAt: 0,
      bobSeed: Math.random() * 1000,
      startedAt: performance.now(),
      lastLeafAt: 0,
      frame: 0,
      lastFrameAt: performance.now(),
      frameInterval: 120,
    };

    wrap.style.left = `${obj.x}px`;

    tankerRescues.add(obj);
    return obj;
  }

  function updateTankerMinoPose(obj, now) {
    if (!obj || !obj.minoEl) return;

    let baseLeft = 36;
    let baseBottom = 14;
    let baseDeg = 90;

    if (obj.state === "run") {
      obj.minoEl.style.opacity = "0";
      return;
    }

    if (obj.state === "load") {
      obj.minoEl.style.opacity = "1";

      const t = Math.min(1, (now - obj.loadAt) / ANT_CFG.tankerLoadDelay);
      baseLeft = 30 + t * 6;
      baseBottom = 6 + t * 8;
      baseDeg = 78 + t * 12;
    } else if (obj.state === "carry") {
      obj.minoEl.style.opacity = "1";
      baseLeft = 36;
      baseBottom = 14;
      baseDeg = 90;
    }

    const sway = Math.sin(now * 0.012 + obj.bobSeed) * 4.5;
    const lift = Math.sin(now * 0.018 + obj.bobSeed) * 1.5;

    obj.minoEl.style.left = `${baseLeft}px`;
    obj.minoEl.style.bottom = `${baseBottom + lift}px`;
    obj.minoEl.style.transform = `rotate(${baseDeg + sway}deg)`;
  }

  function startTankerRescue(m) {
    if (!m || m.rescueFinished) return;

    m.rescueFinished = true;
    m.rescueRequested = false;
    m.state = "tanker";
    m._reviveQueued = false;

    clearMinoStars(m);
    stopMinoMove();

    Body.setStatic(m, true);
    m.isSensor = true;
    Body.setVelocity(m, { x: 0, y: 0 });
    Body.setAngularVelocity(m, 0);
    Body.setAngle(m, Math.PI / 2);

    if (m.render && m.render.sprite) {
      m.render.sprite.texture = MINO_TEX_DIZZY;
      setMinoSpriteScaleByPx(m, MINO_CFG.sizePx);
    }

    const fromLeft = Math.random() < 0.5;
    createTankerRescueDom(m, fromLeft);
  }

  function removeTankerRescue(obj) {
    if (!obj) return;
    tankerRescues.delete(obj);
    if (obj.el && obj.el.parentNode) {
      obj.el.parentNode.removeChild(obj.el);
    }
  }

  function clearTankerRescues() {
    stopLeafCarrySound();

    [...tankerRescues].forEach((obj) => {
      if (obj.mino) {
        clearMinoStars(obj.mino);
        stopMinoMove();
      }
      removeTankerRescue(obj);
    });
  }

  function updateTankerRescues() {
    if (!antsLayer) return;
    const areaWidth =
      antsLayer.clientWidth || canvas.getBoundingClientRect().width || 360;
    const now = performance.now();

    tankerRescues.forEach((obj) => {
      const m = obj.mino;
      if (!m) {
        removeTankerRescue(obj);
        return;
      }

      if (obj.state === "run") {
        obj.x += obj.speed;
        obj.el.style.left = `${obj.x}px`;

        const reached =
          obj.direction > 0 ? obj.x >= obj.targetX : obj.x <= obj.targetX;

        const bob = Math.sin(now * 0.010 + obj.bobSeed) * 1.2;
        obj.el.style.transform = `translateY(${bob}px)`;

        updateTankerMinoPose(obj, now);

        if (now - obj.lastFrameAt >= obj.frameInterval) {
          obj.frame = obj.frame === 0 ? 1 : 0;
          obj.lastFrameAt = now;
          obj.antLeftEl.src = obj.frame === 0 ? ANT_TEX.R1 : ANT_TEX.R2;
          obj.antRightEl.src = obj.frame === 0 ? ANT_TEX.L1 : ANT_TEX.L2;
        }

        if (reached) {
          obj.x = obj.targetX;
          obj.el.style.left = `${obj.x}px`;
          obj.state = "load";
          obj.loadAt = now;
          obj.lastLeafAt = now;

          if (m.render) {
            m.render.visible = false;
          }

          obj.minoEl.style.opacity = "1";
          playLeafCarrySound(0.2);
        }
        return;
      }

      if (obj.state === "load") {
        const bob = Math.sin(now * 0.012 + obj.bobSeed) * 1.5;
        obj.el.style.transform = `translateY(${bob}px)`;

        updateTankerMinoPose(obj, now);

        if (now - obj.loadAt >= ANT_CFG.tankerLoadDelay) {
          obj.state = "carry";
          obj.speed = ANT_CFG.tankerCarrySpeed * obj.direction;
          playLeafCarrySound(getTankerCarryVolume(obj, areaWidth));
        }
        return;
      }

      if (obj.state === "carry") {
        obj.x += obj.speed;

        const bob = Math.sin(now * 0.014 + obj.bobSeed) * ANT_CFG.tankerBobPx;
        const swayX = Math.sin(now * 0.010 + obj.bobSeed) * 1.1;
        obj.el.style.left = `${obj.x}px`;
        obj.el.style.transform = `translate(${swayX}px, ${bob}px)`;

        updateTankerMinoPose(obj, now);

        const antStep = Math.sin(now * 0.022 + obj.bobSeed) * 2.2;
        obj.antLeftEl.style.bottom = `${Math.max(0, antStep)}px`;
        obj.antRightEl.style.bottom = `${Math.max(0, -antStep)}px`;

        if (now - obj.lastFrameAt >= obj.frameInterval) {
          obj.frame = obj.frame === 0 ? 1 : 0;
          obj.lastFrameAt = now;
          obj.antLeftEl.src = obj.frame === 0 ? ANT_TEX.R1 : ANT_TEX.R2;
          obj.antRightEl.src = obj.frame === 0 ? ANT_TEX.L1 : ANT_TEX.L2;
        }

        if (now - obj.lastLeafAt >= ANT_CFG.tankerSoundInterval) {
          obj.lastLeafAt = now;
          playLeafCarrySound(getTankerCarryVolume(obj, areaWidth));
        }

        const outLeft = obj.x < -obj.width - ANT_CFG.tankerExitPadding;
        const outRight = obj.x > areaWidth + ANT_CFG.tankerExitPadding;
        if (outLeft || outRight) {
          obj.state = "leave";
        }
        return;
      }

      if (obj.state === "leave") {
        obj.el.style.opacity = "0";

        clearMinoStars(m);
        stopMinoMove();
        stopLeafCarrySound();

        World.remove(matterWorld, m);
        minos.delete(m);

        removeTankerRescue(obj);
      }
    });
  }

  /* =========================================================
     アリ更新
  ========================================================= */

  function removeAnt(antObj) {
    if (!antObj) return;

    if (antObj.role === "rescuer" && antObj.targetMino?.rescueAntIds) {
      antObj.targetMino.rescueAntIds.delete(antObj.id);
    }

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
    const walkerCount = [...ants].filter((a) => a.role !== "rescuer").length;
    if (walkerCount >= targetCount) return;

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

  function requestRescueAntsForMino(mino) {
    if (!mino || mino.rescueStarted || mino.rescueFinished) return;
    if (mino.state !== "ko") return;

    mino.rescueStarted = true;

    if (DEBUG_FORCE_LADY || Math.random() < LADY_CFG.chance) {
      mino.ladyRescue = true;
      spawnLadyRescue(mino);
      return;
    }

    const nearbyWalkers = findNearbyWalkerAnts(mino, 4, 130);

    nearbyWalkers.forEach((antObj, index) => {
      convertWalkerToRescuer(antObj, mino);
      antObj.nextTapAt = performance.now() + 120 + index * 100;
    });

    const currentRescuers = [...ants].filter(
      (a) => a.role === "rescuer" && a.targetMino === mino
    );

    const needCount = Math.max(0, 4 - currentRescuers.length);

    for (let i = 0; i < needCount; i++) {
      const fromLeft = i % 2 === 0;

      setTimeout(() => {
        if (!mino || mino.state !== "ko" || mino.rescueFinished) return;
        createRescueAntDom(mino, fromLeft);
      }, i * ANT_CFG.rescueSpawnGapMs);
    }
  }

  function updateRescueAnt(antObj, now) {
    const m = antObj.targetMino;
    if (!m) {
      antObj.rescueState = "leave";
      return;
    }

    if (m.state !== "ko" && !m.rescueFinished) {
      antObj.rescueState = "leave";
      return;
    }

    if (antObj.rescueState === "run") {
      antObj.x += antObj.speed;
      antObj.el.style.left = `${antObj.x}px`;

      const distToTarget = Math.abs(antObj.x - antObj.targetX);
      const reached = distToTarget <= 2;

      if (reached) {
        antObj.x = antObj.targetX;
        antObj.el.style.left = `${antObj.x}px`;
        antObj.rescueState = "arrived";
        antObj.arrivedAt = now;
        antObj.nextTapAt = now + 260 + (antObj.tapPhaseOffset || 0);
      }
      return;
    }

    if (antObj.rescueState === "arrived") {
      antObj.el.style.left = `${antObj.x}px`;
      antObj.el.style.bottom = `${antObj.yBottom}px`;

      if (now >= antObj.nextTapAt) {
        antObj.rescueState = "tap";
      }
      return;
    }

    if (antObj.rescueState === "tap") {
      let pokeOffsetX = 0;
      let pokeLiftY = 0;

      if (antObj._pokeUntil && now < antObj._pokeUntil) {
        const t = 1 - (antObj._pokeUntil - now) / 140;
        const hop = Math.sin(t * Math.PI);
        pokeOffsetX = (antObj.fromLeft ? 1 : -1) * hop * 7;
        pokeLiftY = hop * 3;
      }

      antObj.el.style.left = `${antObj.x + pokeOffsetX}px`;
      antObj.el.style.bottom = `${antObj.yBottom + pokeLiftY}px`;

      if (now >= antObj.nextTapAt) {
        antObj.tapCount += 1;
        antObj.nextTapAt = now + ANT_CFG.rescueTapInterval;
        antObj._pokeUntil = now + 140;

        playAntTap();

        if (m.state === "ko") {
          m._tapReactUntil = now + 180;
        }

        const allRescuers = [...ants].filter(
          (a) => a.role === "rescuer" && a.targetMino === m
        );
        const totalTap = allRescuers.reduce(
          (sum, a) => sum + (a.tapCount || 0),
          0
        );

        if (
          totalTap >= ANT_CFG.rescueTapCount &&
          !m.rescueFinished &&
          !m._reviveQueued
        ) {
          m._reviveQueued = true;

          setTimeout(() => {
            if (!m || m.state !== "ko" || m.rescueFinished) return;

            const useTanker = Math.random() < ANT_CFG.tankerChance;

            if (useTanker) {
              startTankerRescue(m);
            } else {
              reviveMino(m);
            }

            const latestRescuers = [...ants].filter(
              (a) => a.role === "rescuer" && a.targetMino === m
            );

            latestRescuers.forEach((a) => {
              a.rescueState = "leave";
              a.speed = a.fromLeft ? -0.75 : 0.75;
            });
          }, 520);
        }
      }

      return;
    }

    if (antObj.rescueState === "leave") {
      antObj.x += antObj.speed;
      antObj.el.style.left = `${antObj.x}px`;
    }
  }

  function updateAnts() {
    if (!antsLayer) return;

    const areaWidth =
      antsLayer.clientWidth || canvas.getBoundingClientRect().width || 360;
    const now = performance.now();

    ants.forEach((antObj) => {
      if (antObj.role === "rescuer") {
        updateRescueAnt(antObj, now);

        if (now - antObj.lastFrameAt >= antObj.frameInterval) {
          antObj.frame = antObj.frame === 0 ? 1 : 0;
          antObj.lastFrameAt = now;

          if (antObj.speed > 0) {
            antObj.img.src = antObj.frame === 0 ? ANT_TEX.R1 : ANT_TEX.R2;
          } else {
            antObj.img.src = antObj.frame === 0 ? ANT_TEX.L1 : ANT_TEX.L2;
          }
        }

        const outLeft = antObj.x < -50;
        const outRight = antObj.x > areaWidth + 50;
        if (outLeft || outRight) {
          removeAnt(antObj);
        }
        return;
      }

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

    updateTankerRescues();
  }

  function startAntLoop() {
    stopAntLoop();
    clearAnts();
    clearTankerRescues();
    clearLadies();

    const initialCount = getAntTargetCount();
    for (let i = 0; i < initialCount; i++) {
      createAntDom(Math.random() < 0.5);
    }

    scheduleNextAnt();
  }

  function bindAntFrameLoop() {
    if (bindAntFrameLoop._bound) return;
    bindAntFrameLoop._bound = true;

    Events.on(dropletEngine.debug.engine, "beforeUpdate", () => {
      updateAnts();
      updateLadies();
    });
  }

  bindAntFrameLoop();
  startAntLoop();

  const obstacleLeaves = new Set();

  /* =========================================================
     ハチ
  ========================================================= */

  const BEE_TEX_L =
    "https://static.wixstatic.com/media/e0436a_750ead96817a40618e8cf9aa30a07192~mv2.png";
  const BEE_TEX_R =
    "https://static.wixstatic.com/media/e0436a_810f0f4624bb4807bdc0a97652bf3d18~mv2.webp";

  const beeSounds = {
    buzz: [new Audio("assets/sounds/buzz.mp3")],
    beeBreak: [new Audio("assets/sounds/bee_break.mp3")],
  };

  beeSounds.buzz.forEach((a) => {
    a.volume = 0.22;
    a.loop = true;
  });
  beeSounds.beeBreak.forEach((a) => {
    a.volume = 0.7;
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
    const y = worldHeight * (0.3 + Math.random() * 0.38);

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
     ミノムシ
  ========================================================= */

  const MINO_TEX_NORMAL = "assets/images/minomusi_1.webp";
  const MINO_TEX_FAIL = "assets/images/minomusi_2.webp";
  const MINO_TEX_DIZZY = "assets/images/minomusi_3.webp";

  const MINO_STAR_FRAMES = [
    "assets/images/hosi_A1.png",
    "assets/images/hosi_A2.png",
    "assets/images/hosi_A3.png",
  ];

  const minoSounds = {
    move: new Audio("assets/sounds/mino_move.wav"),
    rakka: new Audio("assets/sounds/mino_rakka.mp3"),
    hukkatu: new Audio("assets/sounds/mino_hukkatu.mp3"),
  };

  minoSounds.move.loop = true;
  minoSounds.move.volume = 0.18;
  minoSounds.rakka.volume = 0.65;
  minoSounds.hukkatu.volume = 0.65;

  const antSounds = {
    tap: new Audio("assets/sounds/ants_tutuku.mp3"),
  };

  antSounds.tap.volume = 0.45;

  function playAntTap() {
    try {
      antSounds.tap.currentTime = 0;
      antSounds.tap.play();
    } catch (_) {}
  }

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

  function playMinoHukkatu() {
    try {
      minoSounds.hukkatu.currentTime = 0;
      minoSounds.hukkatu.play();
    } catch (_) {}
  }

  function reviveMino(m, options = {}) {
    const { force = false, silent = false } = options;
    if (!m) return;
    if (m.rescueFinished && !force) return;

    m.rescueFinished = true;
    m.rescueRequested = false;
    m.ladyRescue = false;

    stopMinoMove();
    if (!silent) {
      playMinoHukkatu();
    }
    clearMinoStars(m);

    Body.setStatic(m, false);
    m.isSensor = true;

    Body.setAngle(m, 0);
    Body.setAngularVelocity(m, 0);
    Body.setVelocity(m, { x: 0, y: -0.28 });

    if (m.render) {
      m.render.visible = true;
    }

    if (m.render && m.render.sprite) {
      m.render.sprite.texture = MINO_TEX_NORMAL;
      setMinoSpriteScaleByPx(m, MINO_CFG.sizePx);
    }

    m.state = "return";
    m.reviveAt = performance.now();
    m._reviveBounceUntil = performance.now() + 420;
    m._reviveSquashUntil = performance.now() + 220;
    m._reviveQueued = false;

    if (!m.rope) {
      const anchor = { x: m.position.x, y: -180 };

      const rope = Constraint.create({
        pointA: anchor,
        bodyB: m,
        pointB: { x: 0, y: -18 },
        length: Math.max(90, m.position.y - anchor.y),
        stiffness: 0.06,
        damping: 0.18,
        render: {
          visible: true,
          strokeStyle: "rgba(255,255,255,0.55)",
          lineWidth: 2,
        },
      });

      m.rope = rope;
      m.ropeAnchor = anchor;
      World.add(matterWorld, rope);
    }

    stopMinoMove();
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
        visible: true,
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

    mino.rescueRequested = false;
    mino.rescueStarted = false;
    mino.rescueFinished = false;
    mino.reviveAt = 0;
    mino.rescueAntIds = new Set();
    mino.ladyRescue = false;
    mino.ladyCarry = false;
    mino.ladyPartnerId = null;

    mino.spawnAt = performance.now();
    mino.windSeed = Math.random() * 1000;
    mino._starEl = null;
    mino._starTimer = null;
    mino._starFrame = 0;
    mino._tapReactUntil = 0;
    mino._reviveBounceUntil = 0;
    mino._reviveQueued = false;
    mino._reviveSquashUntil = 0;

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
      length: swayStartY - anchor.y + 8,
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

  function clearMinoStars(m) {
    if (!m) return;

    if (m._starTimer) {
      clearInterval(m._starTimer);
      m._starTimer = null;
    }

    if (m._starEl && m._starEl.parentNode) {
      m._starEl.parentNode.removeChild(m._starEl);
    }

    m._starEl = null;
  }

  function worldToOverlayPoint(x, y) {
    const rect = canvas.getBoundingClientRect();

    const worldWidth =
      dropletEngine.debug?.config?.worldWidth || canvas.width || rect.width;
    const worldHeight =
      dropletEngine.debug?.config?.worldHeight || canvas.height || rect.height;

    const scaleX = rect.width / worldWidth;
    const scaleY = rect.height / worldHeight;

    return {
      x: x * scaleX,
      y: y * scaleY,
    };
  }

  function getMinoStarAnchor(m) {
    const canvasRect = canvas.getBoundingClientRect();
    const isMobileView = canvasRect.width <= 430;
    const angle = m.angle || 0;

    if (m.state === "ko") {
      const localX = isMobileView ? -18 : -10;
      const localY = isMobileView ? -20 : -14;

      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      return {
        x: m.position.x + localX * cos - localY * sin,
        y: m.position.y + localX * sin + localY * cos,
      };
    }

    const localX = isMobileView ? 16 : 18;
    const localY = isMobileView ? -24 : -22;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return {
      x: m.position.x + localX * cos - localY * sin,
      y: m.position.y + localX * sin + localY * cos,
    };
  }

  function spawnMinoStars(m) {
    if (!m || !minoFxLayer) return;

    clearMinoStars(m);

    const el = document.createElement("img");
    el.className = "mino-stars";
    el.src = MINO_STAR_FRAMES[0];
    el.style.position = "absolute";
    el.style.width = "30px";
    el.style.height = "30px";
    el.style.pointerEvents = "none";
    el.style.transform = "translate(-50%, -50%)";
    el.style.opacity = "0.95";
    el.style.filter = "drop-shadow(0 2px 2px rgba(0,0,0,0.18))";

    minoFxLayer.appendChild(el);

    m._starEl = el;
    m._starFrame = 0;

    const updateStarPos = () => {
      if (!m._starEl) return;

      const p = getMinoStarAnchor(m);
      const screen = worldToOverlayPoint(p.x, p.y);

      m._starEl.style.left = `${screen.x}px`;
      m._starEl.style.top = `${screen.y}px`;
    };

    updateStarPos();

    m._starTimer = setInterval(() => {
      if (!m._starEl) return;

      m._starFrame = (m._starFrame + 1) % MINO_STAR_FRAMES.length;
      m._starEl.src = MINO_STAR_FRAMES[m._starFrame];
    }, 120);
  }

  function knockOutMino(m) {
    if (!m || m.state === "ko") return;

    playMinoRakka();
    stopMinoMove();

    m.state = "ko";

    const rimY = dropletEngine.debug.cupRimY;
    const minX = 42;
    const maxX = dropletEngine.debug.config.worldWidth - 42;
    const safeX = Math.max(minX, Math.min(maxX, m.position.x));

    Body.setPosition(m, {
      x: safeX,
      y: rimY - 16,
    });

    Body.setVelocity(m, { x: 0, y: 0 });
    Body.setAngularVelocity(m, 0);
    Body.setAngle(m, Math.PI / 2);

    m.isSensor = false;
    m._tapReactUntil = 0;
    m._reviveQueued = false;
    m.ladyRescue = false;
    m.ladyCarry = false;
    m.ladyPartnerId = null;

    if (m.render) {
      m.render.visible = true;
    }

    if (m.render && m.render.sprite) {
      m.render.sprite.texture = MINO_TEX_DIZZY;
      setMinoSpriteScaleByPx(m, MINO_CFG.sizePx);
    }

    Body.setStatic(m, true);

    World.remove(matterWorld, m);
    World.add(matterWorld, m);

    setTimeout(() => {
      if (m.state === "ko") {
        spawnMinoStars(m);
      }
    }, 180);

    m.rescueRequested = true;
    m.rescueStarted = false;
    m.rescueFinished = false;
    m.koAt = performance.now();
  }

  function clearMinos() {
    stopMinoMove();

    minos.forEach((m) => {
      clearMinoStars(m);

      if (m.rope) World.remove(matterWorld, m.rope);
      if (m.carryRope) World.remove(matterWorld, m.carryRope);

      if (m.grab) {
        const g = detachMinoGrab(m);
        if (g) g.isGrabbedByMino = false;
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
        clearMinoStars(m);

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

      if (m.state !== "tanker" && m.position.y > worldHeight + 220) {
        clearMinoStars(m);
        stopMinoMove();

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
            m.isSensor = true;

            Body.setVelocity(m, {
              x: (Math.random() - 0.5) * 0.3,
              y: MINO_CFG.failFallSpeed,
            });

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
        stopMinoMove();

        if (m.rope) {
          m.rope.stiffness = 0.055;
          m.rope.length = Math.max(92, m.rope.length - 0.45);
        }

        const elapsed = performance.now() - (m.reviveAt || 0);

        let returnSpeed = MINO_CFG.upSpeed;
        if (elapsed < 900) {
          returnSpeed = -0.22;
        } else if (elapsed < 1800) {
          returnSpeed = -0.32;
        } else {
          returnSpeed = -0.42;
        }

        Body.setVelocity(m, { x: 0, y: returnSpeed });

        if (m._reviveBounceUntil && performance.now() < m._reviveBounceUntil) {
          const t = (m._reviveBounceUntil - performance.now()) / 420;
          Body.setAngle(m, Math.sin((1 - t) * Math.PI * 2.0) * 0.16);
        } else {
          Body.setAngle(m, 0);
        }

        return;
      }

      if (m.state === "ladyCarry") {
        stopMinoMove();
        return;
      }

      if (m.state === "lady") {
        return;
      }

      if (m.state === "tanker") {
        return;
      }

      if (m.state === "fail") {
        stopMinoMove();

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
        Body.setAngle(
          m,
          Math.PI / 2 + Math.sin(performance.now() * 0.01) * 0.05
        );

        if (m._starEl) {
          const p = getMinoStarAnchor(m);
          const floatY = Math.sin(performance.now() * 0.006) * 2;
          const screen = worldToOverlayPoint(p.x, p.y + floatY);

          m._starEl.style.left = `${screen.x}px`;
          m._starEl.style.top = `${screen.y}px`;
        }

        if (m._tapReactUntil && performance.now() < m._tapReactUntil) {
          Body.setAngle(m, Math.PI / 2 - 0.14);
        }

        if (m.rescueRequested && !m.rescueStarted) {
          if (performance.now() - (m.koAt || 0) > 800) {
            requestRescueAntsForMino(m);
          }
        }

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

  /* =========================================================
     落ち葉（邪魔オブジェクト）
  ========================================================= */

  const OBSTACLE_LEAF_TEXTURE = "assets/images/leaf_BB.png";
  let leafSpawnTimer = null;

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
      density: 0.00025,
      restitution: 0.25,
      friction: 0.04,
      frictionAir: 0.12,
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
    setSpriteScaleByPx(leaf, 34);
  }

  function cleanupObstacleLeaves() {
    const worldHeight = dropletEngine.debug.config.worldHeight;

    obstacleLeaves.forEach((leaf) => {
      if (!leaf) return;
      if (leaf.position.y > worldHeight + 80) {
        obstacleLeaves.delete(leaf);
        World.remove(matterWorld, leaf);
      }
    });
  }

  function stopObstacleLeafLoop() {
    if (leafSpawnTimer) {
      clearTimeout(leafSpawnTimer);
      leafSpawnTimer = null;
    }
  }

  function clearObstacleLeaves() {
    obstacleLeaves.forEach((leaf) => {
      World.remove(matterWorld, leaf);
    });
    obstacleLeaves.clear();
  }

  function startObstacleLeafLoop() {
    stopObstacleLeafLoop();

    const loop = () => {
      const state = dropletEngine.getState();
      if (state.gameOver) return;

      if (Math.random() < 0.72 && obstacleLeaves.size < 6) {
        spawnObstacleLeaf();
      }

      leafSpawnTimer = setTimeout(loop, 2200 + Math.random() * 1800);
    };

    leafSpawnTimer = setTimeout(loop, 1200);
  }

  Events.on(dropletEngine.debug.engine, "beforeUpdate", () => {
    cleanupObstacleLeaves();
  });

  startObstacleLeafLoop();

  /* =========================================================
     リセット補助
  ========================================================= */

  function fullResetExtras() {
    stopAntLoop();
    clearAnts();
    clearTankerRescues();
    clearLadies();
    startAntLoop();

    stopBeeTimer();
    clearBees();
    startBeeLoop();

    stopMinoTimer();
    clearMinos();
    startMinoLoop();

    stopObstacleLeafLoop();
    clearObstacleLeaves();
    startObstacleLeafLoop();

    stopMinoMove();
    stopLeafCarrySound();

    if (minoFxLayer) {
      minoFxLayer.innerHTML = "";
    }
  }

  if (resetBtnEl) {
    resetBtnEl.addEventListener("click", () => {
      setTimeout(fullResetExtras, 0);
    });
  }

  if (overlayRestartBtnEl) {
    overlayRestartBtnEl.addEventListener("click", () => {
      setTimeout(fullResetExtras, 0);
    });
  }
})();
