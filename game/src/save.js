// Solmar Bay 2 — saves: localStorage autosave (after every mission, and
// every 30 seconds of play) plus manual save from the pause menu. A save
// holds cash, respect, health, armor, weapons, upgrades, mission progress
// and the player's position — never anything else.

const KEY = 'solmar-bay-2-save-v1';

export function hasSave() {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function saveGame(G) {
  const p = G.player;
  const data = {
    v: 1,
    savedAt: new Date().toISOString(),
    x: p.x, z: p.z, heading: p.heading,
    health: p.health, armor: p.armor,
    cash: p.cash, respect: p.respect,
    weapon: p.weapon, ammo: p.ammo, ownedWeapons: p.ownedWeapons,
    upgrades: p.upgrades,
    missionsDone: p.missionsDone,
    missionIndex: G.mission && G.mission.def ? G.mission.index : (G.mission && G.mission.done ? 8 : 0),
    wanted: 0,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function applySave(G, data) {
  const p = G.player;
  p.x = data.x; p.z = data.z; p.heading = data.heading || 0;
  p.health = data.health; p.armor = data.armor;
  p.cash = data.cash; p.respect = data.respect;
  p.weapon = data.weapon; p.ammo = data.ammo; p.ownedWeapons = data.ownedWeapons;
  p.upgrades = data.upgrades || [];
  p.missionsDone = data.missionsDone || 0;
  p.wanted = 0; p.heat = 0;
  return data.missionIndex || 0;
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* best-effort */ }
}
