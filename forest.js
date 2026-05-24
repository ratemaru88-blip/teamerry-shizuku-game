(() => {
  const scene = document.querySelector(".forest-scene");
  const map = document.querySelector(".map-content");
  const drops = document.querySelectorAll(".hidden-drop");
  const toast = document.querySelector(".forest-toast");
  const tapEffects = document.querySelector(".tap-effects");
  const mintGuide = document.querySelector(".mint-guide");

  if (!scene || !map) {
    return;
  }

  const state = {
    enabled: false,
    dragging: false,
    pointerId: null,
    scale: 1,
    x: 0,
    y: 0,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    lastSparkAt: 0,
  };

  const isCoarsePointer = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  const isFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const parseLength = (value, axis) => {
    const text = String(value || "0").trim();
    const number = Number.parseFloat(text);

    if (!Number.isFinite(number)) {
      return 0;
    }

    if (text.endsWith("vw")) {
      return window.innerWidth * number / 100;
    }

    if (text.endsWith("vh")) {
      return window.innerHeight * number / 100;
    }

    if (text.endsWith("%")) {
      const size = axis === "x" ? window.innerWidth : window.innerHeight;
      return size * number / 100;
    }

    return number;
  };

  const readIntroEnd = () => {
    const styles = getComputedStyle(document.documentElement);

    state.scale = Number.parseFloat(styles.getPropertyValue("--camera-end-scale")) || 1;
    state.x = parseLength(styles.getPropertyValue("--camera-end-x"), "x");
    state.y = parseLength(styles.getPropertyValue("--camera-end-y"), "y");
  };

  const clampState = () => {
    const baseWidth = map.offsetWidth;
    const baseHeight = map.offsetHeight;
    const scaledWidth = baseWidth * state.scale;
    const scaledHeight = baseHeight * state.scale;
    const edgeHint = Math.min(96, Math.max(28, window.innerWidth * 0.12));

    const maxX = Math.max(0, (scaledWidth - window.innerWidth) / 2 + edgeHint);
    const maxY = Math.max(0, (scaledHeight - window.innerHeight) / 2 + edgeHint);

    state.x = Math.min(maxX, Math.max(-maxX, state.x));
    state.y = Math.min(maxY, Math.max(-maxY, state.y));
  };

  const renderMap = () => {
    clampState();
    map.style.setProperty("--map-x", `${state.x}px`);
    map.style.setProperty("--map-y", `${state.y}px`);
    map.style.setProperty("--map-scale", state.scale);
  };

  const finishIntro = () => {
    readIntroEnd();
    state.enabled = true;
    map.style.animation = "none";
    renderMap();
    document.body.classList.add("intro-finished");
  };

  const showToast = (message) => {
    if (!toast) {
      return;
    }

    toast.textContent = message;
    toast.classList.add("is-visible");

    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 3600);
  };

  const addScreenEffect = (className, x, y) => {
    if (!tapEffects) {
      return;
    }

    const effect = document.createElement("span");
    effect.className = className;
    effect.style.setProperty("--effect-x", `${x}px`);
    effect.style.setProperty("--effect-y", `${y}px`);
    tapEffects.append(effect);

    effect.addEventListener("animationend", () => {
      effect.remove();
    }, { once: true });
  };

  const showMemoryEvent = (x, y) => {
    const sequence = [
      ["memory-event-effect memory-event-effect--glow", 0],
      ["memory-event-effect memory-event-effect--sparkle", 120],
      ["memory-event-effect memory-event-effect--ripple", 240],
      ["memory-event-effect memory-event-effect--fog", 420],
    ];

    sequence.forEach(([className, delay]) => {
      window.setTimeout(() => {
        addScreenEffect(className, x, y);
      }, delay);
    });
  };

  const onCameraIntroEnd = (event) => {
    if (event.target !== map) {
      return;
    }

    map.removeEventListener("animationend", onCameraIntroEnd);
    finishIntro();
  };

  map.addEventListener("animationend", onCameraIntroEnd);
  window.setTimeout(() => {
    if (!state.enabled) {
      finishIntro();
    }
  }, 4600);

  scene.addEventListener("pointerdown", (event) => {
    if (!state.enabled || event.target.closest(".forest-portal") || event.target.closest(".hidden-drop")) {
      return;
    }

    if (isCoarsePointer) {
      addScreenEffect("tap-ripple", event.clientX, event.clientY);
    }

    state.dragging = true;
    state.pointerId = event.pointerId;
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.originX = state.x;
    state.originY = state.y;
    scene.classList.add("is-dragging");
    scene.setPointerCapture(event.pointerId);
  });

  scene.addEventListener("pointermove", (event) => {
    if (!state.dragging || event.pointerId !== state.pointerId) {
      return;
    }

    state.x = state.originX + event.clientX - state.startX;
    state.y = state.originY + event.clientY - state.startY;
    renderMap();

    if (isCoarsePointer && performance.now() - state.lastSparkAt > 140) {
      state.lastSparkAt = performance.now();
      addScreenEffect("drag-spark", event.clientX, event.clientY);
    }
  });

  const endDrag = (event) => {
    if (!state.dragging || event.pointerId !== state.pointerId) {
      return;
    }

    state.dragging = false;
    state.pointerId = null;
    scene.classList.remove("is-dragging");
  };

  scene.addEventListener("pointerup", endDrag);
  scene.addEventListener("pointercancel", endDrag);
  scene.addEventListener("lostpointercapture", () => {
    state.dragging = false;
    state.pointerId = null;
    scene.classList.remove("is-dragging");
  });

  window.addEventListener("resize", () => {
    if (!state.enabled) {
      return;
    }

    renderMap();
  });

  document.querySelectorAll("[data-coming-soon]").forEach((button) => {
    button.addEventListener("click", () => {
      alert("森の奥はまだ準備中のようです");
    });
  });

  drops.forEach((drop) => {
    drop.addEventListener("click", (event) => {
      showMemoryEvent(event.clientX, event.clientY);
      showToast("雫の中に、小さな森の記憶が映っています。");
    });
  });

  if (mintGuide && isFinePointer && !reduceMotion) {
    const mint = {
      active: false,
      following: false,
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      targetX: window.innerWidth / 2,
      targetY: window.innerHeight / 2,
    };

    const followMint = () => {
      mint.x += (mint.targetX - mint.x) * 0.075;
      mint.y += (mint.targetY - mint.y) * 0.075;
      mintGuide.style.transform = `translate3d(${mint.x + 14}px, ${mint.y + 16}px, 0)`;
      window.requestAnimationFrame(followMint);
    };

    window.addEventListener("pointermove", (event) => {
      if (event.pointerType && event.pointerType !== "mouse") {
        return;
      }

      mint.targetX = event.clientX;
      mint.targetY = event.clientY;

      if (!mint.active) {
        mint.active = true;
        mint.x = event.clientX;
        mint.y = event.clientY;
        mintGuide.classList.add("is-active");
        if (!mint.following) {
          mint.following = true;
          window.requestAnimationFrame(followMint);
        }
      }
    }, { passive: true });

    const blinkMint = () => {
      mintGuide.classList.add("is-blinking");
      window.setTimeout(() => {
        mintGuide.classList.remove("is-blinking");
      }, 150);
      window.setTimeout(blinkMint, 4200 + Math.random() * 2600);
    };

    window.setTimeout(blinkMint, 2800);
  }
})();
