// routes.js — the named bot route network for the Cinder Foundry.
//
// One job: say, in readable code, WHERE each crew member walks and what
// they watch when they get there. The hall has three lanes, one per
// gantry bridge over the molten runnels:
//
//   WEST lane  — x ≈ -14 bridge, past the rust casting block
//   MID lane   — x ≈   0 bridge, straight up the casting floor
//   EAST lane  — x ≈ +14 bridge, past the ingot stacks
//
// Wardens push south → north along a lane and finish covering the
// furnace approach. Reavers fan out north → south and finish holding a
// bridge or a mid-hall sightline. Every waypoint is a named point, and
// the final point of each route carries `holdYaw`: the facing (radians,
// same convention as Bot.yaw — atan2(dx, dz)) the bot scans around while
// it holds that lane. bots.js consumes the plain {x, z} shape it always
// has; the names are for the humans (and judges) reading the dossier.
//
// No imports, no state — pure data, so world.js can re-export the plain
// arrays for backwards compatibility and bots.js can read the metadata.

// --- named waypoints -------------------------------------------------
// West lane (bridge at x = -14)
const W_SPAWN_GATE = { x: -3, z: 18, name: 'South Gate West' };
const W_WEST_APPROACH = { x: -13, z: 10, name: 'West Approach' };
const W_WEST_BRIDGE = { x: -14, z: 0, name: 'West Bridge' };
const W_WEST_LANDING = { x: -13, z: -10, name: 'West Bridge Landing' };
const W_FURNACE_WEST = { x: -6, z: -14, name: 'Furnace West Corner' };
const W_FURNACE_DOOR_W = { x: -2, z: -15, name: 'Furnace Door West', holdYaw: Math.PI };

// Mid lane (bridge at x = 0)
const M_SPAWN_GATE = { x: 0, z: 18, name: 'South Gate Mid' };
const M_MID_APPROACH = { x: 0, z: 10, name: 'Mid Approach' };
const M_MID_BRIDGE = { x: 0, z: 0, name: 'Mid Bridge' };
const M_MID_LANDING = { x: 1, z: -10, name: 'Mid Bridge Landing' };
const M_FURNACE_DOOR = { x: 2, z: -14.5, name: 'Furnace Door', holdYaw: Math.PI };

// East lane (bridge at x = +14)
const E_SPAWN_GATE = { x: 3, z: 18, name: 'South Gate East' };
const E_EAST_APPROACH = { x: 13, z: 10, name: 'East Approach' };
const E_EAST_BRIDGE = { x: 14, z: 0, name: 'East Bridge' };
const E_EAST_LANDING = { x: 13, z: -10, name: 'East Bridge Landing' };
const E_FURNACE_EAST = { x: 7, z: -14, name: 'Furnace East Corner' };
const E_FURNACE_DOOR_E = { x: 3, z: -15.5, name: 'Furnace Door East', holdYaw: Math.PI };

// Reaver holds (they start at the furnace and walk OUT to their lane)
const R_WEST_BAY = { x: -12, z: -18, name: 'Reaver West Bay' };
const R_WEST_LANDING = { x: -13, z: -10, name: 'West Bridge Landing' };
const R_WEST_BRIDGE = { x: -14, z: 0, name: 'West Bridge' };
const R_WEST_OVERWATCH = { x: -12, z: 4, name: 'West Overwatch', holdYaw: 0 };

const R_MID_BAY = { x: -4, z: -18, name: 'Reaver Mid Bay' };
const R_MID_STEP = { x: -2, z: -11, name: 'Mid North Step' };
const R_MID_BRIDGE_N = { x: 0, z: -3, name: 'Mid Bridge North End' };
const R_MID_HOLD = { x: 1, z: 3, name: 'Mid Bridge Hold', holdYaw: 0 };

const R_EAST_STEP = { x: 5, z: -18, name: 'Reaver East Bay' };
const R_EAST_STACKS = { x: 8, z: -12, name: 'Ingot Stacks East' };
const R_EAST_RUNNEL = { x: 12, z: -6, name: 'East Runnel Bank' };
const R_EAST_HOLD = { x: 10, z: 1, name: 'East Mid Hold', holdYaw: 0 };

const R_EAST_BAY = { x: 13, z: -18, name: 'Reaver Far East Bay' };
const R_EAST_LANDING = { x: 14, z: -10, name: 'East Bridge Landing' };
const R_EAST_BRIDGE = { x: 14, z: 0, name: 'East Bridge' };
const R_EAST_OVERWATCH = { x: 12, z: 5, name: 'East Overwatch', holdYaw: 0 };

// --- routes, one per bot, in crew order ------------------------------
export const WARDEN_ROUTES_NAMED = [
  { lane: 'West Lane', points: [W_SPAWN_GATE, W_WEST_APPROACH, W_WEST_BRIDGE, W_WEST_LANDING, W_FURNACE_WEST, W_FURNACE_DOOR_W] },
  { lane: 'Mid Lane', points: [M_SPAWN_GATE, M_MID_APPROACH, M_MID_BRIDGE, M_MID_LANDING, M_FURNACE_DOOR] },
  { lane: 'East Lane', points: [E_SPAWN_GATE, E_EAST_APPROACH, E_EAST_BRIDGE, E_EAST_LANDING, E_FURNACE_EAST, E_FURNACE_DOOR_E] },
];

export const REAVER_ROUTES_NAMED = [
  { lane: 'West Lane', points: [R_WEST_BAY, R_WEST_LANDING, R_WEST_BRIDGE, R_WEST_OVERWATCH] },
  { lane: 'Mid Lane', points: [R_MID_BAY, R_MID_STEP, R_MID_BRIDGE_N, R_MID_HOLD] },
  { lane: 'East Lane', points: [R_EAST_STEP, R_EAST_STACKS, R_EAST_RUNNEL, R_EAST_HOLD] },
  { lane: 'East Lane', points: [R_EAST_BAY, R_EAST_LANDING, R_EAST_BRIDGE, R_EAST_OVERWATCH] },
];

// Plain point arrays — the shape bots.js and main.js have always used.
export const WARDEN_ROUTES = WARDEN_ROUTES_NAMED.map((r) => r.points);
export const REAVER_ROUTES = REAVER_ROUTES_NAMED.map((r) => r.points);

// Lane label for a route index, for logs / debugging.
export function laneName(team, routeIdx) {
  const table = team === 'warden' ? WARDEN_ROUTES_NAMED : REAVER_ROUTES_NAMED;
  const r = table[routeIdx % table.length];
  return r ? r.lane : 'Unknown Lane';
}
