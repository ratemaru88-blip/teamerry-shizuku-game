(() => {
  "use strict";
  // Only these game scripts use this scheduler; browser/Forest APIs stay untouched.
  const native = {
    timeout: window.setTimeout.bind(window), clear: window.clearTimeout.bind(window),
    frame: window.requestAnimationFrame.bind(window), cancel: window.cancelAnimationFrame.bind(window),
    now: window.performance.now.bind(window.performance),
  };
  const timers = new Map(), frames = new Map(), audio = new Set(), reasons = new Set();
  const resumeLoops = new Set();
  let serial = 0, active = true, stopped = false, hooks = {};
  let frozenAt = 0, pausedAt = 0, offset = 0;
  const now = () => active ? native.now() - offset : frozenAt;
  const armTimer = (id, job) => {
    if (!active || job.handle !== null) return;
    job.due = native.now() + job.remaining;
    job.handle = native.timeout(() => {
      job.handle = null;
      if (!active || !timers.has(id)) return;
      if (!job.interval) timers.delete(id);
      else job.remaining = job.delay;
      try { job.callback(...job.args); }
      finally { if (job.interval && timers.has(id)) armTimer(id, job); }
    }, job.remaining);
  };
  const schedule = (callback, delay = 0, interval = false, args = []) => {
    const id = ++serial;
    if (stopped) return id;
    const job = {callback, args, interval, delay: Math.max(0, Number(delay) || 0),
      remaining: Math.max(0, Number(delay) || 0), handle: null};
    timers.set(id, job);
    armTimer(id, job);
    return id;
  };
  const clearTimer = id => {
    const job = timers.get(id);
    if (job) native.clear(job.handle);
    timers.delete(id);
  };
  const armFrame = (id, job) => {
    if (!active || job.handle !== null) return;
    job.handle = native.frame(() => {
      frames.delete(id);
      if (active) job.callback(now());
    });
  };
  const requestFrame = callback => {
    const id = ++serial;
    if (stopped) return id;
    const job = {callback, handle:null};
    frames.set(id, job);
    armFrame(id, job);
    return id;
  };
  const cancelFrame = id => {
    const job = frames.get(id);
    if (job) native.cancel(job.handle);
    frames.delete(id);
  };
  function trackAudio(element) {
    const play = element.play.bind(element);
    element.play = () => {
      audio.add(element);
      if (!active) return Promise.resolve();
      const pending = play();
      // Leaving can interrupt a pending play even when an existing SE caller ignores it.
      pending.catch(() => {});
      return pending;
    };
    element.addEventListener('ended', () => { audio.delete(element); resumeLoops.delete(element); });
    audio.add(element);
    return element;
  }
  function GameAudio(...args) { return trackAudio(new window.Audio(...args)); }
  const silence = () => {
    for (const element of audio) {
      if (!element.paused && element.loop) resumeLoops.add(element);
      element.pause();
      try { element.currentTime = 0; } catch {}
    }
  };
  const suspend = () => {
    if (!active) return;
    frozenAt = now(); pausedAt = native.now(); active = false;
    for (const job of timers.values()) {
      job.remaining = Math.max(0, job.due - pausedAt);
      native.clear(job.handle); job.handle = null;
    }
    for (const job of frames.values()) { native.cancel(job.handle); job.handle = null; }
    hooks.pause?.();
    silence();
  };
  const resume = () => {
    if (active || stopped || reasons.size) return;
    offset += native.now() - pausedAt; active = true;
    hooks.resume?.();
    for (const [id, job] of timers) armTimer(id, job);
    for (const [id, job] of frames) armFrame(id, job);
    for (const element of resumeLoops) element.play().catch(() => {});
    resumeLoops.clear();
  };
  const pauseGame = (reason = "view") => { reasons.add(reason); suspend(); };
  const resumeGame = (reason = "view") => { reasons.delete(reason); resume(); };
  const stopGame = () => {
    reasons.add("leave"); suspend(); stopped = true;
    timers.clear(); frames.clear(); resumeLoops.clear();
    hooks.stop?.(); silence(); resumeLoops.clear();
  };
  const startGame = () => {
    reasons.delete("leave");
    if (stopped) { stopped = false; hooks.restart?.(); }
    resume();
  };
  window.ShizukuLifecycle = Object.freeze({
    setTimeout: (fn, ms, ...args) => schedule(fn, ms, false, args),
    setInterval: (fn, ms, ...args) => schedule(fn, ms, true, args),
    clearTimeout: clearTimer, clearInterval: clearTimer,
    requestAnimationFrame: requestFrame, cancelAnimationFrame: cancelFrame,
    Audio: GameAudio, trackAudio, performance: Object.freeze({now}),
    pauseGame, resumeGame, stopGame, startGame,
    isRunning: () => active,
    bind(callbacks) { hooks = callbacks; if (!active) hooks.pause?.(); },
    snapshot: () => ({active, stopped, reasons:[...reasons], timers:timers.size, frames:frames.size,
      runningTimers:[...timers.values()].filter(job => job.handle !== null).length,
      runningFrames:[...frames.values()].filter(job => job.handle !== null).length,
      playingAudio:[...audio].filter(element => !element.paused).length}),
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame("hidden"); else resumeGame("hidden");
  });
  window.addEventListener("pagehide", event => {
    if (event.persisted) pauseGame("page"); else stopGame();
  });
  window.addEventListener("pageshow", () => { resumeGame("page"); startGame(); });
  document.addEventListener("click", event => {
    const link = event.target.closest?.("a[href]");
    if (!link || event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
      || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin || destination.pathname !== location.pathname || destination.search !== location.search) stopGame();
  });
  const view = document.getElementById('game-wrapper');
  if (view) {
    const syncView = () => {
      const visible = view.isConnected && !view.closest('[hidden]') && view.getClientRects().length > 0
        && getComputedStyle(view).visibility !== 'hidden';
      if (visible) resumeGame('view-hidden'); else pauseGame('view-hidden');
    };
    const observer = new MutationObserver(syncView);
    for (let node = view; node; node = node.parentElement) {
      observer.observe(node, {attributes:true, attributeFilter:['hidden','style','class'], childList:true});
    }
    syncView();
  }
  if (document.hidden) pauseGame("hidden");
})();
