// Solmar Bay 2 — the law: a 5-star wanted system. Crimes raise stars;
// patrol cars chase and ram; at 3 stars the department sets roadblocks; at
// 4–5 stars the police helicopter joins with a searchlight. Break line of
// sight and stay quiet to cool down — or get busted when a cop reaches you
// on foot at low speed, or wasted when your health hits zero.

import { WORLD } from './config.js';
import { makeCar } from './player.js';
import { nearestRoadPoint } from './city.js';

const COP_COLORS = ['#20242e', '#1c2a44'];

export function addWanted(G, stars) {
  const p = G.player;
  if (G.mode !== 'playing') return;
  const before = p.wanted;
  p.wanted = Math.max(0, Math.min(5, p.wanted + stars));
  p.heat = Math.min(100, p.heat + stars * 30);
  if (p.wanted > before) {
    if (p.wanted >= 1) G.audio.sirenStart();
    if (p.wanted >= 3) G.toast(`WANTED — ${p.wanted} STARS`, p.wanted >= 4 ? 'The helicopter is in the air.' : 'Roadblocks are going up across the city.');
  }
}

export function wantedFor(G) {
  return G.player.wanted;
}

/** Spawn a patrol car near the player, on a road. */
function spawnCop(G) {
  const p = G.player;
  const angle = Math.random() * Math.PI * 2;
  const x = p.x + Math.sin(angle) * 90;
  const z = p.z + Math.cos(angle) * 90;
  const rp = nearestRoadPoint(x, z);
  const car = makeCar(rp.x, rp.z, Math.atan2(p.x - rp.x, p.z - rp.z), 6, 'cop');
  car.color = COP_COLORS[G.cars.cops.length % COP_COLORS.length];
  car.speed = 12;
  car.hp = 120;
  G.cars.cops.push(car);
}

export function setRoadblocks(G) {
  // Roadblocks on the roads around the player, ahead of the escape route.
  const p = G.player;
  G.roadblocks = [];
  const n = Math.min(3, 1 + Math.floor(G.player.wanted / 2));
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + 0.6;
    const x = p.x + Math.sin(angle) * 70;
    const z = p.z + Math.cos(angle) * 70;
    const rp = nearestRoadPoint(x, z);
    G.roadblocks.push({ x: rp.x, z: rp.z, heading: angle, hp: 60 });
  }
}

export function updatePolice(G, dt) {
  const p = G.player;
  const wanted = p.wanted;

  // --- Spawn / despawn patrol cars to match the wanted level.
  const wantCops = wanted === 0 ? 0 : wanted <= 2 ? wanted + 1 : wanted <= 3 ? 4 : 5;
  while (G.cars.cops.length < wantCops) spawnCop(G);
  if (wanted === 0 && G.cars.cops.length > 0) {
    // Cops give up and drive off once the heat is gone.
    G.cars.cops = G.cars.cops.filter((c) => {
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      return d < 160;
    });
    if (G.cars.cops.length === 0) G.audio.sirenStop();
  }

  // --- Heat decay: hidden and quiet cools the trail.
  const anyCopNear = G.cars.cops.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 55);
  const heliNear = G.heli && Math.hypot(G.heli.x - p.x, G.heli.z - p.z) < 70;
  const speeding = p.car ? Math.abs(p.car.speed) > 15 : p.moving;
  if (!anyCopNear && !heliNear && !speeding && wanted > 0) {
    p.heat -= dt * 7;
    if (p.heat <= 0) {
      p.wanted = Math.max(0, p.wanted - 1);
      p.heat = p.wanted > 0 ? 60 : 0;
      if (p.wanted === 0) {
        G.toast('YOU LOST THEM', 'The heat is off — for now.');
        G.audio.sirenStop();
        G.roadblocks = [];
        G.heli = null;
      }
    }
  } else if (wanted > 0) {
    p.heat = Math.min(100, p.heat + dt * 2);
  }

  // --- Cop AI: chase the player, ram on foot, pit-maneuver cars.
  for (const cop of G.cars.cops) {
    const dx = p.x - cop.x, dz = p.z - cop.z;
    const dist = Math.hypot(dx, dz) || 1;
    const wantHeading = Math.atan2(dx, dz);
    let diff = wantHeading - cop.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cop.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    const top = wanted >= 4 ? 36 : wanted >= 3 ? 33 : 30;
    const close = dist < 10;
    const target = !close ? top : dist > 3.5 ? top * 0.55 : top * 0.25; // brake hard as it closes in
    cop.speed += (target - cop.speed) * Math.min(1, dt * (close ? 3 : 0.9));
    if (dist < 4) cop.speed = Math.min(cop.speed, 12); // on top of the player: slow enough to make the arrest
    cop.x += Math.sin(cop.heading) * cop.speed * dt;
    cop.z += Math.cos(cop.heading) * cop.speed * dt;
    // Ram damage when it reaches the player.
    if (dist < 3.4) {
      if (p.car) {
        p.car.hp -= 14 * dt * 2;
        if (p.car.hp <= 0) { /* wreck handled by player.js */ }
        if (Math.random() < dt * 6) G.addParticles(cop.x, cop.z, 2, 2, '#ffb35c');
      } else {
        // On foot, slow and close: busted. (The brake band above gets the
        // cop under 20 u/s as it closes in, so this can actually fire.)
        if (Math.abs(cop.speed) < 20 && dist < 2.6) {
          G.onBusted();
          return;
        }
      }
    }
    // Cop-car separation.
    for (const other of G.cars.cops) {
      if (other === cop) continue;
      const ox = cop.x - other.x, oz = cop.z - other.z;
      const od = Math.hypot(ox, oz);
      if (od < 5 && od > 0.01) { cop.x += (ox / od) * (5 - od) * 0.5; cop.z += (oz / od) * (5 - od) * 0.5; }
    }
  }
  G.cars.cops = G.cars.cops.filter((c) => c.hp > 0);

  // --- Roadblocks: solid until smashed through.
  if (wanted >= 3 && G.roadblocks.length === 0) setRoadblocks(G);
  if (wanted < 3) G.roadblocks = [];
  for (const rb of G.roadblocks) {
    if (rb.hp <= 0) continue;
    const d = Math.hypot(p.x - rb.x, p.z - rb.z);
    if (p.car && d < 4.5) {
      if (Math.abs(p.car.speed) > 14) {
        rb.hp = 0;
        p.car.hp -= 12;
        p.car.speed *= 0.55;
        G.audio.sfx.crash();
        G.addParticles(rb.x, rb.z, 2, 14, '#ff9d5c');
        G.toast('ROADBLOCK SMASHED', 'Keep moving — they will set another.');
        G.addWanted(0); // no extra star; the smash is the point
      } else {
        // Slow: the block stops the car.
        p.car.speed *= 0.3;
      }
    }
  }
  G.roadblocks = G.roadblocks.filter((rb) => rb.hp > 0);

  // --- Helicopter at 4+ stars.
  if (wanted >= 4 && !G.heli) {
    G.heli = { x: p.x - 40, z: p.z - 40, y: 42, heading: 0, rotor: 0, searchX: p.x, searchZ: p.z };
    G.toast('POLICE HELICOPTER', 'The eye in the sky is on you — break its line of sight.');
  }
  if (wanted < 4) G.heli = null;
  if (G.heli) {
    const h = G.heli;
    h.rotor += dt * 22;
    // Hover well ahead and to the side of the player, high enough to stay
    // in frame, sweeping its searchlight back onto the player.
    const aheadX = Math.sin(p.heading || 0), aheadZ = Math.cos(p.heading || 0);
    const sideX = Math.cos(p.heading || 0), sideZ = -Math.sin(p.heading || 0);
    const tx = p.x + aheadX * 70 + sideX * 30;
    const tz = p.z + aheadZ * 70 + sideZ * 30;
    h.x += (tx - h.x) * Math.min(1, dt * 0.7);
    h.z += (tz - h.z) * Math.min(1, dt * 0.7);
    h.heading = Math.atan2(p.x - h.x, p.z - h.z);
    // Searchlight tracks the player; while it does, the heat never cools.
    h.searchX = p.x; h.searchZ = p.z;
    p.heat = Math.min(100, p.heat + dt * 4);
    // The heli's spotlight pins the player: cops converge faster.
    for (const cop of G.cars.cops) cop.speed = Math.min(38, cop.speed + dt * 2);
  }
}

export function copCount(G) { return G.cars.cops.length; }
export { WORLD };
