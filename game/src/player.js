// Solmar Bay 2 — the player: on-foot movement and driving. One body, two
// modes: walking the streets (camera-relative WASD, sprint, collide with
// buildings) and driving any car in the city (arcade physics: accel, steer,
// handbrake drift, building and car collisions, off-road drag).

import { CAR_MODELS, PLAYER, WORLD } from './config.js';
import { collideBuildings } from './city.js';

export function createPlayer(x, z) {
  return {
    x, z, heading: 0, speed: 0,
    onFoot: true, car: null,
    health: PLAYER.maxHealth, armor: 0,
    cash: PLAYER.startCash, respect: 0,
    wanted: 0, heat: 0, // heat 0..100: how hot the trail is right now
    weapon: 'fists',
    ammo: { pistol: 48, smg: 120, shotgun: 16 },
    ownedWeapons: ['fists', 'pistol'],
    upgrades: [],
    missionsDone: 0,
    lastDamageAt: -99,
  };
}

export function carTopSpeed(car, player) {
  let top = car.model.top;
  if (player && player.upgrades.includes('engine1')) top *= 1.15;
  if (player && player.upgrades.includes('engine2')) top *= 1.15;
  return top;
}

export function carMaxHp(car, player) {
  let hp = 100;
  if (player && player.upgrades.includes('armor1')) hp = 150;
  if (player && player.upgrades.includes('armor2')) hp = 220;
  return hp;
}

function clampToWorld(x, z, margin) {
  const m = WORLD.half - (margin || 0);
  return { x: Math.max(-m, Math.min(m, x)), z: Math.max(-m, Math.min(760, z)) };
}

export function updatePlayerOnFoot(G, dt) {
  const p = G.player;
  const input = G.input;
  const ax = input.axes();
  const camYaw = G.camera.yaw;
  // Camera-relative movement: W walks away from the camera.
  const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
  let mx = (ax.x * cos + ax.y * sin);
  let mz = (-ax.x * sin + ax.y * cos);
  const len = Math.hypot(mx, mz);
  const speed = input.sprint() ? PLAYER.runSpeed : PLAYER.walkSpeed;
  if (len > 0.01) {
    mx /= len; mz /= len;
    p.heading = Math.atan2(mx, mz);
    let nx = p.x + mx * speed * dt;
    let nz = p.z + mz * speed * dt;
    const hit = collideBuildings(G.city, nx, nz, PLAYER.radius);
    nx = hit.x; nz = hit.z;
    const cl = clampToWorld(nx, nz, 4);
    p.x = cl.x; p.z = cl.z;
    p.speed = speed;
    p.moving = true;
  } else {
    p.speed = 0;
    p.moving = false;
  }
}

/** Drive the player's current car. Returns true when a crash happened. */
export function updatePlayerCar(G, dt) {
  const p = G.player;
  const car = p.car;
  if (!car) return false;
  const input = G.input;
  const ax = input.axes();
  const top = carTopSpeed(car, p);
  const accel = car.model.accel;
  const reversing = ax.y < 0;
  if (ax.y > 0) car.speed += accel * dt;
  else if (reversing) car.speed -= accel * 0.8 * dt;
  else car.speed *= Math.pow(0.4, dt); // coast
  // Drag + off-road slowdown.
  car.speed *= Math.pow(0.995, dt * 60);
  const offroad = !isOnRoad(G, car.x, car.z);
  const cap = offroad ? top * 0.55 : top;
  if (car.speed > cap) car.speed = Math.max(cap, car.speed - 30 * dt);
  if (car.speed < -top * 0.4) car.speed = -top * 0.4;
  const handbrake = input.down('Space');
  const steerInput = ax.x;
  const steerAmount = steerInput * car.model.grip * (handbrake ? 1.7 : 1) * Math.min(1, Math.abs(car.speed) / 8);
  car.heading += steerAmount * dt * (car.speed >= 0 ? 1 : -1) * (handbrake ? 1.4 : 1);
  if (handbrake) car.speed *= Math.pow(0.25, dt);
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  let nx = car.x + fx * car.speed * dt;
  let nz = car.z + fz * car.speed * dt;
  // Buildings: stop dead with damage on a hard hit.
  let crashed = false;
  const hit = collideBuildings(G.city, nx, nz, 2.2);
  if (hit.hit) {
    const impact = Math.abs(car.speed);
    if (impact > 12) {
      car.hp -= impact * 1.2;
      damagePlayer(G, impact * 0.35, 'crash');
      G.audio.sfx.crash();
      G.addParticles(car.x, car.z, 2, 10, '#ff9d5c');
      crashed = true;
    }
    car.speed *= 0.35;
    nx = hit.x; nz = hit.z;
  }
  const cl = clampToWorld(nx, nz, 6);
  if (cl.x !== nx || cl.z !== nz) { car.speed *= 0.4; }
  car.x = cl.x; car.z = cl.z;
  // Car-vs-car bumps.
  for (const other of allCars(G)) {
    if (other === car) continue;
    const dx = car.x - other.x, dz = car.z - other.z;
    const d = Math.hypot(dx, dz);
    if (d < 4.4 && d > 0.01) {
      const push = (4.4 - d) / 2;
      car.x += (dx / d) * push; car.z += (dz / d) * push;
      other.x -= (dx / d) * push; other.z -= (dz / d) * push;
      const rel = Math.abs(car.speed - (other.speed || 0));
      // Damage once per bump (0.6s cooldown), not every frame of contact.
      if (rel > 10 && G.time - (car.lastBumpAt || -9) > 0.6) {
        car.lastBumpAt = G.time;
        car.hp -= rel * 0.5;
        if (other.hp !== undefined) other.hp -= rel * 0.5;
        if (rel > 16) { G.audio.sfx.crash(); G.addParticles(car.x, car.z, 2, 5, '#ffb35c'); }
        car.speed *= 0.7;
      }
    }
  }
  // Car wrecked: it burns out and the player is thrown clear.
  if (car.hp <= 0) {
    G.addParticles(car.x, car.z, 3, 26, '#ff5e3c');
    G.audio.sfx.crash();
    exitCar(G, true);
    car.hp = -999; // mark dead; main loop removes it
  }
  p.x = car.x; p.z = car.z; p.heading = car.heading; p.speed = Math.abs(car.speed);
  return crashed;
}

export function allCars(G) {
  return [...G.cars.parked, ...G.cars.traffic, ...G.cars.cops];
}

export function isOnRoad(G, x, z) {
  // Roads are the grid; the beach and plaza are also drivable.
  const gap = WORLD.roadGap;
  const w = WORLD.roadWidth / 2 + 3;
  const mx = ((x % gap) + gap) % gap;
  const mz = ((z % gap) + gap) % gap;
  const nearX = Math.min(mx, gap - mx) < w;
  const nearZ = Math.min(mz, gap - mz) < w;
  return nearX || nearZ || z > 540 || (Math.abs(x) < 90 && Math.abs(z + 280) < 90);
}

/** Nearest drivable car within range of the player (on foot). */
export function nearestCar(G, maxDist) {
  const p = G.player;
  let best = null, bestD = maxDist || 5;
  for (const car of allCars(G)) {
    if (car.hp !== undefined && car.hp <= 0) continue;
    if (car.owner === 'cop') continue; // stealing a patrol car is a death wish
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

export function enterCar(G, car) {
  const p = G.player;
  if (!car) return false;
  // Take it out of whatever list it was in; it is the player's now.
  for (const list of [G.cars.parked, G.cars.traffic]) {
    const i = list.indexOf(car);
    if (i >= 0) list.splice(i, 1);
  }
  if (car.owner === 'traffic') {
    // Grand theft auto: witnesses call it in.
    G.addWanted(1);
    G.toast('CAR STOLEN', 'The owner called it in — the cops are coming.');
  }
  car.owner = 'player';
  p.car = car;
  p.onFoot = false;
  car.speed = 0;
  G.audio.sfx.door();
  G.audio.engineStart();
  return true;
}

export function exitCar(G, wrecked) {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  p.car = null;
  p.onFoot = true;
  if (!wrecked && car.hp > 0) {
    // Park it beside the player.
    car.x += Math.cos(car.heading) * 3;
    car.z -= Math.sin(car.heading) * 3;
    car.owner = 'parked';
    car.speed = 0;
    G.cars.parked.push(car);
  }
  G.audio.sfx.door();
}

export function damagePlayer(G, amount, source) {
  const p = G.player;
  if (G.mode !== 'playing') return;
  if (G.time - p.lastDamageAt < 0.15) return;
  p.lastDamageAt = G.time;
  let rest = amount;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, rest);
    p.armor -= absorbed;
    rest -= absorbed;
  }
  p.health -= rest;
  if (p.health <= 0) {
    p.health = 0;
    G.onWasted();
  }
}

export function healPlayer(G, amount) {
  const p = G.player;
  p.health = Math.min(PLAYER.maxHealth, p.health + amount);
}

export function makeCar(x, z, heading, modelIdx, owner) {
  const model = CAR_MODELS[modelIdx % CAR_MODELS.length];
  return {
    x, z, heading, speed: 0, model, color: model.color,
    owner: owner || 'parked', hp: 100, id: Math.random().toString(36).slice(2, 8),
  };
}
