// smoke.js — Soot Canister clouds: the vision-blocking smoke grenade.
//
// One job: own every live smoke cloud — its puff meshes, its lifetime,
// and the sight test that makes the cloud tactically real.
//
// How the blocking works: main.js registers this field with the world
// (world.smokeTest = (ax, az, bx, bz) => field.blocksSight(...)) and
// Foundry.lineOfSight() consults it. Bot perception in bots.js is built
// entirely on lineOfSight(), so a bot on one side of a cloud genuinely
// cannot acquire a target on the other side — it falls back to its
// last-seen-position pursuit, exactly like losing sight around a wall.
// The cloud is a soft cylinder for sight purposes: if the 2D segment
// between two actors passes within the cloud radius of its centre, the
// line is blocked. The thrown canister itself is handled in main.js
// (same flight model as the Cinder Grenade); this module starts at the
// burst.

import * as THREE from 'three';

const PUFF_COUNT = 9;
const puffGeo = new THREE.SphereGeometry(1, 10, 8);

export class SmokeField {
  constructor(scene) {
    this.scene = scene;
    this.clouds = []; // {x, z, r, life, ttl, group, mat}
  }

  // Burst a canister at a floor position. def: SMOKE_GRENADE from
  // weapons.js ({radius, duration}).
  burst(pos, def) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8d8578, roughness: 1, metalness: 0,
      transparent: true, opacity: 0, depthWrite: false,
    });
    const group = new THREE.Group();
    for (let i = 0; i < PUFF_COUNT; i++) {
      const puff = new THREE.Mesh(puffGeo, mat);
      const a = (i / PUFF_COUNT) * Math.PI * 2;
      const rr = i === 0 ? 0 : def.radius * 0.45;
      puff.position.set(Math.cos(a) * rr, 0.9 + (i % 3) * 0.55, Math.sin(a) * rr);
      puff.scale.setScalar(0.4);
      puff.raycast = () => {};
      group.add(puff);
    }
    group.position.set(pos.x, 0, pos.z);
    this.scene.add(group);
    this.clouds.push({ x: pos.x, z: pos.z, r: def.radius, life: 0, ttl: def.duration, group, mat });
  }

  // Sight test in the floor plane: does segment a→b pass through any
  // cloud that is still thick (first and last moments are wispy)?
  blocksSight(ax, az, bx, bz) {
    for (const c of this.clouds) {
      if (c.life < 0.35 || c.life > c.ttl - 1.2) continue; // too thin to hide behind
      if (segmentNearPoint(ax, az, bx, bz, c.x, c.z, c.r)) return true;
    }
    return false;
  }

  update(dt) {
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.life += dt;
      const grow = Math.min(1, c.life / 0.8); // billow out fast
      const fade = Math.min(1, Math.max(0, (c.ttl - c.life) / 2.2)); // thin out at the end
      c.mat.opacity = 0.62 * Math.min(grow, fade);
      if (c.life < 0.8) {
        const s = 0.4 + grow * (c.r / 1.15);
        for (const puff of c.group.children) puff.scale.setScalar(s * (0.75 + (puff.position.y % 0.5)));
      }
      if (c.life >= c.ttl) {
        this.scene.remove(c.group);
        c.mat.dispose();
        this.clouds.splice(i, 1);
      }
    }
  }

  clear() {
    for (const c of this.clouds) {
      this.scene.remove(c.group);
      c.mat.dispose();
    }
    this.clouds.length = 0;
  }
}

// Is point (px, pz) within r of segment a→b (all in the floor plane)?
function segmentNearPoint(ax, az, bx, bz, px, pz, r) {
  const dx = bx - ax, dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  let t = lenSq > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t, cz = az + dz * t;
  const ex = px - cx, ez = pz - cz;
  return ex * ex + ez * ez < r * r;
}
