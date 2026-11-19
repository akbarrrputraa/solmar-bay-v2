// Solmar Bay 2 — the story: 8 missions across Solmar Bay. Each mission is
// a small state machine (stages, markers, timers) driven by updateMissions.
// Completing one pays cash and respect and unlocks the next; failing (timer,
// busted, wasted) restarts it. The whole arc ends at the yacht.

import { MISSIONS, LANDMARKS } from './config.js';
import { spawnEnemy, spawnPickup } from './combat.js';

export function startMission(G, index) {
  const def = MISSIONS[index];
  if (!def) return false;
  const m = {
    index, def, stage: 0, timer: def.timeLimit || 0,
    marker: { x: 0, z: 0, label: '' },
    data: {}, stageTimer: 0, done: false,
  };
  G.mission = m;
  const P = LANDMARKS;
  switch (index) {
    case 0: m.marker = { x: P.pier[0], z: P.pier[1], label: 'Meet Mara at the pier' }; break;
    case 1: m.marker = { x: P.garage[0], z: P.garage[1], label: 'Bring a stolen car to the garage' }; break;
    case 2:
      m.marker = { x: P.safehouse[0], z: P.safehouse[1], label: 'Reach the safehouse' };
      G.addWanted(2);
      break;
    case 3:
      m.data.checkpoints = [[-280, 140], [140, -280], [280, 280], [P.garage[0], P.garage[1]]];
      m.data.cp = 0;
      m.marker = { x: m.data.checkpoints[0][0], z: m.data.checkpoints[0][1], label: 'Checkpoint 1/4' };
      break;
    case 4: m.marker = { x: P.store[0], z: P.store[1], label: 'Rob the Coral Row store' }; break;
    case 5:
      m.marker = { x: P.tunnel[0], z: P.tunnel[1], label: 'Reach the tunnel hideout' };
      G.addWanted(4);
      break;
    case 6:
      m.marker = { x: P.plaza[0], z: P.plaza[1], label: 'Pick up the package at the plaza' };
      break;
    case 7: m.marker = { x: P.bank[0], z: P.bank[1], label: 'Hit the Solmar Bay Bank' }; break;
  }
  G.toast(def.name, def.brief);
  G.audio.sfx.mission();
  G.hudDirty = true;
  return true;
}

function near(G, x, z, r) {
  return Math.hypot(G.player.x - x, G.player.z - z) < r;
}

function completeMission(G) {
  const m = G.mission;
  const def = m.def;
  G.player.cash += def.payout;
  G.player.respect += def.respect;
  G.player.missionsDone++;
  G.audio.sfx.cash();
  G.toast(`${def.name} — COMPLETE`, `+$${def.payout} · +${def.respect} respect`);
  if (m.index >= MISSIONS.length - 1) {
    G.mission = { index: 8, def: null, stage: 0, timer: 0, marker: null, data: {}, done: true };
    G.onGameComplete();
    return;
  }
  startMission(G, m.index + 1);
}

function failMission(G, reason) {
  const m = G.mission;
  if (!m || !m.def) return;
  G.audio.sfx.fail();
  G.toast('MISSION FAILED', `${reason} — try again, Rico.`);
  startMission(G, m.index);
}

export function updateMissions(G, dt) {
  const m = G.mission;
  if (!m || !m.def) return;
  const p = G.player;
  const P = LANDMARKS;
  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) { failMission(G, 'Out of time.'); return; }
  }
  switch (m.index) {
    case 0: // First Light: reach the pier.
      if (near(G, P.pier[0], P.pier[1], 10)) completeMission(G);
      break;
    case 1: // Hotwire: steal a car, then park at the garage.
      if (m.stage === 0 && p.car) {
        m.stage = 1;
        m.marker = { x: P.garage[0], z: P.garage[1], label: 'Park it in the garage' };
        G.toast('NICE WHEELS', 'Now get it to the Marina Garage.');
      } else if (m.stage === 1 && p.car && near(G, P.garage[0], P.garage[1], 12)) {
        completeMission(G);
      }
      break;
    case 2: // Getaway: reach the safehouse.
      if (near(G, P.safehouse[0], P.safehouse[1], 12)) completeMission(G);
      break;
    case 3: { // Harbor Lights: checkpoint race.
      const cps = m.data.checkpoints;
      const cp = cps[m.data.cp];
      if (cp && near(G, cp[0], cp[1], 12)) {
        G.audio.sfx.pickup();
        m.data.cp++;
        if (m.data.cp >= cps.length) { completeMission(G); break; }
        const next = cps[m.data.cp];
        m.marker = { x: next[0], z: next[1], label: `Checkpoint ${m.data.cp + 1}/4` };
        G.toast('CHECKPOINT', `${m.data.cp}/4 — ${Math.ceil(m.timer)}s left.`);
      }
      break;
    }
    case 4: // Cash & Carry: reach store, hold up (3s), escape to safehouse.
      if (m.stage === 0 && near(G, P.store[0], P.store[1], 12)) {
        m.stage = 1; m.stageTimer = 0;
        spawnEnemy(G, P.store[0] + 8, P.store[1] + 6, { hp: 60, drop: 120 });
        spawnEnemy(G, P.store[0] - 8, P.store[1] + 4, { hp: 60, drop: 120 });
        spawnEnemy(G, P.store[0] + 4, P.store[1] - 10, { hp: 60, drop: 120 });
        G.toast('HOLD-UP', 'Stay at the counter — grab the cash while the guards react.');
      } else if (m.stage === 1) {
        m.stageTimer += dt;
        if (m.stageTimer >= 3) {
          m.stage = 2;
          p.cash += 500;
          G.addWanted(3);
          m.marker = { x: P.safehouse[0], z: P.safehouse[1], label: 'Escape to the safehouse' };
          G.toast('CASH GRABBED — $500', 'Three stars on you. Run for the safehouse.');
        }
      } else if (m.stage === 2 && near(G, P.safehouse[0], P.safehouse[1], 12)) {
        completeMission(G);
      }
      break;
    case 5: // Sky Watch: reach the tunnel under the helicopter.
      m.stageTimer += dt;
      if (near(G, P.tunnel[0], P.tunnel[1], 12)) completeMission(G);
      else if (m.stageTimer > 60) completeMission(G); // survived a full minute
      break;
    case 6: // Roadblock Run: pickup at plaza, deliver to marina through roadblocks.
      if (m.stage === 0 && near(G, P.plaza[0], P.plaza[1], 10)) {
        m.stage = 1;
        G.addWanted(3);
        m.marker = { x: P.marina[0], z: P.marina[1], label: 'Deliver to the marina' };
        spawnPickup(G, 'health', P.plaza[0] + 6, P.plaza[1]);
        G.toast('PACKAGE SECURED', 'Roadblocks are up — punch through and deliver it.');
      } else if (m.stage === 1 && near(G, P.marina[0], P.marina[1], 12)) {
        completeMission(G);
      }
      break;
    case 7: // Big Score: bank, vault hold-up (5s), escape to the yacht at 5 stars.
      if (m.stage === 0 && near(G, P.bank[0], P.bank[1], 14)) {
        m.stage = 1; m.stageTimer = 0;
        spawnEnemy(G, P.bank[0] + 10, P.bank[1] + 8, { hp: 80, drop: 200 });
        spawnEnemy(G, P.bank[0] - 10, P.bank[1] + 6, { hp: 80, drop: 200 });
        spawnEnemy(G, P.bank[0], P.bank[1] - 12, { hp: 80, drop: 200 });
        spawnPickup(G, 'armor', P.bank[0] + 16, P.bank[1]);
        G.toast('THE VAULT', 'Crack it — hold position while the drill works.');
      } else if (m.stage === 1) {
        m.stageTimer += dt;
        if (m.stageTimer >= 5) {
          m.stage = 2;
          p.cash += 2000;
          G.addWanted(5);
          m.marker = { x: P.yacht[0], z: P.yacht[1], label: 'Escape to the yacht' };
          G.toast('VAULT CRACKED — $2,000', 'Five stars. The whole city is coming. Get to the yacht!');
        }
      } else if (m.stage === 2 && near(G, P.yacht[0], P.yacht[1], 12)) {
        completeMission(G);
      }
      break;
  }
}

/** Restart the current mission after a bust / waste (keeps story progress). */
export function restartMission(G) {
  if (G.mission && G.mission.def) startMission(G, G.mission.index);
}
