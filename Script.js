/* ====== Configuration ====== */
const CONFIG = {
  canvasWidth: 360,
  canvasHeight: 640,
  roadWidth: 260,
  laneCount: 3,
  initialSpeed: 2.0,      // base obstacle speed (pixels per frame unit)
  speedIncrease: 0.0008,  // how quickly speed grows per ms
  spawnInterval: 1000,    // initial ms between obstacle spawns
  minSpawnInterval: 380,
  spawnDecrease: 0.6,     // multiplier when lowering spawn interval (as difficulty)
  carWidth: 44,
  carHeight: 78,
  lanePadding: 12
};

/* ====== Canvas and drawing setup ====== */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const speedText = document.getElementById('speedText');
const overlay = document.getElementById('overlay');
const panelTitle = document.getElementById('panelTitle');
const panelText  = document.getElementById('panelText');
const btnStart = document.getElementById('btnStart');
const btnHow = document.getElementById('btnHow');
const leftBtn = document.getElementById('leftBtn');
const rightBtn = document.getElementById('rightBtn');
const muteBtn = document.getElementById('muteBtn');
const resetBtn = document.getElementById('resetBtn');
const touchControls = document.getElementById('touchControls');

let lastTime = 0;
let running = false;
let score = 0;
let speedMultiplier = 1.0;
let gameSpeed = CONFIG.initialSpeed;
let spawnTimer = 0;
let currentSpawnInterval = CONFIG.spawnInterval;
let obstacles = [];
let lanes = [];
let audioEnabled = false;

/* ====== Sound (optional, tiny beep using WebAudio) ====== */
let audioCtx;
function beep(freq=440, dur=0.08, vol=0.05){
  if(!audioEnabled) return;
  if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
  setTimeout(()=>o.stop(), dur*1000+20);
}

/* ====== Game objects ====== */
const road = {
  x: (CONFIG.canvasWidth - CONFIG.roadWidth)/2,
  y: 0,
  width: CONFIG.roadWidth,
  height: CONFIG.canvasHeight,
  lineWidth: 6
};

function computeLanes(){
  lanes = [];
  const laneW = CONFIG.roadWidth / CONFIG.laneCount;
  for(let i=0;i<CONFIG.laneCount;i++){
    const centerX = road.x + laneW*i + laneW/2;
    lanes.push(centerX);
  }
}
computeLanes();

/* Player car state (starts in middle lane) */
const player = {
  lane: Math.floor(CONFIG.laneCount/2),
  x: lanes[Math.floor(CONFIG.laneCount/2)],
  y: CONFIG.canvasHeight - CONFIG.carHeight - 22,
  targetX: null,
  width: CONFIG.carWidth,
  height: CONFIG.carHeight,
  color: '#4ec5ff'
};

/* Obstacle constructor */
function spawnObstacle(){
  // choose random lane not necessary to be different
  const lane = Math.floor(Math.random()*CONFIG.laneCount);
  const w = CONFIG.carWidth + (Math.random()*10 - 5);
  const h = CONFIG.carHeight * (0.7 + Math.random()*0.8);
  const x = lanes[lane];
  const y = -h - 10;
  const col = Math.random() < 0.15 ? '#ffb86b' : '#ff6b6b';
  obstacles.push({lane, x, y, w, h, col, passed:false});
}

/* ====== Controls ====== */
const keys = {};
window.addEventListener('keydown', e=>{
  keys[e.key.toLowerCase()] = true;
  if(!running && (e.key === ' ' || e.key.toLowerCase()==='arrowright' || e.key.toLowerCase()==='arrowleft')) {
    startGame();
  }
});
window.addEventListener('keyup', e=> keys[e.key.toLowerCase()] = false);

/* Touch buttons */
let leftHeld=false, rightHeld=false;
leftBtn.addEventListener('touchstart', e=>{e.preventDefault(); leftHeld=true});
leftBtn.addEventListener('touchend', e=>{e.preventDefault(); leftHeld=false});
rightBtn.addEventListener('touchstart', e=>{e.preventDefault(); rightHeld=true});
rightBtn.addEventListener('touchend', e=>{e.preventDefault(); rightHeld=false});

/* Mouse clicks on left/right half of canvas for desktop */
canvas.addEventListener('mousedown', e=>{
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  if(sx < rect.width/2) leftHeld=true; else rightHeld=true;
});
window.addEventListener('mouseup', ()=>{ leftHeld=false; rightHeld=false; });

/* Buttons */
btnStart.addEventListener('click', ()=> startGame());
btnHow.addEventListener('click', ()=> {
  panelTitle.textContent = 'How to play';
  panelText.textContent = 'Move left and right with ← → or A D. On mobile use the buttons. Avoid the obstacles as long as you can — score increases with time.';
});
muteBtn.addEventListener('click', ()=>{
  audioEnabled = !audioEnabled;
  muteBtn.textContent = audioEnabled ? 'Sound on' : 'Mute';
});
resetBtn.addEventListener('click', ()=> resetAll());

/* ====== Game loop & logic ====== */
function resetAll(){
  running = false;
  score = 0;
  gameSpeed = CONFIG.initialSpeed;
  speedMultiplier = 1.0;
  obstacles = [];
  currentSpawnInterval = CONFIG.spawnInterval;
  player.lane = Math.floor(CONFIG.laneCount/2);
  player.x = lanes[player.lane];
  overlay.style.display = 'flex';
  panelTitle.textContent = 'Top-down Car Dodger';
  panelText.textContent = 'Use ← → or A D to move. On mobile use the buttons. Avoid obstacles and get a high score!';
  btnStart.textContent = 'Start';
  scoreEl.textContent = '0';
  speedText.textContent = `Speed: ${speedMultiplier.toFixed(2)}x`;
  beep(220,0.04);
}

function startGame(){
  if(!audioCtx && audioEnabled) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  running = true;
  overlay.style.display = 'none';
  lastTime = performance.now();
  spawnTimer = 0;
  currentSpawnInterval = CONFIG.spawnInterval;
  obstacles = [];
  score = 0;
  gameSpeed = CONFIG.initialSpeed;
  speedMultiplier = 1.0;
  btnStart.textContent = 'Restart';
  beep(880,0.06,0.04);
  requestAnimationFrame(loop);
}

function endGame(){
  running = false;
  overlay.style.display = 'flex';
  panelTitle.textContent = 'Game Over';
  panelText.textContent = `Score: ${Math.floor(score)} — press Start to play again`;
  beep(120,0.2,0.07);
}

function loop(now){
  const dt = Math.min(30, now - lastTime); // clamp large dt
  lastTime = now;
  if(!running) return;

  // Controls: keyboard or held buttons
  const leftPressed = keys['arrowleft'] || keys['a'] || leftHeld;
  const rightPressed = keys['arrowright'] || keys['d'] || rightHeld;

  // Update player lane on input (instant lane switch for simplicity; smooth tween)
  if(leftPressed && player.lane > 0){
    player.lane--;
    beep(600,0.03,0.02);
    keys['arrowleft']=false; keys['a']=false; leftHeld=false;
  } else if(rightPressed && player.lane < CONFIG.laneCount-1){
    player.lane++;
    beep(600,0.03,0.02);
    keys['arrowright']=false; keys['d']=false; rightHeld=false;
  }
  // Smooth transition to target x
  player.targetX = lanes[player.lane];
  player.x += (player.targetX - player.x) * 0.25;

  // Increase difficulty gradually
  speedMultiplier += CONFIG.speedIncrease * dt;
  gameSpeed = CONFIG.initialSpeed * speedMultiplier;
  speedText.textContent = `Speed: ${speedMultiplier.toFixed(2)}x`;

  // Spawn obstacles
  spawnTimer += dt;
  if(spawnTimer >= currentSpawnInterval){
    spawnTimer = 0;
    spawnObstacle();
    // slowly reduce spawn interval to increase difficulty, but not too fast
    currentSpawnInterval = Math.max(CONFIG.minSpawnInterval, currentSpawnInterval - Math.random()*40 - speedMultiplier*2);
  }

  // Update obstacles
  for(let i=obstacles.length-1;i>=0;i--){
    const ob = obstacles[i];
    ob.y += gameSpeed + (i*0.01);
    // mark passed for scoring when it moves past player y
    if(!ob.passed && ob.y > player.y + player.height){
      ob.passed = true;
      score += 10;
      beep(1200,0.02,0.02);
    }
    // remove if off-screen
    if(ob.y > CONFIG.canvasHeight + 200) obstacles.splice(i,1);
  }

  // Update score continuously (time-based)
  score += dt * 0.01 * speedMultiplier;
  scoreEl.textContent = Math.floor(score);

  // Collision detection (AABB)
  for(const ob of obstacles){
    const obHalfW = ob.w/2;
    const obX = ob.x - obHalfW;
    const obY = ob.y;
    const obW = ob.w;
    const obH = ob.h;
    const plX = player.x - player.width/2;
    const plY = player.y;
    const plW = player.width;
    const plH = player.height;
    if(plX < obX + obW && plX + plW > obX && plY < obY + obH && plY + plH > obY){
      // collision!
      endGame();
      return;
    }
  }

  // Draw everything
  draw();

  requestAnimationFrame(loop);
}

/* ====== Drawing functions ====== */
function draw(){
  // clear
  ctx.clearRect(0,0,CONFIG.canvasWidth,CONFIG.canvasHeight);

  // background (sky gradient)
  const g = ctx.createLinearGradient(0,0,0,CONFIG.canvasHeight);
  g.addColorStop(0,'#07111a');
  g.addColorStop(1,'#091220');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,CONFIG.canvasWidth,CONFIG.canvasHeight);

  // road
  ctx.fillStyle = '#23272d';
  roundRect(ctx, road.x, road.y, road.width, road.height, 8, true, false);

  // side grass / shoulders
  ctx.fillStyle = '#091016';
  ctx.fillRect(0,0,road.x,CONFIG.canvasHeight);
  ctx.fillRect(road.x + road.width,0,CONFIG.canvasWidth - (road.x + road.width),CONFIG.canvasHeight);

  // lane separators (dashed)
  const laneW = CONFIG.roadWidth / CONFIG.laneCount;
  ctx.strokeStyle = '#dfe6ea55';
  ctx.lineWidth = 5;
  ctx.setLineDash([22,16]);
  for(let i=1;i<CONFIG.laneCount;i++){
    const lx = road.x + laneW * i;
    ctx.beginPath();
    ctx.moveTo(lx, -100 + (performance.now()*0.06 % 120));
    ctx.lineTo(lx, CONFIG.canvasHeight+100);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // moving center glow stripes to simulate motion
  for(let i=0;i<6;i++){
    const sx = road.x + road.width/2 + Math.sin((performance.now()*0.001 + i)*1.3)*(road.width*0.01);
    ctx.fillStyle = `rgba(255,255,255,${0.02 + (i%2)*0.02})`;
    ctx.fillRect(sx, (i*150 + (performance.now()*0.2 % 150))-80, 6, 120);
  }

  // obstacles
  obstacles.forEach(ob=>{
    ctx.save();
    const halfW = ob.w/2;
    ctx.translate(ob.x, ob.y);
    // simple car-like rectangle with small top angle
    ctx.fillStyle = ob.col;
    ctx.beginPath();
    roundedRectPath(ctx, -halfW, 0, ob.w, ob.h, 6);
    ctx.fill();

    // windows
    ctx.fillStyle = '#ffffff22';
    ctx.fillRect(-halfW + 6, ob.h*0.2, ob.w-12, ob.h*0.28);

    // wheels
    ctx.fillStyle = '#111';
    ctx.fillRect(-halfW+4, ob.h-8, 10, 5);
    ctx.fillRect(halfW-14, ob.h-8, 10, 5);

    ctx.restore();
  });

  // player car
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = player.color;
  roundedRectPath(ctx, -player.width/2, 0, player.width, player.height, 8);
  ctx.fill();

  // windows & stripes on player
  ctx.fillStyle = '#0a2534';
  ctx.fillRect(-player.width/2 + 8, player.height*0.18, player.width-16, player.height*0.3);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(-player.width/2 + 8, player.height*0.6, player.width-16, player.height*0.09);

  // wheels
  ctx.fillStyle = '#0b0b0b';
  ctx.fillRect(-player.width/2+6, player.height-10, 10, 6);
  ctx.fillRect(player.width/2-16, player.height-10, 10, 6);
  ctx.restore();

  // small HUD inside canvas (top-left)
  ctx.fillStyle = '#ffffffcc';
  ctx.font = '12px system-ui, Arial';
  ctx.fillText(`Score ${Math.floor(score)}`, 14, 20);
  ctx.fillText(`Speed ${speedMultiplier.toFixed(2)}x`, 14, 38);
}

/* helper: rounded rect path */
function roundedRectPath(ctx, x, y, w, h, r){
  const radius = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/* helper: draw rounded rect */
function roundRect(ctx, x, y, w, h, r, fill=true, stroke=true){
  roundedRectPath(ctx,x,y,w,h,r);
  if(fill) ctx.fill();
  if(stroke) ctx.stroke();
}

/* ====== Responsive scaling: keep canvas internal resolution fixed but CSS scales it
   to keep crisp drawing on devices with devicePixelRatio. ====== */
function resizeCanvasToDisplaySize(){
  const ratio = window.devicePixelRatio || 1;
  canvas.width = CONFIG.canvasWidth * ratio;
  canvas.height = CONFIG.canvasHeight * ratio;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
window.addEventListener('resize', ()=>{ resizeCanvasToDisplaySize(); computeLanes(); });
resizeCanvasToDisplaySize();

/* init */
resetAll();
