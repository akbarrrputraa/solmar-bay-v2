// Solmar Bay 2 — tuning constants, car models, weapons, radio stations and
// the story. Everything the other systems read lives here so the game can be
// rebalanced from one file.

export const WORLD = {
  half: 700, // city extends -700..700 on x and z; beach/sea beyond z > 560
  roadGap: 140, // distance between road centerlines
  roadWidth: 22,
  seed: 20261119,
  goldenHour: '18:42',
};

export const PLAYER = {
  walkSpeed: 9,
  runSpeed: 15,
  radius: 1.1,
  maxHealth: 100,
  maxArmor: 100,
  startCash: 250,
};

export const CAR_MODELS = [
  { name: 'Civic Sedan', color: '#c94f4f', top: 26, accel: 15, grip: 2.6, len: 4.6, wid: 2.0 },
  { name: 'Bay Taxi', color: '#f2c230', top: 27, accel: 15, grip: 2.6, len: 4.6, wid: 2.0 },
  { name: 'Comet Sport', color: '#e8446c', top: 38, accel: 21, grip: 3.4, len: 4.4, wid: 2.0 },
  { name: 'Vulcan GT', color: '#3f7fe0', top: 42, accel: 23, grip: 3.6, len: 4.5, wid: 2.1 },
  { name: 'Harbor Van', color: '#7a8899', top: 22, accel: 11, grip: 2.2, len: 5.4, wid: 2.3 },
  { name: 'Sunset Coupe', color: '#ff8a3c', top: 36, accel: 20, grip: 3.2, len: 4.5, wid: 2.0 },
  { name: 'Patrol Cruiser', color: '#20242e', top: 34, accel: 20, grip: 3.4, len: 4.8, wid: 2.1 },
];

export const WEAPONS = {
  fists: { name: 'Fists', damage: 12, rate: 0.35, range: 3, ammo: Infinity, auto: false, spread: 0 },
  pistol: { name: 'P9 Pistol', damage: 22, rate: 0.28, range: 55, ammo: 120, auto: false, spread: 0.02 },
  smg: { name: 'K9 SMG', damage: 13, rate: 0.09, range: 48, ammo: 240, auto: true, spread: 0.06 },
  shotgun: { name: 'Street Sweeper', damage: 16, rate: 0.85, range: 26, ammo: 40, auto: false, spread: 0.16, pellets: 6 },
};

export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun'];
export const WEAPON_PRICES = { pistol: 400, smg: 900, shotgun: 1200 };
export const AMMO_PRICE = 150;

export const GARAGE_UPGRADES = [
  { id: 'engine1', name: 'Stage 1 Engine — +top speed', price: 600, desc: 'top' },
  { id: 'engine2', name: 'Stage 2 Engine — +top speed', price: 1200, desc: 'top', needs: 'engine1' },
  { id: 'armor1', name: 'Reinforced Frame — +car HP', price: 500, desc: 'hp' },
  { id: 'armor2', name: 'Armored Plating — +car HP', price: 1000, desc: 'hp', needs: 'armor1' },
  { id: 'paint', name: 'Sunset Pearl Paint Job', price: 300, desc: 'paint' },
];

export const RADIO = [
  { name: 'BAY FM 101.1 — Sunset Drive', bpm: 96, root: 220, mode: [0, 3, 5, 7, 10] },
  { name: 'WAVE 88.5 — Neon Nights', bpm: 122, root: 196, mode: [0, 2, 3, 7, 8] },
  { name: 'K-SOL 94.7 — Harbor Blues', bpm: 72, root: 174, mode: [0, 3, 5, 6, 10] },
];

// Landmarks: name -> [x, z]. The story, the minimap and the garage all use these.
export const LANDMARKS = {
  pier: [0, 620],
  marina: [-420, 560],
  garage: [-420, 500],
  safehouse: [420, -420],
  hospital: [280, 280],
  bank: [0, 0],
  store: [140, 140],
  tunnel: [-560, -560],
  yacht: [120, 640],
  plaza: [0, -280],
};

export const MISSIONS = [
  {
    id: 'first-light', name: '1 · FIRST LIGHT', payout: 300, respect: 10,
    goal: 'Meet Mara at the pier — follow the yellow marker south to the water.',
    brief: 'Mara Kessler is waiting at the pier. Get there any way you like — on foot or in a borrowed car.',
  },
  {
    id: 'hotwire', name: '2 · HOTWIRE 101', payout: 400, respect: 15,
    goal: 'Steal any car (walk up and press E) and bring it to the Marina Garage.',
    brief: 'Mara needs wheels that cannot be traced. Steal a car and park it in the garage.',
  },
  {
    id: 'getaway', name: '3 · THE GETAWAY', payout: 700, respect: 25,
    goal: 'The cops are onto you — reach the safehouse and lose the heat.',
    brief: 'A patrol spotted the stolen car. Lose them and get to the safehouse in one piece.',
  },
  {
    id: 'harbor-lights', name: '4 · HARBOR LIGHTS', payout: 900, respect: 30,
    goal: 'Timed delivery: hit every checkpoint before the clock runs out.',
    brief: 'A package for the harbor crew. Four checkpoints, ninety seconds, no excuses.',
    timeLimit: 90,
  },
  {
    id: 'cash-carry', name: '5 · CASH & CARRY', payout: 1400, respect: 40,
    goal: 'Rob the corner store, grab the cash, and escape the 3-star response.',
    brief: 'The store on Coral Row keeps its takings in the back. Take it — and mind the guards.',
  },
  {
    id: 'sky-watch', name: '6 · SKY WATCH', payout: 1600, respect: 45,
    goal: 'A police helicopter is on you — survive and reach the tunnel hideout.',
    brief: 'The department sent its eye in the sky. Stay moving, break its line of sight, reach the tunnel.',
  },
  {
    id: 'roadblock', name: '7 · ROADBLOCK RUN', payout: 2000, respect: 55,
    goal: 'Smash through the roadblocks and deliver the package to the plaza.',
    brief: 'The whole force is out tonight. Punch through their roadblocks and finish the run.',
  },
  {
    id: 'big-score', name: '8 · THE BIG SCORE', payout: 5000, respect: 100,
    goal: 'Rob the Solmar Bay Bank vault, then escape 5 stars to the yacht.',
    brief: 'The vault. The helicopter. Every cop in the city. Get the money and get to the yacht — this is the one they will sing about.',
  },
];
