// Solmar Bay 2 — the city: a seeded procedural grid of blocks, towers,
// shops, palms, the beach and the marina. Deterministic (seed 20261119),
// so every run builds the same streets. Buildings are AABBs the player,
// cars and AI collide with.

import { mulberry32, pick, range, int } from './rng.js';
import { WORLD, LANDMARKS } from './config.js';

const BUILDING_COLORS = ['#b5674e', '#c98a5a', '#8a6a9e', '#5a7fa8', '#a8a06a', '#7a8a9a', '#d08a7a', '#6a9a8a', '#9e7a5a', '#7a6a8a'];
const SHOP_COLORS = ['#e8705a', '#f2a541', '#5ab8a8', '#e85a8a', '#7ab8e8'];

export function buildCity() {
  const rng = mulberry32(WORLD.seed);
  const buildings = [];
  const palms = [];
  const props = []; // {x, z, w, d, h, color, kind}
  const gap = WORLD.roadGap;
  const half = WORLD.half;

  // City blocks: for each block between roads, place 1-4 buildings.
  for (let bx = -half + gap / 2; bx < half; bx += gap) {
    for (let bz = -half + gap / 2; bz < half - 90; bz += gap) {
      // Beach strip: no buildings south of z=520.
      if (bz > 500) continue;
      // Landmark plots stay clear for the bank, store, hospital, plaza.
      const isPlaza = Math.abs(bx - 0) < 80 && Math.abs(bz + 280) < 80;
      if (isPlaza) continue;
      const downtown = Math.abs(bx) < 300 && Math.abs(bz) < 300;
      const n = downtown ? int(rng, 2, 4) : int(rng, 1, 3);
      for (let k = 0; k < n; k++) {
        const w = range(rng, 18, downtown ? 30 : 42);
        const d = range(rng, 18, downtown ? 30 : 42);
        const x = bx + range(rng, -gap / 2 + w / 2 + 8, gap / 2 - w / 2 - 8);
        const z = bz + range(rng, -gap / 2 + d / 2 + 8, gap / 2 - d / 2 - 8);
        const h = downtown ? range(rng, 22, 78) : range(rng, 8, 26);
        const color = downtown ? pick(rng, BUILDING_COLORS) : pick(rng, [...BUILDING_COLORS, ...SHOP_COLORS]);
        buildings.push({ x, z, w, d, h, color, windows: true });
      }
      // Palms along the block corners.
      if (rng() < 0.6) palms.push({ x: bx + gap / 2 - 14, z: bz + gap / 2 - 14 });
      if (rng() < 0.4) palms.push({ x: bx - gap / 2 + 14, z: bz - gap / 2 + 14 });
    }
  }

  // Landmark buildings (hand-placed, part of the story).
  buildings.push({ x: 0, z: 0, w: 56, d: 44, h: 34, color: '#c9b06a', windows: true, name: 'Solmar Bay Bank' });
  buildings.push({ x: 140, z: 140, w: 30, d: 24, h: 12, color: '#e8705a', windows: true, name: 'Coral Row Store' });
  buildings.push({ x: 280, z: 280, w: 40, d: 34, h: 26, color: '#e8e8e8', windows: true, name: 'Solmar Clinic' });
  buildings.push({ x: -420, z: 500, w: 44, d: 30, h: 14, color: '#5ab8a8', windows: true, name: 'Marina Garage' });
  buildings.push({ x: 420, z: -420, w: 30, d: 26, h: 16, color: '#8a6a9e', windows: true, name: 'Safehouse' });
  buildings.push({ x: -560, z: -560, w: 26, d: 26, h: 12, color: '#7a8899', windows: false, name: 'Tunnel Hideout' });

  // Beach palms in a row along the sand.
  for (let x = -640; x <= 640; x += 80) {
    palms.push({ x: x + range(rng, -14, 14), z: 585 + range(rng, -8, 8) });
  }
  // Marina props: crates, containers, lamp posts.
  for (let i = 0; i < 10; i++) {
    props.push({ x: -480 + i * 14, z: 560 + (i % 2) * 12, w: 8, d: 8, h: 5 + (i % 3) * 3, color: pick(rng, ['#c96a3c', '#3c7ac9', '#6ac96a']), kind: 'crate' });
  }
  for (let i = 0; i < 24; i++) {
    props.push({ x: range(rng, -640, 640), z: range(rng, -640, 520), w: 1.2, d: 1.2, h: 7, color: '#2e3440', kind: 'lamp' });
  }

  const colliders = buildings.map((b) => ({ x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2 }));
  return { buildings, palms, props, colliders, rng };
}

/** Is (x,z) on a road (within the asphalt)? */
export function onRoad(x, z) {
  const gap = WORLD.roadGap;
  const w = WORLD.roadWidth / 2;
  const mx = ((x % gap) + gap) % gap;
  const mz = ((z % gap) + gap) % gap;
  const nearX = Math.min(mx, gap - mx) < w + 2;
  const nearZ = Math.min(mz, gap - mz) < w + 2;
  return nearX || nearZ;
}

/** Nearest point on the road grid to (x,z) — for spawning traffic. */
export function nearestRoadPoint(x, z) {
  const gap = WORLD.roadGap;
  const rx = Math.round(x / gap) * gap;
  const rz = Math.round(z / gap) * gap;
  if (Math.abs(x - rx) < Math.abs(z - rz)) return { x: rx, z, axis: 'z' };
  return { x, z: rz, axis: 'x' };
}

/** Circle-vs-building collision: push (x,z) out of any collider. Returns true if it hit. */
export function collideBuildings(city, x, z, radius) {
  let hit = false;
  for (const c of city.colliders) {
    const dx = x - c.x, dz = z - c.z;
    if (Math.abs(dx) > c.hw + radius || Math.abs(dz) > c.hd + radius) continue;
    const px = c.hw + radius - Math.abs(dx);
    const pz = c.hd + radius - Math.abs(dz);
    if (px < pz) x += dx >= 0 ? px : -px;
    else z += dz >= 0 ? pz : -pz;
    hit = true;
  }
  return { x, z, hit };
}

/** Point-in-building test (for bullets / markers). */
export function insideBuilding(city, x, z) {
  for (const c of city.colliders) {
    if (Math.abs(x - c.x) < c.hw && Math.abs(z - c.z) < c.hd) return true;
  }
  return false;
}

/** Distance from (x,z) to the nearest building face (for AI sight lines). */
export function buildingAt(city, x, z) {
  for (const b of city.buildings) {
    if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2) return b;
  }
  return null;
}

export { LANDMARKS };
