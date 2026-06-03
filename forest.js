(() => {
  const scene = document.querySelector(".forest-scene");
  const viewport = document.querySelector(".forest-stage");
  const stage = document.getElementById("stage");
  const map = document.querySelector(".map-content");
  const drops = document.querySelectorAll(".hidden-drop");
  const toast = document.querySelector(".forest-toast");
  const narration = document.querySelector(".forest-narration");
  const tapEffects = document.querySelector(".tap-effects");
  const mintGuide = document.querySelector(".mint-guide");
  const mapAtmosphere = document.querySelector(".map-atmosphere");
  const creatures = document.querySelector(".forest-creatures");
  const driftLayer = document.querySelector(".forest-drift");
  const milkyWay = document.querySelector(".forest-milkyway");
  const moon = document.querySelector(".forest-moon");
  const forestBgVideos = Array.from(document.querySelectorAll("[data-bg-video]"));
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
    intro: true,
    minX: 0,
    minY: 0,
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
  const backgroundSlots = {
    day: {
      label: "昼",
      src: "./assets/backgrounds/forest_day_v02.webm",
    },
    "evening-a": {
      label: "夕方前",
      src: "./assets/backgrounds/forest_evening_A_v02.webm",
    },
    "evening-b": {
      label: "夕焼け",
      src: "./assets/backgrounds/forest_evening_B_v02.webm",
    },
    night: {
      label: "夜",
      src: "./assets/backgrounds/forest_night_v02.webm",
    },
  };
  let visibleBackgroundIndex = 0;
  const worldSize = {
    width: 1920,
    height: 1080,
  };
  let stageScale = 1;

  const getViewportSize = () => {
    const rect = viewport ? viewport.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };

    return {
      width: rect.width || window.innerWidth,
      height: rect.height || window.innerHeight,
    };
  };

  const getScaledWorldSize = () => ({
    width: worldSize.width * stageScale,
    height: worldSize.height * stageScale,
  });

  const timePresets = {
    day: { mist: 0.06, glow: 0 },
    "evening-a": { mist: 0.1, glow: 0.04 },
    "evening-b": { mist: 0.12, glow: 0.07 },
    night: { mist: 0.08, glow: 0.1 },
  };
  const moonPhases = {
    crescent: {
      src: "./assets/images/effects/moon.small.crescent2.png",
      size: 66,
      opacity: 0.64,
    },
    half: {
      src: "./assets/images/effects/moon.halt1.png",
      size: 90,
      opacity: 0.68,
    },
    full: {
      src: "./assets/images/effects/moon.hull.png",
      size: 108,
      opacity: 0.72,
    },
    super: {
      src: "./assets/images/effects/moon.big.full.png",
      size: 160,
      opacity: 0.78,
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
    "イベントのお知らせが届いています。\n本文DATAはこれから入ります。",
    "作者からのお知らせが届いています。\n本文DATAはこれから入ります。",
    "妖精からのお手紙が届いています。\n本文DATAはこれから入ります。",
  ];

  const birdPerches = [
    { x: 28, y: 42, scale: 0.84 },
    { x: 44, y: 35, scale: 0.78 },
    { x: 58, y: 47, scale: 0.82 },
    { x: 74, y: 41, scale: 0.72 },
    { x: 36, y: 61, scale: 0.76 },
  ];

  const groundBirdSites = [
    { area: "path", x: 980, y: 618, spreadX: 54, spreadY: 16, scale: 0.76 },
    { area: "stairs", x: 1198, y: 646, spreadX: 48, spreadY: 14, scale: 0.82 },
    { area: "stone-plaza", x: 1586, y: 794, spreadX: 86, spreadY: 28, scale: 0.94 },
  ];

  const bottleRoutes = [
    {
      name: "river-downstream",
      startX: 1118,
      startY: 742,
      midX: 1018,
      midY: 854,
      endX: 906,
      endY: 1003,
      startTilt: -18,
      midTilt: 7,
      endTilt: -10,
    },
    {
      name: "waterfall",
      startX: 1380,
      startY: 562,
      midX: 1288,
      midY: 674,
      endX: 1178,
      endY: 752,
      startTilt: -12,
      midTilt: 8,
      endTilt: -12,
    },
  ];

  let currentBird = null;
  const groundBirds = new Set();
  let audioReady = false;
  let audioContext = null;
  let riverStarted = false;
  let activeTimeName = "";
  let soundscape = null;
  const debugState = {
    timeOverride: "",
    toggles: {
      mist: false,
      walker: true,
    },
    fastMode: false,
    idleFastMode: false,
    timers: {
      ambient: 0,
      bird: 0,
      bottle: 0,
      narration: 0,
      onsenNotice: 0,
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

  const centerCamera = () => {
    const size = getViewportSize();
    const scaledWorld = getScaledWorldSize();

    state.x = (size.width - scaledWorld.width) / 2;
    state.y = (size.height - scaledWorld.height) / 2;
  };

  const getCameraForWorldPoint = (worldX, worldY) => {
    const size = getViewportSize();

    return {
      x: size.width / 2 - worldX * stageScale,
      y: size.height / 2 - worldY * stageScale,
    };
  };

  const getPulledBackCamera = () => {
    const size = getViewportSize();
    const scaledWorld = getScaledWorldSize();

    return {
      x: (size.width - scaledWorld.width) / 2,
      y: -Math.max(0, (scaledWorld.height - size.height) * 0.18),
    };
  };

  const clampState = () => {
    const size = getViewportSize();
    const scaledWorld = getScaledWorldSize();
    const minX = Math.min(size.width - scaledWorld.width, 0);
    const minY = Math.min(size.height - scaledWorld.height, 0);

    state.minX = minX;
    state.minY = minY;
    state.x = Math.min(0, Math.max(minX, state.x));
    state.y = Math.min(0, Math.max(minY, state.y));
  };

  const renderMap = () => {
    clampState();
    const cameraX = `${state.x}px`;
    const cameraY = `${state.y}px`;
    const size = getViewportSize();

    console.log("viewport", size.width, size.height);
    console.log("camera", state.x, state.y);
    console.log("[forest camera]", {
      stateX: state.x,
      stateY: state.y,
      minX: state.minX,
      minY: state.minY,
      windowInnerWidth: window.innerWidth,
      windowInnerHeight: window.innerHeight,
      cameraX,
      cameraY,
    });

    document.documentElement.style.setProperty("--camera-x", cameraX);
    document.documentElement.style.setProperty("--camera-y", cameraY);
  };

  const resizeStage = () => {
    stageScale = Math.max(
      1,
      Math.max(window.innerWidth / worldSize.width, window.innerHeight / worldSize.height)
    );

    document.documentElement.style.setProperty("--stage-scale", stageScale);

    if (stage) {
      stage.style.transform = `scale(${stageScale})`;
    }

    if (state.enabled) {
      clampState();
      renderMap();
    }
  };

  const easeInOutCubic = (value) => (
    value < 0.5
      ? 4 * value * value * value
      : 1 - Math.pow(-2 * value + 2, 3) / 2
  );

  const animateCameraTo = ({ x, y, duration = 1200, onComplete }) => {
    const startX = state.x;
    const startY = state.y;
    const startTime = performance.now();

    const tick = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = easeInOutCubic(progress);

      state.x = startX + (x - startX) * eased;
      state.y = startY + (y - startY) * eased;
      renderMap();

      if (progress < 1) {
        window.requestAnimationFrame(tick);
        return;
      }

      if (typeof onComplete === "function") {
        onComplete();
      }
    };

    window.requestAnimationFrame(tick);
  };

  const finishIntro = () => {
    centerCamera();
    state.enabled = true;
    state.intro = false;
    renderMap();
    document.body.classList.remove("camera-intro");
    document.body.classList.add("intro-finished");
  };

  const runCameraIntro = () => {
    const pulled = getPulledBackCamera();
    const mid = getCameraForWorldPoint(940, 500);

    document.body.classList.add("camera-intro");
    state.enabled = false;
    state.intro = true;
    state.x = pulled.x;
    state.y = pulled.y;
    renderMap();

    window.setTimeout(() => {
      if (!state.intro) {
        return;
      }

      animateCameraTo({
        x: mid.x,
        y: mid.y,
        duration: reduceMotion ? 1 : 2200,
        onComplete: () => {
          if (!state.intro) {
            return;
          }

          const main = getCameraForWorldPoint(960, 540);
          animateCameraTo({
            x: main.x,
            y: main.y,
            duration: reduceMotion ? 1 : 1700,
            onComplete: finishIntro,
          });
        },
      });
    }, reduceMotion ? 0 : 450);
  };

  const showToast = (message) => {
    if (!toast) {
      return;
    }

    toast.textContent = message;
    toast.classList.remove("is-actionable");
    toast.dataset.cameraTarget = "";
    toast.classList.add("is-visible");

    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      toast.classList.remove("is-actionable");
      toast.dataset.cameraTarget = "";
    }, 3600);
  };

  const cameraTargets = {
    onsen: { x: 80, y: 200, message: "温泉の方で何かが始まったようです" },
    shrine: { x: 735, y: 515, message: "祠のあたりで小さな光が揺れています" },
    fortune: { x: 528, y: 290, message: "おみくじの看板がきらりと光りました" },
  };

  const moveCameraToWorldPoint = (worldX, worldY, duration = 1300) => {
    const next = getCameraForWorldPoint(worldX, worldY);
    animateCameraTo({ x: next.x, y: next.y, duration });
  };

  const revealWorldPointForTest = (worldX, worldY) => {
    if (state.intro || !state.enabled) {
      state.enabled = true;
      state.intro = false;
      document.body.classList.remove("camera-intro");
      document.body.classList.add("intro-finished");
    }

    moveCameraToWorldPoint(worldX, worldY, reduceMotion ? 1 : 700);
  };

  const showCameraNotice = (targetName) => {
    if (!toast || !cameraTargets[targetName]) {
      return;
    }

    const target = cameraTargets[targetName];

    toast.textContent = target.message;
    toast.dataset.cameraTarget = targetName;
    toast.classList.add("is-visible", "is-actionable");

    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.classList.remove("is-visible", "is-actionable");
      toast.dataset.cameraTarget = "";
    }, 6400);
  };

  const getCurrentBackgroundName = () => {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();

    if (minutes >= 6 * 60 && minutes < 16 * 60 + 30) {
      return "day";
    }

    if (minutes >= 16 * 60 + 30 && minutes < 17 * 60 + 30) {
      return "evening-a";
    }

    if (minutes >= 17 * 60 + 30 && minutes < 18 * 60) {
      return "evening-b";
    }

    return "night";
  };

  const playBackgroundVideo = (video) => {
    if (!video || reduceMotion) {
      return;
    }

    const playPromise = video.play();

    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  };

  const updateForestBgVideo = (timeName) => {
    const slot = backgroundSlots[timeName];

    if (!slot || forestBgVideos.length === 0) {
      return;
    }

    const visibleVideo = forestBgVideos[visibleBackgroundIndex] || forestBgVideos[0];

    if (visibleVideo && visibleVideo.dataset.currentSrc === slot.src) {
      playBackgroundVideo(visibleVideo);
      return;
    }

    const nextIndex = forestBgVideos.length > 1
      ? (visibleBackgroundIndex + 1) % forestBgVideos.length
      : visibleBackgroundIndex;
    const nextVideo = forestBgVideos[nextIndex];

    if (!nextVideo) {
      return;
    }

    if (nextVideo.dataset.currentSrc !== slot.src) {
      nextVideo.dataset.currentSrc = slot.src;
      nextVideo.src = slot.src;
      nextVideo.load();
    }

    playBackgroundVideo(nextVideo);
    nextVideo.classList.add("is-visible");

    if (visibleVideo && visibleVideo !== nextVideo) {
      visibleVideo.classList.remove("is-visible");
    }

    visibleBackgroundIndex = nextIndex;
  };

  const getTodayKey = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const isSuperMoonDay = () => {
    const today = getTodayKey();
    const storageKey = `teamerrySuperMoon:${today}`;

    try {
      const saved = window.localStorage.getItem(storageKey);

      if (saved) {
        return saved === "1";
      }

      const active = Math.random() < 0.04;
      window.localStorage.setItem(storageKey, active ? "1" : "0");

      return active;
    } catch (error) {
      return false;
    }
  };

  const getMoonPhaseName = () => {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();

    if (minutes >= 19 * 60 + 30 || minutes < 6 * 60) {
      return "full";
    }

    if (minutes >= 18 * 60) {
      return "half";
    }

    if (minutes >= 17 * 60 + 30) {
      return "crescent";
    }

    return "";
  };

  const updateMilkyWayEffect = (timeName) => {
    if (!milkyWay) {
      return;
    }

    milkyWay.classList.toggle("is-visible", timeName === "night");
  };

  const showSuperMoonNotice = () => {
    const today = getTodayKey();
    const storageKey = `teamerrySuperMoonNotice:${today}`;

    try {
      if (window.localStorage.getItem(storageKey) === "1") {
        return;
      }

      window.localStorage.setItem(storageKey, "1");
    } catch (error) {
      // The notice can still appear without storage.
    }

    showToast("今日はスーパームーンです。月がとても大きく見えます。");
    showNarration("今日はスーパームーンです。森の影まで、少し明るく見えます。");
  };

  const updateMoonEffect = () => {
    if (!moon) {
      return;
    }

    const phaseName = getMoonPhaseName();

    if (!phaseName) {
      moon.classList.remove("is-visible", "is-super");
      return;
    }

    const superMoon = isSuperMoonDay();
    const phase = moonPhases[superMoon ? "super" : phaseName];

    if (moon.dataset.currentSrc !== phase.src) {
      moon.dataset.currentSrc = phase.src;
      moon.src = phase.src;
    }

    moon.style.setProperty("--moon-size", `${phase.size}px`);
    moon.style.setProperty("--moon-opacity", phase.opacity);
    moon.classList.toggle("is-super", superMoon);
    moon.classList.add("is-visible");

    if (superMoon) {
      showSuperMoonNotice();
    }
  };

  const showDebugMoon = (phaseName = "full") => {
    if (!moon || !moonPhases[phaseName]) {
      return;
    }

    const phase = moonPhases[phaseName];
    moon.dataset.currentSrc = phase.src;
    moon.src = phase.src;
    moon.style.setProperty("--moon-size", `${phase.size}px`);
    moon.style.setProperty("--moon-opacity", phase.opacity);
    moon.classList.toggle("is-super", phaseName === "super");
    moon.classList.add("is-visible");
  };

  const showDebugMilkyWay = () => {
    if (!milkyWay) {
      return;
    }

    milkyWay.classList.add("is-visible");
  };

  const applyTimePreset = (forcedName = debugState.timeOverride) => {
    const automaticName = getCurrentBackgroundName();
    const name = timePresets[forcedName] ? forcedName : automaticName;
    const preset = timePresets[name];
    activeTimeName = name;
    updateForestBgVideo(name);

    scene.classList.remove("forest-time--day", "forest-time--evening-a", "forest-time--evening-b", "forest-time--night");
    scene.classList.add(`forest-time--${name}`);
    scene.style.setProperty("--mist-opacity", debugState.toggles.mist ? Math.max(preset.mist, 0.18) : preset.mist);
    scene.style.setProperty("--glow-boost", preset.glow);
    updateMilkyWayEffect(name);
    updateMoonEffect();
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
    setDebugTimer("onsenNotice", () => showCameraNotice("onsen"), debugState.fastMode ? 7000 : 18000);
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

  const flyAwayGroundBird = (bird) => {
    if (!bird || bird.classList.contains("is-flying")) {
      return;
    }

    window.clearTimeout(bird.leaveTimer);
    bird.classList.add("is-flying");
    bird.style.setProperty("--ground-bird-fly-x", `${randomBetween(-180, 180)}px`);
    bird.style.setProperty("--ground-bird-fly-y", `${randomBetween(-180, -104)}px`);
    playSoftTone(560, 0.08, 0.008);

    window.setTimeout(() => {
      groundBirds.delete(bird);
      bird.remove();
    }, 1800);
  };

  const spawnGroundBirdFlock = () => {
    if (!creatures || reduceMotion || groundBirds.size >= 6) {
      return;
    }

    const site = pick(groundBirdSites);
    const count = Math.min(6 - groundBirds.size, Math.floor(randomBetween(2, 5)));

    for (let i = 0; i < count; i += 1) {
      const bird = document.createElement("button");
      const body = document.createElement("span");
      const head = document.createElement("span");
      const crumb = document.createElement("span");
      const offsetX = randomBetween(-site.spreadX, site.spreadX);
      const offsetY = randomBetween(-site.spreadY, site.spreadY);
      const direction = Math.random() < 0.5 ? -1 : 1;
      const scale = site.scale * randomBetween(0.82, 1.12);

      bird.type = "button";
      bird.className = "forest-ground-bird";
      bird.tabIndex = -1;
      bird.setAttribute("aria-label", "餌をついばむ鳥");
      bird.style.setProperty("--ground-bird-x", `${site.x + offsetX}px`);
      bird.style.setProperty("--ground-bird-y", `${site.y + offsetY}px`);
      bird.style.setProperty("--ground-bird-scale", scale);
      bird.style.setProperty("--ground-bird-direction", direction);
      bird.style.setProperty("--ground-bird-delay", `${i * 170 + Math.abs(offsetX) * 2}ms`);
      bird.style.setProperty("--ground-bird-hop", `${randomBetween(3, 8)}px`);

      body.className = "forest-ground-bird__body";
      head.className = "forest-ground-bird__head";
      crumb.className = "forest-ground-bird__crumb";
      bird.append(body, head, crumb);
      creatures.append(bird);
      groundBirds.add(bird);

      bird.addEventListener("pointerenter", () => flyAwayGroundBird(bird));
      bird.addEventListener("click", (event) => {
        event.preventDefault();
        flyAwayGroundBird(bird);
      });

      bird.leaveTimer = window.setTimeout(() => {
        flyAwayGroundBird(bird);
      }, randomBetween(10500, 19000) + i * 280);
    }
  };

  const scheduleBird = (delay = getDebugDelay(24000, 62000, 3000, 5200)) => {
    setDebugTimer("bird", () => {
      if (Math.random() < 0.62) {
        spawnGroundBirdFlock();
      } else if (Math.random() < 0.72) {
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

  const spawnBottle = (routeName = "", isTest = false) => {
    if (!driftLayer) {
      return;
    }

    driftLayer.querySelectorAll(".bottle-mail").forEach((activeBottle) => activeBottle.remove());

    const route = bottleRoutes.find((item) => item.name === routeName) || pick(bottleRoutes);
    if (isTest) {
      revealWorldPointForTest(route.endX, route.endY);
    }

    const bottle = document.createElement("button");
    bottle.type = "button";
    bottle.className = "bottle-mail";
    bottle.setAttribute("aria-label", "流れてきたボトルメールを読む");
    bottle.style.setProperty("--bottle-start-x", `${route.startX}px`);
    bottle.style.setProperty("--bottle-start-y", `${route.startY}px`);
    bottle.style.setProperty("--bottle-mid-x", `${route.midX - route.startX}px`);
    bottle.style.setProperty("--bottle-mid-y", `${route.midY - route.startY}px`);
    bottle.style.setProperty("--bottle-early-x", `${(route.midX - route.startX) * 0.54}px`);
    bottle.style.setProperty("--bottle-early-y", `${(route.midY - route.startY) * 0.48}px`);
    bottle.style.setProperty("--bottle-end-x", `${route.endX - route.startX}px`);
    bottle.style.setProperty("--bottle-end-y", `${route.endY - route.startY}px`);
    bottle.style.setProperty("--bottle-start-tilt", `${route.startTilt + randomBetween(-4, 4)}deg`);
    bottle.style.setProperty("--bottle-mid-tilt", `${route.midTilt + randomBetween(-5, 5)}deg`);
    bottle.style.setProperty("--bottle-end-tilt", `${route.endTilt + randomBetween(-3, 3)}deg`);
    bottle.style.setProperty("--bottle-duration", `${reduceMotion ? 4 : isTest ? 7 : randomBetween(16, 23)}s`);
    driftLayer.append(bottle);

    bottle.addEventListener("click", (event) => {
      event.preventDefault();
      if (!bottle.classList.contains("is-arrived")) {
        return;
      }
      bottle.classList.add("is-opening");
      showBottleLetter(pick(bottleMessages));
      playSoftTone(660, 0.2, 0.012);
      window.setTimeout(() => bottle.remove(), 780);
    });
    bottle.addEventListener("animationend", () => {
      bottle.classList.add("is-arrived");
      bottle.setAttribute("aria-label", "漂着したボトルメールを開く");
      showToast("ボトルメールが流れ着きました。");
    }, { once: true });
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
        mist: "霧",
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
        spawnGroundBirdFlock();
      });
    }

    const moonButton = debugPanel.querySelector('[data-debug-action="moon"]');
    if (moonButton) {
      moonButton.addEventListener("click", () => {
        showDebugMoon("full");
        showToast("月レイヤーを表示しました。");
      });
    }

    const superMoonButton = debugPanel.querySelector('[data-debug-action="super-moon"]');
    if (superMoonButton) {
      superMoonButton.addEventListener("click", () => {
        showDebugMoon("super");
        showToast("今日はスーパームーンです。月がとても大きく見えます。");
      });
    }

    const milkyWayButton = debugPanel.querySelector('[data-debug-action="milkyway"]');
    if (milkyWayButton) {
      milkyWayButton.addEventListener("click", () => {
        showDebugMilkyWay();
        showToast("天の川レイヤーを表示しました。");
      });
    }

    const bottleButton = debugPanel.querySelector('[data-debug-action="bottle"]');
    if (bottleButton) {
      bottleButton.addEventListener("click", () => {
        spawnBottle("waterfall", true);
        showToast("ボトルメールを流しました。");
      });
    }

    const memoryEffectButton = debugPanel.querySelector('[data-debug-action="memory-effect"]');
    if (memoryEffectButton) {
      memoryEffectButton.addEventListener("click", () => {
        showMemoryEvent(window.innerWidth / 2, window.innerHeight / 2);
        showToast("雫エフェクトを表示しました。");
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

  resizeStage();
  runCameraIntro();

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

    if (event.pointerType === "mouse" && groundBirds.size) {
      groundBirds.forEach((bird) => {
        if (bird.classList.contains("is-flying")) {
          return;
        }

        const rect = bird.getBoundingClientRect();
        const birdX = rect.left + rect.width / 2;
        const birdY = rect.top + rect.height / 2;
        const distance = Math.hypot(event.clientX - birdX, event.clientY - birdY);

        if (distance < 82) {
          flyAwayGroundBird(bird);
        }
      });
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
    resizeStage();

    if (!state.enabled) {
      return;
    }

    syncWalkerEnabled();
    updateWalkerTargetFromScroll();
  });

  window.addEventListener("load", resizeStage);

  window.addEventListener("scroll", handleWalkerScroll, { passive: true });

  if (toast) {
    toast.addEventListener("click", () => {
      const target = cameraTargets[toast.dataset.cameraTarget];

      if (!target || state.intro) {
        return;
      }

      toast.classList.remove("is-visible", "is-actionable");
      toast.dataset.cameraTarget = "";
      moveCameraToWorldPoint(target.x, target.y);
    });
  }

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

  const onsenPortal = document.querySelector(".forest-portal--onsen");
  if (onsenPortal) {
    onsenPortal.addEventListener("pointerenter", () => {
      showCameraNotice("onsen");
    });
  }

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
