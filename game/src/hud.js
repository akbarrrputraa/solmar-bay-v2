// Solmar Bay 2 — the HUD: DOM panels (cash, health, wanted stars, weapon,
// radio, speedometer, objective), the circular minimap canvas, toasts, and
// the garage shop UI. The 3D world is canvas; the interface is DOM so it
// stays crisp and readable in screenshots.

import { WEAPONS, WEAPON_ORDER, WEAPON_PRICES, AMMO_PRICE, GARAGE_UPGRADES, LANDMARKS } from './config.js';

export function createHud(G) {
  const $ = (id) => document.getElementById(id);
  const el = {
    cash: $('cash'), respect: $('respect'), missionsDone: $('missionsDone'),
    hptext: $('hptext'), hpbar: $('hpbar'), armorbar: $('armorbar'),
    stars: $('stars'), clock: $('clock'),
    missionName: $('missionName'), missionGoal: $('missionGoal'), missionTimer: $('missionTimer'),
    weaponName: $('weaponName'), ammo: $('ammo'), weaponslots: $('weaponslots'),
    station: $('station'), speed: $('speed'), carname: $('carname'),
    toast: $('toast'), hint: $('hint'), crosshair: $('crosshair'),
    minimap: $('minimap'),
  };
  const mm = el.minimap.getContext('2d');
  let toastUntil = 0;

  function showToast(title, sub, seconds) {
    el.toast.innerHTML = `${title}${sub ? `<br><span class="sub">${sub}</span>` : ''}`;
    toastUntil = performance.now() + (seconds || 3.2) * 1000;
  }

  function update(G2) {
    const p = G2.player;
    el.cash.textContent = p.cash.toLocaleString('en-US');
    el.respect.textContent = p.respect;
    el.missionsDone.textContent = p.missionsDone;
    el.hptext.textContent = Math.ceil(p.health);
    el.hpbar.style.width = `${Math.max(0, p.health)}%`;
    el.armorbar.style.width = `${Math.max(0, p.armor)}%`;
    // Wanted stars.
    let stars = '';
    for (let i = 0; i < 5; i++) stars += `<span class="star${i < p.wanted ? ' on' : ''}">★</span>`;
    el.stars.innerHTML = stars;
    el.clock.textContent = `18:42 · GOLDEN HOUR${p.wanted > 0 ? ` · HEAT ${Math.round(p.heat)}%` : ''}`;
    // Mission objective.
    const m = G2.mission;
    if (m && m.def) {
      el.missionName.textContent = m.def.name;
      let goal = m.def.goal;
      if (m.index === 4 && m.stage === 1) goal = `Hold the counter… ${Math.max(0, 3 - m.stageTimer).toFixed(0)}s`;
      if (m.index === 7 && m.stage === 1) goal = `Cracking the vault… ${Math.max(0, 5 - m.stageTimer).toFixed(0)}s`;
      el.missionGoal.textContent = goal;
      el.missionTimer.textContent = m.timer > 0 ? `⏱ ${Math.ceil(m.timer)}s` : '';
    } else if (m && m.done) {
      el.missionName.textContent = 'SOLMAR BAY — FREE ROAM';
      el.missionGoal.textContent = 'The Big Score is done. The city is yours — drive, explore, cause trouble.';
      el.missionTimer.textContent = '';
    } else {
      el.missionName.textContent = 'SOLMAR BAY';
      el.missionGoal.textContent = 'Press ENTER to start the story — or explore the city freely.';
      el.missionTimer.textContent = '';
    }
    // Weapon.
    const w = WEAPONS[p.weapon];
    el.weaponName.textContent = w.name;
    el.ammo.textContent = p.ammo[p.weapon] === Infinity ? '∞' : (p.ammo[p.weapon] ?? '—');
    el.weaponslots.textContent = WEAPON_ORDER.filter((k) => p.ownedWeapons.includes(k)).map((k) => (k === p.weapon ? `[${WEAPONS[k].name}]` : WEAPONS[k].name)).join(' · ');
    el.station.textContent = `♪ ${G2.audio.stationName}`;
    // Speedometer.
    if (p.car) {
      el.speed.textContent = Math.round(Math.abs(p.car.speed) * 2.4);
      el.carname.textContent = `${p.car.model.name.toUpperCase()} · HP ${Math.max(0, Math.round(p.car.hp))}`;
    } else {
      el.speed.textContent = '0';
      el.carname.textContent = 'ON FOOT';
    }
    el.crosshair.style.display = (!p.car && p.weapon !== 'fists' && G2.mode === 'playing') ? 'block' : 'none';
    if (toastUntil && performance.now() > toastUntil) { el.toast.innerHTML = ''; toastUntil = 0; }
    drawMinimap(G2);
  }

  function drawMinimap(G2) {
    const S = 168, C = S / 2;
    const scale = S / 1500; // world -700..700 plus margin
    mm.clearRect(0, 0, S, S);
    mm.save();
    mm.beginPath(); mm.arc(C, C, C - 2, 0, Math.PI * 2); mm.clip();
    // Sea + sand + city ground.
    mm.fillStyle = '#274b73'; mm.fillRect(0, 0, S, S);
    mm.fillStyle = '#d9b06a'; mm.fillRect(0, (560 + 700) * scale, S, S);
    mm.fillStyle = '#3a3f4d'; mm.fillRect(0, 0, S, (560 + 700) * scale);
    // Roads.
    mm.strokeStyle = '#565d6e'; mm.lineWidth = 3;
    for (let k = -700; k <= 700; k += 140) {
      mm.beginPath(); mm.moveTo((k + 700) * scale, 0); mm.lineTo((k + 700) * scale, S); mm.stroke();
      mm.beginPath(); mm.moveTo(0, (k + 700) * scale); mm.lineTo(S, (k + 700) * scale); mm.stroke();
    }
    const dot = (x, z, color, r) => {
      mm.fillStyle = color;
      mm.beginPath(); mm.arc((x + 700) * scale, (z + 700) * scale, r || 3, 0, Math.PI * 2); mm.fill();
    };
    // Landmarks.
    dot(LANDMARKS.garage[0], LANDMARKS.garage[1], '#5ab8a8', 3);
    dot(LANDMARKS.hospital[0], LANDMARKS.hospital[1], '#ffffff', 3);
    dot(LANDMARKS.bank[0], LANDMARKS.bank[1], '#c9b06a', 3);
    // Roadblocks.
    for (const rb of G2.roadblocks) dot(rb.x, rb.z, '#ff5a5a', 4);
    // Mission marker (pulsing yellow).
    const m = G2.mission;
    if (m && m.marker) {
      const pulse = 3 + Math.sin(performance.now() / 200) * 1.5;
      dot(m.marker.x, m.marker.z, '#ffd60a', pulse);
      mm.strokeStyle = '#ffd60a'; mm.lineWidth = 1.5;
      mm.beginPath(); mm.arc((m.marker.x + 700) * scale, (m.marker.z + 700) * scale, pulse + 4, 0, Math.PI * 2); mm.stroke();
    }
    // Cops (blue), traffic (grey), enemies (red).
    for (const c of G2.cars.cops) dot(c.x, c.z, '#4d8dff', 2.5);
    for (const c of G2.cars.traffic) dot(c.x, c.z, '#9aa0ad', 1.8);
    for (const e of G2.enemies) dot(e.x, e.z, '#ff5a5a', 2.5);
    if (G2.heli) dot(G2.heli.x, G2.heli.z, '#ff8a3c', 4);
    // Player arrow (rotates with heading).
    const p = G2.player;
    const px = (p.x + 700) * scale, pz = (p.z + 700) * scale;
    mm.save();
    mm.translate(px, pz);
    mm.rotate(p.heading);
    mm.fillStyle = '#ffffff';
    mm.strokeStyle = '#000000'; mm.lineWidth = 1;
    mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(5, 6); mm.lineTo(-5, 6); mm.closePath(); mm.fill(); mm.stroke();
    mm.restore();
    mm.restore();
    // Ring.
    mm.strokeStyle = 'rgba(255,255,255,0.35)'; mm.lineWidth = 2;
    mm.beginPath(); mm.arc(C, C, C - 2, 0, Math.PI * 2); mm.stroke();
  }

  // --- Garage shop -------------------------------------------------------
  function openGarage(G2) {
    const p = G2.player;
    const panel = document.getElementById('garage');
    const items = document.getElementById('garageItems');
    document.getElementById('garageCash').textContent = `Cash: $${p.cash.toLocaleString('en-US')} — upgrades apply to the car you are driving.`;
    items.innerHTML = '';
    const rows = [];
    for (const u of GARAGE_UPGRADES) {
      const owned = p.upgrades.includes(u.id);
      const blocked = u.needs && !p.upgrades.includes(u.needs);
      const row = document.createElement('div');
      row.className = 'item';
      const label = document.createElement('span');
      label.textContent = `${u.name} — $${u.price}`;
      const btn = document.createElement('button');
      btn.textContent = owned ? 'OWNED' : blocked ? `NEEDS ${u.needs.toUpperCase()}` : 'BUY';
      btn.disabled = owned || blocked || p.cash < u.price;
      btn.onclick = () => {
        if (p.cash < u.price) return;
        p.cash -= u.price;
        p.upgrades.push(u.id);
        if (u.id === 'paint' && p.car) p.car.color = '#ffd60a';
        G2.audio.sfx.cash();
        showToast('UPGRADE INSTALLED', u.name);
        openGarage(G2);
      };
      row.appendChild(label); row.appendChild(btn);
      rows.push(row);
    }
    // Weapons.
    for (const [id, price] of Object.entries(WEAPON_PRICES)) {
      const owned = p.ownedWeapons.includes(id);
      const row = document.createElement('div');
      row.className = 'item';
      const label = document.createElement('span');
      label.textContent = `${WEAPONS[id].name} — $${price}`;
      const btn = document.createElement('button');
      btn.textContent = owned ? 'OWNED' : 'BUY';
      btn.disabled = owned || p.cash < price;
      btn.onclick = () => {
        if (p.cash < price) return;
        p.cash -= price;
        p.ownedWeapons.push(id);
        p.weapon = id;
        G2.audio.sfx.cash();
        showToast('WEAPON BOUGHT', WEAPONS[id].name);
        openGarage(G2);
      };
      row.appendChild(label); row.appendChild(btn);
      rows.push(row);
    }
    // Ammo.
    const ammoRow = document.createElement('div');
    ammoRow.className = 'item';
    const ammoLabel = document.createElement('span');
    ammoLabel.textContent = `Ammo restock (all owned guns) — $${AMMO_PRICE}`;
    const ammoBtn = document.createElement('button');
    ammoBtn.textContent = 'BUY';
    ammoBtn.disabled = p.cash < AMMO_PRICE;
    ammoBtn.onclick = () => {
      if (p.cash < AMMO_PRICE) return;
      p.cash -= AMMO_PRICE;
      for (const k of p.ownedWeapons) if (p.ammo[k] !== undefined) p.ammo[k] = Math.min(999, p.ammo[k] + 60);
      G2.audio.sfx.cash();
      openGarage(G2);
    };
    ammoRow.appendChild(ammoLabel); ammoRow.appendChild(ammoBtn);
    rows.push(ammoRow);
    for (const r of rows) items.appendChild(r);
    panel.classList.remove('hidden');
  }

  function closeGarage() {
    document.getElementById('garage').classList.add('hidden');
  }

  function garageOpen() {
    return !document.getElementById('garage').classList.contains('hidden');
  }

  return { update, showToast, openGarage, closeGarage, garageOpen };
}
