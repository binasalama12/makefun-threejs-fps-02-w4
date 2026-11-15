// bots.js — the foundry crews. Each bot is a simple state machine:
// follow its assigned route across the hall, and when it can see an
// opponent, stop, settle, and fire short bursts. Bots hear gunfire too:
// a shot fired nearby turns them toward the noise. Accuracy is honest —
// a bot's hit chance falls off with range and with how fast its target
// is moving, and it needs a beat to react when a target first appears.

import * as THREE from 'three';
import { weaponById } from './weapons.js';

const WARDEN_PAINT = { torso: 0xb3541e, limbs: 0x3a3f45, visor: 0xffc37a };
const REAVER_PAINT = { torso: 0x3f5a58, limbs: 0x24272b, visor: 0x9fe8dc };

export class Bot {
  constructor(scene, opts) {
    this.team = opts.team; // 'warden' | 'reaver'
    this.name = opts.name;
    this.isPlayer = false;
    this.pos = new THREE.Vector3(opts.spawn.x, 0, opts.spawn.z);
    this.yaw = opts.team === 'warden' ? Math.PI : 0;
    this.hp = 100;
    this.alive = true;
    this.speed2d = 0;
    this.crouching = false;
    this.grounded = true;
    this.heat = 0;
    this.weapon = weaponById(opts.weaponId || 'rivet');
    this.mag = this.weapon.mag;
    this.route = opts.route;
    this.routeIdx = 0;
    this.holdAtEnd = opts.holdAtEnd !== false;
    this.skill = opts.skill; // 0..1, scales reaction time and hit chance
    this.state = 'advance'; // advance | engage | hold | dead
    this.target = null;
    this.seenFor = 0;
    this.fireCd = 0;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.strafeDir = 1;
    this.strafeT = 0;
    this.reloadT = 0;
    this.heardT = 0;
    this.heardFrom = null;
    this.walkPhase = Math.random() * 6;

    this.buildMesh(scene);
  }

  buildMesh(scene) {
    const paint = this.team === 'warden' ? WARDEN_PAINT : REAVER_PAINT;
    const g = new THREE.Group();
    const torsoMat = new THREE.MeshStandardMaterial({ color: paint.torso, roughness: 0.7, metalness: 0.3 });
    const limbMat = new THREE.MeshStandardMaterial({ color: paint.limbs, roughness: 0.8, metalness: 0.2 });
    const visorMat = new THREE.MeshStandardMaterial({
      color: paint.visor, emissive: paint.visor, emissiveIntensity: 1.6, roughness: 0.3,
    });

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), limbMat);
    legs.position.y = 0.39;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), torsoMat);
    torso.position.y = 1.14;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.34), limbMat);
    head.position.y = 1.68;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.05), visorMat);
    visor.position.set(0, 1.7, 0.18);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.78), limbMat);
    gun.position.set(0.24, 1.22, 0.4);
    for (const m of [legs, torso, head, visor, gun]) {
      m.castShadow = true;
      g.add(m);
    }
    torso.userData = { bot: this, part: 'body' };
    legs.userData = { bot: this, part: 'body' };
    head.userData = { bot: this, part: 'head' };
    this.hitMeshes = [torso, legs, head];
    this.group = g;
    this.torsoMesh = torso;
    g.position.copy(this.pos);
    scene.add(g);
  }

  eyePos(out) {
    return out.set(this.pos.x, this.crouching ? 1.2 : 1.62, this.pos.z);
  }

  headCenter(out) {
    return out.set(this.pos.x, 1.68, this.pos.z);
  }

  chestCenter(out) {
    return out.set(this.pos.x, 1.15, this.pos.z);
  }

  hearShot(fromPos) {
    this.heardT = 2.5;
    this.heardFrom = fromPos;
  }

  takeDamage(amount) {
    if (!this.alive) return true;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.state = 'dead';
      // fall sideways and settle
      this.group.rotation.z = Math.PI / 2.2;
      this.group.position.y = 0.18;
      return true;
    }
    return false;
  }

  // ctx: { world, opponents, rng, shoot(bot, target), time }
  update(dt, ctx) {
    if (!this.alive) return;
    const { world, opponents, rng } = ctx;
    this.fireCd -= dt;
    this.heardT -= dt;
    this.heat = Math.max(0, this.heat - dt * 1.6);

    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.mag = this.weapon.mag;
    }

    // --- perception: nearest visible living opponent ---
    let visible = null;
    let visibleDist = Infinity;
    const myEye = this.eyePos(new THREE.Vector3());
    for (const o of opponents) {
      if (!o.alive) continue;
      const d = this.pos.distanceTo(o.pos);
      if (d > 65) continue;
      // rough facing check: bots scan as they walk, so allow a wide cone
      if (!world.lineOfSight(this.pos.x, this.pos.z, o.pos.x, o.pos.z)) continue;
      if (d < visibleDist) { visible = o; visibleDist = d; }
    }
    if (visible) {
      if (this.target !== visible) { this.target = visible; this.seenFor = 0; }
      this.seenFor += dt;
    } else if (this.heardT > 0 && this.heardFrom) {
      // turn toward recent gunfire even without a sight line
      this.yaw = Math.atan2(this.heardFrom.x - this.pos.x, this.heardFrom.z - this.pos.z);
      this.target = null;
      this.seenFor = 0;
    } else {
      this.target = null;
      this.seenFor = 0;
    }

    let moveX = 0, moveZ = 0;
    let wantSpeed = 0;

    if (this.target && this.seenFor > 0.05) {
      this.state = 'engage';
      const t = this.target;
      this.yaw = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      // keep a fighting distance; back off if point blank, close if far
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafeT = rng.range(0.7, 1.6);
        this.strafeDir = rng.chance(0.5) ? 1 : -1;
        this.crouching = rng.chance(0.3);
      }
      const ideal = this.weapon.id === 'scatter' ? 9 : 17;
      const away = visibleDist < ideal - 4 ? -1 : visibleDist > ideal + 7 ? 1 : 0;
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const sx = Math.cos(this.yaw) * this.strafeDir, sz = -Math.sin(this.yaw) * this.strafeDir;
      moveX = fx * away + sx * 0.7;
      moveZ = fz * away + sz * 0.7;
      wantSpeed = away !== 0 ? 3.1 : 1.6;
      this.tryShoot(ctx, visibleDist);
    } else {
      this.state = this.routeIdx >= this.route.length ? 'hold' : 'advance';
      this.crouching = false;
      const wp = this.route[Math.min(this.routeIdx, this.route.length - 1)];
      if (wp) {
        const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.1) {
          if (this.routeIdx < this.route.length - 1) this.routeIdx++;
          else if (!this.holdAtEnd) this.routeIdx = 0;
        } else {
          this.yaw = Math.atan2(dx, dz);
          moveX = dx / dist;
          moveZ = dz / dist;
          wantSpeed = 3.4;
        }
      }
    }

    // --- locomotion with the same collision the player uses ---
    const len = Math.hypot(moveX, moveZ);
    if (len > 0.01 && wantSpeed > 0) {
      const vx = (moveX / len) * wantSpeed;
      const vz = (moveZ / len) * wantSpeed;
      world.moveActor(this.pos, vx * dt, vz * dt, 0.45);
      this.speed2d = wantSpeed;
      this.walkPhase += dt * 8;
    } else {
      this.speed2d = 0;
    }

    // molten runnels burn anyone careless enough to stand in them
    if (world.inHazard(this.pos.x, this.pos.z)) {
      this.hp -= 26 * dt;
      if (this.hp <= 0 && this.alive) { this.hp = 0; this.takeDamage(1); }
    }

    // --- present the mesh ---
    this.group.position.set(this.pos.x, this.crouching ? -0.28 : 0, this.pos.z);
    this.group.rotation.y = this.yaw;
    const bob = this.speed2d > 0.2 ? Math.abs(Math.sin(this.walkPhase)) * 0.05 : 0;
    this.group.position.y += bob;
    void myEye;
  }

  tryShoot(ctx, dist) {
    if (this.reloadT > 0) return;
    const reaction = 0.42 - this.skill * 0.22;
    if (this.seenFor < reaction) return;
    if (this.mag <= 0) {
      this.reloadT = this.weapon.reloadMs / 1000;
      return;
    }
    if (this.burstPause > 0) { this.burstPause -= 1 / 60; return; }
    if (this.fireCd > 0) return;
    this.fireCd = this.weapon.fireMs / 1000;
    this.mag--;
    this.heat = Math.min(1, this.heat + 0.16);
    if (this.burstLeft <= 0) this.burstLeft = ctx.rng.int(2, 5);
    this.burstLeft--;
    if (this.burstLeft <= 0) this.burstPause = ctx.rng.range(0.35, 0.8);
    ctx.shoot(this, this.target, dist);
  }
}
