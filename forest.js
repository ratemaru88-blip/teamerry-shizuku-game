(() => {
  const scene = document.querySelector(".forest-scene");
  const map = document.querySelector(".map-content");
  const drops = document.querySelectorAll(".hidden-drop");
  const toast = document.querySelector(".forest-toast");
  const narration = document.querySelector(".forest-narration");
  const tapEffects = document.querySelector(".tap-effects");
  const mintGuide = document.querySelector(".mint-guide");
  const mapAtmosphere = document.querySelector(".map-atmosphere");
  const creatures = document.querySelector(".forest-creatures");
  const driftLayer = document.querySelector(".forest-drift");
  const debugPanel = document.querySelector(".debug-panel");
  const mobileWalker = document.querySelector(".mobile-walker");
  const mobileWalkerBubble = document.querySelector(".mobile-walker__bubble");

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

  const isCoarsePointer = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  const isFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const mobileWalkerQuery = window.matchMedia("(max-width: 759px)");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const randomBetween = (min, max) => min + Math.random() * (max - min);
  const pick = (items) => items[Math.floor(Math.random() * items.length)];

  const timePresets = {
    morning: {
      brightness: 1.03,
      saturate: 0.9,
      contrast: 0.94,
      warmth: "rgba(255, 247, 219, 0.08)",
      coolness: "rgba(229, 242, 255, 0.1)",
      darkness: "rgba(8, 18, 22, 0.02)",
      mist: 0.18,
      stars: 0,
      lamps: 0.04,
      sunset: 0,
      glow: 0.04,
    },
    day: {
      brightness: 1.08,
      saturate: 1,
      contrast: 0.98,
      warmth: "rgba(255, 242, 205, 0.04)",
      coolness: "rgba(206, 239, 255, 0.05)",
      darkness: "rgba(4, 10, 18, 0)",
      mist: 0.06,
      stars: 0,
      lamps: 0,
      sunset: 0,
      glow: 0,
    },
    evening: {
      brightness: 0.82,
      saturate: 1.08,
      contrast: 1.04,
      warmth: "rgba(255, 116, 76, 0.26)",
      coolness: "rgba(38, 55, 128, 0.16)",
      darkness: "rgba(10, 16, 28, 0.18)",
      mist: 0.12,
      stars: 0.08,
      lamps: 0.36,
      sunset: 0.82,
      glow: 0.13,
    },
    night: {
      brightness: 0.52,
      saturate: 0.72,
      contrast: 1.06,
      warmth: "rgba(255, 181, 103, 0.05)",
      coolness: "rgba(75, 105, 162, 0.18)",
      darkness: "rgba(3, 8, 19, 0.46)",
      mist: 0.08,
      stars: 0.72,
      lamps: 0.44,
      sunset: 0,
      glow: 0.18,
    },
  };

  const narrationLines = [
    "今日は霧が深いようです。",
    "湖が静かな日です。",
    "森が少し眠たそうです。",
    "どこかで羽音がしました。",
    "川の音が、少し近く聞こえます。",
    "木々の影がゆっくり伸びています。",
  ];

  const bottleMessages = [
    "昨日の夜、\n湖にはたくさんの星が映っていました。",
    "今日は深い霧の予感がします。",
    "小鳥たちが橋の近くで羽を休めていました。",
    "流れの遅い場所に、光が少しだけ残っています。",
    "森は今朝、静かに目を覚ましたようです。",
  ];

  const birdPerches = [
    { x: 28, y: 42, scale: 0.84 },
    { x: 44, y: 35, scale: 0.78 },
    { x: 58, y: 47, scale: 0.82 },
    { x: 74, y: 41, scale: 0.72 },
    { x: 36, y: 61, scale: 0.76 },
  ];

  const bottleRoutes = [
    { x: 63, y: 64, midX: "-4vw", midY: "1.4vh", endX: "-17vw", endY: "4vh" },
    { x: 80, y: 60, midX: "-6vw", midY: "-1vh", endX: "-20vw", endY: "2.5vh" },
    { x: 47, y: 69, midX: "5vw", midY: "1vh", endX: "17vw", endY: "-2vh" },
  ];

  let currentBird = null;
  let audioReady = false;
  let audioContext = null;
  let riverStarted = false;
  let activeTimeName = "";
  let soundscape = null;
  const debugState = {
    timeOverride: "",
    toggles: {
      rain: false,
      mist: false,
      stars: false,
      walker: true,
    },
    fastMode: false,
    idleFastMode: false,
    timers: {
      ambient: 0,
      bird: 0,
      bottle: 0,
      narration: 0,
    },
  };

  const walkerState = {
    enabled: false,
    x: 0,
    y: window.innerHeight * 0.5,
    targetX: 0,
    targetY: window.innerHeight * 0.5,
    lastScrollY: window.scrollY || 0,
    lastTime: performance.now(),
    lastDirection: 0,
    directionChanges: [],
    stopTimer: 0,
    speechTimer: 0,
    centerTimer: 0,
    restTimers: [],
    restStage: "",
    raf: 0,
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

  const applyTimePreset = (forcedName = debugState.timeOverride) => {
    const hour = new Date().getHours();
    const automaticName = hour >= 5 && hour < 10
      ? "morning"
      : hour >= 10 && hour < 16
        ? "day"
        : hour >= 16 && hour < 19
          ? "evening"
          : "night";
    const name = timePresets[forcedName] ? forcedName : automaticName;
    const preset = timePresets[name];
    activeTimeName = name;

    scene.classList.remove("forest-time--morning", "forest-time--day", "forest-time--evening", "forest-time--night");
    scene.classList.add(`forest-time--${name}`);
    scene.style.setProperty("--time-brightness", preset.brightness);
    scene.style.setProperty("--time-saturate", preset.saturate);
    scene.style.setProperty("--time-contrast", preset.contrast);
    scene.style.setProperty("--time-warmth", preset.warmth);
    scene.style.setProperty("--time-coolness", preset.coolness);
    scene.style.setProperty("--time-darkness", preset.darkness);
    scene.style.setProperty("--mist-opacity", debugState.toggles.mist ? Math.max(preset.mist, 0.18) : preset.mist);
    scene.style.setProperty("--star-opacity", debugState.toggles.stars ? Math.max(preset.stars, 0.78) : preset.stars);
    scene.style.setProperty("--lamp-opacity", preset.lamps);
    scene.style.setProperty("--sunset-opacity", preset.sunset || 0);
    scene.style.setProperty("--rain-opacity", debugState.toggles.rain ? 0.34 : 0);
    scene.style.setProperty("--glow-boost", preset.glow);
    updateSoundscape();
  };

  const createSoundscape = () => {
    if (soundscape) {
      return;
    }

    soundscape = {
      river: new Audio("./assets/sounds/river_sound1.mp3"),
      bird: new Audio("./assets/sounds/カッコウの鳴き声.mp3"),
    };
    soundscape.river.loop = true;
    soundscape.river.preload = "auto";
    soundscape.river.volume = 0.018;
    soundscape.bird.volume = 0.035;
  };

  const startRiverSound = () => {
    createSoundscape();

    if (!soundscape || !soundscape.river) {
      return;
    }

    soundscape.river.loop = true;
    const playPromise = soundscape.river.play();
    riverStarted = true;

    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        riverStarted = false;
      });
    }
  };

  const ensureAudio = () => {
    createSoundscape();

    if (audioReady) {
      startRiverSound();
      return;
    }

    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioCtor) {
      audioContext = new AudioCtor();

      if (audioContext.state === "suspended" && typeof audioContext.resume === "function") {
        audioContext.resume().catch(() => {});
      }
    }

    audioReady = true;
    startRiverSound();
    updateSoundscape();
  };

  const playForestSound = (name) => {
    if (!soundscape || reduceMotion) {
      return;
    }

    const sound = soundscape[name];
    if (!sound) {
      return;
    }

    sound.currentTime = 0;
    sound.play().catch(() => {});
  };

  const updateSoundscape = () => {
    if (!soundscape) {
      return;
    }

    soundscape.river.volume = 0.018;
  };

  const playSoftTone = (frequency, duration = 0.18, volume = 0.018) => {
    if (!audioContext || reduceMotion) {
      return;
    }

    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + duration + 0.04);
  };

  const showNarration = (message = pick(narrationLines)) => {
    if (!narration) {
      return;
    }

    narration.textContent = message;
    narration.classList.add("is-visible");
    window.clearTimeout(showNarration.timer);
    showNarration.timer = window.setTimeout(() => {
      narration.classList.remove("is-visible");
    }, 5200);
  };

  const walkerLines = {
    fast: [
      "ま、待って〜！",
      "速いよ〜！",
      "ふぅ追いついた",
      "急に走らないで〜！",
    ],
    angry: [
      "もう！どっちなの〜！",
      "上？下？はっきりして〜！",
      "目が回る〜！",
      "森で暴走禁止〜！",
    ],
    side: [
      "見に行くね",
      "こっちかな？",
      "確認中〜",
    ],
    rest: [
      "ちょっと休憩〜",
    ],
    lunch: [
      "おべんとうタイム！",
    ],
    sleep: [
      "むにゃ",
    ],
    wake: [
      "えっ、もう行くの！？",
      "置いてかないで〜！",
    ],
  };

  const isMobileWalkerActive = () => Boolean(mobileWalker && mobileWalkerQuery.matches && debugState.toggles.walker);

  const setWalkerSpeech = (message) => {
    if (!mobileWalker || !mobileWalkerBubble) {
      return;
    }

    mobileWalkerBubble.textContent = message;
    mobileWalker.classList.add("has-speech");
    window.clearTimeout(walkerState.speechTimer);
    walkerState.speechTimer = window.setTimeout(() => {
      mobileWalker.classList.remove("has-speech");
    }, reduceMotion ? 1400 : 2300);
  };

  const setWalkerClass = (name, active) => {
    if (mobileWalker) {
      mobileWalker.classList.toggle(name, active);
    }
  };

  const clearWalkerRestTimers = () => {
    walkerState.restTimers.forEach((timer) => window.clearTimeout(timer));
    walkerState.restTimers = [];
  };

  const clearWalkerRestState = () => {
    ["is-resting", "is-lunching", "is-sleeping", "is-waking"].forEach((name) => setWalkerClass(name, false));
    walkerState.restStage = "";
  };

  const setWalkerRestStage = (stage) => {
    if (!walkerState.enabled || !mobileWalker) {
      return;
    }

    clearWalkerRestState();
    walkerState.restStage = stage;
    setWalkerClass("is-walking", false);
    setWalkerClass("is-running", false);

    if (stage === "rest") {
      setWalkerClass("is-resting", true);
      setWalkerSpeech(pick(walkerLines.rest));
    } else if (stage === "lunch") {
      setWalkerClass("is-lunching", true);
      setWalkerSpeech(pick(walkerLines.lunch));
    } else if (stage === "sleep") {
      setWalkerClass("is-sleeping", true);
      setWalkerSpeech(pick(walkerLines.sleep));
    }
  };

  const getIdleDelays = () => {
    return debugState.idleFastMode
      ? { rest: 1200, lunch: 2400, sleep: 4200 }
      : { rest: 5000, lunch: 10000, sleep: 18000 };
  };

  const scheduleWalkerIdleRest = () => {
    if (!walkerState.enabled) {
      return;
    }

    clearWalkerRestTimers();
    const delays = getIdleDelays();
    walkerState.restTimers = [
      window.setTimeout(() => setWalkerRestStage("rest"), delays.rest),
      window.setTimeout(() => setWalkerRestStage("lunch"), delays.lunch),
      window.setTimeout(() => setWalkerRestStage("sleep"), delays.sleep),
    ];
  };

  const wakeWalkerForScroll = () => {
    if (!walkerState.enabled || !walkerState.restStage) {
      return;
    }

    const wasSleeping = walkerState.restStage === "sleep";
    clearWalkerRestTimers();
    clearWalkerRestState();
    setWalkerClass("is-waking", true);
    setWalkerSpeech(pick(walkerLines.wake));
    window.setTimeout(() => setWalkerClass("is-waking", false), reduceMotion ? 350 : 1300);

    if (wasSleeping) {
      setWalkerClass("is-running", true);
    }
  };

  const syncWalkerEnabled = () => {
    const active = isMobileWalkerActive();
    walkerState.enabled = active;
    document.body.classList.toggle("mobile-walker-enabled", active);
    document.body.classList.toggle("mobile-walker-disabled", mobileWalkerQuery.matches && !debugState.toggles.walker);

    if (!active) {
      clearWalkerRestTimers();
      clearWalkerRestState();
    }

    if (active && !walkerState.raf) {
      walkerState.targetY = window.innerHeight * 0.5;
      walkerState.y = walkerState.targetY;
      walkerState.lastScrollY = window.scrollY || 0;
      walkerState.lastTime = performance.now();
      walkerState.raf = window.requestAnimationFrame(updateWalkerFrame);
      scheduleWalkerIdleRest();
    }
  };

  const updateWalkerTargetFromScroll = (speed = 0) => {
    if (!walkerState.enabled) {
      return;
    }

    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
    const range = reduceMotion ? 28 : 86;
    walkerState.targetY = window.innerHeight * 0.43 + progress * range;

    if (speed > 1.65 && !reduceMotion) {
      setWalkerClass("is-running", true);
      setWalkerClass("is-walking", false);
    } else {
      setWalkerClass("is-running", false);
      setWalkerClass("is-walking", true);
    }
  };

  function updateWalkerFrame() {
    if (!walkerState.enabled || !mobileWalker) {
      walkerState.raf = 0;
      return;
    }

    const follow = reduceMotion ? 0.32 : mobileWalker.classList.contains("is-running") ? 0.2 : 0.11;
    walkerState.x += (walkerState.targetX - walkerState.x) * follow;
    walkerState.y += (walkerState.targetY - walkerState.y) * follow;
    mobileWalker.style.setProperty("--walker-x", `${walkerState.x.toFixed(1)}px`);
    mobileWalker.style.setProperty("--walker-y", `${walkerState.y.toFixed(1)}px`);
    walkerState.raf = window.requestAnimationFrame(updateWalkerFrame);
  }

  const finishWalkerScroll = () => {
    if (!walkerState.enabled || !mobileWalker) {
      return;
    }

    setWalkerClass("is-running", false);
    setWalkerClass("is-walking", false);
    setWalkerClass("is-sweating", true);
    setWalkerSpeech(pick(walkerLines.fast));
    window.setTimeout(() => setWalkerClass("is-sweating", false), 1900);
    scheduleWalkerIdleRest();
  };

  const triggerWalkerAngry = () => {
    if (!walkerState.enabled || !mobileWalker) {
      return;
    }

    setWalkerClass("is-angry", true);
    setWalkerClass("is-running", false);
    setWalkerSpeech(pick(walkerLines.angry));
    window.setTimeout(() => setWalkerClass("is-angry", false), 1800);
  };

  const triggerWalkerFast = () => {
    if (!walkerState.enabled) {
      return;
    }

    setWalkerClass("is-running", true);
    clearWalkerRestTimers();
    clearWalkerRestState();
    setWalkerSpeech(pick(walkerLines.fast));
    window.clearTimeout(walkerState.stopTimer);
    walkerState.stopTimer = window.setTimeout(finishWalkerScroll, reduceMotion ? 500 : 1200);
  };

  const moveWalkerToSide = (side) => {
    if (!walkerState.enabled) {
      return;
    }

    const distance = reduceMotion ? 18 : 42;
    walkerState.targetX = side === "left" ? -distance : distance;
    setWalkerClass("is-walking", true);
    clearWalkerRestTimers();
    clearWalkerRestState();
    setWalkerSpeech(pick(walkerLines.side));
    window.clearTimeout(walkerState.centerTimer);
    walkerState.centerTimer = window.setTimeout(() => {
      walkerState.targetX = 0;
      setWalkerClass("is-walking", false);
    }, reduceMotion ? 500 : 1300);
  };

  const handleWalkerScroll = () => {
    if (!walkerState.enabled) {
      return;
    }

    const now = performance.now();
    const currentY = window.scrollY || 0;
    const delta = currentY - walkerState.lastScrollY;
    const elapsed = Math.max(16, now - walkerState.lastTime);
    const speed = Math.abs(delta) / elapsed;
    const direction = delta === 0 ? 0 : delta > 0 ? 1 : -1;

    if (Math.abs(delta) > 1) {
      wakeWalkerForScroll();
      clearWalkerRestTimers();
    }

    updateWalkerTargetFromScroll(speed);

    if (direction && walkerState.lastDirection && direction !== walkerState.lastDirection && speed > 0.7) {
      walkerState.directionChanges.push(now);
      walkerState.directionChanges = walkerState.directionChanges.filter((time) => now - time < 2400);
      if (walkerState.directionChanges.length >= 3) {
        walkerState.directionChanges = [];
        triggerWalkerAngry();
      }
    }

    if (speed > 1.65) {
      triggerWalkerFast();
    }

    if (direction) {
      walkerState.lastDirection = direction;
    }

    walkerState.lastScrollY = currentY;
    walkerState.lastTime = now;
    window.clearTimeout(walkerState.stopTimer);
    walkerState.stopTimer = window.setTimeout(finishWalkerScroll, reduceMotion ? 260 : 760);
  };

  const addAmbientParticle = () => {
    if (!mapAtmosphere || reduceMotion) {
      return;
    }

    const kind = pick(["spark", "leaf", "shimmer", "ripple", "glow"]);
    const particle = document.createElement("span");
    const watery = kind === "shimmer" || kind === "ripple";
    const size = watery ? randomBetween(38, 86) : randomBetween(16, 48);

    particle.className = `ambient-particle ambient-particle--${kind}`;
    particle.style.setProperty("--ambient-x", `${watery ? randomBetween(45, 84) : randomBetween(8, 92)}%`);
    particle.style.setProperty("--ambient-y", `${watery ? randomBetween(56, 73) : randomBetween(18, 76)}%`);
    particle.style.setProperty("--ambient-size", `${size}px`);
    particle.style.setProperty("--ambient-opacity", watery ? randomBetween(0.13, 0.26) : randomBetween(0.08, 0.2));
    particle.style.setProperty("--ambient-duration", `${randomBetween(5.8, 11.5)}s`);
    particle.style.setProperty("--ambient-drift-x", `${randomBetween(-34, 34)}px`);
    particle.style.setProperty("--ambient-drift-y", `${randomBetween(-28, 18)}px`);
    mapAtmosphere.append(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  };

  const getDebugDelay = (normalMin, normalMax, fastMin, fastMax) => {
    return debugState.fastMode
      ? randomBetween(fastMin, fastMax)
      : randomBetween(normalMin, normalMax);
  };

  const setDebugTimer = (name, callback, delay) => {
    window.clearTimeout(debugState.timers[name]);
    debugState.timers[name] = window.setTimeout(callback, delay);
  };

  const restartTimedEvents = () => {
    Object.keys(debugState.timers).forEach((name) => {
      window.clearTimeout(debugState.timers[name]);
      debugState.timers[name] = 0;
    });

    scheduleAmbient(debugState.fastMode ? 800 : 2600);
    scheduleNarration(debugState.fastMode ? 3000 : 9000);
    scheduleBird(debugState.fastMode ? 5000 : 14000);
    scheduleBottle(debugState.fastMode ? 5200 : 18000);
  };

  const scheduleAmbient = (delay = getDebugDelay(2400, 7600, 900, 1800)) => {
    setDebugTimer("ambient", () => {
      addAmbientParticle();
      scheduleAmbient();
    }, delay);
  };

  const setBirdFrame = (bird, frame) => {
    const image = bird.querySelector("img");
    if (image) {
      image.src = `./assets/birds/character/${frame}`;
    }
  };

  const flyAwayBird = (bird = currentBird) => {
    if (!bird || bird.classList.contains("is-flying")) {
      return;
    }

    window.clearInterval(bird.lookTimer);
    window.clearInterval(bird.flyTimer);
    bird.classList.add("is-flying");
    bird.style.setProperty("--bird-fly-x", `${randomBetween(-140, 160)}px`);
    bird.style.setProperty("--bird-fly-y", `${randomBetween(-130, -72)}px`);
    playSoftTone(520, 0.1, 0.012);

    const frames = ["bird-fly-1.webp", "bird-fly-2.webp", "bird-fly-3.webp"];
    let frame = 0;
    bird.flyTimer = window.setInterval(() => {
      setBirdFrame(bird, frames[frame % frames.length]);
      frame += 1;
    }, 180);

    window.setTimeout(() => {
      window.clearInterval(bird.flyTimer);
      bird.remove();
      if (currentBird === bird) {
        currentBird = null;
      }
    }, 2700);
  };

  const spawnBird = () => {
    if (!creatures || currentBird || reduceMotion) {
      return;
    }

    const perch = pick(birdPerches);
    const bird = document.createElement("button");
    const image = document.createElement("img");
    bird.type = "button";
    bird.className = "forest-bird";
    bird.tabIndex = -1;
    bird.style.setProperty("--bird-x", `${perch.x}%`);
    bird.style.setProperty("--bird-y", `${perch.y}%`);
    bird.style.setProperty("--bird-scale", perch.scale);
    image.src = "./assets/birds/character/bird-idle.webp";
    image.alt = "";
    bird.append(image);
    creatures.append(bird);
    currentBird = bird;
    playSoftTone(880, 0.16, 0.008);
    playForestSound("bird");

    bird.lookTimer = window.setInterval(() => {
      setBirdFrame(bird, pick([
        "bird-idle.webp",
        "bird-look-left.webp",
        "bird-look-right.webp",
        "bird-upward.webp",
        "bird-downward1.webp",
      ]));
    }, randomBetween(1400, 2800));

    bird.addEventListener("pointerenter", () => flyAwayBird(bird));
    bird.addEventListener("click", (event) => {
      event.preventDefault();
      flyAwayBird(bird);
    });

    window.setTimeout(() => flyAwayBird(bird), randomBetween(9000, 17000));
  };

  const scheduleBird = (delay = getDebugDelay(24000, 62000, 3000, 5200)) => {
    setDebugTimer("bird", () => {
      if (Math.random() < 0.72) {
        spawnBird();
      }
      scheduleBird();
    }, delay);
  };

  const showBottleLetter = (message) => {
    let letter = document.querySelector(".forest-letter");
    if (!letter) {
      letter = document.createElement("p");
      letter.className = "forest-letter";
      scene.append(letter);
    }

    letter.textContent = message;
    letter.classList.add("is-visible");
    showNarration(message);
    window.clearTimeout(showBottleLetter.timer);
    showBottleLetter.timer = window.setTimeout(() => {
      letter.classList.remove("is-visible");
    }, 6600);
  };

  const spawnBottle = () => {
    if (!driftLayer || reduceMotion) {
      return;
    }

    const route = pick(bottleRoutes);
    const bottle = document.createElement("button");
    bottle.type = "button";
    bottle.className = "bottle-mail";
    bottle.setAttribute("aria-label", "流れてきたボトルメールを読む");
    bottle.style.setProperty("--bottle-x", `${route.x}%`);
    bottle.style.setProperty("--bottle-y", `${route.y}%`);
    bottle.style.setProperty("--bottle-mid-x", route.midX);
    bottle.style.setProperty("--bottle-mid-y", route.midY);
    bottle.style.setProperty("--bottle-end-x", route.endX);
    bottle.style.setProperty("--bottle-end-y", route.endY);
    const tilt = randomBetween(-10, 10);
    bottle.style.setProperty("--bottle-tilt", `${tilt}deg`);
    bottle.style.setProperty("--bottle-mid-tilt", `${tilt * -0.8}deg`);
    bottle.style.setProperty("--bottle-duration", `${randomBetween(22, 34)}s`);
    driftLayer.append(bottle);

    bottle.addEventListener("click", (event) => {
      event.preventDefault();
      showBottleLetter(pick(bottleMessages));
      playSoftTone(660, 0.2, 0.012);
      bottle.remove();
    });
    bottle.addEventListener("animationend", () => bottle.remove(), { once: true });
  };

  const scheduleBottle = (delay = getDebugDelay(36000, 86000, 5000, 7600)) => {
    setDebugTimer("bottle", () => {
      if (Math.random() < 0.64) {
        spawnBottle();
      }
      scheduleBottle();
    }, delay);
  };

  const scheduleNarration = (delay = getDebugDelay(26000, 74000, 3000, 5000)) => {
    setDebugTimer("narration", () => {
      if (Math.random() < 0.78) {
        showNarration();
      }
      scheduleNarration();
    }, delay);
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

  const updateDebugButtons = () => {
    if (!debugPanel) {
      return;
    }

    debugPanel.querySelectorAll("[data-debug-time]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.debugTime === debugState.timeOverride);
    });

    debugPanel.querySelectorAll("[data-debug-toggle]").forEach((button) => {
      const name = button.dataset.debugToggle;
      const active = Boolean(debugState.toggles[name]);
      const label = {
        rain: "雨",
        mist: "霧",
        stars: "星空",
        walker: "Walker",
      }[name] || name;
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.textContent = `${label} ${active ? "ON" : "OFF"}`;
    });
  };

  const setupDebugPanel = () => {
    if (!debugPanel) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    let panelSetting = "";
    try {
      if (params.get("debug") === "1") {
        window.localStorage.removeItem("teamerryForestDebugPanel");
      }
      panelSetting = window.localStorage.getItem("teamerryForestDebugPanel") || "";
    } catch (error) {
      panelSetting = "";
    }

    if (params.get("debug") === "0" || panelSetting === "off") {
      document.body.classList.add("debug-panel-hidden");
    }

    debugPanel.querySelectorAll("[data-debug-time]").forEach((button) => {
      button.addEventListener("click", () => {
        debugState.timeOverride = button.dataset.debugTime || "";
        applyTimePreset();
        updateDebugButtons();
        showToast(`${button.textContent}に切り替えました。`);
      });
    });

    debugPanel.querySelectorAll("[data-debug-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const name = button.dataset.debugToggle;
        debugState.toggles[name] = !debugState.toggles[name];
        applyTimePreset();
        syncWalkerEnabled();
        updateDebugButtons();
      });
    });

    const fastInput = debugPanel.querySelector("[data-debug-fast]");
    if (fastInput) {
      fastInput.addEventListener("change", () => {
        debugState.fastMode = fastInput.checked;
        restartTimedEvents();
        showToast(debugState.fastMode ? "時間差イベントを高速化しました。" : "時間差イベントを通常速度に戻しました。");
      });
    }

    const idleFastInput = debugPanel.querySelector("[data-debug-idle-fast]");
    if (idleFastInput) {
      idleFastInput.addEventListener("change", () => {
        debugState.idleFastMode = idleFastInput.checked;
        scheduleWalkerIdleRest();
        showToast(debugState.idleFastMode ? "休憩タイマーを短縮しました。" : "休憩タイマーを通常速度に戻しました。");
      });
    }

    const hideButton = debugPanel.querySelector("[data-debug-hide]");
    if (hideButton) {
      hideButton.addEventListener("click", () => {
        document.body.classList.add("debug-panel-hidden");
        try {
          window.localStorage.setItem("teamerryForestDebugPanel", "off");
        } catch (error) {
          // The query parameter still supports production hiding when storage is unavailable.
        }
      });
    }

    const birdButton = debugPanel.querySelector('[data-debug-action="bird"]');
    if (birdButton) {
      birdButton.addEventListener("click", () => {
        spawnBird();
      });
    }

    const soundButton = debugPanel.querySelector('[data-debug-action="se"]');
    if (soundButton) {
      soundButton.addEventListener("click", () => {
        ensureAudio();
        playForestSound("river");
      });
    }

    const fastScrollButton = debugPanel.querySelector('[data-debug-action="fast-scroll"]');
    if (fastScrollButton) {
      fastScrollButton.addEventListener("click", () => {
        syncWalkerEnabled();
        triggerWalkerFast();
      });
    }

    const angryButton = debugPanel.querySelector('[data-debug-action="angry"]');
    if (angryButton) {
      angryButton.addEventListener("click", () => {
        syncWalkerEnabled();
        triggerWalkerAngry();
      });
    }

    const sideMoveButton = debugPanel.querySelector('[data-debug-action="side-move"]');
    if (sideMoveButton) {
      sideMoveButton.addEventListener("click", () => {
        syncWalkerEnabled();
        moveWalkerToSide(walkerState.targetX <= 0 ? "right" : "left");
      });
    }

    const kakaoRunButton = debugPanel.querySelector('[data-debug-action="kakao-run"]');
    if (kakaoRunButton) {
      kakaoRunButton.addEventListener("click", () => {
        syncWalkerEnabled();
        triggerWalkerFast();
      });
    }

    const kakaoLunchButton = debugPanel.querySelector('[data-debug-action="kakao-lunch"]');
    if (kakaoLunchButton) {
      kakaoLunchButton.addEventListener("click", () => {
        syncWalkerEnabled();
        setWalkerRestStage("lunch");
      });
    }

    const kakaoSleepButton = debugPanel.querySelector('[data-debug-action="kakao-sleep"]');
    if (kakaoSleepButton) {
      kakaoSleepButton.addEventListener("click", () => {
        syncWalkerEnabled();
        setWalkerRestStage("sleep");
      });
    }

    const wakeButton = debugPanel.querySelector('[data-debug-action="wake-up"]');
    if (wakeButton) {
      wakeButton.addEventListener("click", () => {
        syncWalkerEnabled();
        if (!walkerState.restStage) {
          setWalkerRestStage("sleep");
        }
        wakeWalkerForScroll();
      });
    }

    updateDebugButtons();
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
    ensureAudio();

    if (!state.enabled || event.target.closest(".debug-panel") || event.target.closest(".forest-portal") || event.target.closest(".hidden-drop") || event.target.closest(".bottle-mail") || event.target.closest(".forest-bird")) {
      return;
    }

    if (isMobileWalkerActive()) {
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
    if (currentBird && event.pointerType === "mouse") {
      const rect = currentBird.getBoundingClientRect();
      const birdX = rect.left + rect.width / 2;
      const birdY = rect.top + rect.height / 2;
      const distance = Math.hypot(event.clientX - birdX, event.clientY - birdY);

      if (distance < 72) {
        flyAwayBird(currentBird);
      }
    }

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
    syncWalkerEnabled();
    updateWalkerTargetFromScroll();
  });

  window.addEventListener("scroll", handleWalkerScroll, { passive: true });

  document.querySelectorAll(".forest-portal").forEach((portal) => {
    portal.addEventListener("pointerdown", () => {
      if (!isMobileWalkerActive()) {
        return;
      }

      const rect = portal.getBoundingClientRect();
      const side = rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right";
      moveWalkerToSide(side);
    }, { passive: true });
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

  setupDebugPanel();
  applyTimePreset();
  startRiverSound();
  syncWalkerEnabled();
  updateWalkerTargetFromScroll();
  const handleWalkerMediaChange = () => {
    syncWalkerEnabled();
    updateWalkerTargetFromScroll();
  };
  if (typeof mobileWalkerQuery.addEventListener === "function") {
    mobileWalkerQuery.addEventListener("change", handleWalkerMediaChange);
  } else if (typeof mobileWalkerQuery.addListener === "function") {
    mobileWalkerQuery.addListener(handleWalkerMediaChange);
  }
  window.setInterval(applyTimePreset, 60 * 1000);

  ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
    window.addEventListener(eventName, ensureAudio, { once: true, passive: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && soundscape && !riverStarted) {
      startRiverSound();
    }
  });

  restartTimedEvents();

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
