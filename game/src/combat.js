// Hitscan combat: one ray per pellet, resolved against walls and bodies.
// Headshots pay more, walls stop bullets, smoke blocks sight. Tracers and
// smoke are pooled — nothing is allocated in the hot loop.
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

const TRACER_POOL = 18;
const SMOKE_SECONDS = 12;

export function createCombat(scene, world, state) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 100;
  const hitMeshes = [];
  const dir = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  // Tracer pool: thin additive cylinders, reused.
  const tracers = [];
  const tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 5, 1, true);
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(tracerGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerIndex = 0;

  function spawnTracer(from, to) {
    const t = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % TRACER_POOL;
    const len = tmp.copy(to).sub(from).length();
    if (len < 0.2) return;
    t.mesh.position.copy(from).add(to).multiplyScalar(0.5);
    t.mesh.scale.set(1, len, 1);
    t.mesh.lookAt(to);
    t.mesh.rotateX(Math.PI / 2);
    t.mesh.visible = true;
    t.mesh.material.opacity = 0.85;
    t.life = 0.07;
  }

  // Impact sparks: pooled point bursts, 8 points each, gravity + fade.
  const sparkBursts = [];
  const sparkGeo = new THREE.BufferGeometry();
  for (let i = 0; i < 8; i += 1) {
    const positions = new Float32Array(8 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffc46b, size: 0.06, transparent: true, opacity: 0, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    sparkBursts.push({ points, positions, velocities: new Float32Array(8 * 3), life: 0 });
  }
  let sparkIndex = 0;

  function spawnSparks(point) {
    const b = sparkBursts[sparkIndex];
    sparkIndex = (sparkIndex + 1) % sparkBursts.length;
    for (let i = 0; i < 8; i += 1) {
      b.positions[i * 3] = point.x;
      b.positions[i * 3 + 1] = point.y;
      b.positions[i * 3 + 2] = point.z;
      b.velocities[i * 3] = (Math.random() - 0.5) * 4;
      b.velocities[i * 3 + 1] = Math.random() * 3 + 1;
      b.velocities[i * 3 + 2] = (Math.random() - 0.5) * 4;
    }
    b.points.geometry.attributes.position.needsUpdate = true;
    b.points.visible = true;
    b.points.material.opacity = 1;
    b.life = 0.3;
  }

  // Smoke clouds: each is a cluster of soft spheres + a ground disc.
  const smokes = [];
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0xa39a8c, transparent: true, opacity: 0.16, depthWrite: false });
  const smokeGeo = new THREE.SphereGeometry(1, 10, 8);
  function deploySmoke(x, z) {
    const group = new THREE.Group();
    for (let i = 0; i < 6; i += 1) {
      const puff = new THREE.Mesh(smokeGeo, smokeMat);
      puff.position.set((Math.random() - 0.5) * 3.2, 0.7 + Math.random() * 1.1, (Math.random() - 0.5) * 3.2);
      const s = 1.1 + Math.random() * 0.9;
      puff.scale.set(s, s * 0.7, s);
      group.add(puff);
    }
    group.position.set(x, 0, z);
    scene.add(group);
    smokes.push({ x, z, group, until: state.time + SMOKE_SECONDS });
    state.events.push({ type: 'smoke', x, z });
  }

  function smokeBlocks(ax, az, bx, bz) {
    for (const s of smokes) {
      if (state.time > s.until) continue;
      // Segment-to-point distance in 2D; smoke radius ~2.6.
      const dx = bx - ax;
      const dz = bz - az;
      const lenSq = dx * dx + dz * dz || 1;
      let t = ((s.x - ax) * dx + (s.z - az) * dz) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t - s.x;
      const pz = az + dz * t - s.z;
      if (px * px + pz * pz < 2.6 * 2.6) return true;
    }
    return false;
  }

  // Fire one pellet. origin/dir are scratch vectors the caller fills.
  // Returns the agent hit (or null) and whether it was a headshot.
  function firePellet(from, direction, range, shooterTeam) {
    raycaster.set(from, direction);
    raycaster.far = range;
    const hits = raycaster.intersectObjects(world.shootables.concat(hitMeshes), false);
    for (const hit of hits) {
      const target = hit.object.userData.agent;
      if (!target) return { blocked: true, point: hit.point };
      // Friendly fire is off and the dead do not block: the shot passes through.
      if (target.team === shooterTeam || !target.alive) continue;
      return { agent: target, part: hit.object.userData.part || 'torso', point: hit.point };
    }
    return null;
  }

  function damageAgent(target, amount, attacker, part) {
    if (!target.alive) return false;
    target.health -= amount;
    state.events.push({ type: 'damage', target, amount, attacker, part });
    if (target.health > 0) return false;
    target.health = 0;
    target.alive = false;
    state.events.push({ type: 'kill', target, attacker });
    return true;
  }

  // A shooter's full shot: pellets fan out by spread, tracers fly, and each
  // pellet resolves. Returns {killed, hit, headshot} for the HUD.
  function shoot(shooter, from, baseDir, def, spread) {
    let killed = false;
    let hitAny = false;
    let headshot = false;
    const end = new THREE.Vector3();
    for (let p = 0; p < def.pellets; p += 1) {
      dir.copy(baseDir);
      dir.x += (Math.random() * 2 - 1) * spread;
      dir.y += (Math.random() * 2 - 1) * spread;
      dir.z += (Math.random() * 2 - 1) * spread;
      dir.normalize();
      const res = firePellet(from, dir, def.range, shooter.team);
      if (res && res.agent) {
        const mult = res.part === 'head' ? def.headMult : 1;
        const dmg = def.damage * mult;
        const died = damageAgent(res.agent, dmg, shooter, res.part);
        killed = killed || died;
        hitAny = true;
        headshot = headshot || res.part === 'head';
        end.copy(res.point);
      } else if (res && res.point) {
        end.copy(res.point);
        spawnSparks(res.point);
      } else {
        end.copy(from).addScaledVector(dir, def.range);
      }
      spawnTracer(from, end);
    }
    return { killed, hit: hitAny, headshot };
  }

  function step(dt) {
    for (const b of sparkBursts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      for (let i = 0; i < 8; i += 1) {
        b.velocities[i * 3 + 1] -= 12 * dt;
        b.positions[i * 3] += b.velocities[i * 3] * dt;
        b.positions[i * 3 + 1] += b.velocities[i * 3 + 1] * dt;
        b.positions[i * 3 + 2] += b.velocities[i * 3 + 2] * dt;
      }
      b.points.geometry.attributes.position.needsUpdate = true;
      b.points.material.opacity = Math.max(0, b.life / 0.3);
      if (b.life <= 0) b.points.visible = false;
    }
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.mesh.visible = false;
        t.mesh.material.opacity = 0;
      } else {
        t.mesh.material.opacity = t.life / 0.07 * 0.85;
      }
    }
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      if (state.time <= smokes[i].until) continue;
      scene.remove(smokes[i].group);
      smokes.splice(i, 1);
    }
  }

  return {
    shoot,
    damageAgent,
    deploySmoke,
    smokeBlocks,
    step,
    registerHitMeshes(meshes) {
      for (const m of meshes) hitMeshes.push(m);
    },
    clearHitMeshes() {
      hitMeshes.length = 0;
    },
    origin,
    tmp,
  };
}
