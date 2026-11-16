// main.js — Cinder Foundry, a round-based tactical shooter in a smelting
// hall. The Wardens (you + three bots) push north and plant a slag charge
// at the main furnace; the Ash Reavers (four bots) hold the hall. Rounds
// are won by wiping the other crew or by the charge: detonation wins it
// for the Wardens, a defuse or the clock wins it for the Reavers. Between
// rounds, earnings buy better foundry guns. Standing still or crouching
// is what makes those guns shoot straight.
//
// The simulation runs on a fixed 60 Hz step, apart from rendering.
// A deterministic screenshot mode (?shot=start|play|end&seed=N) poses one
// still scene per mode and flags window.__shotReady after its first frame.

import * as THREE from 'three';
import { Foundry, PLANT_ZONE, WARDEN_SPAWNS, REAVER_SPAWNS } from './world.js';
import { WARDEN_ROUTES, REAVER_ROUTES, laneName } from './routes.js';
import { Player } from './player.js';
import { Bot } from './bots.js';
import { WEAPONS, GRENADE, SMOKE_GRENADE, weaponById, currentSpread } from './weapons.js';
import { resolveHit, botHitPart } from './hitmodel.js';
import { SmokeField } from './smoke.js';
import { Hud } from './hud.js';
import { SoundBank } from './audio.js';
import { Rng } from './rng.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const shotRng = new Rng(parseInt(params.get('seed') || '1', 10) || 1);
const liveRng = new Rng((Math.random() * 1e9) | 0);

// ---------- renderer / scene / camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.08, 220);
scene.add(camera);

const world = new Foundry(scene);
const smoke = new SmokeField(scene);
// Soot clouds block bot sight: the world's one lineOfSight() test now
// consults the smoke field, so every perception check honours smoke.
world.smokeTest = (ax, az, bx, bz) => smoke.blocksSight(ax, az, bx, bz);
const hud = new Hud(document);
const sounds = new SoundBank();

// ---------- crews ----------
const player = new Player(WARDEN_SPAWNS[0]);
const ALLY_DEFS = [
  { name: 'Bram', weaponId: 'rivet', skill: 0.5 },
  { name: 'Sella', weaponId: 'scatter', skill: 0.55 },
  { name: 'Odo', weaponId: 'lance', skill: 0.45 },
];
const REAVER_DEFS = [
  { name: 'Vex', weaponId: 'lance', skill: 0.6 },
  { name: 'Marn', weaponId: 'rivet', skill: 0.55 },
  { name: 'Kessa', weaponId: 'scatter', skill: 0.5 },
  { name: 'Rurik', weaponId: 'longshot', skill: 0.65 },
];
let allies = [];
let reavers = [];
const stats = new Map(); // name -> {kills, deaths}

function statFor(name) {
  if (!stats.has(name)) stats.set(name, { kills: 0, deaths: 0 });
  return stats.get(name);
}

function buildCrews() {
  for (const b of [...allies, ...reavers]) scene.remove(b.group);
  allies = ALLY_DEFS.map((d, i) => new Bot(scene, {
    team: 'warden', name: d.name, spawn: WARDEN_SPAWNS[i + 1],
    route: WARDEN_ROUTES[i], lane: laneName('warden', i), weaponId: d.weaponId, skill: d.skill,
  }));
  reavers = REAVER_DEFS.map((d, i) => new Bot(scene, {
    team: 'reaver', name: d.name, spawn: REAVER_SPAWNS[i],
    route: REAVER_ROUTES[i], lane: laneName('reaver', i), weaponId: d.weaponId, skill: d.skill,
  }));
  for (const b of [...allies, ...reavers]) statFor(b.name);
  statFor('You');
}

function resetCrews() {
  buildCrews();
}

// ---------- match state ----------
const G = {
  phase: 'menu', // menu | buy | live | over | matchover
  round: 1,
  roundsTotal: 12,
  scoreW: 0,
  scoreR: 0,
  money: 800,
  timeLeft: 0,
  phaseT: 0,
  planted: false,
  plantTimer: 0,
  plantProgress: 0,
  defuseProgress: 0,
  chargePos: new THREE.Vector3(),
  winner: null,
};
const loadout = {
  primaryId: null,
  current: 'piston',
  grenades: 0,
  smokes: 0,
  mags: {}, // weaponId -> {mag, reserve}
};
function magState(id) {
  if (!loadout.mags[id]) {
    const def = weaponById(id);
    loadout.mags[id] = { mag: def.mag, reserve: def.reserve };
  }
  return loadout.mags[id];
}
function currentDef() { return weaponById(loadout.current); }

// the planted charge prop
const charge = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 0.6, metalness: 0.4 }));
  body.position.y = 0.17;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xff3b26, emissive: 0xff3b26, emissiveIntensity: 3 });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), lampMat);
  lamp.position.y = 0.4;
  charge.add(body, lamp);
  charge.userData.lampMat = lampMat;
  charge.visible = false;
  scene.add(charge);
}

// ---------- viewmodel ----------
const viewmodel = new THREE.Group();
camera.add(viewmodel);
let vmMuzzle = new THREE.Object3D();
function buildViewmodel() {
  viewmodel.clear();
  const def = currentDef();
  const len = def.id === 'longshot' ? 0.85 : def.id === 'scatter' ? 0.6 : 0.52;
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.4, metalness: 0.8 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x8a4a2b, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, len), bodyMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, len * 0.5),
    new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.35, metalness: 0.85 }));
  barrel.position.set(0, 0.045, -len * 0.7);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.09), gripMat);
  grip.position.set(0, -0.12, 0.08);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xff7a26, emissive: 0xff7a26, emissiveIntensity: 2 }));
  glow.position.set(0, 0.05, -len * 0.45);
  vmMuzzle = new THREE.Object3D();
  vmMuzzle.position.set(0, 0.045, -len * 0.98);
  for (const m of [body, barrel, grip, glow, vmMuzzle]) {
    m.raycast = () => {};
    viewmodel.add(m);
  }
  viewmodel.position.set(0.27, -0.24, -0.45);
}
buildViewmodel();

// ---------- effects: tracers, sparks, muzzle flash ----------
const tracers = [];
function spawnTracer(from, to, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geo, mat);
  line.raycast = () => {};
  scene.add(line);
  tracers.push({ line, life: 0.06 });
}
const sparks = [];
const sparkGeo = new THREE.SphereGeometry(0.07, 6, 6);
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc37a });
function spawnSpark(point) {
  const m = new THREE.Mesh(sparkGeo, sparkMat);
  m.position.copy(point);
  m.raycast = () => {};
  scene.add(m);
  sparks.push({ m, life: 0.12 });
}
const flashLight = new THREE.PointLight(0xffa03c, 0, 9, 2);
scene.add(flashLight);

// ---------- input ----------
const keys = {};
let mouseDown = false;
let locked = false;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (SHOT) return;
  if (G.phase === 'buy') handleBuyKey(e.code);
  else if (G.phase === 'live') {
    if (e.code === 'KeyR') startReload();
    if (e.code === 'KeyG') throwGrenade();
    if (e.code === 'KeyH') throwSmoke();
    if (e.code === 'Digit1' && loadout.primaryId) switchWeapon(loadout.primaryId);
    if (e.code === 'Digit2') switchWeapon('piston');
  }
  if (e.code === 'Tab') { e.preventDefault(); hud.showScoreboard(scoreRows(), scoreTitle()); }
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Tab') hud.hideScoreboard();
});
document.addEventListener('mousemove', (e) => {
  if (!locked || SHOT) return;
  player.yaw -= e.movementX * 0.0023;
  player.pitch -= e.movementY * 0.0023;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
});
document.addEventListener('mousedown', (e) => { if (locked && e.button === 0) mouseDown = true; });
document.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (!locked && !SHOT && (G.phase === 'live' || G.phase === 'buy')) {
    hud.showOverlay('Paused', 'The foundry waits. Click to step back onto the casting floor.', 'Resume');
  } else if (locked) {
    hud.hideOverlay();
  }
});
document.getElementById('play').addEventListener('click', () => {
  sounds.ensure();
  if (G.phase === 'menu' || G.phase === 'matchover') startMatch();
  renderer.domElement.requestPointerLock();
});

// ---------- economy / buy ----------
function handleBuyKey(code) {
  const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(code);
  if (idx >= 0) {
    const def = WEAPONS[idx];
    if (loadout.primaryId === def.id) { sounds.denied(); return; }
    if (def.price === 0) { switchWeapon('piston'); return; }
    if (G.money < def.price) { sounds.denied(); hud.feedLine(`Not enough funds for the ${def.name}`, 'bad'); return; }
    G.money -= def.price;
    loadout.primaryId = def.id;
    loadout.mags[def.id] = { mag: def.mag, reserve: def.reserve };
    switchWeapon(def.id);
    sounds.buy();
    refreshBuy();
    return;
  }
  if (code === 'Digit6') {
    if (G.money < GRENADE.price) { sounds.denied(); return; }
    G.money -= GRENADE.price;
    loadout.grenades++;
    sounds.buy();
    refreshBuy();
  }
  if (code === 'Digit7') {
    if (G.money < SMOKE_GRENADE.price) { sounds.denied(); return; }
    G.money -= SMOKE_GRENADE.price;
    loadout.smokes++;
    sounds.buy();
    refreshBuy();
  }
  if (code === 'Enter' || code === 'Space') endBuyPhase();
}
function refreshBuy() {
  hud.showBuy(G.money, WEAPONS, loadout.primaryId, GRENADE.price, loadout.grenades, SMOKE_GRENADE.price, loadout.smokes);
}
function switchWeapon(id) {
  loadout.current = id;
  reloading = 0;
  buildViewmodel();
}

// ---------- combat ----------
const raycaster = new THREE.Raycaster();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
let fireTimer = 0;
let reloading = 0;
let recoil = 0;

function startReload() {
  const def = currentDef();
  const st = magState(def.id);
  if (reloading > 0 || st.mag >= def.mag || st.reserve <= 0) return;
  reloading = def.reloadMs / 1000;
  sounds.reload();
}

function playerShoot(now) {
  const def = currentDef();
  const st = magState(def.id);
  if (reloading > 0) return;
  if (st.mag <= 0) { sounds.dryFire(); fireTimer = 0.25; startReload(); return; }
  st.mag--;
  fireTimer = def.fireMs / 1000;
  player.heat = Math.min(1, player.heat + 0.13);
  recoil = Math.min(0.06, recoil + 0.011 * def.kick);
  sounds.shot(def.id);

  const spread = currentSpread(def, player);
  camera.getWorldDirection(tmpV);
  const origin = player.eyePos(new THREE.Vector3());
  vmMuzzle.getWorldPosition(flashLight.position);
  flashLight.intensity = 26;

  for (let p = 0; p < def.pellets; p++) {
    const dir = tmpV.clone();
    dir.x += (liveRng.next() - 0.5) * 2 * spread;
    dir.y += (liveRng.next() - 0.5) * 2 * spread;
    dir.z += (liveRng.next() - 0.5) * 2 * spread;
    dir.normalize();
    raycaster.set(origin, dir);
    raycaster.far = def.range * 1.6;
    const hits = raycaster.intersectObjects(scene.children, true);
    let end = origin.clone().add(dir.clone().multiplyScalar(def.range));
    for (const hit of hits) {
      const ud = hit.object.userData;
      if (ud && ud.bot && !ud.bot.alive) continue;
      end = hit.point;
      if (ud && ud.bot) {
        const bot = ud.bot;
        // one damage model for every shooter — see hitmodel.js. The
        // head mesh is a distinct hitbox (userData.part === 'head').
        const res = resolveHit(def, ud.part, hit.distance);
        const died = bot.takeDamage(res.damage);
        hud.hitmark(res.isHead);
        sounds.hit(res.isHead);
        if (died) onKill(player, bot, { weaponName: def.name, headshot: res.isHead });
      } else {
        spawnSpark(hit.point);
      }
      break;
    }
    spawnTracer(flashLight.position.clone(), end, def.tracer);
  }
  // gunfire carries: nearby reavers turn toward the noise
  for (const b of reavers) {
    if (b.alive && b.pos.distanceTo(player.pos) < 22) b.hearShot(player.pos);
  }
}

function botShoot(bot, target, dist) {
  if (dist < 36) sounds.enemyShot();
  const origin = bot.pos.clone(); origin.y = 1.3;
  origin.x += Math.sin(bot.yaw) * 0.5; origin.z += Math.cos(bot.yaw) * 0.5;
  const targetSpeed = target.speed2d || 0;
  let p = 0.3 + bot.skill * 0.42 - dist * 0.006 - targetSpeed * 0.05 - bot.heat * 0.14;
  if (target.crouching) p -= 0.05;
  p = Math.max(0.05, Math.min(0.78, p));
  let end;
  if (liveRng.next() < p) {
    // bots strike head or body through the same hitmodel as the player
    const part = botHitPart(liveRng);
    const head = part === 'head';
    end = head ? target.headCenter(new THREE.Vector3()) : target.chestCenter(new THREE.Vector3());
    const res = resolveHit(bot.weapon, part, dist);
    const died = target.takeDamage(res.damage);
    if (target.isPlayer) { hud.damageFlash(); sounds.hurt(); }
    if (died) onKill(bot, target, { weaponName: bot.weapon.name, headshot: head });
  } else {
    end = target.chestCenter(new THREE.Vector3());
    end.x += (liveRng.next() - 0.5) * 2.4;
    end.y += (liveRng.next() - 0.5) * 1.2;
    end.z += (liveRng.next() - 0.5) * 2.4;
  }
  spawnTracer(origin, end, bot.team === 'reaver' ? 0x9fe8dc : 0xffc37a);
  for (const b of (bot.team === 'reaver' ? allies : reavers)) {
    if (b.alive && b !== bot && b.pos.distanceTo(bot.pos) < 18) b.hearShot(bot.pos);
  }
}

function onKill(killer, victim, opts = {}) {
  statFor(killer.name).kills++;
  statFor(victim.name).deaths++;
  const kName = killer.isPlayer ? 'You' : killer.name;
  hud.killFeed(kName, victim.name, {
    weaponName: opts.weaponName, headshot: !!opts.headshot,
    cls: victim.team === 'reaver' ? 'good' : 'bad',
  });
  if (opts.headshot && killer.isPlayer) sounds.headshotKill();
  if (killer.isPlayer) { G.money += 300; hud.feedLine('+$300 salvage bounty', 'good'); }
  checkRoundEnd();
}

// ---------- grenades ----------
const grenadesInFlight = [];
const grenadeGeo = new THREE.SphereGeometry(0.11, 10, 10);
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0xff7a26, emissive: 0xff7a26, emissiveIntensity: 1.4 });
function throwGrenade() {
  if (loadout.grenades <= 0 || !player.alive || reloading > 0) return;
  loadout.grenades--;
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.raycast = () => {};
  const origin = player.eyePos(new THREE.Vector3());
  camera.getWorldDirection(tmpV);
  mesh.position.copy(origin).add(tmpV.clone().multiplyScalar(0.6));
  scene.add(mesh);
  grenadesInFlight.push({ mesh, vel: tmpV.clone().multiplyScalar(13).add(new THREE.Vector3(0, 3.4, 0)), fuse: 1.5 });
  sounds.tone(600, 900, 0.08, 'sine', 0.2);
}
function updateGrenades(dt) {
  for (let i = grenadesInFlight.length - 1; i >= 0; i--) {
    const g = grenadesInFlight[i];
    g.fuse -= dt;
    g.vel.y -= 16 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    if (g.mesh.position.y < 0.12) { g.mesh.position.y = 0.12; g.vel.y *= -0.35; g.vel.x *= 0.7; g.vel.z *= 0.7; }
    if (g.fuse <= 0) {
      explode(g.mesh.position);
      scene.remove(g.mesh);
      grenadesInFlight.splice(i, 1);
    }
  }
}
function explode(at) {
  sounds.explosion(false);
  flashLight.position.copy(at).y += 1;
  flashLight.intensity = 90;
  spawnSpark(at.clone());
  for (const b of [...allies, ...reavers]) {
    if (!b.alive) continue;
    const d = b.pos.distanceTo(at);
    if (d < GRENADE.radius) {
      const died = b.takeDamage(GRENADE.damage * (1 - d / (GRENADE.radius * 1.4)));
      if (died) onKill(player, b, { weaponName: GRENADE.name });
    }
  }
}

// ---------- smoke canisters ----------
// Same lobbed flight as the Cinder Grenade, but the payload is a Soot
// cloud (smoke.js): no damage, pure sight denial. Bots caught on the
// far side lose their target and fall back to last-seen pursuit.
const smokesInFlight = [];
const smokeGeo = new THREE.SphereGeometry(0.11, 10, 10);
const smokeMat = new THREE.MeshStandardMaterial({ color: 0x8d8578, roughness: 0.9, metalness: 0.1 });
function throwSmoke() {
  if (loadout.smokes <= 0 || !player.alive || reloading > 0) return;
  loadout.smokes--;
  const mesh = new THREE.Mesh(smokeGeo, smokeMat);
  mesh.raycast = () => {};
  const origin = player.eyePos(new THREE.Vector3());
  camera.getWorldDirection(tmpV);
  mesh.position.copy(origin).add(tmpV.clone().multiplyScalar(0.6));
  scene.add(mesh);
  smokesInFlight.push({ mesh, vel: tmpV.clone().multiplyScalar(12).add(new THREE.Vector3(0, 3.2, 0)), fuse: 1.1 });
  sounds.tone(420, 640, 0.08, 'sine', 0.18);
}
function updateSmokes(dt) {
  for (let i = smokesInFlight.length - 1; i >= 0; i--) {
    const g = smokesInFlight[i];
    g.fuse -= dt;
    g.vel.y -= 16 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    if (g.mesh.position.y < 0.12) { g.mesh.position.y = 0.12; g.vel.y *= -0.3; g.vel.x *= 0.7; g.vel.z *= 0.7; }
    if (g.fuse <= 0) {
      smoke.burst(g.mesh.position, SMOKE_GRENADE);
      sounds.smokeHiss();
      scene.remove(g.mesh);
      smokesInFlight.splice(i, 1);
    }
  }
  smoke.update(dt);
}

// ---------- round flow ----------
function startMatch() {
  G.round = 1; G.scoreW = 0; G.scoreR = 0; G.money = 800;
  loadout.primaryId = null; loadout.current = 'piston'; loadout.grenades = 0; loadout.smokes = 0; loadout.mags = {};
  stats.clear();
  startRound();
}
function startRound() {
  resetCrews();
  player.reset(WARDEN_SPAWNS[0]);
  G.planted = false; G.plantProgress = 0; G.defuseProgress = 0;
  charge.visible = false;
  for (const g of grenadesInFlight) scene.remove(g.mesh);
  grenadesInFlight.length = 0;
  for (const g of smokesInFlight) scene.remove(g.mesh);
  smokesInFlight.length = 0;
  smoke.clear();
  reloading = 0; fireTimer = 0;
  // everyone keeps their bought gun between rounds; ammo refills
  for (const id of Object.keys(loadout.mags)) {
    const def = weaponById(id);
    loadout.mags[id] = { mag: def.mag, reserve: def.reserve };
  }
  buildViewmodel();
  G.phase = 'buy';
  G.timeLeft = 12;
  refreshBuy();
  hud.banner(`ROUND ${G.round}`, 'Buy your gear — the Reavers are already in the hall');
}
function endBuyPhase() {
  if (G.phase !== 'buy') return;
  hud.hideBuy();
  G.phase = 'live';
  G.timeLeft = 100;
  hud.banner('SHIFT START', 'Plant the slag charge at the main furnace');
}
function endRound(winnerTeam, reason) {
  if (G.phase !== 'live') return;
  G.phase = 'over';
  G.phaseT = 4.5;
  G.winner = winnerTeam;
  hud.hideBuy();
  if (winnerTeam === 'warden') {
    G.scoreW++; G.money += 2400;
    hud.banner('WARDENS TAKE THE ROUND', reason);
    sounds.roundWin();
  } else {
    G.scoreR++; G.money += 1400;
    hud.banner('REAVERS HOLD THE FOUNDRY', reason);
    sounds.roundLose();
  }
  if (G.planted && winnerTeam === 'warden' && reason.includes('detonated')) sounds.explosion(true);
  hud.showScoreboard(scoreRows(), scoreTitle());
}
function scoreTitle() {
  return `WARDENS ${G.scoreW} — ${G.scoreR} REAVERS`;
}
function scoreRows() {
  const rows = [];
  rows.push(rowFor('You', 'Wardens', player, true));
  for (const b of allies) rows.push(rowFor(b.name, 'Wardens', b, false));
  for (const b of reavers) rows.push(rowFor(b.name, 'Reavers', b, false));
  return rows;
}
function rowFor(name, team, actor, me) {
  const s = statFor(name);
  return { name, team, kills: s.kills, deaths: s.deaths, alive: actor.alive, me };
}
function checkRoundEnd() {
  if (G.phase !== 'live') return;
  const wardensAlive = (player.alive ? 1 : 0) + allies.filter((b) => b.alive).length;
  const reaversAlive = reavers.filter((b) => b.alive).length;
  if (reaversAlive === 0) endRound('warden', 'The Reaver crew is down');
  else if (wardensAlive === 0 && !G.planted) endRound('reaver', 'The Warden crew is down');
}
function updatePlant(dt) {
  if (!G.planted) {
    const inZone = player.alive &&
      Math.hypot(player.pos.x - PLANT_ZONE.x, player.pos.z - PLANT_ZONE.z) < PLANT_ZONE.radius;
    if (inZone && keys['KeyE']) {
      G.plantProgress += dt / 3;
      if (G.plantProgress >= 1) {
        G.planted = true;
        G.plantTimer = 35;
        G.money += 350;
        charge.position.copy(player.pos);
        charge.visible = true;
        G.chargePos.copy(player.pos);
        sounds.plantBeep(true);
        hud.banner('CHARGE PLANTED', 'Hold the furnace for 35 seconds');
        hud.feedLine('The slag charge is live +$350', 'good');
        // reavers converge on the charge to defuse it — drop any stale
        // pursuit memory so the objective, not an old sighting, leads
        for (const b of reavers) if (b.alive) { b.route = [{ x: G.chargePos.x, z: G.chargePos.z }]; b.routeIdx = 0; b.hasLastSeen = false; }
      }
    } else {
      G.plantProgress = Math.max(0, G.plantProgress - dt * 0.7);
    }
    return;
  }
  G.plantTimer -= dt;
  const lampMat = charge.userData.lampMat;
  lampMat.emissiveIntensity = (Math.sin(performance.now() * 0.02) > 0) ? 3.4 : 0.4;
  if (Math.ceil(G.plantTimer) !== Math.ceil(G.plantTimer + dt) && G.plantTimer < 10) sounds.plantBeep(false);
  // defuse: a reaver at the charge with no warden close by
  const defenderNear = (player.alive && player.pos.distanceTo(G.chargePos) < 3.2) ||
    allies.some((b) => b.alive && b.pos.distanceTo(G.chargePos) < 3.2);
  const defuser = reavers.find((b) => b.alive && b.pos.distanceTo(G.chargePos) < 2.3);
  if (defuser && !defenderNear) {
    G.defuseProgress += dt / 5;
    if (G.defuseProgress >= 1) { endRound('reaver', 'The charge was quenched in the slag pit'); return; }
  } else {
    G.defuseProgress = Math.max(0, G.defuseProgress - dt * 0.5);
  }
  if (G.plantTimer <= 0) endRound('warden', 'The charge detonated — the furnace is breached');
}

// ---------- per-step simulation ----------
const botCtx = { world, rng: liveRng, shoot: botShoot };
function stepSim(dt) {
  if (G.phase === 'buy') {
    G.timeLeft -= dt;
    if (G.timeLeft <= 0) endBuyPhase();
    return;
  }
  if (G.phase === 'over') {
    G.phaseT -= dt;
    if (G.phaseT <= 0) {
      hud.hideScoreboard();
      const need = Math.floor(G.roundsTotal / 2) + 1;
      if (G.scoreW >= need || G.scoreR >= need || G.round >= G.roundsTotal) {
        G.phase = 'matchover';
        const won = G.scoreW > G.scoreR;
        hud.showOverlay(
          won ? 'THE FOUNDRY IS YOURS' : 'THE REAVERS KEEP THE HALL',
          `Final score — Wardens ${G.scoreW}, Reavers ${G.scoreR}. Click to run another shift.`,
          'Play again',
        );
        document.exitPointerLock?.();
      } else {
        G.round++;
        startRound();
      }
    }
    return;
  }
  if (G.phase !== 'live') return;

  G.timeLeft -= dt;
  if (G.timeLeft <= 0 && !G.planted) { endRound('reaver', 'The shift clock ran out'); return; }

  // player
  const moveKeys = {
    f: !!keys['KeyW'], b: !!keys['KeyS'], l: !!keys['KeyA'], r: !!keys['KeyD'],
    jump: !!keys['Space'], crouch: !!(keys['ControlLeft'] || keys['KeyC']),
  };
  player.update(dt, moveKeys, world);
  fireTimer -= dt;
  if (reloading > 0) {
    reloading -= dt;
    if (reloading <= 0) {
      const def = currentDef();
      const st = magState(def.id);
      const take = Math.min(def.mag - st.mag, st.reserve);
      st.mag += take; st.reserve -= take;
    }
  }
  const def = currentDef();
  if (mouseDown && player.alive && fireTimer <= 0) {
    playerShoot();
    if (!def.auto) mouseDown = false;
  }

  // bots
  const wardenActors = [player, ...allies];
  const reaverActors = [...reavers];
  for (const b of allies) { botCtx.opponents = reaverActors; b.update(dt, botCtx); }
  for (const b of reavers) { botCtx.opponents = wardenActors; b.update(dt, botCtx); }

  updatePlant(dt);
  updateGrenades(dt);
  updateSmokes(dt);
  checkRoundEnd();
}

// ---------- camera & HUD per frame ----------
let menuAngle = 0;
function placeCamera(dt) {
  if (SHOT) return; // shot mode poses its own camera
  if (G.phase === 'menu' || G.phase === 'matchover') {
    menuAngle += dt * 0.07;
    camera.position.set(Math.sin(menuAngle) * 20, 9.5, Math.cos(menuAngle) * 20);
    camera.lookAt(0, 1, -6);
    viewmodel.visible = false;
    return;
  }
  viewmodel.visible = player.alive;
  recoil = Math.max(0, recoil - dt * 0.24);
  const eye = player.eyePos(tmpV2);
  camera.position.copy(eye);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch + recoil;
  camera.rotation.z = 0;
  // viewmodel bob + recoil push
  const bob = Math.sin(performance.now() * 0.011) * 0.008 * Math.min(1, player.speed2d / 4);
  viewmodel.position.y = -0.24 + bob;
  viewmodel.position.z = -0.45 + recoil * 1.4;
  const fovTarget = currentDef().zoom > 1.2 && keys['MouseRight'] ? 74 / currentDef().zoom : 74;
  camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 10);
  camera.updateProjectionMatrix();
}
addEventListener('mousedown', (e) => { if (e.button === 2) keys['MouseRight'] = true; });
addEventListener('mouseup', (e) => { if (e.button === 2) keys['MouseRight'] = false; });
addEventListener('contextmenu', (e) => e.preventDefault());

function refreshHud() {
  const def = currentDef();
  const st = magState(def.id);
  let objective = 'Plant the slag charge at the main furnace [hold E]';
  if (G.phase === 'buy') objective = 'Buy phase — keys 1-6, Enter to start';
  else if (G.planted) objective = `CHARGE LIVE — detonates in ${Math.ceil(G.plantTimer)}s`;
  else if (G.phase === 'over') objective = 'Round over';
  else if (!player.alive) objective = 'You are down — your crew fights on';
  hud.update({
    hp: player.hp, money: G.money, round: G.round, roundsTotal: G.roundsTotal,
    timeLeft: G.planted ? G.plantTimer : G.timeLeft, planted: G.planted,
    mag: st.mag, reserve: st.reserve, reloading: reloading > 0,
    scoreW: G.scoreW, scoreR: G.scoreR, weaponName: def.name,
    grenades: loadout.grenades, smokes: loadout.smokes, objective,
    spread: currentSpread(def, player), plantProgress: G.plantProgress,
  });
}

// ---------- deterministic screenshot scenes ----------
function poseShotScene() {
  buildCrews();
  // shared dressing: mid-match economy and loadout for the HUD
  G.money = 3350; G.round = 4; G.scoreW = 3; G.scoreR = 2;
  loadout.primaryId = 'lance'; loadout.current = 'lance'; loadout.grenades = 1; loadout.smokes = 1;
  loadout.mags = { lance: { mag: 17, reserve: 64 }, piston: { mag: 12, reserve: 60 } };
  buildViewmodel();

  if (SHOT === 'start') {
    G.phase = 'buy';
    G.timeLeft = 12;
    refreshBuy();
    refreshHud();
    hud.showOverlay(
      'CINDER FOUNDRY',
      'Wardens versus Ash Reavers in a working smelting hall. Plant the slag charge at the main furnace — or hold the lanes and stop it. Click to play.',
      'Click to play',
    );
    // crews posed on their spawn pads, facing off down the hall
    allies.forEach((b, i) => { b.pos.set(-6 + i * 2.5, 0, 17); b.yaw = Math.PI; b.group.position.copy(b.pos); b.group.rotation.y = Math.PI; });
    reavers.forEach((b, i) => { b.pos.set(-9 + i * 5, 0, -13 - (i % 2) * 2); b.yaw = 0; b.group.position.copy(b.pos); b.group.rotation.y = 0; });
    player.pos.set(0, 0, 19);
    camera.position.set(11.5, 5.2, 15.5);
    camera.lookAt(-2, 1.2, -14);
    viewmodel.visible = false;
  }

  if (SHOT === 'play') {
    hud.hideOverlay();
    G.phase = 'live';
    G.timeLeft = 73;
    player.pos.set(3.0, 0, 4.2);
    player.hp = 74;
    player.yaw = 0.05; player.pitch = -0.03;
    camera.position.set(3.0, 1.62, 4.2);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(-0.03, 0.05, 0);
    viewmodel.visible = true;
    // two reavers caught in the open ahead, one ally covering the left lane
    const spots = [
      { b: reavers[0], x: -2.2, z: -4.5, yaw: 0.15, crouch: false },
      { b: reavers[1], x: 3.4, z: -7.5, yaw: -0.12, crouch: true },
      { b: reavers[2], x: 10, z: -14, yaw: 0.05, crouch: false },
      { b: reavers[3], x: -13, z: -11, yaw: 0.1, crouch: false },
      { b: allies[0], x: -3.4, z: 4.6, yaw: Math.PI + 0.1, crouch: false },
      { b: allies[1], x: -12.5, z: -1, yaw: Math.PI, crouch: false },
      { b: allies[2], x: 13.5, z: 2, yaw: Math.PI - 0.1, crouch: true },
    ];
    for (const s of spots) {
      s.b.pos.set(s.x + (shotRng.next() - 0.5) * 0.4, 0, s.z);
      s.b.yaw = s.yaw; s.b.crouching = s.crouch;
      s.b.group.position.copy(s.b.pos);
      s.b.group.position.y = s.crouch ? -0.28 : 0;
      s.b.group.rotation.y = s.yaw;
    }
    // a tracer mid-flight and the muzzle still lit
    spawnTracer(new THREE.Vector3(3.3, 1.5, 3.4), new THREE.Vector3(-2.1, 1.35, -4.4), 0xffe9c4);
    spawnTracer(new THREE.Vector3(-2.0, 1.35, -4.2), new THREE.Vector3(2.8, 1.1, 3.6), 0x9fe8dc);
    flashLight.position.set(3.3, 1.5, 3.4);
    flashLight.intensity = 30;
    hud.killFeed('Sella', 'Kessa', { weaponName: 'Slag Scattergun', cls: 'good' });
    hud.killFeed('Vex', 'Bram', { weaponName: 'Forge Lance', headshot: true, cls: 'bad' });
    // a Soot cloud hangs over the west runnel bank — sight denied there
    smoke.burst(new THREE.Vector3(-8.5, 0, -2.5), SMOKE_GRENADE);
    smoke.update(1.2);
    refreshHud();
  }

  if (SHOT === 'end') {
    hud.hideOverlay();
    G.phase = 'over';
    G.scoreW = 4; G.scoreR = 2;
    G.planted = true; G.plantTimer = 0;
    charge.position.set(0.8, 0, -13.8);
    charge.visible = true;
    player.pos.set(2.5, 0, -6);
    camera.position.set(6.5, 3.4, -4.5);
    camera.lookAt(0, 1, -15);
    viewmodel.visible = false;
    reavers[1].takeDamage(200);
    reavers[3].takeDamage(200);
    statFor('You').kills = 3; statFor('You').deaths = 1;
    statFor('Bram').kills = 2; statFor('Sella').kills = 2; statFor('Odo').kills = 1;
    statFor('Vex').kills = 2; statFor('Vex').deaths = 2;
    statFor('Marn').deaths = 3; statFor('Kessa').kills = 1; statFor('Kessa').deaths = 2; statFor('Rurik').deaths = 2;
    hud.banner('WARDENS TAKE THE ROUND', 'The charge detonated — the furnace is breached');
    hud.showScoreboard(scoreRows(), scoreTitle());
    refreshHud();
  }
}

// ---------- boot & main loop ----------
buildCrews();
if (SHOT) {
  poseShotScene();
} else {
  hud.showOverlay(
    'CINDER FOUNDRY',
    'Wardens versus Ash Reavers in a working smelting hall. Plant the slag charge at the main furnace — or hold the lanes and stop it.',
    'Click to play',
  );
}

let last = performance.now();
let acc = 0;
let shotSignalled = false;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!SHOT) {
    acc += dt;
    const step = 1 / 60;
    while (acc >= step) { stepSim(step); acc -= step; }
    placeCamera(dt);
    refreshHud();
  }
  world.update(dt, now / 1000);
  // fade effects (frozen in screenshot mode so the posed action holds)
  if (!SHOT) {
    for (let i = tracers.length - 1; i >= 0; i--) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) {
        scene.remove(tracers[i].line);
        tracers[i].line.geometry.dispose();
        tracers[i].line.material.dispose();
        tracers.splice(i, 1);
      }
    }
    flashLight.intensity = Math.max(0, flashLight.intensity - dt * 320);
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    sparks[i].life -= dt;
    sparks[i].m.scale.setScalar(Math.max(0.01, sparks[i].life * 6));
    if (sparks[i].life <= 0) { scene.remove(sparks[i].m); sparks.splice(i, 1); }
  }
  renderer.render(scene, camera);
  if (SHOT && !shotSignalled) {
    shotSignalled = true;
    window.__shotReady = true;
  }
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
