// weapons.js — the Cinder Foundry armoury.
// Every gun here is an invention of the foundry crews: names, prices and
// handling stats are all original to this game. Accuracy is the theme:
// spread blooms while moving or spraying and shrinks when the shooter
// stands still or crouches behind the casting pits.

export const WEAPONS = [
  {
    id: 'piston',
    name: 'Piston Sidearm',
    price: 0,
    damage: 24,
    headMult: 3.2,
    fireMs: 260,
    auto: false,
    mag: 12,
    reserve: 60,
    reloadMs: 1100,
    pellets: 1,
    spreadStill: 0.006,
    spreadMove: 0.03,
    range: 55,
    kick: 0.55,
    zoom: 1.0,
    tracer: 0xffc37a,
  },
  {
    id: 'scatter',
    name: 'Slag Scattergun',
    price: 900,
    damage: 11,
    headMult: 1.6,
    fireMs: 880,
    auto: false,
    mag: 6,
    reserve: 30,
    reloadMs: 2100,
    pellets: 8,
    spreadStill: 0.05,
    spreadMove: 0.085,
    range: 22,
    kick: 1.6,
    zoom: 1.0,
    tracer: 0xff9a3c,
  },
  {
    id: 'rivet',
    name: 'Rivet Carbine',
    price: 1700,
    damage: 30,
    headMult: 3.4,
    fireMs: 118,
    auto: true,
    mag: 25,
    reserve: 100,
    reloadMs: 1600,
    pellets: 1,
    spreadStill: 0.009,
    spreadMove: 0.045,
    range: 70,
    kick: 0.8,
    zoom: 1.08,
    tracer: 0xffd9a0,
  },
  {
    id: 'lance',
    name: 'Forge Lance',
    price: 2700,
    damage: 36,
    headMult: 3.6,
    fireMs: 102,
    auto: true,
    mag: 30,
    reserve: 120,
    reloadMs: 1900,
    pellets: 1,
    spreadStill: 0.007,
    spreadMove: 0.052,
    range: 85,
    kick: 1.0,
    zoom: 1.15,
    tracer: 0xffe9c4,
  },
  {
    id: 'longshot',
    name: 'Crucible Longshot',
    price: 4200,
    damage: 108,
    headMult: 2.4,
    fireMs: 1450,
    auto: false,
    mag: 5,
    reserve: 25,
    reloadMs: 2600,
    pellets: 1,
    spreadStill: 0.0015,
    spreadMove: 0.09,
    range: 130,
    kick: 2.4,
    zoom: 2.6,
    tracer: 0xfff3d6,
  },
];

export const GRENADE = {
  id: 'cinderbomb',
  name: 'Cinder Grenade',
  price: 300,
  damage: 85,
  radius: 5.2,
};

export function weaponById(id) {
  for (const w of WEAPONS) if (w.id === id) return w;
  return WEAPONS[0];
}

// Spread for one shot, in radians. Standing still is the accurate case;
// sprinting, jumping or holding the trigger all open the cone up.
export function currentSpread(def, shooter) {
  const speed = shooter.speed2d || 0;
  const moveT = Math.min(1, speed / 5.2);
  let s = def.spreadStill + (def.spreadMove - def.spreadStill) * moveT;
  if (shooter.crouching) s *= 0.55;
  if (!shooter.grounded) s *= 2.4;
  s *= 1 + (shooter.heat || 0) * 1.9; // sustained fire blooms the cone
  return s;
}
