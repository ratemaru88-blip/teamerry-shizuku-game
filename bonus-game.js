(() => {
  'use strict';

  /* =====================================================
     画像パス（charIndex 順 = dropletTypes と同じ順番）
     0:kakao 1:pakku 2:peapea 3:tyokopa 4:hoippu 5:tyatyajii 6:minto
  ===================================================== */
  const TOBIDASU = [
    'assets/images/kakao_tobidasu_1.webp',
    'assets/images/pakku_tobidasu_1.webp',
    'assets/images/peapea_tobidasu_1.webp',
    'assets/images/tyokopa_tobidasu_1.webp',
    'assets/images/hoippu_tobidasu_1.webp',
    'assets/images/tyatyajii_tobidasu_1.webp',
    'assets/images/minto_tobidasu_1.webp',
  ];

  const BG_SRC     = 'assets/images/Bonus Game_haikei.webp';
  const LOGO_SRC   = 'assets/images/BonusGame_logo.webp';
  const ACORN_SRC  = 'assets/images/donguri_1.webp';
  const BASKET_SRC = 'assets/images/kago.webp';
  const GROUND_SRC = 'assets/images/G_anderbar.webp';
  const HAT_R_SRC  = 'assets/images/ari_hata_R.webp';
  const ANT_R1     = 'assets/images/ant_R_1.webp';
  const ANT_R2     = 'assets/images/ant_R_2.webp';

  /* =====================================================
     サウンド
  ===================================================== */
  function mkAudio(src, loop = false, vol = 0.6) {
    const a = new Audio(src);
    a.loop = loop;
    a.volume = vol;
    a.preload = 'auto';
    return a;
  }

  const SND = {
    tobidasu : mkAudio('assets/sounds/tobidasu.mp3',       false, 0.8),
    kaisi    : mkAudio('assets/sounds/bonus_kaisi.mp3',    false, 0.8),
    bgm      : mkAudio('assets/sounds/BonusGame_BGM.mp3',  true,  0.5),
    get      : mkAudio('assets/sounds/donguri_get_B.mp3',  false, 0.7),
    sippai   : mkAudio('assets/sounds/donguri_sippai.mp3', false, 0.7),
    hoissuru : mkAudio('assets/sounds/hoissuru.mp3',       false, 0.7),
    march    : mkAudio('assets/sounds/leaf_soft.mp3',      true,  0.22),
  };

  function playSnd(key) {
    const s = SND[key]; if (!s) return;
    try { s.currentTime = 0; s.play(); } catch (_) {}
  }
  function stopSnd(key) {
    const s = SND[key]; if (!s) return;
    try { s.pause(); s.currentTime = 0; } catch (_) {}
  }
  function stopAllSnd() {
    Object.keys(SND).forEach(stopSnd);
  }

  /* =====================================================
     定数
  ===================================================== */
  const TOTAL       = 20;
  const BONUS_PT    = 50;
  const ACORN_W     = 25;
  const BASKET_W    = 37;
  const BASKET_H    = 15;
  const GROUND_W_RATIO = 0.92;
  const GROUND_H    = 38;
  const GROUND_Y_OFFSET = -8;
  const BASKET_TO_GROUND_GAP = 44;
  const FALL_SPEED  = 3.2;
  const SPAWN_MS    = 460;

  /* =====================================================
     状態変数
  ===================================================== */
  let _phase    = 'idle';
  let _overlay  = null;
  let _charIdx  = 0;
  let _onFinish = null;

  // playing
  let _playEl    = null;
  let _acornLyr  = null;
  let _antLyr    = null;
  let _basketEl  = null;
  let _groundEl  = null;
  let _ctrEl     = null;
  let _iconsEl   = null;
  let _acorns    = [];
  let _spawned   = 0;
  let _caught    = 0;
  let _W         = 0;
  let _H         = 0;
  let _baskX     = 0;
  let _baskY     = 0;
  let _gndY      = 0;
  let _ended     = false;
  let _lastSpawn = 0;
  let _raf       = 0;

  /* =====================================================
     オーバーレイ管理
  ===================================================== */
  function getGameFrame() {
    return document.querySelector('.game-frame') || document.body;
  }

  function ensureOverlay() {
    if (_overlay) return;
    _overlay = document.createElement('div');
    _overlay.id = 'bonusOverlay';
    _overlay.className = 'bns-overlay';
    getGameFrame().appendChild(_overlay);
  }

  function showOverlay(show) {
    if (!_overlay) return;
    _overlay.style.display = show ? 'flex' : 'none';
  }

  function clearOverlay() {
    if (_overlay) _overlay.innerHTML = '';
  }

  function setOverlayStyle(bg, justify) {
    if (!_overlay) return;
    _overlay.style.background       = bg;
    _overlay.style.justifyContent   = justify || 'center';
    _overlay.style.flexDirection    = 'column';
    _overlay.style.alignItems       = 'center';
  }

  /* =====================================================
     フェーズ 1 ― キャラ飛び出し
  ===================================================== */
  function phaseCharPopup() {
    _phase = 'charPopup';
    ensureOverlay();
    clearOverlay();
    setOverlayStyle('rgba(10,35,15,0.93)', 'center');
    showOverlay(true);

    const img = document.createElement('img');
    img.src = TOBIDASU[_charIdx] ?? TOBIDASU[0];
    img.className = 'bns-char-img';
    _overlay.appendChild(img);

    playSnd('tobidasu');
    setTimeout(() => { if (_phase === 'charPopup') phaseLogo(); }, 1500);
  }

  /* =====================================================
     フェーズ 2 ― ロゴ表示
  ===================================================== */
  function phaseLogo() {
    _phase = 'logo';
    clearOverlay();
    setOverlayStyle('rgba(10,35,15,0.93)', 'center');

    const img = document.createElement('img');
    img.src = LOGO_SRC;
    img.className = 'bns-logo-img';
    _overlay.appendChild(img);

    playSnd('kaisi');
    setTimeout(() => { if (_phase === 'logo') phasePlay(); }, 1700);
  }

  /* =====================================================
     フェーズ 3 ― ゲームプレイ
  ===================================================== */
  function phasePlay() {
    _phase = 'playing';
    _acorns = []; _spawned = 0; _caught = 0;
    _ended = false; _lastSpawn = 0;

    clearOverlay();
    setOverlayStyle('transparent', 'flex-start');
    _overlay.style.padding = '0';

    /* プレイエリア */
    _playEl = document.createElement('div');
    _playEl.className = 'bns-play-area';

    /* 背景 */
    const bg = document.createElement('img');
    bg.src = BG_SRC;
    bg.className = 'bns-bg';
    _playEl.appendChild(bg);

    /* UI（上部） */
    const ui = document.createElement('div');
    ui.className = 'bns-ui';

    _iconsEl = document.createElement('div');
    _iconsEl.className = 'bns-acorn-icons';
    for (let i = 0; i < TOTAL; i++) {
      const ic = document.createElement('img');
      ic.src = ACORN_SRC;
      ic.className = 'bns-acorn-ic empty';
      _iconsEl.appendChild(ic);
    }

    _ctrEl = document.createElement('div');
    _ctrEl.className = 'bns-counter';
    _ctrEl.textContent = `0 / ${TOTAL}`;

    ui.appendChild(_iconsEl);
    ui.appendChild(_ctrEl);
    _playEl.appendChild(ui);

    /* cup-line の位置に置く地面バー */
    _groundEl = document.createElement('img');
    _groundEl.src = GROUND_SRC;
    _groundEl.className = 'bns-ground';
    _playEl.appendChild(_groundEl);

    /* どんぐりレイヤー */
    _acornLyr = document.createElement('div');
    _acornLyr.className = 'bns-acorn-layer';
    _playEl.appendChild(_acornLyr);

    /* アリレイヤー */
    _antLyr = document.createElement('div');
    _antLyr.className = 'bns-acorn-layer'; /* same absolute-inset style */
    _playEl.appendChild(_antLyr);

    /* カゴ */
    _basketEl = document.createElement('img');
    _basketEl.src = BASKET_SRC;
    _basketEl.className = 'bns-basket';
    _playEl.appendChild(_basketEl);

    _overlay.appendChild(_playEl);

    /* ポインター操作 */
    _overlay.addEventListener('pointermove', _onPtr, { passive: true });
    _overlay.addEventListener('pointerdown', _onPtr, { passive: true });

    playSnd('bgm');

    /* サイズ確定後にゲーム開始 */
    requestAnimationFrame(() => {
      const r = _playEl.getBoundingClientRect();
      _W = r.width  || 360;
      _H = r.height || 620;
      _baskX = _W / 2;
      _gndY = _getCupLineGroundY();
      _baskY = _gndY - BASKET_TO_GROUND_GAP;
      _updateCatcher();
      _raf = requestAnimationFrame(_gameLoop);
    });
  }

  function _getCupLineGroundY() {
    const line = document.querySelector('.cup-line');
    if (!_playEl || !line) return _H - 64;

    const playRect = _playEl.getBoundingClientRect();
    const lineRect = line.getBoundingClientRect();
    if (!playRect.height || !lineRect.height) return _H - 64;

    return lineRect.top - playRect.top + lineRect.height * 0.35 + GROUND_Y_OFFSET;
  }

  function _onPtr(e) {
    if (_phase !== 'playing' || !_playEl) return;
    if (_ended) return;
    const r = _playEl.getBoundingClientRect();
    const rx = e.clientX - r.left;
    _baskX = Math.max(BASKET_W / 2, Math.min(_W - BASKET_W / 2, rx));
    _updateCatcher();
  }

  function _updateCatcher() {
    if (_groundEl) {
      const groundW = _W * GROUND_W_RATIO;
      _groundEl.style.left = `${(_W - groundW) / 2}px`;
      _groundEl.style.top = `${_gndY - GROUND_H * 0.35}px`;
      _groundEl.style.width = `${groundW}px`;
      _groundEl.style.height = `${GROUND_H}px`;
    }

    if (_basketEl) {
      _basketEl.style.left = `${_baskX - BASKET_W / 2}px`;
      _basketEl.style.top  = `${_baskY}px`;
    }
  }

  function _spawnAcorn() {
    const margin = ACORN_W + 8;
    const x = margin + Math.random() * (_W - margin * 2);
    const el = document.createElement('img');
    el.src = ACORN_SRC;
    el.className = 'bns-acorn';
    el.style.left = `${x - ACORN_W / 2}px`;
    el.style.top  = `-${ACORN_W}px`;
    _acornLyr.appendChild(el);
    _acorns.push({ el, x, y: -ACORN_W, state: 'fall' });
    _spawned++;
  }

  function _updateIcons() {
    if (_ctrEl) _ctrEl.textContent = `${_caught} / ${TOTAL}`;
    if (!_iconsEl) return;
    const icons = _iconsEl.querySelectorAll('.bns-acorn-ic');
    icons.forEach((ic, i) => {
      if (i < _caught && ic.classList.contains('empty')) {
        ic.classList.remove('empty');
        ic.classList.add('filled');
      }
    });
  }

  function _gameLoop(now) {
    if (_phase !== 'playing') return;

    /* スポーン */
    if (_spawned < TOTAL) {
      if (!_lastSpawn || now - _lastSpawn >= SPAWN_MS) {
        _lastSpawn = now;
        _spawnAcorn();
      }
    }

    /* どんぐり更新 */
    for (const ac of _acorns) {
      if (ac.state !== 'fall') continue;

      ac.y += FALL_SPEED;
      ac.el.style.top = `${ac.y - ACORN_W / 2}px`;

      const acBottom = ac.y + ACORN_W / 2;

      /* カゴ衝突 */
      if (
        !_ended &&
        acBottom >= _baskY &&
        acBottom <= _baskY + BASKET_H * 0.6 &&
        ac.x - ACORN_W / 2 < _baskX + BASKET_W / 2 &&
        ac.x + ACORN_W / 2 > _baskX - BASKET_W / 2
      ) {
        ac.state = 'caught';
        ac.el.style.display = 'none';
        _caught++;
        _updateIcons();
        const s = SND.get.cloneNode(true);
        s.volume = 0.7;
        try { s.play(); } catch (_) {}
        continue;
      }

      /* 地面到達 → ミス */
      if (acBottom >= _gndY) {
        ac.state = 'ground';
        ac.y = _gndY - ACORN_W / 2;
        ac.el.style.top = `${ac.y - ACORN_W / 2}px`;
        if (!_ended) {
          _ended = true;
          _overlay.removeEventListener('pointermove', _onPtr);
          _overlay.removeEventListener('pointerdown', _onPtr);
          stopSnd('bgm');
          playSnd('sippai');
        }
      }
    }

    /* 全解決チェック */
    const allDone = _spawned >= TOTAL && _acorns.every(a => a.state !== 'fall');
    if (allDone) {
      cancelAnimationFrame(_raf);
      _overlay.removeEventListener('pointermove', _onPtr);
      _overlay.removeEventListener('pointerdown', _onPtr);
      if (_basketEl) _basketEl.style.display = 'none';
      setTimeout(phaseCleanup, 900);
      return;
    }

    _raf = requestAnimationFrame(_gameLoop);
  }

  /* =====================================================
     フェーズ 4 ― アリ清掃
  ===================================================== */
  function phaseCleanup() {
    if (_phase === 'idle') return;
    _phase = 'cleanup';

    const groundAcorns = _acorns.filter(a => a.state === 'ground');

    if (groundAcorns.length === 0) {
      /* 全部とった → すぐスコア */
      setTimeout(phaseScore, 600);
      return;
    }

    /* ホイッスル → 行進 */
    playSnd('hoissuru');
    setTimeout(() => {
      if (_phase !== 'cleanup') return;
      playSnd('march');
      _startMarch(groundAcorns);
    }, 900);
  }

  function _startMarch(gAcorns) {
    /* 左から右へ行進。先頭＋ワーカー＋最後尾アリ */
    const sorted    = [...gAcorns].sort((a, b) => a.x - b.x);
    const antCount  = Math.max(3, Math.min(sorted.length + 2, 8));
    const GAP       = 34;
    const antFloorY = _gndY - 28;

    const ants = [];

    for (let i = 0; i < antCount; i++) {
      const isLeader = i === 0;
      const isLast   = i === antCount - 1;

      const wrap = document.createElement('div');
      wrap.style.cssText = `position:absolute; left:0; top:${antFloorY}px; width:${isLast ? 82 : 34}px; height:32px; pointer-events:none;`;

      const img = document.createElement('img');
      img.src   = ANT_R1;
      img.style.cssText = 'position:absolute; left:4px; bottom:0; width:24px; height:auto; display:block;';
      wrap.appendChild(img);

      let flag = null;
      if (isLeader) {
        flag = document.createElement('img');
        flag.src = HAT_R_SRC;
        flag.style.cssText = 'position:absolute; left:14px; bottom:10px; width:16px; height:auto; display:block; transform:rotate(-7deg); transform-origin:8px 24px;';
        wrap.appendChild(flag);
      }

      const carry = document.createElement('img');
      carry.src = ACORN_SRC;
      carry.style.cssText = 'position:absolute; left:5px; bottom:14px; width:15px; height:auto; display:none; transform:rotate(-12deg); filter:drop-shadow(0 1px 2px rgba(0,0,0,0.25));';
      wrap.appendChild(carry);

      const helpers = [];
      if (isLast) {
        for (let h = 0; h < 2; h++) {
          const helper = document.createElement('img');
          helper.src = ANT_R1;
          helper.style.cssText = `position:absolute; left:${-12 - h * 11}px; bottom:${h % 2}px; width:22px; height:auto; display:none;`;
          wrap.appendChild(helper);
          helpers.push(helper);
        }
      }

      const pile = document.createElement('div');
      pile.style.cssText = 'position:absolute; left:22px; bottom:1px; width:52px; height:26px; display:none;';
      wrap.appendChild(pile);

      _antLyr.appendChild(wrap);

      ants.push({
        el: wrap, img, flag, carry, helpers, pile,
        x: -70 - i * GAP,
        isLeader, isLast,
        frame: 0, lastFrameAt: 0,
        targetAcorn: null,
        acornPicked: false,
        pileAcorns: [],
        pilePicked: false,
      });
    }

    /* ワーカーにどんぐりを割り当て */
    const workers = ants.filter(a => !a.isLeader && !a.isLast);
    workers.forEach((ant, i) => { ant.targetAcorn = sorted[i] ?? null; });
    const lastAnt = ants.find(a => a.isLast);
    if (lastAnt) lastAnt.pileAcorns = sorted.slice(workers.length);

    const loop = (now) => {
      if (_phase !== 'cleanup') return;

      let allOut = true;

      ants.forEach((ant) => {
        /* 速度：最後尾は周期的に遅れてから猛ダッシュ */
        let spd = 1.25;
        if (ant.isLast) {
          const t = (now * 0.0012) % (Math.PI * 2);
          spd = t < Math.PI * 0.65 ? 0.55 : 2.2;
        }

        ant.x += spd;
        ant.el.style.left = `${ant.x}px`;

        /* フレームアニメ（リーダー以外） */
        if (!ant.isLeader && now - ant.lastFrameAt >= 110) {
          ant.frame ^= 1;
          ant.lastFrameAt = now;
          ant.img.src = ant.frame ? ANT_R2 : ANT_R1;
          if (ant.carry && ant.acornPicked) {
            ant.carry.style.bottom = `${14 + (ant.frame ? 1 : 0)}px`;
          }
          if (ant.helpers?.length) {
            ant.helpers.forEach((helper) => {
              helper.src = ant.frame ? ANT_R2 : ANT_R1;
            });
          }
        }

        /* どんぐりをピックアップ */
        if (ant.targetAcorn && !ant.acornPicked) {
          if (ant.x + 14 >= ant.targetAcorn.x) {
            ant.acornPicked = true;
            ant.targetAcorn.el.style.display = 'none';
            if (ant.carry) ant.carry.style.display = 'block';
          }
        }

        /* 残ったどんぐりは最後尾アリがまとめて押して運ぶ */
        if (ant.isLast && ant.pileAcorns?.length && !ant.pilePicked) {
          const firstPileX = ant.pileAcorns[0].x;
          if (ant.x + 22 >= firstPileX) {
            ant.pilePicked = true;
            ant.pileAcorns.forEach((ac) => {
              ac.el.style.display = 'none';
            });

            const showCount = Math.min(ant.pileAcorns.length, 10);
            for (let j = 0; j < showCount; j++) {
              const p = document.createElement('img');
              p.src = ACORN_SRC;
              p.style.cssText =
                `position:absolute; left:${4 + (j % 5) * 8}px; bottom:${1 + Math.floor(j / 5) * 7 + (j % 2)}px; width:14px; height:auto; transform:rotate(${j % 2 ? 10 : -8}deg); filter:drop-shadow(0 1px 2px rgba(0,0,0,0.24));`;
              ant.pile.appendChild(p);
            }

            ant.pile.style.display = 'block';
            ant.helpers.forEach((helper) => { helper.style.display = 'block'; });
          }
        }

        if (ant.x < _W + 90) allOut = false;
      });

      if (allOut) {
        stopSnd('march');
        setTimeout(phaseScore, 500);
        return;
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }

  /* =====================================================
     フェーズ 5 ― スコア表示
  ===================================================== */
  function phaseScore() {
    if (_phase === 'idle') return;
    _phase = 'score';
    stopSnd('bgm');
    stopSnd('march');

    const pts = _caught * BONUS_PT;
    clearOverlay();
    setOverlayStyle('rgba(10,35,15,0.92)', 'center');

    const box = document.createElement('div');
    box.className = 'bns-score-box';

    const t1 = document.createElement('div');
    t1.className = 'bns-score-title';
    t1.textContent = 'BONUS!';

    const t2 = document.createElement('div');
    t2.className = 'bns-score-count';
    t2.textContent = `${_caught} / ${TOTAL}`;

    const t3 = document.createElement('div');
    t3.className = 'bns-score-pts';
    t3.textContent = `+ ${pts} pt`;

    box.appendChild(t1);
    box.appendChild(t2);
    box.appendChild(t3);
    _overlay.appendChild(box);

    setTimeout(() => _finish(pts), 2400);
  }

  /* =====================================================
     終了
  ===================================================== */
  function _finish(pts) {
    _phase = 'idle';
    stopAllSnd();
    cancelAnimationFrame(_raf);
    if (_overlay) {
      _overlay.removeEventListener('pointermove', _onPtr);
      _overlay.removeEventListener('pointerdown', _onPtr);
    }
    clearOverlay();
    showOverlay(false);
    if (typeof _onFinish === 'function') _onFinish(pts);
  }

  /* =====================================================
     公開 API
  ===================================================== */
  window.BonusGame = {
    start(charIdx, onFinish) {
      if (_phase !== 'idle') return false;
      _charIdx  = charIdx;
      _onFinish = onFinish;
      phaseCharPopup();
      return true;
    },
    stop() {
      _finish(0);
    },
    isRunning() { return _phase !== 'idle'; },
  };

})();
