// player.js — the local Warden: pointer-lock look, WASD movement with
// acceleration and friction, crouching, a small hop, and the same
// circle-vs-boxes collision the bots use, so cover treats everyone alike.
// Stopping (or crouching) is what makes the guns accurate; that trade-off
// lives in weapons.currentSpread and reads speed2d / crouching from here.

import * as THREE from 'three';

export class Player {
  constructor(spawn) {
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z); // feet
    this.vel = new THREE.Vector3();
    this.yaw = 0; // face north, toward the furnace
    this.pitch = 0;
    this.hp = 100;
    this.alive = true;
    this.isPlayer = true;
    this.name = 'You';
    this.team = 'warden';
    this.crouching = false;
    this.grounded = true;
    this.speed2d = 0;
    this.heat = 0;
    this.radius = 0.45;
    this.name = 'You';
  }

  reset(spawn) {
    this.pos.set(spawn.x, 0, spawn.z);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.hp = 100;
    this.alive = true;
    this.crouching = false;
    this.heat = 0;
  }

  eyeHeight() {
    return this.crouching ? 1.12 : 1.62;
  }

  eyePos(out) {
    return out.set(this.pos.x, this.pos.y + this.eyeHeight(), this.pos.z);
  }

  headCenter(out) {
    return out.set(this.pos.x, this.pos.y + (this.crouching ? 1.28 : 1.68), this.pos.z);
  }

  chestCenter(out) {
    return out.set(this.pos.x, this.pos.y + (this.crouching ? 0.85 : 1.15), this.pos.z);
  }

  takeDamage(amount) {
    if (!this.alive) return true;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return true;
    }
    return false;
  }

  // keys: {f,b,l,r,jump,crouch} booleans; dt in seconds.
  update(dt, keys, world) {
    if (!this.alive) { this.speed2d = 0; return; }
    this.crouching = !!keys.crouch;
    const walkSpeed = this.crouching ? 2.1 : 4.6;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let ix = 0, iz = 0;
    if (keys.f) { ix += -sin; iz += -cos; }
    if (keys.b) { ix += sin; iz += cos; }
    if (keys.l) { ix += -cos; iz += sin; }
    if (keys.r) { ix += cos; iz += -sin; }
    const il = Math.hypot(ix, iz);
    if (il > 0) { ix /= il; iz /= il; }

    // accelerate toward the desired velocity, bleed speed with friction
    const accel = this.grounded ? 26 : 6;
    this.vel.x += ix * accel * dt;
    this.vel.z += iz * accel * dt;
    const damp = Math.exp(-(this.grounded ? 9 : 0.6) * dt);
    if (il === 0) { this.vel.x *= damp; this.vel.z *= damp; }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > walkSpeed) {
      this.vel.x *= walkSpeed / sp;
      this.vel.z *= walkSpeed / sp;
    }

    // gravity + hop
    this.vel.y -= 18 * dt;
    if (keys.jump && this.grounded) {
      this.vel.y = 6.2;
      this.grounded = false;
    }
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.vel.y = 0;
      this.grounded = true;
    }

    world.moveActor(this.pos, this.vel.x * dt, this.vel.z * dt, this.radius);
    this.speed2d = Math.hypot(this.vel.x, this.vel.z);
    this.heat = Math.max(0, this.heat - dt * 1.6);

    if (world.inHazard(this.pos.x, this.pos.z)) {
      this.takeDamage(26 * dt);
    }
  }
}
