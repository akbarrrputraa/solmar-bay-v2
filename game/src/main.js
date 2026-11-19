// Solmar Bay 2 — main: boot, game loop, chase camera, world rendering,
// menus, and the screenshot/test hooks. Every system is wired here through
// the shared state object G.

import { createRenderer } from './engine3d.js';
import { buildCity, collideBuildings } from './city.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createPlayer, updatePlayerOnFoot, updatePlayerCar, enterCar, exitCar, nearestCar, makeCar, carTopSpeed, allCars } from './player.js';
import { spawnTraffic, spawnPedestrians, updateTraffic, updatePedestrians } from './traffic.js';
import { addWanted, updatePolice } from './police.js';
import { createCombat, fireWeapon, switchWeapon, updateEnemies, updatePickups, aimHeading } from './combat.js';
import { startMission, updateMissions, restartMission } from './missions.js';
import { createHud } from './hud.js';
import { hasSave, saveGame, loadSave, applySave } from './save.js';
import { LANDMARKS, WORLD, MISSIONS } from './config.js';

window.__ERRORS__ = [];
window.addEventListener('error', (e) => window.__ERRORS__.push(String(e.message || e.error)));
const _consoleError = console.error.bind(console);
console.error = (...args) => { window.__ERRORS__.push(args.map(String).join(' ')); _consoleError(...args); };

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
renderer.resize();
window.addEventListener('resize', () => renderer.resize());

const G = {
  mode: 'title',
  time: 0,
  city: buildCity(),
  player: createPlayer(0, 600),
  cars: { parked: [], traffic: [], cops: [] },
  peds: [], enemies: [], pickups: [],
  particles: [], tracers: [],
  heli: null, roadblocks: [],
  mission: null,
  camera: { x: 0, y: 8, z: 580, yaw: 0, pitch: 0.18, dist: 12, height: 6.5 },
  input: createInput(),
  audio: createAudio(),
  combat: createCombat(),
  gunfireAt: null,
  hudDirty: true,
  garageOpen: false,
  lastAutosave: 0,
  lastMissionsDone: 0,
};
G.renderer = renderer;

// --- cross-system callbacks (systems call these on G) --------------------
G.addWanted = (n) => addWanted(G, n);
G.toast = (title, sub, seconds) => hud.showToast(title, sub, seconds);
G.addParticles = (x, z, y, count, color) => {
  for (let i = 0; i < count; i++) {
    G.particles.push({
      x: x + (Math.random() - 0.5) * 2, y: (y || 1) + Math.random() * 2, z: z + (Math.random() - 0.5) * 2,
      vx: (Math.random() - 0.5) * 8, vy: Math.random() * 6 + 2, vz: (Math.random() - 0.5) * 8,
      life: 0.7 + Math.random() * 0.5, maxLife: 1.2, color, size: 0.5 + Math.random() * 0.8,
    });
  }
};
G.addTracer = (x1, z1, x2, z2) => {
  G.tracers.push({ x1, z1, x2, z2, life: 0.12 });
};
G.onBusted = () => {
  if (G.mode !== 'playing') return;
  const p = G.player;
  const fine = Math.max(50, Math.floor(p.cash * 0.2));
  p.cash -= fine;
  p.health = 100; p.armor = 0; p.wanted = 0; p.heat = 0;
  G.cars.cops = []; G.heli = null; G.roadblocks = [];
  if (p.car) { exitCar(G); }
  p.x = LANDMARKS.hospital[0]; p.z = LANDMARKS.hospital[1] + 30;
  G.audio.sfx.busted();
  G.audio.sirenStop();
  restartMission(G);
  G.mode = 'busted';
  showOverlay('busted');
};
G.onWasted = () => {
  if (G.mode !== 'playing') return;
  const p = G.player;
  const bill = Math.max(50, Math.floor(p.cash * 0.15));
  p.cash -= bill;
  p.health = 100; p.armor = 0; p.wanted = 0; p.heat = 0;
  G.cars.cops = []; G.heli = null; G.roadblocks = [];
  if (p.car) { exitCar(G); }
  p.x = LANDMARKS.hospital[0]; p.z = LANDMARKS.hospital[1] + 30;
  G.audio.sfx.fail();
  G.audio.sirenStop();
  restartMission(G);
  G.mode = 'wasted';
  showOverlay('wasted');
};
G.onGameComplete = () => {
  saveGame(G);
  G.mode = 'complete';
  document.getElementById('completeText').textContent =
    `All 8 missions done — $${G.player.cash.toLocaleString('en-US')} in the pocket, ${G.player.respect} respect on the streets. The yacht is waiting at the marina. Solmar Bay is yours, Rico.`;
  showOverlay('complete');
};

const hud = createHud(G);

// --- parked cars -----------------------------------------------------------
function spawnParkedCars() {
  const spots = [
    [70, 0, 0], [-70, 140, 1], [140, -70, 2], [-140, -140, 3], [210, 70, 4],
    [0, 210, 5], [-210, 0, 0], [280, -140, 2], [-280, 280, 3], [70, -280, 1],
    [350, 140, 5], [-350, -70, 4], [420, 70, 2], [-70, 420, 0], [140, 350, 3],
  ];
  for (const [x, z, model] of spots) {
    const car = makeCar(x, z, Math.random() * Math.PI * 2, model, 'parked');
    G.cars.parked.push(car);
  }
  // The player's starter ride at the pier.
  const starter = makeCar(8, 600, Math.PI, 2, 'parked');
  G.cars.parked.push(starter);
}
spawnParkedCars();
spawnTraffic(G, 14);
spawnPedestrians(G, 22);

// --- overlays / menus ------------------------------------------------------
const overlays = ['title', 'howto', 'pause', 'busted', 'wasted', 'complete'];
function showOverlay(id) {
  for (const o of overlays) document.getElementById(o).classList.toggle('hidden', o !== id);
  document.getElementById('hud').style.visibility = id === 'title' || id === 'howto' ? 'hidden' : 'visible';
}
function hideOverlays() {
  for (const o of overlays) document.getElementById(o).classList.add('hidden');
  document.getElementById('hud').style.visibility = 'visible';
}
function startPlaying(fresh) {
  hideOverlays();
  G.mode = 'playing';
  G.audio.resume();
  G.audio.radioStart();
  if (fresh) {
    G.player = createPlayer(0, 600);
    G.mission = null;
    startMission(G, 0);
  } else if (!G.mission) {
    startMission(G, G.player.missionsDone);
  }
  saveGame(G);
}
document.getElementById('btnNew').onclick = () => { G.audio.resume(); startPlaying(true); };
document.getElementById('btnContinue').onclick = () => {
  const data = loadSave();
  if (data) {
    const idx = applySave(G, data);
    startPlaying(false);
    if (idx < MISSIONS.length) startMission(G, idx);
    G.toast('WELCOME BACK, RICO', 'Your save was loaded — the city kept your money.');
  } else {
    startPlaying(true);
  }
};
document.getElementById('btnHow').onclick = () => showOverlay('howto');
document.getElementById('btnHowBack').onclick = () => showOverlay('title');
document.getElementById('btnResume').onclick = () => { hideOverlays(); G.mode = 'playing'; };
document.getElementById('btnSave').onclick = () => {
  if (saveGame(G)) hud.showToast('GAME SAVED', 'Progress is safe. Keep the engine warm.');
  else hud.showToast('SAVE FAILED', 'Browser storage is unavailable.');
};
document.getElementById('btnRestart').onclick = () => { hideOverlays(); G.mode = 'playing'; restartMission(G); };
document.getElementById('btnQuit').onclick = () => { saveGame(G); G.mode = 'title'; showOverlay('title'); refreshTitleButtons(); };
document.getElementById('btnBustedOk').onclick = () => { hideOverlays(); G.mode = 'playing'; };
document.getElementById('btnWastedOk').onclick = () => { hideOverlays(); G.mode = 'playing'; };
document.getElementById('btnFreeRoam').onclick = () => { hideOverlays(); G.mode = 'playing'; };
document.getElementById('btnGarageClose').onclick = () => { hud.closeGarage(); G.garageOpen = false; };
function refreshTitleButtons() {
  document.getElementById('btnContinue').style.display = hasSave() ? '' : 'none';
}
refreshTitleButtons();

// --- camera ------------------------------------------------------------------
function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

function updateCamera(dt) {
  const p = G.player;
  const targetYaw = p.heading;
  G.camera.yaw = angleLerp(G.camera.yaw, targetYaw, dt * (p.car ? 2.2 : 3.2));
  const dist = p.car ? 17 : 12;
  const height = p.car ? 7.5 : 6.5;
  const fx = Math.sin(G.camera.yaw), fz = Math.cos(G.camera.yaw);
  const tx = p.x - fx * dist, tz = p.z - fz * dist;
  const k = 1 - Math.exp(-dt * 5);
  G.camera.x += (tx - G.camera.x) * k;
  G.camera.z += (tz - G.camera.z) * k;
  G.camera.y += (height - G.camera.y) * k;
  G.camera.pitch = 0.16 + Math.min(0.12, (p.car ? Math.abs(p.car.speed) : 0) * 0.002);
}

// --- drawing -----------------------------------------------------------------
function drawCar(r, car) {
  const isCop = car.owner === 'cop';
  const isPlayer = car.owner === 'player';
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
  const w = car.model.wid, l = car.model.len;
  // Body + cabin.
  r.addBox({ x: car.x, z: car.z, y: 0.35, w: w, d: l, h: 0.85, color: car.color, windows: false });
  r.addBox({ x: car.x - fx * 0.2, z: car.z - fz * 0.2, y: 1.15, w: w * 0.82, d: l * 0.5, h: 0.7, color: '#1c2438', windows: false });
  // Wheels.
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    r.addBox({ x: car.x + rx * sx * (w / 2) + fx * sz * (l / 2 - 0.7), z: car.z + rz * sx * (w / 2) + fz * sz * (l / 2 - 0.7), y: 0.1, w: 0.35, d: 0.7, h: 0.7, color: '#14161c', windows: false });
  }
  // Headlights.
  const hx = car.x + fx * (l / 2), hz = car.z + fz * (l / 2);
  r.addGlow(hx + rx * 0.7, 0.7, hz + rz * 0.7, 0.5, '#fff3c4', 0.9);
  r.addGlow(hx - rx * 0.7, 0.7, hz - rz * 0.7, 0.5, '#fff3c4', 0.9);
  if (isCop) {
    // Flashing light bar.
    const phase = Math.floor(G.time * 6) % 2 === 0;
    r.addGlow(car.x, 2.1, car.z, 0.7, phase ? '#ff3b30' : '#3b82ff', 0.95);
  }
  if (isPlayer) {
    r.addGlow(car.x, 0.4, car.z, 0.5, '#ffd60a', 0.15);
  }
  if (car.hp < 40 && car.hp > 0) {
    r.addGlow(car.x, 1.5, car.z, 1.5, '#ff5e3c', 0.4 + 0.3 * Math.sin(G.time * 10));
  }
}

function drawPerson(r, x, z, heading, color, walkPhase, down) {
  if (down) {
    r.addBox({ x, z, y: 0.2, w: 1.8, d: 0.7, h: 0.5, color, windows: false });
    return;
  }
  const bob = Math.abs(Math.sin(walkPhase || 0)) * 0.12;
  const fx = Math.sin(heading), fz = Math.cos(heading);
  r.addBox({ x, z, y: 0 + bob, w: 0.75, d: 0.45, h: 0.85, color: '#22242e', windows: false });
  r.addBox({ x, z, y: 0.85 + bob, w: 0.8, d: 0.5, h: 0.85, color, windows: false });
  r.addBox({ x: x + fx * 0.1, z: z + fz * 0.1, y: 1.7 + bob, w: 0.42, d: 0.42, h: 0.45, color: '#e8b88a', windows: false });
}

function drawWorld() {
  const r = renderer;
  const p = G.player;
  const cam = G.camera;
  r.setCamera({ x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch });
  r.drawSky(cam.yaw);
  const H = WORLD.half;
  // Ground, tiled: a tile whose corners fall behind the camera drops on its
  // own, so the ground never vanishes the way one big quad would.
  const tile = 140;
  const view = 340;
  const fwdX = Math.sin(cam.yaw), fwdZ = Math.cos(cam.yaw);
  const inFront = (x, z, margin) => (x - cam.x) * fwdX + (z - cam.z) * fwdZ > (margin ?? -80);
  for (let gx = Math.floor((cam.x - view) / tile); gx <= Math.floor((cam.x + view) / tile); gx++) {
    for (let gz = Math.floor((cam.z - view) / tile); gz <= Math.floor((cam.z + view) / tile); gz++) {
      const x0 = gx * tile, z0 = gz * tile;
      const cx = x0 + tile / 2, cz = z0 + tile / 2;
      if (!inFront(cx, cz, -80)) continue;
      let color;
      if (cz >= 700) color = '#2a5a8a'; // sea
      else if (cz >= 560) color = '#d9b06a'; // sand
      else if (Math.abs(cx) <= H) color = '#4d5248'; // city ground
      else continue;
      r.addGround(x0, z0, x0 + tile, z0 + tile, 0, color);
    }
  }
  // Pier planks into the sea (two segments, same near-plane reason).
  r.addGround(-22, 600, 22, 650, 0.4, '#8a6a4a');
  r.addGround(-22, 650, 22, 700, 0.4, '#8a6a4a');
  // Roads, in 40-unit segments so the near edge never drops the whole road.
  const gap = WORLD.roadGap;
  for (let k = Math.floor((cam.x - view) / gap); k <= Math.floor((cam.x + view) / gap); k++) {
    const x = k * gap;
    if (Math.abs(x) > H) continue;
    for (let z = Math.floor((cam.z - view) / 40) * 40; z < cam.z + view; z += 40) {
      if (!inFront(x, z + 20, -10)) continue;
      r.addGround(x - 11, z, x + 11, z + 40, 0.05, '#3a3d46');
      r.addGround(x - 15, z, x - 11, z + 40, 0.06, '#6a6d78');
      r.addGround(x + 11, z, x + 15, z + 40, 0.06, '#6a6d78');
      r.addGround(x - 0.5, z + 4, x + 0.5, z + 20, 0.08, '#e8c85a');
    }
  }
  for (let k = Math.floor((cam.z - view) / gap); k <= Math.floor((cam.z + view) / gap); k++) {
    const z = k * gap;
    if (Math.abs(z) > H) continue;
    for (let x = Math.floor((cam.x - view) / 40) * 40; x < cam.x + view; x += 40) {
      if (!inFront(x + 20, z, -10)) continue;
      r.addGround(x, z - 11, x + 40, z + 11, 0.05, '#3a3d46');
      r.addGround(x, z - 15, x + 40, z - 11, 0.06, '#6a6d78');
      r.addGround(x, z + 11, x + 40, z + 15, 0.06, '#6a6d78');
      r.addGround(x + 4, z - 0.5, x + 20, z + 0.5, 0.08, '#e8c85a');
    }
  }
  // Plaza, in four tiles.
  r.addGround(-90, -370, 0, -280, 0.07, '#7a6a8a');
  r.addGround(0, -370, 90, -280, 0.07, '#7a6a8a');
  r.addGround(-90, -280, 0, -190, 0.07, '#7a6a8a');
  r.addGround(0, -280, 90, -190, 0.07, '#7a6a8a');
  // Buildings.
  for (const b of G.city.buildings) r.addBox(b);
  // Palms: trunk + fronds.
  for (const palm of G.city.palms) {
    const d = Math.hypot(palm.x - cam.x, palm.z - cam.z);
    if (d > 320) continue;
    r.addBox({ x: palm.x, z: palm.z, y: 0, w: 0.5, d: 0.5, h: 7, color: '#6a4a2e', windows: false });
    const fr = 3.2;
    r.addQuad([[palm.x - fr, 7, palm.z], [palm.x + fr, 7, palm.z], [palm.x + fr * 0.4, 6.2, palm.z + fr * 0.7], [palm.x - fr * 0.4, 6.2, palm.z + fr * 0.7]], '#2e8a5a');
    r.addQuad([[palm.x, 7, palm.z - fr], [palm.x, 7, palm.z + fr], [palm.x + fr * 0.7, 6.2, palm.z + fr * 0.4], [palm.x + fr * 0.7, 6.2, palm.z - fr * 0.4]], '#37a86a');
  }
  // Props: crates, lamps.
  for (const prop of G.city.props) {
    const d = Math.hypot(prop.x - cam.x, prop.z - cam.z);
    if (d > 300) continue;
    r.addBox({ x: prop.x, z: prop.z, y: 0, w: prop.w, d: prop.d, h: prop.h, color: prop.color, windows: false });
  }
  // Yacht at the marina.
  r.addBox({ x: 120, z: 640, y: 0.5, w: 10, d: 26, h: 3.5, color: '#f2f2f2', windows: false });
  r.addBox({ x: 120, z: 640, y: 4, w: 6, d: 12, h: 3, color: '#e8e8e8', windows: false });
  // Beach umbrellas.
  for (const [ux, uz, col] of [[-200, 620, '#e85a8a'], [240, 630, '#5ab8a8'], [60, 615, '#f2a541']]) {
    r.addQuad([[ux - 4, 3.4, uz], [ux + 4, 3.4, uz], [ux + 3, 2.6, uz + 3], [ux - 3, 2.6, uz + 3]], col);
    r.addBox({ x: ux, z: uz, y: 0, w: 0.3, d: 0.3, h: 3.2, color: '#8a8a8a', windows: false });
  }
  // Roadblocks.
  for (const rb of G.roadblocks) {
    r.addBox({ x: rb.x - 3, z: rb.z, y: 0, w: 1.2, d: 4, h: 1.4, color: '#ff5a3c', windows: false });
    r.addBox({ x: rb.x + 3, z: rb.z, y: 0, w: 1.2, d: 4, h: 1.4, color: '#ff5a3c', windows: false });
    r.addBox({ x: rb.x, z: rb.z, y: 1.4, w: 7.2, d: 0.8, h: 0.5, color: '#e8e8e8', windows: false });
    r.addGlow(rb.x, 2.2, rb.z, 1, '#ff3b30', 0.5 + 0.3 * Math.sin(G.time * 6));
  }
  // Cars.
  for (const car of allCars(G)) {
    if (car.hp === -999) continue;
    drawCar(r, car);
  }
  // Pedestrians.
  for (const ped of G.peds) {
    const d = Math.hypot(ped.x - cam.x, ped.z - cam.z);
    if (d > 300) continue;
    drawPerson(r, ped.x, ped.z, ped.heading, ped.color, ped.walkPhase, ped.down);
  }
  // Enemies.
  for (const e of G.enemies) {
    drawPerson(r, e.x, e.z, e.heading, e.flash > 0 ? '#ffffff' : '#8a1a2e', G.time * 6, false);
    r.addBox({ x: e.x, z: e.z, y: 1.1, w: 1.1, d: 0.3, h: 0.25, color: '#14161c', windows: false });
  }
  // Pickups.
  for (const pk of G.pickups) {
    const bobY = 1 + Math.sin(pk.bob * 3) * 0.3;
    const col = pk.kind === 'health' ? '#4dff88' : pk.kind === 'armor' ? '#5aa8ff' : pk.kind === 'ammo' ? '#ffd60a' : '#7dff9a';
    r.addGlow(pk.x, bobY, pk.z, 1.4, col, 0.7);
    r.addBox({ x: pk.x, z: pk.z, y: bobY - 0.4, w: 0.9, d: 0.9, h: 0.9, color: col, windows: false });
  }
  // Player on foot.
  if (p.onFoot) drawPerson(r, p.x, p.z, p.heading, '#2ec4b6', p.moving ? G.time * 9 : 0, false);
  // Mission marker beam.
  if (G.mission && G.mission.marker) {
    r.addBeam(G.mission.marker.x, G.mission.marker.z, '#ffd60a');
  }
  // Helicopter.
  if (G.heli) {
    const h = G.heli;
    r.addBox({ x: h.x, z: h.z, y: h.y, w: 5, d: 3.2, h: 2.4, color: '#20242e', windows: false });
    r.addBox({ x: h.x - Math.sin(h.heading) * 4, z: h.z - Math.cos(h.heading) * 4, y: h.y + 0.4, w: 1, d: 5, h: 1, color: '#20242e', windows: false });
    const rx = Math.cos(h.rotor) * 5, rz = Math.sin(h.rotor) * 5;
    r.addLine([h.x - rx, h.y + 2.6, h.z - rz], [h.x + rx, h.y + 2.6, h.z + rz], 'rgba(200,200,200,0.7)', 3);
    r.addLine([h.x, h.y - 1, h.z], [h.searchX, 0, h.searchZ], 'rgba(255,240,180,0.35)', 5);
    r.addGlow(h.searchX, 0.5, h.searchZ, 1.8, '#fff3c4', 0.3);
    r.addGlow(h.x, h.y, h.z, 1, '#ff3b30', 0.8);
  }
  // Tracers.
  for (const t of G.tracers) {
    r.addLine([t.x1, 1.4, t.z1], [t.x2, 1.4, t.z2], '#ffe9a8', 2);
  }
  // Particles.
  for (const pt of G.particles) {
    r.addGlow(pt.x, pt.y, pt.z, pt.size * 0.45, pt.color, Math.max(0, 1 - pt.life / pt.maxLife) * 0.7);
  }
  // Muzzle flash.
  if (G.time - G.combat.muzzleAt < 0.06) {
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    r.addGlow(p.x + fx * 2, 1.4, p.z + fz * 2, 1.2, '#ffe9a8', 0.95);
  }
  r.flush();
}

// --- update ------------------------------------------------------------------
function update(dt) {
  const input = G.input;
  const p = G.player;

  if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
    if (G.garageOpen) { hud.closeGarage(); G.garageOpen = false; }
    else if (G.mode === 'playing') {
      G.mode = 'paused';
      document.getElementById('pauseStats').textContent =
        `Cash $${p.cash.toLocaleString('en-US')} · Respect ${p.respect} · Missions ${p.missionsDone}/8 · Wanted ${p.wanted}★`;
      showOverlay('pause');
    } else if (G.mode === 'paused') {
      hideOverlays(); G.mode = 'playing';
    }
  }
  if (G.mode !== 'playing') return;

  if (input.wasPressed('KeyM')) {
    G.audio.setMuted(!G.audio.muted);
    if (!G.audio.muted) G.audio.radioStart(); else G.audio.radioStop();
    hud.showToast(G.audio.muted ? 'SOUND OFF' : 'SOUND ON', '');
  }
  if (input.wasPressed('KeyR')) {
    const name = G.audio.nextStation();
    hud.showToast('RADIO', name);
  }
  if (input.wasPressed('KeyQ')) switchWeapon(G, 1);
  if (input.wasPressed('Digit1') && p.ownedWeapons.includes('fists')) p.weapon = 'fists';
  if (input.wasPressed('Digit2') && p.ownedWeapons.includes('pistol')) p.weapon = 'pistol';
  if (input.wasPressed('Digit3') && p.ownedWeapons.includes('smg')) p.weapon = 'smg';
  if (input.wasPressed('Digit4') && p.ownedWeapons.includes('shotgun')) p.weapon = 'shotgun';
  if (input.wasPressed('Enter') && !G.mission) startMission(G, p.missionsDone);

  // Garage.
  const nearGarage = Math.hypot(p.x - LANDMARKS.garage[0], p.z - LANDMARKS.garage[1]) < 22;
  if (input.wasPressed('KeyG') && nearGarage && !G.garageOpen) {
    hud.openGarage(G);
    G.garageOpen = true;
  } else if (input.wasPressed('KeyG') && G.garageOpen) {
    hud.closeGarage(); G.garageOpen = false;
  }
  if (G.garageOpen) return; // world frozen while shopping

  // Enter / exit car.
  if (input.wasPressed('KeyE')) {
    if (p.car) exitCar(G);
    else {
      const car = nearestCar(G, 5);
      if (car) enterCar(G, car);
    }
  }

  // Aiming on foot: face the mouse.
  if (p.onFoot && (input.mouse().down || input.mouse().clicked)) {
    const aim = aimHeading(G);
    p.heading = aim.yaw;
  }
  if (p.onFoot && input.mouse().down) fireWeapon(G);
  else if (p.onFoot && input.mouse().clicked) fireWeapon(G);

  if (p.car) updatePlayerCar(G, dt);
  else updatePlayerOnFoot(G, dt);
  updateCamera(dt);
  updateTraffic(G, dt);
  updatePedestrians(G, dt);
  updatePolice(G, dt);
  updateEnemies(G, dt);
  updatePickups(G, dt);
  updateMissions(G, dt);

  // Particles + tracers.
  for (const pt of G.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.z += pt.vz * dt;
    pt.vy -= 12 * dt;
    if (pt.y < 0.1) { pt.y = 0.1; pt.vy = 0; }
  }
  G.particles = G.particles.filter((pt) => pt.life > 0);
  for (const t of G.tracers) t.life -= dt;
  G.tracers = G.tracers.filter((t) => t.life > 0);
  G.gunfireAt = null;

  // Engine + radio audio.
  G.audio.engineSet(p.car ? Math.abs(p.car.speed) / carTopSpeed(p.car, p) : 0, !!p.car);

  // Autosave: every 30s, and right after a mission completes.
  if (G.time - G.lastAutosave > 30 || G.player.missionsDone !== G.lastMissionsDone) {
    G.lastAutosave = G.time;
    G.lastMissionsDone = G.player.missionsDone;
    saveGame(G);
  }
}

// --- main loop -----------------------------------------------------------------
let lastT = performance.now();
let fpsFrames = 0, fpsAt = performance.now();
function frame(now) {
  fpsFrames++;
  if (now - fpsAt >= 1000) { window.__FPS__ = fpsFrames; fpsFrames = 0; fpsAt = now; }
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (G.mode !== 'title' && G.mode !== 'howto') {
    G.time += dt;
    update(dt);
  } else {
    // Title backdrop: slow orbit over the city.
    G.time += dt;
    G.camera.yaw += dt * 0.05;
    const cx = Math.sin(G.camera.yaw) * 260, cz = Math.cos(G.camera.yaw) * 260;
    G.camera.x = cx; G.camera.z = cz; G.camera.y = 90;
    G.camera.pitch = 0.32;
    // Keep a few traffic cars moving for life behind the title.
    updateTraffic(G, dt);
    updatePedestrians(G, dt);
  }
  drawWorld();
  if (G.mode !== 'title' && G.mode !== 'howto') hud.update(G);
  G.input.endFrame();
  requestAnimationFrame(frame);
}

// --- screenshot staging (?shot=...) -------------------------------------------
function applyShot() {
  const q = new URLSearchParams(location.search);
  const shot = q.get('shot');
  if (!shot) return;
  hideOverlays();
  G.mode = 'playing';
  G.audio.setMuted(true);
  const p = G.player;
  if (shot === 'menu') { G.mode = 'title'; showOverlay('title'); return; }
  if (shot === 'drive') {
    p.x = 0; p.z = 280; p.heading = 0;
    const car = makeCar(0, 280, 0, 2, 'player');
    p.car = car; p.onFoot = false; car.speed = 24;
    G.cars.parked.push(car);
    startMission(G, 0);
    G.addWanted(1);
    return;
  }
  if (shot === 'mission') {
    // Open street south of the store: player, store front and guards all in frame.
    p.x = 140; p.z = 195; p.heading = 0;
    p.weapon = 'smg';
    p.cash = 2400;
    startMission(G, 4);
    G.mission.stage = 1; G.mission.stageTimer = 2.9; // about to finish the hold-up: 3 stars incoming
    for (let i = 0; i < 3; i++) {
      const e = { x: 130 + i * 10, z: 156 + (i % 2) * 8, heading: Math.PI, hp: 60, speed: 5.5, weapon: 'pistol', lastShotAt: 0, drop: 120, flash: 0, dead: false, kind: 'gang' };
      G.enemies.push(e);
    }
    return;
  }
  if (shot === 'chase') {
    p.x = 0; p.z = 140; p.heading = 0;
    const car = makeCar(0, 140, 0, 3, 'player');
    car.hp = 400; // staging: survive the opening seconds of the pursuit
    p.car = car; p.onFoot = false; car.speed = 30;
    G.cars.parked.push(car);
    startMission(G, 2); // mission 2 raises 2 stars itself
    return;
  }
  // cover: the Big Score finale — 5 stars, helicopter, roadblocks, escape run.
  p.x = 0; p.z = 80; p.heading = 0;
  const car = makeCar(0, 80, 0, 3, 'player');
  car.hp = 400; // staging: survive the opening seconds of the pursuit
  p.car = car; p.onFoot = false; car.speed = 28;
  G.cars.parked.push(car);
  startMission(G, 7);
  G.mission.stage = 2;
  G.mission.marker = { x: LANDMARKS.yacht[0], z: LANDMARKS.yacht[1], label: 'Escape to the yacht' };
  p.cash += 2000;
  G.addWanted(5);
  updatePolice(G, 0.1);
  // Stage the pursuit ahead of the player so the frame reads as a chase:
  // patrol cars converging from up the road, helicopter off to the side.
  G.cars.cops.forEach((c, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    c.x = p.x + side * 26; c.z = p.z + 64 + (i % 3) * 16;
    c.heading = Math.atan2(p.x - c.x, p.z - c.z);
    c.speed = 18;
  });
  if (G.heli) { G.heli.x = p.x + 40; G.heli.z = p.z + 80; G.heli.y = 42; }
}
applyShot();

// --- test hooks (used by the Playwright verification; harmless in play) ------
window.__SOLMAR__ = {
  G,
  snapshot() {
    const p = G.player;
    return {
      mode: G.mode, time: +G.time.toFixed(2),
      player: { x: +p.x.toFixed(1), z: +p.z.toFixed(1), heading: +p.heading.toFixed(2), health: p.health, armor: p.armor, cash: p.cash, respect: p.respect, wanted: p.wanted, onFoot: p.onFoot, weapon: p.weapon, missionsDone: p.missionsDone },
      mission: G.mission ? { index: G.mission.index, stage: G.mission.stage, name: G.mission.def ? G.mission.def.name : null, timer: G.mission.timer ? +G.mission.timer.toFixed(1) : 0 } : null,
      counts: { traffic: G.cars.traffic.length, parked: G.cars.parked.length, cops: G.cars.cops.length, peds: G.peds.length, enemies: G.enemies.length, roadblocks: G.roadblocks.length, heli: G.heli ? 1 : 0, buildings: G.city.buildings.length },
      errors: window.__ERRORS__.slice(),
    };
  },
  startMission(i) { return startMission(G, i); },
  setWanted(n) { G.player.wanted = n; G.player.heat = 80; updatePolice(G, 0.1); },
  teleport(x, z) { G.player.x = x; G.player.z = z; if (G.player.car) { G.player.car.x = x; G.player.car.z = z; } },
  giveCash(n) { G.player.cash += n; },
  enterNearestCar() { const c = nearestCar(G, 8); return c ? enterCar(G, c) : false; },
  startPlaying(fresh) { startPlaying(fresh); },
  setMode(m) { G.mode = m; },
};

requestAnimationFrame(frame);
