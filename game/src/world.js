// world.js — the Cinder Foundry itself: one original smelting hall.
// A rectangular casting floor split by two molten runnels, crossed by
// three gantry bridges. The main furnace squats at the north end and is
// where the Wardens plant their slag charge; the Ash Reavers spawn in the
// north bays and hold the lanes. All geometry is plain boxes and cylinders
// dressed in an ember / charcoal / steel palette — the runnels glow with
// emissive material and flicker through update().

import * as THREE from 'three';

export const ARENA = { minX: -30, maxX: 30, minZ: -22, maxZ: 22 };
export const PLANT_ZONE = { x: 0, z: -15.5, radius: 4.6 };

const MAT = {
  floor: new THREE.MeshStandardMaterial({ color: 0x3d3831, roughness: 0.95, metalness: 0.05 }),
  floorPlate: new THREE.MeshStandardMaterial({ color: 0x4a443b, roughness: 0.9, metalness: 0.1 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x554f47, roughness: 0.85, metalness: 0.15 }),
  wallTrim: new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.6, metalness: 0.3 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x596069, roughness: 0.45, metalness: 0.8 }),
  darkSteel: new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.55, metalness: 0.7 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x8a4a2b, roughness: 0.9, metalness: 0.1 }),
  crate: new THREE.MeshStandardMaterial({ color: 0x6e5636, roughness: 0.85, metalness: 0.05 }),
  barrel: new THREE.MeshStandardMaterial({ color: 0x7a3b22, roughness: 0.7, metalness: 0.4 }),
  molten: new THREE.MeshStandardMaterial({
    color: 0xff6a1a, emissive: 0xff7a26, emissiveIntensity: 2.4, roughness: 0.4, metalness: 0,
  }),
  moltenHot: new THREE.MeshStandardMaterial({
    color: 0xffb03a, emissive: 0xffa03c, emissiveIntensity: 3.2, roughness: 0.4, metalness: 0,
  }),
  furnaceGlow: new THREE.MeshStandardMaterial({
    color: 0xff8c2e, emissive: 0xff8c2e, emissiveIntensity: 2.8, roughness: 0.5, metalness: 0,
  }),
  bridge: new THREE.MeshStandardMaterial({ color: 0x4c5157, roughness: 0.5, metalness: 0.75 }),
};

export class Foundry {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // {minX,maxX,minZ,maxZ,h}
    this.losBlockers = []; // colliders tall enough to break sight lines
    this.hazards = []; // molten strips {minX,maxX,minZ,maxZ}
    this.moltenMats = [MAT.molten, MAT.moltenHot];
    this.flickerT = 0;
    this.build();
  }

  box(x, z, w, d, h, mat, yBase = 0, collide = true) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, yBase + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (collide) {
      const c = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h };
      this.colliders.push(c);
      if (h >= 1.35) this.losBlockers.push(c);
    }
    return mesh;
  }

  build() {
    const s = this.scene;
    s.background = new THREE.Color(0x241a12);
    s.fog = new THREE.Fog(0x241a12, 70, 150);

    // --- lights: warm work lamps over a smoky hall ---
    s.add(new THREE.HemisphereLight(0xffd9b0, 0x2a2018, 1.5));
    const sun = new THREE.DirectionalLight(0xffe2bb, 2.4);
    sun.position.set(18, 30, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -36; sun.shadow.camera.right = 36;
    sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
    s.add(sun);
    for (const [x, z] of [[-14, -6], [14, -6], [-14, 6], [14, 6]]) {
      const p = new THREE.PointLight(0xff7a26, 60, 20, 1.8);
      p.position.set(x, 2.2, z);
      s.add(p);
    }
    const furnaceLight = new THREE.PointLight(0xff8c2e, 90, 26, 1.7);
    furnaceLight.position.set(0, 4, -17);
    s.add(furnaceLight);

    // --- floor: slab plus lighter casting plates ---
    const floor = new THREE.Mesh(new THREE.BoxGeometry(64, 0.4, 48), MAT.floor);
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    s.add(floor);
    for (let x = -24; x <= 24; x += 12) {
      for (let z = -16; z <= 16; z += 11) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.06, 9.4), MAT.floorPlate);
        plate.position.set(x, 0.03, z);
        plate.receiveShadow = true;
        s.add(plate);
      }
    }

    // --- perimeter walls with a hazard-yellow trim line ---
    const wallH = 6;
    this.box(0, ARENA.minZ - 1, 64, 2, wallH, MAT.wall);
    this.box(0, ARENA.maxZ + 1, 64, 2, wallH, MAT.wall);
    this.box(ARENA.minX - 1, 0, 2, 48, wallH, MAT.wall);
    this.box(ARENA.maxX + 1, 0, 2, 48, wallH, MAT.wall);
    for (const z of [ARENA.minZ - 0.05, ARENA.maxZ + 0.05]) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(60, 0.35, 0.12), MAT.wallTrim);
      trim.position.set(0, 3.4, z);
      s.add(trim);
    }

    // --- molten runnels at z = -6 and z = +6, bridges at x = -14, 0, 14 ---
    for (const cz of [-6, 6]) {
      const lava = new THREE.Mesh(new THREE.BoxGeometry(56, 0.1, 2.4), MAT.molten);
      lava.position.set(0, 0.06, cz);
      s.add(lava);
      const core = new THREE.Mesh(new THREE.BoxGeometry(56, 0.12, 0.9), MAT.moltenHot);
      core.position.set(0, 0.07, cz);
      s.add(core);
      this.hazards.push({ minX: -28, maxX: 28, minZ: cz - 1.2, maxZ: cz + 1.2 });
      // curbs on both banks, with gaps where the bridges land
      for (const side of [-1, 1]) {
        const curbZ = cz + side * 1.45;
        let cursor = -28;
        for (const bx of [-14, 0, 14]) {
          const gapL = bx - 2.4, gapR = bx + 2.4;
          if (gapL > cursor) this.box((cursor + gapL) / 2, curbZ, gapL - cursor, 0.5, 0.55, MAT.darkSteel);
          cursor = Math.max(cursor, gapR);
        }
        if (cursor < 28) this.box((cursor + 28) / 2, curbZ, 28 - cursor, 0.5, 0.55, MAT.darkSteel);
      }
      // bridge decks (walkable, no collider) with side rails
      for (const bx of [-14, 0, 14]) {
        const deck = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.18, 4.6), MAT.bridge);
        deck.position.set(bx, 0.1, cz);
        deck.receiveShadow = true;
        s.add(deck);
        for (const side of [-1, 1]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.8, 4.6), MAT.steel);
          rail.position.set(bx + side * 2.3, 0.55, cz);
          s.add(rail);
          this.colliders.push({ minX: bx + side * 2.3 - 0.1, maxX: bx + side * 2.3 + 0.1, minZ: cz - 2.3, maxZ: cz + 2.3, h: 0.8 });
        }
      }
    }

    // --- cover: casting blocks, ingot stacks, barrels, pillars ---
    const cover = [
      // [x, z, w, d, h, mat]
      [-21, -14, 4, 2.2, 1.3, MAT.crate], [-7, -12.5, 3, 3, 1.6, MAT.steel],
      [9, -12, 4.4, 2, 1.25, MAT.crate], [22, -13, 3, 3, 2.2, MAT.darkSteel],
      [-19, 0, 3.4, 3.4, 1.5, MAT.rust], [19, 0.5, 3.4, 3.4, 1.5, MAT.rust],
      [-9, 0, 2, 5, 1.3, MAT.crate], [9.5, -0.5, 2, 5, 1.3, MAT.crate],
      [-23, 12, 4, 2.4, 1.4, MAT.crate], [-4, 13, 3, 3, 1.7, MAT.steel],
      [12, 12.5, 4.4, 2.2, 1.25, MAT.crate], [24, 13, 2.6, 2.6, 2.0, MAT.darkSteel],
      [-16, -19, 3, 2, 1.2, MAT.barrel], [16, -19, 3, 2, 1.2, MAT.barrel],
      [-26, 19, 3.4, 2, 1.3, MAT.crate], [26, 19, 3.4, 2, 1.3, MAT.crate],
    ];
    for (const [x, z, w, d, h, m] of cover) this.box(x, z, w, d, h, m);
    // tall pillars carrying the roof trusses
    for (const [x, z] of [[-20, -10], [20, -10], [-20, 10], [20, 10], [0, 11], [0, -1]]) {
      this.box(x, z, 1.4, 1.4, 7, MAT.darkSteel);
    }

    // --- the main furnace at the north end (the plant site) ---
    this.box(0, -20.2, 13, 3.4, 5.2, MAT.darkSteel);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.2, 0.4), MAT.furnaceGlow);
    mouth.position.set(0, 1.7, -18.4);
    s.add(mouth);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 6.5, 14), MAT.rust);
    stack.position.set(-3.6, 8, -20.2);
    stack.castShadow = true;
    s.add(stack);
    const stack2 = stack.clone();
    stack2.position.x = 3.6;
    s.add(stack2);
    // plant-zone ring painted on the floor
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(PLANT_ZONE.radius - 0.35, PLANT_ZONE.radius, 40),
      new THREE.MeshBasicMaterial({ color: 0xffb03a, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(PLANT_ZONE.x, 0.09, PLANT_ZONE.z);
    s.add(ring);
    this.plantRing = ring;

    // --- overhead gantry crane spanning the hall ---
    const beam = new THREE.Mesh(new THREE.BoxGeometry(56, 0.9, 1.6), MAT.steel);
    beam.position.set(0, 7.4, 0);
    s.add(beam);
    const trolley = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 2.6), MAT.wallTrim);
    trolley.position.set(-6, 6.5, 0);
    s.add(trolley);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.4, 0.18), MAT.darkSteel);
    hook.position.set(-6, 4.6, 0);
    s.add(hook);
    const ingot = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.8, 1.1), MAT.steel);
    ingot.position.set(-6, 2.6, 0);
    ingot.castShadow = true;
    s.add(ingot);

    // spawn pads
    const padMat = new THREE.MeshBasicMaterial({ color: 0xff7a26 });
    const pad = new THREE.Mesh(new THREE.BoxGeometry(9, 0.05, 3), padMat);
    pad.position.set(0, 0.06, 19);
    s.add(pad);
    const pad2 = new THREE.Mesh(new THREE.BoxGeometry(16, 0.05, 3),
      new THREE.MeshBasicMaterial({ color: 0x7fd4c9 }));
    pad2.position.set(0, 0.06, -19.5);
    s.add(pad2);
  }

  // Circle-vs-boxes movement resolution, one axis at a time so actors
  // slide along walls instead of sticking to them.
  moveActor(pos, dx, dz, radius) {
    pos.x += dx;
    for (const c of this.colliders) {
      if (pos.x + radius > c.minX && pos.x - radius < c.maxX && pos.z + radius > c.minZ && pos.z - radius < c.maxZ) {
        pos.x = dx > 0 ? c.minX - radius : c.maxX + radius;
      }
    }
    pos.z += dz;
    for (const c of this.colliders) {
      if (pos.x + radius > c.minX && pos.x - radius < c.maxX && pos.z + radius > c.minZ && pos.z - radius < c.maxZ) {
        pos.z = dz > 0 ? c.minZ - radius : c.maxZ + radius;
      }
    }
    pos.x = Math.max(ARENA.minX + radius, Math.min(ARENA.maxX - radius, pos.x));
    pos.z = Math.max(ARENA.minZ + radius, Math.min(ARENA.maxZ - radius, pos.z));
  }

  // Is the straight line between two floor points free of tall cover?
  lineOfSight(ax, az, bx, bz) {
    for (const c of this.losBlockers) {
      if (segmentHitsBox(ax, az, bx, bz, c)) return false;
    }
    return true;
  }

  inHazard(x, z) {
    for (const hz of this.hazards) {
      if (x > hz.minX && x < hz.maxX && z > hz.minZ && z < hz.maxZ) {
        // bridge decks carry you over the melt
        for (const bx of [-14, 0, 14]) if (Math.abs(x - bx) < 2.3) return false;
        return true;
      }
    }
    return false;
  }

  update(dt, elapsed) {
    this.flickerT += dt;
    const f = 0.92 + 0.13 * Math.sin(elapsed * 11.3) * Math.sin(elapsed * 5.7 + 1.3);
    MAT.molten.emissiveIntensity = 2.4 * f;
    MAT.moltenHot.emissiveIntensity = 3.2 * (2 - f) * 0.62;
    if (this.plantRing) {
      const pulse = 0.75 + 0.25 * Math.sin(elapsed * 2.4);
      this.plantRing.material.opacity = pulse;
      this.plantRing.material.transparent = true;
    }
  }
}

// Slab test: does segment a->b cross box c (expanded slightly)?
function segmentHitsBox(ax, az, bx, bz, c) {
  const pad = 0.15;
  const minX = c.minX - pad, maxX = c.maxX + pad, minZ = c.minZ - pad, maxZ = c.maxZ + pad;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[ax, dx, minX, maxX], [az, dz, minZ, maxZ]]) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return false;
    } else {
      let ta = (lo - p) / d, tb = (hi - p) / d;
      if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  return true;
}

// Patrol / push routes. Wardens start south and push north to the furnace;
// Reavers start north and fan out to hold the bridges and mid.
export const WARDEN_ROUTES = [
  [{ x: -3, z: 18 }, { x: -13, z: 10 }, { x: -14, z: 0 }, { x: -13, z: -10 }, { x: -6, z: -14 }, { x: -2, z: -15 }],
  [{ x: 0, z: 18 }, { x: 0, z: 10 }, { x: 0, z: 0 }, { x: 1, z: -10 }, { x: 2, z: -14.5 }],
  [{ x: 3, z: 18 }, { x: 13, z: 10 }, { x: 14, z: 0 }, { x: 13, z: -10 }, { x: 7, z: -14 }, { x: 3, z: -15.5 }],
];
export const REAVER_ROUTES = [
  [{ x: -12, z: -18 }, { x: -13, z: -10 }, { x: -14, z: 0 }, { x: -12, z: 4 }],
  [{ x: -4, z: -18 }, { x: -2, z: -11 }, { x: 0, z: -3 }, { x: 1, z: 3 }],
  [{ x: 5, z: -18 }, { x: 8, z: -12 }, { x: 12, z: -6 }, { x: 10, z: 1 }],
  [{ x: 13, z: -18 }, { x: 14, z: -10 }, { x: 14, z: 0 }, { x: 12, z: 5 }],
];
export const WARDEN_SPAWNS = [
  { x: -4.5, z: 19 }, { x: -1.5, z: 19.5 }, { x: 1.5, z: 19.5 }, { x: 4.5, z: 19 },
];
export const REAVER_SPAWNS = [
  { x: -13, z: -18.5 }, { x: -5, z: -19 }, { x: 5, z: -19 }, { x: 13, z: -18.5 },
];
