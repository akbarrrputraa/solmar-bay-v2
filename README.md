# SOLMAR BAY 2 — Sunset Heat

[![make.fun bounty](https://img.shields.io/badge/make.fun-bounty-gta6--01-blue)](https://make.fun/bounty/gta6-01)
[![Prize pool](https://img.shields.io/badge/prize-%241%2C666%20USDC-22c55e)](https://make.fun/bounty/gta6-01)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A 3D open-world crime game built for the [make.fun **Make GTA 6** bounty](https://make.fun/bounty/gta6-01) — a sun-soaked original coastal city, **Solmar Bay**, with 8 story missions, a 5-star wanted system, police pursuits, a police helicopter, roadblocks, carjacking, on-foot and driving play, shooting, a garage with upgrades, a weapon wheel, radio stations, a minimap HUD, and saves.

This is a v2 entry: it replaces our v1 ("Solmar Bay") with a bigger, deeper game — more story missions, a helicopter, and a full 5-star police response.

## Play

Serve `game/` with any static server and open `index.html` in desktop Chrome:

```sh
node serve.ts
# → http://localhost:8080
```

No build step, no network requests — every file the game loads lives under `game/`. The 3D engine is a hand-written canvas renderer (`game/src/engine3d.js`); no library is vendored.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse + click | Aim / shoot (on foot) |
| Shift | Sprint |
| E | Enter / exit car (steal it) |
| Space | Handbrake |
| Q | Cycle weapon (Pistol / SMG / Shotgun) |
| R | Change radio station |
| G | Garage upgrades (near the garage) |
| P / Esc | Pause — save, resume, restart |
| M | Mute |

## Story — 8 missions

1. **First Light** — meet Mara at the pier.
2. **Hotwire 101** — steal a car, bring it to the garage.
3. **The Getaway** — outrun a 2-star pursuit to the safehouse.
4. **Harbor Lights** — timed checkpoint delivery across the city.
5. **Cash & Carry** — rob the corner store, escape a 3-star response.
6. **Sky Watch** — survive a helicopter hunt, reach the tunnel.
7. **Roadblock Run** — smash through roadblocks with the package.
8. **The Big Score** — the bank job: 5 stars, helicopter, roadblocks, escape to the yacht.

Missions pay cash and respect. Cash buys garage upgrades (engine, armor, paint) and better weapons. Wanted level rises with crimes and decays when you break line of sight. Get busted or wasted and you wake up at the clinic, lighter in the pocket.

## Layout

- `game/index.html` — page, canvas, HUD shell
- `game/src/` — one file per system: `engine3d.js` (software 3D renderer), `city.js` (Solmar Bay generation), `player.js` (on-foot + driving), `traffic.js`, `police.js` (wanted, cops, helicopter, roadblocks), `combat.js`, `missions.js`, `hud.js`, `audio.js` (synth SFX + radio), `save.js`, `input.js`, `main.js`
- `main.ts` — the make.fun hand-in program (copies `game/` + `screenshots/`, writes `dossier.json`)
- `screenshots/` — 4 real renders of the game
- `vendor/makefun-game.ts` — make.fun's dossier library, unchanged from the kit

## Entry

Built for [gta6-01](https://make.fun/bounty/gta6-01) on make.fun. Entry fee: $0. Entries close 24 Nov 2026, 15:00 UTC. All city, character, vehicle, story, art and sound names are original — nothing from any commercial game.
