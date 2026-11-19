// Solmar Bay 2 — traffic and pedestrians: the city alive. Traffic cars
// cruise the road grid, stop for nothing, and swerve around wrecks; when a
// player car rams one, its driver bails. Pedestrians stroll the sidewalks,
// scatter from gunfire and speeding cars, and call the cops on a carjacking.

import { mulberry32, pick, range, int } from './rng.js';
import { WORLD } from './config.js';
import { makeCar } from './player.js';
import { nearestRoadPoint, onRoad } from './city.js';

export function spawnTraffic(G, count) {
  const rng = mulberry32(777);
  for (let i = 0; i < count; i++) {
    const x = range(rng, -620, 620);
    const z = range(rng, -620, 520);
    const rp = nearestRoadPoint(x, z);
    const heading = rp.axis === 'x' ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const car = makeCar(rp.x, rp.z, heading, int(rng, 0, 5), 'traffic');
    car.speed = range(rng, 8, 14);
    car.lane = rng() < 0.5 ? 1 : -1;
    G.cars.traffic.push(car);
  }
}

export function spawnPedestrians(G, count) {
  const rng = mulberry32(4242);
  const skins = ['#e85a8a', '#5ab8a8', '#f2a541', '#7ab8e8', '#c9c9c9', '#8a6a9e'];
  for (let i = 0; i < count; i++) {
    const x = range(rng, -640, 640);
    const z = range(rng, -640, 520);
    G.peds.push({
      x, z, heading: rng() * Math.PI * 2,
      speed: range(rng, 1.2, 2.6),
      color: pick(rng, skins),
      panic: 0, walkPhase: rng() * 10,
      target: null,
    });
  }
}

function steerToRoad(car, dt) {
  // Keep the car on its road: snap gently toward the nearest grid line.
  const gap = WORLD.roadGap;
  const mx = ((car.x % gap) + gap) % gap;
  const mz = ((car.z % gap) + gap) % gap;
  const onXRoad = Math.min(mx, gap - mx) < WORLD.roadWidth / 2;
  const onZRoad = Math.min(mz, gap - mz) < WORLD.roadWidth / 2;
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  if (Math.abs(fx) > Math.abs(fz)) {
    // Travelling mostly along x: hold z on a road line.
    const targetZ = Math.round(car.z / gap) * gap + (car.lane || 1) * 3;
    car.heading += Math.max(-1.2 * dt, Math.min(1.2 * dt, (targetZ - car.z) * 0.004 * (fz >= 0 ? 1 : -1) * (fx >= 0 ? 1 : 1)));
    if (!onZRoad && onXRoad) car.heading = Math.atan2(fx, 0); // turn onto the cross road
  } else {
    const targetX = Math.round(car.x / gap) * gap + (car.lane || 1) * 3;
    car.heading += Math.max(-1.2 * dt, Math.min(1.2 * dt, (targetX - car.x) * 0.004));
    if (!onXRoad && onZRoad) car.heading = Math.atan2(0, fz);
  }
  // At an intersection, sometimes turn.
  const nearIx = Math.min(mx, gap - mx) < 14;
  const nearIz = Math.min(mz, gap - mz) < 14;
  if (nearIx && nearIz && Math.random() < dt * 0.25) {
    car.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
  }
}

export function updateTraffic(G, dt) {
  const p = G.player;
  for (const car of G.cars.traffic) {
    if (car.hp <= 0) continue;
    // Flee the player when rammed hard, else cruise.
    const dp = Math.hypot(car.x - p.x, car.z - p.z);
    const target = car.fleeing ? 20 : 11;
    car.speed += (target - car.speed) * Math.min(1, dt * 0.8);
    steerToRoad(car, dt);
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    car.x += fx * car.speed * dt;
    car.z += fz * car.speed * dt;
    // Bounce off the world edge.
    if (Math.abs(car.x) > WORLD.half - 10 || Math.abs(car.z) > WORLD.half - 10 || car.z > 700) {
      car.heading += Math.PI;
    }
    // Avoid the player's car: brake when close ahead.
    if (p.car && dp < 14) {
      const ahead = (car.x - p.car.x) * Math.sin(p.car.heading) + (car.z - p.car.z) * Math.cos(p.car.heading);
      if (ahead > 0 && ahead < 14) car.speed = Math.max(0, car.speed - 20 * dt);
    }
    // Car-car separation.
    for (const other of G.cars.traffic) {
      if (other === car) continue;
      const dx = car.x - other.x, dz = car.z - other.z;
      const d = Math.hypot(dx, dz);
      if (d < 5 && d > 0.01) {
        car.x += (dx / d) * (5 - d) * 0.5;
        car.z += (dz / d) * (5 - d) * 0.5;
      }
    }
    void onRoad;
  }
  // Remove wrecks.
  G.cars.traffic = G.cars.traffic.filter((c) => c.hp > 0 || c.fleeing);
}

export function updatePedestrians(G, dt) {
  const p = G.player;
  for (const ped of G.peds) {
    // Panic: gunfire, speeding cars, or the player sprinting at them.
    const dp = Math.hypot(ped.x - p.x, ped.z - p.z);
    let panic = ped.panic;
    if (G.gunfireAt && Math.hypot(ped.x - G.gunfireAt.x, ped.z - G.gunfireAt.z) < 40) panic = 1;
    if (p.car && dp < 8 && Math.abs(p.car.speed) > 12) panic = 1;
    if (dp < 3 && p.moving) panic = Math.max(panic, 0.7);
    ped.panic = Math.max(0, panic - dt * 0.15);
    const speed = ped.speed * (ped.panic > 0 ? 3.2 : 1);
    if (ped.panic > 0) {
      // Run away from the player.
      const away = Math.atan2(ped.x - p.x, ped.z - p.z);
      ped.heading = away;
    } else if (!ped.target || Math.hypot(ped.x - ped.target.x, ped.z - ped.target.z) < 4) {
      // Pick a new stroll target on a sidewalk.
      const rp = nearestRoadPoint(ped.x + (Math.random() - 0.5) * 200, ped.z + (Math.random() - 0.5) * 200);
      ped.target = { x: rp.x + 14, z: rp.z + 14 };
    }
    if (ped.target && ped.panic <= 0) {
      ped.heading = Math.atan2(ped.target.x - ped.x, ped.target.z - ped.z);
    }
    ped.x += Math.sin(ped.heading) * speed * dt;
    ped.z += Math.cos(ped.heading) * speed * dt;
    ped.walkPhase += dt * speed * 2;
    // Keep them in the city.
    if (Math.abs(ped.x) > WORLD.half - 6) ped.heading = Math.atan2(-ped.x, ped.z - ped.z);
    if (ped.z > 680 || ped.z < -WORLD.half + 6) ped.heading = Math.atan2(ped.x - ped.x, -ped.z);
    // Hit by a speeding car: they go down and it is a crime.
    if (p.car && dp < 2.2 && Math.abs(p.car.speed) > 6) {
      ped.down = true;
      G.addWanted(1);
      G.toast('PEDESTRIAN DOWN', 'Witnesses called the police.');
      G.addParticles(ped.x, ped.z, 1.5, 8, '#ff5a5a');
      ped.x += (Math.random() - 0.5) * 30;
      ped.z += (Math.random() - 0.5) * 30;
    }
  }
  // Downed pedestrians get back up after a while (or despawn far away).
  for (const ped of G.peds) {
    if (ped.down) {
      ped.downTimer = (ped.downTimer || 0) + dt;
      if (ped.downTimer > 6) { ped.down = false; ped.downTimer = 0; }
    }
  }
}
