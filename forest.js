(() => {
  const scene = document.querySelector(".forest-scene");
  const map = document.querySelector(".forest-camera");
  const drop = document.querySelector(".memory-drop");
  const toast = document.querySelector(".forest-toast");

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
  };

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
    if (!state.enabled || event.target.closest(".ui-buttons") || event.target.closest(".memory-drop")) {
      return;
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

  if (drop) {
    drop.addEventListener("click", () => {
      showToast("雫の中に、小さな森の記憶が映っています。");
    });
  }
})();
