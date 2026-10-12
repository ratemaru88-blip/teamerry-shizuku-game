# Shizuku Game Lifecycle (2026-10-12)

## Cause and Scope

The game started Matter Runner/Render on load and had no page/view lifecycle. Main-game spawn timers, effect RAFs and bonus phase timers continued independently. Audio ownership included cloned bee buzz and bonus SE elements, which were not covered by the existing normal-game audio stop helper.

Only this game's `index.html`, `game.js`, `droplet-engine.js`, `bonus-game.js` and new `game-lifecycle.js` are changed. Neither Forest repository scripts nor this repository's `forest.js`/`forest.html`/sound settings are changed. Game content, difficulty, scores and bonus rules are unchanged.

## Resource Ownership

The three game scripts locally use the lifecycle scheduler, clock and Audio constructor. Native browser APIs are not replaced. Timeout/Interval and RAF handles are tracked, as are newly constructed and explicitly registered cloned Audio elements. Matter's native Runner/Render have explicit pause/resume hooks. Game audio is paused and rewound; asynchronous play rejection during exit is handled. Only loops which were playing before a pause resume; one-shot SE is not replayed.

`pauseGame(reason)` cancels all native handles but preserves remaining timer delays and queued frames. The game clock freezes, so hidden-tab time does not advance bonus phases or entity timers. `resumeGame(reason)` restarts only after all pause reasons are cleared. `stopGame()` also discards queued work, ends the bonus without its normal completion callback, clears queued tilt state and prevents later game-owned playback. `startGame()` resets game/extras after a stop without rerunning initialization or rebinding input listeners. Duplicate start/resume calls do not add loops.

Triggers: document `visibilitychange`; `pagehide` and `pageshow` (including BFCache); same-tab destination links; help open/close; and the game wrapper or its ancestors being hidden/removed. A future host can call the same API for additional view transitions. Bonus overlays remain part of the game, not an unrelated view. Initial hidden loading is also paused.

## Tests

Run `node tests/lifecycle.cjs` with Playwright on NODE_PATH. `SHIZUKU_TEST_BASE_URL` selects the published site; otherwise a temporary local static server is used and closed at completion. `SHIZUKU_TEST_ARTIFACTS` enables screenshots.

Deterministic policy tests cover remaining Timeout delays, Interval cancellation, RAF cancellation, frozen clock, overlapping pause reasons, stop/restart, duplicate scheduling and late Audio play. Native/non-game Audio and timers continue running during a game pause.

Chromium/Edge tests run desktop 1366x900 and touch/mobile 375x667. They verify Matter engine time stops, help and hidden views pause, hidden-tab handling, resumed input, real bonus BGM and falling-loop pause/exit, cloned audio silence, five restarts with exactly one of each of the four spawn timers, unchanged RAF handles after duplicate starts, Forest/observatory exit-link handling, pagehide and BFCache return, and no page errors.

Headless tab visibility varies by browser, so the hidden-tab test opens another tab and also exercises the exact visibility handler with a controlled hidden state. Physical iOS/Android audio output still merits a device check. Game sound is tested through media playback state rather than microphone recording. Forest ambient is protected by unchanged source and explicit non-game-resource isolation tests.

## Git Safety

Initial game status contained only untracked `assets/images/game_bg_A.jpg` and `forest.gdoc`. Both are preserved. The separate Forest checkout's existing 20 modified and 89 untracked path groups are preserved. Only lifecycle implementation, its wiring, this record and the test are staged. No force push or destructive Git commands are used.
