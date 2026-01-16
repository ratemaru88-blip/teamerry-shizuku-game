const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// 上の皿＆プレビュー雫（HTML側）
const plateEl = document.getElementById("leafPlate") || document.getElementById("plate");
const previewEl = document.getElementById("previewDroplet") || document.getElementById("previewDropletImg");

// ない場合でも落ちないように保険
if (!plateEl || !previewEl) {
  console.warn("leafPlate / previewDroplet が見つかりません（index.htmlのid確認）");
}

// CanvasをCSS表示サイズに合わせる
function fitCanvas() {
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width);
  canvas.height = Math.round(r.height);
}
fitCanvas();
window.addEventListener("resize", fitCanvas);

const drop = {
  x: canvas.width / 2,
  y: 0,
  r: 12,
  vy: 0,
  state: "hold" // hold / fall
};

// “ほっと落ちる”落下
const GRAVITY = 0.015;
const MAX_VY  = 0.7;

// 風（揺れ）を少しだけ（欲しければ）
const WIND_CHANGE = 0.01;
const WIND_POWER  = 0.006;
const DRAG_X      = 0.985;
const MAX_VX      = 0.18;
let wind = 0;
let vx = 0;

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function clientXToCanvasX(clientX) {
  const r = canvas.getBoundingClientRect();
  const t = (clientX - r.left) / r.width;
  return t * canvas.width;
}

// HTMLプレビュー雫をXに合わせる（%で動かす）
function setPreviewX(xCanvas) {
  const p = (xCanvas / canvas.width) * 100;
  previewEl.style.left = `${p}%`; // CSSで translateX(-50%) 前提
}

// 皿の中心YをCanvas座標に変換して、落下開始位置にする
function getPlateStartY() {
  const pr = plateEl.getBoundingClientRect();
  const cr = canvas.getBoundingClientRect();
  const plateBottom = pr.bottom;
  const y = ((plateBottom - cr.top) / cr.height) * canvas.height;
  return y + 6; // 皿から少し下
}

// 入力：左右移動（hold中だけ）
canvas.addEventListener("pointermove", (e) => {
  if (drop.state !== "hold") return;
  const x = clientXToCanvasX(e.clientX);
  const margin = drop.r + 8;
  drop.x = clamp(x, margin, canvas.width - margin);
  setPreviewX(drop.x);
});

// 入力：タップで落下開始
canvas.addEventListener("pointerdown", (e) => {
  if (drop.state !== "hold") return;

  const x = clientXToCanvasX(e.clientX);
  const margin = drop.r + 8;
  drop.x = clamp(x, margin, canvas.width - margin);
  setPreviewX(drop.x);

  drop.y = getPlateStartY();
  drop.vy = 0;
  vx = 0;
  wind = 0;

  drop.state = "fall";
  previewEl.style.visibility = "hidden";
});

// 下の丸太ライン（簡易）※本物の当たり判定は後で
const FLOOR_Y = () => canvas.height - 90; // まずは見た目で調整

function update() {
  if (drop.state === "hold") {
    // hold中はCanvasには描かない（プレビューはHTMLで表示）
    return;
  }

  // そよ風（横に少し）
  wind += (Math.random() * 2 - 1) * WIND_CHANGE;
  wind = clamp(wind, -1, 1);
  vx = (vx + wind * WIND_POWER) * DRAG_X;
  vx = clamp(vx, -MAX_VX, MAX_VX);

  drop.x = clamp(drop.x + vx, drop.r + 8, canvas.width - (drop.r + 8));

  // 落下
  drop.vy = Math.min(MAX_VY, drop.vy + GRAVITY);
  drop.y += drop.vy;

  // 床に到達したら停止→次の雫へ（仮）
  const floor = FLOOR_Y();
  if (drop.y + drop.r >= floor) {
    drop.y = floor - drop.r;

    // 次の雫を上に戻す（仮）
    drop.state = "hold";
    previewEl.style.visibility = "visible";
    previewEl.style.left = "50%";
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (drop.state !== "fall") return;

  ctx.beginPath();
  ctx.arc(drop.x, drop.y, drop.r, 0, Math.PI * 2);
  ctx.fillStyle = "#6ec6ff";
  ctx.fill();
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}
loop();
