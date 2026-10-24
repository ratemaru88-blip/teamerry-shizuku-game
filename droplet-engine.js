(() => {
  "use strict";
  const { setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame, cancelAnimationFrame, Audio, performance } = window.ShizukuLifecycle;

  if (!window.Matter) {
    console.error("[droplet-engine] Matter.js が読み込まれていません");
    return;
  }

  const { Engine, Render, Runner, World, Bodies, Body, Events } = window.Matter;

  // Protect this game's Canvas only; Matter's renderer and physics stay unchanged.
  function protectSpriteRendering(render) {
    const context = render.context;
    const drawImage = context.drawImage;
    const images = new WeakMap();

    function track(image) {
      if (images.has(image)) return images.get(image);
      const state = { status: "loading" };
      images.set(image, state);

      function fail(error) {
        if (state.status === "failed") return;
        state.status = "failed";
        console.warn("[shizuku-render] Image skipped", image.currentSrc || image.src, error);
      }

      function loaded() {
        if (state.status !== "loading") return;
        if (!image.naturalWidth || !image.naturalHeight) {
          fail(new Error("Image has no decoded dimensions"));
          return;
        }
        state.status = "decoding";
        Promise.resolve()
          .then(() => typeof image.decode === "function" ? image.decode() : undefined)
          .then(() => {
            if (state.status === "failed") return;
            if (image.complete && image.naturalWidth && image.naturalHeight) {
              state.status = "ready";
            } else {
              fail(new Error("Image is not drawable after decode"));
            }
          }, fail);
      }

      state.fail = fail;
      image.addEventListener("load", loaded, { once: true });
      image.addEventListener("error", fail, { once: true });
      if (image.complete && image.src) loaded();
      return state;
    }

    context.drawImage = function (image, ...args) {
      const state = image instanceof window.HTMLImageElement ? track(image) : null;
      if (state && state.status !== "ready") return;

      // Return normally on image failure so Matter also undoes its outer
      // translate/rotate and continues drawing the remaining bodies.
      this.save();
      try {
        return drawImage.call(this, image, ...args);
      } catch (error) {
        if (!state) throw error;
        state.fail(error);
      } finally {
        this.restore();
      }
    };

    Events.on(render, "beforeRender", () => {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
    });

    return function prepareTexture(url) {
      let image = render.textures[url];
      if (!image) {
        image = new Image();
        render.textures[url] = image;
        track(image);
        image.src = url;
      } else {
        track(image);
      }
    };
  }

  window.createDropletEngine = function createDropletEngine(options) {
    const cfg = {
      worldWidth: 360,
      worldHeight: 580,
      leftMargin: 34,
      rightMargin: 26,
      cupLineBottomPx: 50,
      cupLineHeightPx: 46,
      floorThickness: 18,
      topSensorWidthRatio: 0.82,
      topSensorHeight: 10,
      topSensorYRatio: 0.12,
      gravityY: 1.05,
      positionIterations: 8,
      velocityIterations: 6,
      dropCooldownMs: 420,
      bounceMinSpeed: 1.6,
      bounceMinInterval: 320,
      stageRadius: [16, 26, 38],
      stageScores: [30, 60, 120, 200],
      stageKeys: ["small", "medium", "large"],
      visualScale: 1.0,
      stageVisualMultiplier: { 0: 1.0, 1: 1.0, 2: 1.0 },
      ...options,
    };

    const canvas = cfg.canvas;
    const cupLineEl = cfg.cupLineEl || null;
    const leafWrapperEl = cfg.leafWrapperEl;
    const previewDropletEl = cfg.previewDropletEl;
    const cupHandleEl = cfg.cupHandleEl || null;
    const scoreLabelEl = cfg.scoreLabelEl || null;
    const gameOverOverlayEl = cfg.gameOverOverlayEl || null;
    const finalScoreTextEl = cfg.finalScoreTextEl || null;
    const overlayRestartBtnEl = cfg.overlayRestartBtnEl || null;
    const resetBtnEl = cfg.resetBtnEl || null;

    if (!canvas || !leafWrapperEl || !previewDropletEl) {
      throw new Error("[droplet-engine] canvas / leafWrapperEl / previewDropletEl が必要です");
    }

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

    function makeAudio(url, { loop = false, volume = 0.5 } = {}) {
      const a = new Audio(url);
      a.loop = loop;
      a.volume = volume;
      a.preload = "auto";
      return a;
    }

    const sounds = {
      drop: [makeAudio("assets/sounds/drop.mp3", { volume: 0.35 })],
      merge: [
        makeAudio("assets/sounds/merge1.mp3", { volume: 0.45 }),
        makeAudio("assets/sounds/merge2.mp3", { volume: 0.45 }),
      ],
    };

    let audioUnlocked = false;
    let audioPaused = false;
    function unlockAudioOnce() {
      if (audioUnlocked) return;
      audioUnlocked = true;

      const all = [...sounds.drop, ...sounds.merge];
      all.forEach((a) => {
        try {
          const prevVol = a.volume;
          a.volume = 0;
          a.play()
            .then(() => {
              a.pause();
              a.currentTime = 0;
              a.volume = prevVol;
            })
            .catch(() => {
              a.volume = prevVol;
            });
        } catch (_) {}
      });
    }

    function playRandom(list) {
      if (audioPaused) return;
      if (!list || !list.length) return;
      const a = list[(Math.random() * list.length) | 0];
      try {
        a.currentTime = 0;
        a.play();
      } catch (_) {}
    }

    function stopAllSounds() {
      [...sounds.drop, ...sounds.merge].forEach((a) => {
        try {
          a.pause();
          a.currentTime = 0;
        } catch (_) {}
      });
    }

    const engine = Engine.create();
    const world = engine.world;
    world.gravity.y = cfg.gravityY;
    engine.positionIterations = cfg.positionIterations;
    engine.velocityIterations = cfg.velocityIterations;

    canvas.width = cfg.worldWidth;
    canvas.height = cfg.worldHeight;

    const render = Render.create({
      canvas,
      engine,
      options: {
        width: cfg.worldWidth,
        height: cfg.worldHeight,
        wireframes: false,
        background: "transparent",
        pixelRatio: 1,
      },
    });

    const prepareTexture = protectSpriteRendering(render);
    const runner = Runner.create();

    const droplets = new Set();
    const textureInfo = new Map();

    let score = 0;
    let nextCharIndex = 0;
    let gameOver = false;
    let canDrop = true;

    let plateX = cfg.worldWidth / 2;
    let holding = null;

    let moveTiltDeg = 0;
    let tiltRAF = 0;

    let cupRimY =
      cfg.worldHeight - cfg.cupLineBottomPx - cfg.cupLineHeightPx * 0.3;
    let rimFloor = null;
    let rimImageTopRatio = 0;
    let rimSurface = null;
    let rimObserver = null;
    let disposed = false;

    const DROPLET_GAMEOVER_Y = cfg.worldHeight * cfg.topSensorYRatio;
    const DROPLET_GAMEOVER_COUNT = 8;

    function clamp(v, min, max) {
      return Math.max(min, Math.min(max, v));
    }

    function updateScoreUI() {
      if (scoreLabelEl) scoreLabelEl.textContent = String(score);
      if (typeof cfg.onScoreChange === "function") cfg.onScoreChange(score);
    }

    function setGameOver() {
      if (gameOver) return;
      gameOver = true;
      canDrop = false;

      if (finalScoreTextEl) finalScoreTextEl.textContent = `SCORE : ${score}`;

      if (gameOverOverlayEl) {
        gameOverOverlayEl.style.display = "block";
        gameOverOverlayEl.classList.add("visible");
      }

      if (typeof cfg.onGameOver === "function") cfg.onGameOver(score);
    }

    function resetGame() {
      gameOver = false;
      canDrop = true;
      score = 0;
      updateScoreUI();

      if (gameOverOverlayEl) {
        gameOverOverlayEl.style.display = "";
        gameOverOverlayEl.classList.remove("visible");
      }

      droplets.forEach((body) => {
        World.remove(world, body);
      });
      droplets.clear();

      plateX = cfg.worldWidth / 2;
      moveTiltDeg = 0;
      updatePlateDom();

      leafWrapperEl.style.transform = "translateX(-50%) rotate(0deg)";
      if (cupHandleEl) {
        cupHandleEl.style.transform = "translateX(-50%) rotate(0deg)";
      }

      pickNextDroplet();
      setHoldingDroplet(nextCharIndex);
    }

    function ensureTextureInfo(url) {
      if (!url) return null;
      const cached = textureInfo.get(url);
      if (cached) return cached;

      const info = { w: 512, h: 512, ok: false, failed: false };
      textureInfo.set(url, info);

      const img = new Image();

      img.onload = () => {
        info.w = img.naturalWidth || 512;
        info.h = img.naturalHeight || 512;
        info.ok = true;
        info.failed = false;

        droplets.forEach((body) => {
          const tex = body?.render?.sprite?.texture;
          if (tex === url) {
            applySpriteScale(body);
          }
        });

        if (holding && holding.texture === url && previewDropletEl) {
          previewDropletEl.src = url;
        }
      };

      img.onerror = () => {
        info.ok = false;
        info.failed = true;

        droplets.forEach((body) => {
          const tex = body?.render?.sprite?.texture;
          if (tex === url) {
            body.render.sprite = undefined;
            body.render.fillStyle = "#ffffff";
            body.isTear = false;
          }
        });
      };

      img.src = url;
      return info;
    }

    function applySpriteScale(body) {
      const sp = body?.render?.sprite;
      if (!sp || !sp.texture || !body.circleRadius) return;

      const info = ensureTextureInfo(sp.texture);
      const baseW = info && info.w ? info.w : 512;
      const diameter = body.circleRadius * 2;
      const scale = (diameter / baseW) * cfg.visualScale;
      const stageMul = cfg.stageVisualMultiplier[body.stage] || 1.0;

      sp.xScale = scale * stageMul;
      sp.yScale = scale * stageMul;
      body.baseSpriteScale = sp.xScale;
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

      function easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      }

      function step(now) {
        const t = Math.min(1, (now - start) / duration);
        let mul;
        if (t < 0.5) mul = 1 + (maxMul - 1) * easeInOut(t * 2);
        else mul = maxMul + (1 - maxMul) * easeInOut((t - 0.5) * 2);

        sprite.xScale = baseX * mul;
        sprite.yScale = baseY * mul;

        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          sprite.xScale = body.baseSpriteScale || baseX;
          sprite.yScale = body.baseSpriteScale || baseY;
          body.isSquishing = false;
        }
      }

      requestAnimationFrame(step);
    }

    function moveSupportedDroplets(deltaY) {
      // Move the floor's contact-connected stack with it on resize. Airborne
      // bodies keep their position and all bodies keep their velocity/identity.
      const supported = new Set([rimFloor]);
      const live = new Set(world.bodies);
      let changed;
      do {
        changed = false;
        for (const pair of engine.pairs.list) {
          if (!pair.isActive || pair.isSensor) continue;
          const a = pair.bodyA.parent, b = pair.bodyB.parent;
          for (const [base, body] of [[a, b], [b, a]]) {
            if (!supported.has(base) || supported.has(body) || !live.has(body)) continue;
            if (body.isStatic || body.isSensor || !(body.isDroplet || body.isObstacleLeaf)) continue;
            supported.add(body);
            changed = true;
          }
        }
      } while (changed);
      supported.delete(rimFloor);
      supported.forEach(body => Body.translate(body, { x: 0, y: deltaY }));
    }

    function syncCupRimToVisual() {
      if (disposed || !rimFloor || !cupLineEl) return;
      const canvasRect = canvas.getBoundingClientRect();
      const lineRect = cupLineEl.getBoundingClientRect();
      if (!(canvasRect.height > 0 && lineRect.height > 0)) return;

      // The current CSS stretches maruta_A.png to 100% x 100%. Account for
      // its transparent top rows instead of treating the element edge as wood.
      const screenY = lineRect.top + lineRect.height * rimImageTopRatio;
      const topY = (screenY - canvasRect.top) * cfg.worldHeight / canvasRect.height;
      const centerY = topY + cfg.floorThickness / 2;
      if (!Number.isFinite(centerY)) return;
      const deltaY = centerY - cupRimY;
      if (Math.abs(deltaY) > 0.0001) {
        moveSupportedDroplets(deltaY);
        Body.setPosition(rimFloor, { x: rimFloor.position.x, y: centerY });
        cupRimY = centerY;
      }
      rimSurface = { screenY, topY, centerY: cupRimY, imageTopRatio: rimImageTopRatio };
      Events.trigger(engine, "cupRimSync", { deltaY, ...rimSurface });
      // A paused game also needs a fresh bitmap after its layout changes.
      Render.world(render);
    }

    function bindCupRimSync() {
      if (!cupLineEl) return;
      syncCupRimToVisual();
      window.addEventListener("resize", syncCupRimToVisual, { passive: true });
      window.visualViewport?.addEventListener("resize", syncCupRimToVisual, { passive: true });
      if (window.ResizeObserver) {
        rimObserver = new window.ResizeObserver(syncCupRimToVisual);
        rimObserver.observe(canvas);
        rimObserver.observe(cupLineEl);
      }

      const match = getComputedStyle(cupLineEl).backgroundImage.match(/^url\((['"]?)(.*?)\1\)$/);
      if (!match) return;
      const image = new Image();
      const loaded = typeof image.decode === "function" ? null : new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
      image.src = match[2];
      (loaded || image.decode()).then(() => {
        if (disposed) return;
        const probe = document.createElement("canvas");
        probe.width = image.naturalWidth;
        probe.height = image.naturalHeight;
        const ctx = probe.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data;
        for (let y = 0; y < probe.height; y++) {
          for (let x = 0; x < probe.width; x++) {
            if (pixels[(y * probe.width + x) * 4 + 3] >= 16) {
              rimImageTopRatio = y / probe.height;
              syncCupRimToVisual();
              return;
            }
          }
        }
      }).catch(error => {
        // A missing/blocked image must never reset physics or game progress.
        console.warn("[cup-rim] Using element top; image surface unavailable", error);
      });
    }

    function createBounds() {
      rimFloor = Bodies.rectangle(
        (cfg.leftMargin + (cfg.worldWidth - cfg.rightMargin)) / 2,
        cupRimY,
        cfg.worldWidth - cfg.leftMargin - cfg.rightMargin,
        cfg.floorThickness,
        { isStatic: true, render: { visible: false } }
      );
      rimFloor.isCupRim = true;

      const safetyFloor = Bodies.rectangle(
        (cfg.leftMargin + (cfg.worldWidth - cfg.rightMargin)) / 2,
        cfg.worldHeight + 40,
        cfg.worldWidth - cfg.leftMargin - cfg.rightMargin,
        80,
        { isStatic: true, render: { visible: false } }
      );

      const leftWall = Bodies.rectangle(
        cfg.leftMargin,
        cfg.worldHeight / 2,
        20,
        cfg.worldHeight * 2,
        { isStatic: true, render: { visible: false } }
      );

      const rightWall = Bodies.rectangle(
        cfg.worldWidth - cfg.rightMargin,
        cfg.worldHeight / 2,
        20,
        cfg.worldHeight * 2,
        { isStatic: true, render: { visible: false } }
      );

      const topSensor = Bodies.rectangle(
        cfg.worldWidth / 2,
        cfg.worldHeight * cfg.topSensorYRatio,
        cfg.worldWidth * cfg.topSensorWidthRatio,
        cfg.topSensorHeight,
        { isStatic: true, isSensor: true, render: { visible: false } }
      );
      topSensor.isTopSensor = true;

      World.add(world, [rimFloor, safetyFloor, leftWall, rightWall, topSensor]);
    }

    function updateMoveTilt() {
      leafWrapperEl.style.transform =
        `translateX(-50%) rotate(${moveTiltDeg.toFixed(2)}deg)`;

      if (cupHandleEl) {
        cupHandleEl.style.transform =
          `translateX(-50%) rotate(${(moveTiltDeg * 0.55).toFixed(2)}deg)`;
      }

      tiltRAF = 0;
    }

    function playLeafDropKick() {
      if (!leafWrapperEl.animate) return;
      const base = moveTiltDeg;

      leafWrapperEl.animate(
        [
          { transform: `translateX(-50%) rotate(${base}deg) translateY(0px)` },
          { transform: `translateX(-50%) rotate(${base - 8}deg) translateY(2px)` },
          { transform: `translateX(-50%) rotate(${base + 3}deg) translateY(-1px)` },
          { transform: `translateX(-50%) rotate(${base}deg) translateY(0px)` },
        ],
        { duration: 320, easing: "cubic-bezier(.2,.9,.2,1)" }
      );

      if (cupHandleEl && cupHandleEl.animate) {
        const handleBase = moveTiltDeg * 0.55;
        cupHandleEl.animate(
          [
            { transform: `translateX(-50%) rotate(${handleBase}deg)` },
            { transform: `translateX(-50%) rotate(${(handleBase - 4).toFixed(2)}deg)` },
            { transform: `translateX(-50%) rotate(${(handleBase + 1.5).toFixed(2)}deg)` },
            { transform: `translateX(-50%) rotate(${handleBase}deg)` },
          ],
          { duration: 320, easing: "cubic-bezier(.2,.9,.2,1)" }
        );
      }
    }

    function pickNextDroplet() {
      nextCharIndex = Math.floor(Math.random() * dropletTypes.length);
    }

    function setHoldingDroplet(charIndex) {
      const type = dropletTypes[charIndex];
      const tex =
        (type && type.dropSmall) ||
        (type && type.sprites && type.sprites.small) ||
        "";

      ensureTextureInfo(tex);

      holding = {
        charIndex,
        stage: 0,
        radius: cfg.stageRadius[0],
        texture: tex,
      };

      if (!tex) {
        previewDropletEl.removeAttribute("src");
        previewDropletEl.style.display = "none";
        return;
      }

      previewDropletEl.style.display = "block";
      previewDropletEl.style.opacity = "1";
      previewDropletEl.src = tex;
      updatePlateDom();
    }

    function createDropletBody({ charIndex, stage, x, y, radius, texture, isTear }) {
      const hasTex = typeof texture === "string" && texture.length > 0;

      ensureTextureInfo(texture);

      const body = Bodies.circle(x, y, radius, {
        restitution: 0.15,
        friction: 0.01,
        frictionAir: 0.03,
        density: 0.0012,
        render: hasTex
          ? {
              fillStyle: "transparent",
              strokeStyle: "rgba(0,0,0,0)",
              lineWidth: 0,
              sprite: { texture, xScale: 1, yScale: 1 },
            }
          : {
              fillStyle: "#ffffff",
              strokeStyle: "rgba(0,0,0,0)",
              lineWidth: 0,
            },
      });

      body.isDroplet = true;
      body.charIndex = charIndex;
      body.stage = stage;
      body.lastBounceTime = 0;
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
      const tex = type?.sprites?.[cfg.stageKeys[body.stage]] || "";

      if (!tex) {
        body.isTear = false;
        return;
      }

      ensureTextureInfo(tex);

      body.render.sprite =
        body.render.sprite || { texture: tex, xScale: 1, yScale: 1 };
      body.render.sprite.texture = tex;
      body.isTear = false;

      applySpriteScale(body);
    }

    function dropFromPlate(charIndex, xWorld) {
      const stage = 0;
      const radius = cfg.stageRadius[0];
      const type = dropletTypes[charIndex];

      const roundTex = type?.sprites?.small || "";
      const tearTex = type?.dropSmall || "";
      const texture = tearTex || roundTex;
      const isTear = !!tearTex;

      const minX = cfg.leftMargin + radius;
      const maxX = cfg.worldWidth - cfg.rightMargin - radius;
      const clampedX = clamp(xWorld, minX, maxX);

      const startY = cfg.worldHeight * 0.22;

      const d = createDropletBody({
        charIndex,
        stage,
        x: clampedX,
        y: startY,
        radius,
        texture,
        isTear,
      });

      Body.setVelocity(d, { x: 0, y: 0.2 });
      playRandom(sounds.drop);
      return d;
    }

    function addScoreForStage(stageIndex, bonus = 0) {
      const base =
        cfg.stageScores[Math.min(stageIndex, cfg.stageScores.length - 1)] || 0;
      score += base + bonus;
      updateScoreUI();
    }

    function mergeDroplets(bodyA, bodyB) {
      if (!bodyA || !bodyB) return;
      if (!bodyA.isDroplet || !bodyB.isDroplet) return;
      if (bodyA.isMerging || bodyB.isMerging) return;
      if (bodyA.charIndex !== bodyB.charIndex) return;
      if (bodyA.stage !== bodyB.stage) return;

      bodyA.isMerging = true;
      bodyB.isMerging = true;

      const stage = bodyA.stage;
      const type = dropletTypes[bodyA.charIndex];

      const centerX = (bodyA.position.x + bodyB.position.x) / 2;
      const centerY = (bodyA.position.y + bodyB.position.y) / 2;

      const vx = (bodyA.velocity.x + bodyB.velocity.x) / 2;
      const vy = (bodyA.velocity.y + bodyB.velocity.y) / 2;

      droplets.delete(bodyA);
      droplets.delete(bodyB);
      World.remove(world, bodyA);
      World.remove(world, bodyB);

      if (stage < cfg.stageKeys.length - 1) {
        const newStage = stage + 1;
        const r = cfg.stageRadius[newStage];
        const tex = type?.sprites?.[cfg.stageKeys[newStage]] || "";

        const newBody = createDropletBody({
          charIndex: bodyA.charIndex,
          stage: newStage,
          x: centerX,
          y: centerY,
          radius: r,
          texture: tex,
          isTear: false,
        });

        Body.setVelocity(newBody, {
          x: vx * 0.25,
          y: Math.min(-6, vy * 0.15 - 4),
        });

        squish(newBody, 1.25, 220);
        addScoreForStage(newStage);
        playRandom(sounds.merge);
      } else {
        addScoreForStage(3);
        playRandom(sounds.merge);
        if (typeof cfg.onLargeMerge === 'function') {
          cfg.onLargeMerge({ charIndex: bodyA.charIndex, x: centerX, y: centerY });
        }
      }
    }

    function handleBounce(body, now) {
      const dt = now - (body.lastBounceTime || 0);

      if (
        body.speed > cfg.bounceMinSpeed &&
        dt > cfg.bounceMinInterval &&
        body.position.y < cfg.worldHeight - 40
      ) {
        body.lastBounceTime = now;
        playRandom(sounds.drop);

        const power =
          1 + Math.min(0.6, Math.max(0, body.speed - 1.0) * 0.25);
        squish(body, power, 260);
      } else if (body.speed < 0.15) {
        Body.setVelocity(body, { x: 0, y: 0 });
        Body.setAngularVelocity(body, 0);
      }
    }

    function updatePlateDom() {
      const pct = (plateX / cfg.worldWidth) * 100;
      leafWrapperEl.style.left = `${pct}%`;
      previewDropletEl.style.left = `${pct}%`;

      if (cupHandleEl) {
        cupHandleEl.style.left = `${pct}%`;
      }
    }

    function screenToWorldX(screenX) {
      const rect = canvas.getBoundingClientRect();
      const t = (screenX - rect.left) / rect.width;
      return t * cfg.worldWidth;
    }

    function setPlateXFromPointer(clientX) {
      const radius = holding?.radius ?? cfg.stageRadius[0];
      const minX = cfg.leftMargin + radius;
      const maxX = cfg.worldWidth - cfg.rightMargin - radius;

      const prevX = plateX;
      plateX = clamp(screenToWorldX(clientX), minX, maxX);
      updatePlateDom();

      const dx = plateX - prevX;
      const target = clamp(dx * 0.25, -2.5, 2.5);
      moveTiltDeg = moveTiltDeg * 0.75 + target * 0.25;

      if (!tiltRAF) tiltRAF = requestAnimationFrame(updateMoveTilt);
    }

    function bindPlateControls() {
      const target = canvas.parentElement;

      let pointerActive = false;
      let pointerMoved = false;
      let downX = 0;
      let downY = 0;

      const DRAG_THRESHOLD = 4;
      resetInput = () => { pointerActive = false; pointerMoved = false; };

      target.addEventListener(
        "pointerdown",
        (e) => {
          if (!window.ShizukuLifecycle.isRunning()) return;
          unlockAudioOnce();

          pointerActive = true;
          pointerMoved = false;
          downX = e.clientX;
          downY = e.clientY;

          setPlateXFromPointer(e.clientX);
        },
        { passive: true }
      );

      window.addEventListener(
        "pointermove",
        (e) => {
          if (!window.ShizukuLifecycle.isRunning()) return;
          if (!pointerActive) return;

          const dx = e.clientX - downX;
          const dy = e.clientY - downY;

          if (Math.abs(dx) > DRAG_THRESHOLD) {
            pointerMoved = true;
          }

          setPlateXFromPointer(e.clientX);
        },
        { passive: true }
      );

      window.addEventListener(
        "pointerup",
        (e) => {
          if (!window.ShizukuLifecycle.isRunning()) { resetInput(); return; }
          if (!pointerActive) return;

          pointerActive = false;

          if (pointerMoved) return;
          if (!holding || !canDrop || gameOver) return;

          setPlateXFromPointer(e.clientX);
          playLeafDropKick();
          dropFromPlate(holding.charIndex, plateX);

          pickNextDroplet();
          setHoldingDroplet(nextCharIndex);

          canDrop = false;
          setTimeout(() => {
            if (!gameOver) canDrop = true;
          }, cfg.dropCooldownMs);
        },
        { passive: true }
      );

      window.addEventListener(
        "pointerup",
        (e) => {
          if (!window.ShizukuLifecycle.isRunning()) { resetInput(); return; }
          if (!pointerActive) return;

          pointerActive = false;

          if (pointerMoved) return;
          if (!holding || !canDrop || gameOver) return;

          setPlateXFromPointer(e.clientX);
          playLeafDropKick();
          dropFromPlate(holding.charIndex, plateX);

          pickNextDroplet();
          setHoldingDroplet(nextCharIndex);

          canDrop = false;
          setTimeout(() => {
            if (!gameOver) canDrop = true;
          }, cfg.dropCooldownMs);
        },
        { passive: true }
      );
    }

    Events.on(engine, "collisionStart", (event) => {
      if (gameOver) return;
      const now = performance.now();

      for (const pair of event.pairs) {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        if (bodyA?.isDroplet && bodyA.isTear) makeRoundIfTear(bodyA);
        if (bodyB?.isDroplet && bodyB.isTear) makeRoundIfTear(bodyB);

        if (bodyA?.isDroplet && bodyB?.isStatic) handleBounce(bodyA, now);
        else if (bodyB?.isDroplet && bodyA?.isStatic) handleBounce(bodyB, now);

        if (bodyA?.isTopSensor && bodyB?.isDroplet) {
          setGameOver();
          return;
        }
        if (bodyB?.isTopSensor && bodyA?.isDroplet) {
          setGameOver();
          return;
        }

        if (bodyA?.isDroplet && bodyB?.isDroplet) {
          mergeDroplets(bodyA, bodyB);
        }
      }
    });

    Events.on(engine, "beforeUpdate", () => {
      if (gameOver) return;

      let cnt = 0;
      for (const d of droplets) {
        if (!d?.isDroplet) continue;
        if (d.isMerging) continue;
        if (d.position.y < DROPLET_GAMEOVER_Y) cnt++;
        if (cnt >= DROPLET_GAMEOVER_COUNT) break;
      }
      if (cnt >= DROPLET_GAMEOVER_COUNT) setGameOver();
    });

    let started = false;
    let resetInput = () => {};
    function start() {
      if (started) return;
      started = true;
      createBounds();
      bindCupRimSync();
      Render.run(render);
      Runner.run(runner, engine);
      bindPlateControls();
      pickNextDroplet();
      setHoldingDroplet(nextCharIndex);
      updatePlateDom();
      updateScoreUI();

      if (overlayRestartBtnEl) {
        overlayRestartBtnEl.addEventListener("click", resetGame);
      }
      if (resetBtnEl && resetBtnEl !== overlayRestartBtnEl) {
        resetBtnEl.addEventListener("click", resetGame);
      }
    }

    function destroy() {
      disposed = true;
      rimObserver?.disconnect();
      window.removeEventListener("resize", syncCupRimToVisual);
      window.visualViewport?.removeEventListener("resize", syncCupRimToVisual);
      Runner.stop(runner);
      Render.stop(render);
      World.clear(world, false);
      Engine.clear(engine);
    }

    return {
      start,
      prepareTexture,
      resetGame,
      destroy,
      pause() {
        resetInput();
        Runner.stop(runner);
        Render.stop(render);
      },
      stop() {
        this.pause();
        cancelAnimationFrame(tiltRAF);
        tiltRAF = 0;
      },
      resume(runPhysics = true) {
        syncCupRimToVisual();
        Render.run(render);
        if (runPhysics) Runner.run(runner, engine);
      },

      getState() {
        return {
          score,
          gameOver,
          plateX,
          nextCharIndex,
          dropletCount: droplets.size,
        };
      },

      getLargeDroplets() {
        return [...droplets].filter(
          (d) => d && d.isDroplet && d.stage === 2 && !d.isMerging
        );
      },

      breakLargeDroplet(targetDroplet, opts = {}) {
        if (!targetDroplet || !targetDroplet.isDroplet) return null;
        if (targetDroplet.stage !== 2) return null;

        const now = performance.now();
        if (now - (targetDroplet.justBrokenAt || 0) < 900) return null;
        targetDroplet.justBrokenAt = now;

        const centerX = targetDroplet.position.x;
        const centerY = targetDroplet.position.y;
        const charIndex = targetDroplet.charIndex;

        droplets.delete(targetDroplet);
        World.remove(world, targetDroplet);

        const newStage = 1;
        const r = cfg.stageRadius[newStage];
        const type = dropletTypes[charIndex];
        const tex = type?.sprites?.[cfg.stageKeys[newStage]] || "";

        const newBody = createDropletBody({
          charIndex,
          stage: newStage,
          x: centerX,
          y: centerY,
          radius: r,
          texture: tex,
          isTear: false,
        });

        Body.setVelocity(newBody, {
          x: typeof opts.vx === "number" ? opts.vx : (Math.random() - 0.5) * 1.2,
          y: typeof opts.vy === "number" ? opts.vy : -2,
        });

        squish(newBody, 1.12, 220);
        return newBody;
      },

      addScore(points) {
        if (typeof points !== 'number' || points === 0) return;
        score = Math.max(0, score + points);
        updateScoreUI();
      },

      pauseAudio() {
        audioPaused = true;
        stopAllSounds();
      },

      resumeAudio() {
        audioPaused = false;
      },

      debug: {
        engine,
        world,
        runner,
        droplets,
        config: cfg,
        get cupRimY() { return cupRimY; },
        get cupRimSurface() { return rimSurface && { ...rimSurface }; },
        syncCupRimToVisual,
      },
    };
  };
})();
