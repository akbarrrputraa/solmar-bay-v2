// Solmar Bay 2 — combat: weapons, shooting, rival gang members, health
// pickups and explosions. Shooting is hitscan from the player's aim ray:
// on foot the player aims with the mouse (the camera swings to face the
// cursor); in a car the player fires forward. Every shot is a crime the
// witnesses report.

import { WEAPONS } from './config.js';
import { damagePlayer } from './player.js';
import { insideBuilding } from './city.js';

export function createCombat() {
  return { lastShotAt: -99, muzzleAt: -99, muzzleX: 0, muzzleZ: 0 };
}

/** Aim direction on foot: from the player toward the mouse cursor's ground point. */
export function aimHeading(G) {
  const p = G.player;
  const m = G.input.mouse();
  const r = G.renderer;
  // Unproject the cursor: assume the ground plane (y=0) at the screen point.
  // We approximate by rotating the camera yaw by the cursor's offset from center.
  const nx = (m.x / window.innerWidth - 0.5) * 2;
  const ny = (m.y / window.innerHeight - 0.5) * 2;
  const yaw = G.camera.yaw + nx * 0.9;
  return { yaw, pitch: ny };
}

export function currentWeapon(G) {
  return WEAPONS[G.player.weapon];
}

export function switchWeapon(G, dir) {
  const p = G.player;
  const owned = p.ownedWeapons;
  const i = owned.indexOf(p.weapon);
  const next = owned[(i + dir + owned.length) % owned.length];
  p.weapon = next;
  G.audio.sfx.click();
  G.hudDirty = true;
}

export function buyWeapon(G, id) {
  const p = G.player;
  const { WEAPON_PRICES } = { WEAPON_PRICES: { pistol: 400, smg: 900, shotgun: 1200 } };
  const price = WEAPON_PRICES[id];
  if (p.ownedWeapons.includes(id)) return 'owned';
  if (p.cash < price) return 'poor';
  p.cash -= price;
  p.ownedWeapons.push(id);
  p.weapon = id;
  G.audio.sfx.cash();
  return 'ok';
}

export function buyAmmo(G) {
  const p = G.player;
  if (p.cash < 150) return 'poor';
  p.cash -= 150;
  for (const k of ['pistol', 'smg', 'shotgun']) {
    if (p.ownedWeapons.includes(k)) p.ammo[k] = Math.min(999, (p.ammo[k] || 0) + (k === 'smg' ? 120 : 40));
  }
  G.audio.sfx.cash();
  return 'ok';
}

/** Fire the current weapon. Returns 'fired' | 'empty' | 'cooldown' | 'fists'. */
export function fireWeapon(G) {
  const p = G.player;
  const w = currentWeapon(G);
  if (G.mode !== 'playing' || !p.onFoot) return 'nope';
  if (G.time - G.combat.lastShotAt < w.rate) return 'cooldown';
  if (p.weapon === 'fists') {
    G.combat.lastShotAt = G.time;
    // Punch: short range, hurts enemies and peds nearby.
    const hx = p.x + Math.sin(p.heading) * 2.2;
    const hz = p.z + Math.cos(p.heading) * 2.2;
    let hitAny = false;
    for (const e of G.enemies) {
      if (Math.hypot(e.x - hx, e.z - hz) < 2.4) { hurtEnemy(G, e, w.damage); hitAny = true; }
    }
    G.audio.sfx.hit();
    return hitAny ? 'fired' : 'fired';
  }
  const ammo = p.ammo[p.weapon];
  if (ammo <= 0) { G.audio.sfx.click(); G.toast('NO AMMO', 'Buy ammo — press G near the garage, or grab a pickup.'); return 'empty'; }
  p.ammo[p.weapon] = ammo - 1;
  G.combat.lastShotAt = G.time;
  G.combat.muzzleAt = G.time;
  const aim = aimHeading(G);
  const pellets = w.pellets || 1;
  let hitSomething = false;
  for (let i = 0; i < pellets; i++) {
    const spread = (Math.random() - 0.5) * w.spread * 2;
    const dir = aim.yaw + spread;
    const hx = p.x + Math.sin(dir) * w.range;
    const hz = p.z + Math.cos(dir) * w.range;
    // Find the closest thing the ray hits: enemy, cop, traffic car, building.
    let bestD = w.range;
    let best = null;
    for (const e of G.enemies) {
      const d = rayHit(p.x, p.z, dir, e.x, e.z, 1.6);
      if (d !== null && d < bestD) { bestD = d; best = { kind: 'enemy', e }; }
    }
    for (const cop of G.cars.cops) {
      const d = rayHit(p.x, p.z, dir, cop.x, cop.z, 2.6);
      if (d !== null && d < bestD) { bestD = d; best = { kind: 'cop', car: cop }; }
    }
    for (const car of [...G.cars.traffic, ...G.cars.parked]) {
      const d = rayHit(p.x, p.z, dir, car.x, car.z, 2.6);
      if (d !== null && d < bestD) { bestD = d; best = { kind: 'car', car }; }
    }
    const ex = p.x + Math.sin(dir) * bestD;
    const ez = p.z + Math.cos(dir) * bestD;
    G.addTracer(p.x, p.z, ex, ez);
    if (best) {
      hitSomething = true;
      if (best.kind === 'enemy') hurtEnemy(G, best.e, w.damage);
      else if (best.kind === 'cop') { best.car.hp -= w.damage; if (best.car.hp <= 0) G.addWanted(1); }
      else if (best.kind === 'car') {
        best.car.hp -= w.damage;
        if (best.car.owner === 'traffic') { best.car.fleeing = true; G.addWanted(1); }
      }
      G.addParticles(ex, ez, 1, 4, '#ffd98a');
    }
  }
  G.gunfireAt = { x: p.x, z: p.z };
  if (p.weapon === 'shotgun') G.audio.sfx.shotgun(); else G.audio.sfx.shoot();
  if (p.wanted < 1 && hitSomething) G.addWanted(1);
  else if (p.wanted < 2 && Math.random() < 0.3) G.addWanted(1);
  return 'fired';
}

/** Ray vs circle: distance along the ray, or null. */
function rayHit(ox, oz, dir, cx, cz, r) {
  const fx = Math.sin(dir), fz = Math.cos(dir);
  const dx = cx - ox, dz = cz - oz;
  const t = dx * fx + dz * fz;
  if (t < 0) return null;
  const px = ox + fx * t, pz = oz + fz * t;
  const d = Math.hypot(cx - px, cz - pz);
  if (d > r) return null;
  return t - Math.sqrt(Math.max(0, r * r - d * d));
}

export function hurtEnemy(G, e, dmg) {
  e.hp -= dmg;
  e.flash = 0.12;
  if (e.hp <= 0) {
    e.dead = true;
    G.addParticles(e.x, e.z, 1.5, 12, '#ff5a5a');
    G.player.cash += e.drop || 60;
    G.audio.sfx.cash();
    G.toast('TARGET DOWN', `+$${e.drop || 60} taken from the fallen.`);
  }
}

export function spawnEnemy(G, x, z, opts) {
  const e = {
    x, z, heading: Math.random() * Math.PI * 2,
    hp: (opts && opts.hp) || 60, speed: 5.5,
    weapon: (opts && opts.weapon) || 'pistol',
    lastShotAt: 0, drop: (opts && opts.drop) || 60,
    flash: 0, dead: false, kind: (opts && opts.kind) || 'gang',
  };
  G.enemies.push(e);
  return e;
}

export function updateEnemies(G, dt) {
  const p = G.player;
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.flash = Math.max(0, e.flash - dt);
    const d = Math.hypot(p.x - e.x, p.z - e.z);
    // Chase the player when close, shoot when in range and in the open.
    if (d < 46) {
      e.heading = Math.atan2(p.x - e.x, p.z - e.z);
      if (d > 12) {
        e.x += Math.sin(e.heading) * e.speed * dt;
        e.z += Math.cos(e.heading) * e.speed * dt;
        const hit = insideBuilding(G.city, e.x, e.z);
        if (hit) { e.x -= Math.sin(e.heading) * e.speed * dt; e.z -= Math.cos(e.heading) * e.speed * dt; }
      } else if (G.time - e.lastShotAt > 0.9) {
        e.lastShotAt = G.time;
        G.addTracer(e.x, e.z, p.x, p.z);
        if (Math.random() < 0.55) damagePlayer(G, 7, 'enemy');
        G.audio.sfx.shoot();
      }
    }
  }
  G.enemies = G.enemies.filter((e) => !e.dead);
}

export function spawnPickup(G, kind, x, z) {
  G.pickups.push({ kind, x, z, bob: Math.random() * 6 });
}

export function updatePickups(G, dt) {
  const p = G.player;
  for (const pk of G.pickups) {
    pk.bob += dt;
    const d = Math.hypot(p.x - pk.x, p.z - pk.z);
    if (d < 2.6) {
      pk.taken = true;
      if (pk.kind === 'health') { G.player.health = Math.min(100, G.player.health + 40); G.toast('HEALTH +40', 'Patched up.'); }
      if (pk.kind === 'armor') { G.player.armor = Math.min(100, G.player.armor + 50); G.toast('ARMOR +50', 'Vest on.'); }
      if (pk.kind === 'ammo') { for (const k of p.ownedWeapons) if (p.ammo[k] !== undefined) p.ammo[k] += 60; G.toast('AMMO RESTOCKED', 'Fresh mags.'); }
      if (pk.kind === 'cash') { p.cash += 150; G.toast('CASH +$150', 'Found money.'); }
      G.audio.sfx.pickup();
    }
  }
  G.pickups = G.pickups.filter((pk) => !pk.taken);
}
