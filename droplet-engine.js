(() => {
  "use strict";

  if (!window.Matter) {
    console.error("[droplet-engine] Matter.js が読み込まれていません");
    return;
  }

  const { Engine, Render, Runner, World, Bodies, Body, Events } = window.Matter;

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
    const leafWrapperEl = cfg.leafWrapperEl;
    const previewDropletEl = cfg.previewDropletEl;
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
      if (!list || !list.length) return;
      const a = list[(Math.random() * list.length) | 0];
      try {
        a.currentTime = 0;
        a.play();
      } catch (_) {}
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

    const runner = Runner.create();

    const droplets = new Set();
    const textureInfo = new Map();

    let score = 0;
    let nextCharIndex = 0;
    let gameOver = false;
    let canDrop = true;

    let plateX = cfg.worldWidth / 2;
    let holding = null;
    let pointerActive = false;

    let moveTiltDeg = 0;
    let tiltRAF = 0;

    const CUP_RIM_Y =
      cfg.worldHeight - cfg.cupLineBottomPx - cfg.cupLineHeightPx * 0.30;

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

    function createBounds() {
      const rimFloor = Bodies.rectangle(
        (cfg.leftMargin + (cfg.worldWidth - cfg.rightMargin)) / 2,
        CUP_RIM_Y,
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
      leafWrapperEl.style.transform = `translateX(-50%) rotate(${moveTiltDeg.toFixed(2)}deg)`;
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

  target.addEventListener(
    "pointerdown",
    (e) => {
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
      if (!pointerActive) return;

      pointerActive = false;

      // スライドした時は移動だけ。落とさない
      if (pointerMoved) return;

      // タップだけの時に落とす
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

    function start() {
      createBounds();
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
      Runner.stop(runner);
      Render.stop(render);
      World.clear(world, false);
      Engine.clear(engine);
    }

    return {
      start,
      resetGame,
      destroy,

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
        if ((now - (targetDroplet.justBrokenAt || 0)) < 900) return null;
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

      debug: {
        engine,
        world,
        droplets,
        config: cfg,
        cupRimY: CUP_RIM_Y,
      },
    };
  };
})();