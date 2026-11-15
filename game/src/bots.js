// Bots: nine teammates and enemies with one state machine each.
// States: route (follow the waypoint graph), hold (guard a post), combat
// (stop, aim, burst fire), investigate (walk to a noise), plant / defuse
// (channel the objective), dead. Perception is staggered: each bot re-checks
// one enemy every 0.12 s, so nine bots cost a handful of raycasts a frame.
// Bots see through a 110-degree cone, hear gunfire within 20 m, and never
// turn and hit instantly: reaction time, burst rhythm and aim error are real.
import * as THREE from 'three';
import { MAP, nearestWaypoint, findPath } from './map.js';
import { createMover } from './player.js';
import { WEAPONS } from './weapons.js';
import { mergeParts, part, limb } from './merge.js';

const CT_NAMES = ['Sari', 'Budi', 'Dewi', 'Agus'];
const T_NAMES = ['Raka', 'Joko', 'Fajar', 'Bima', 'Eko'];
const SKIN = 0xc9a582;
const PANTS = 0x2c2f28;
const EYE_Y = 1.55;
const FOV_COS = 0.45; // ~63 degrees either side
const PERCEIVE_EVERY = 0.12;
const REACT_MIN = 0.35;
const REACT_MAX = 0.75;

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _chest = new THREE.Vector3();

// ---- Procedural characters -------------------------------------------------
// A bot is a mill worker in gear, built from primitives only (no model files):
// hard-hat helmet with a dark visor strip, vest with chest plate, pouches and
// shoulder pads, aim-posed arms holding a rifle, knee-padded legs, boots and
// a backpack with a bedroll. Team reads at a glance: green vests / helmets
// for the Mill Wardens, rust-red for the Pulp Raiders.
// Presentation contract (build-threejs-enemy-systems): the hitboxes are
// UNCHANGED — the same two invisible boxes as the old boxy body (torso
// 0.56x0.72x0.32 at y 1.12, head 0.27 cube at y 1.62), so hits, headshots and
// collision behave exactly as before; only the visuals change.
// Draw-call budget: the old body was 6 meshes per bot and the cover view
// already runs 277 calls against a 300 target, so the new body is also 6
// visible meshes per bot — parts are merged by material slot, and the torso
// slot carries its colour variation as vertex colours (vest, dark plate,
// helmet, pack) instead of extra materials. Legs stay separate groups
// pivoted at the hip so the walk swing still works. Geometry is built once
// per team and shared by every bot of that team.
const TEAM_COLORS = {
  ct: { vest: 0x3e7a5e, vestDark: 0x2a5443, helmet: 0x33523f },
  t: { vest: 0xa33b2e, vestDark: 0x752a20, helmet: 0x6e2a20 },
};
const PACK_COLOR = 0x4a4238;
const BOOT_COLOR = 0x1e201d;
const _hitMat = new THREE.MeshBasicMaterial({ visible: false });
const _hitTorsoGeo = new THREE.BoxGeometry(0.56, 0.72, 0.32);
const _hitHeadGeo = new THREE.BoxGeometry(0.27, 0.27, 0.27);

const _teamGeo = {};
function teamGeometry(team) {
  if (_teamGeo[team]) return _teamGeo[team];
  const cols = TEAM_COLORS[team];
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const C = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
  const S = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  // Aim pose: right hand on the grip, left hand on the fore-end.
  const shoulderR = V3(0.33, 1.42, -0.02);
  const shoulderL = V3(-0.33, 1.42, -0.02);
  const elbowR = V3(0.28, 1.28, -0.24);
  const elbowL = V3(-0.28, 1.28, -0.24);
  const handR = V3(0.17, 1.2, -0.32);
  const handL = V3(0.14, 1.21, -0.46);
  const g = {
    // One vertex-coloured mesh: vest, plate, helmet, pack in a single slot.
    torso: mergeParts([
      part(B(0.58, 0.62, 0.34), 0, 1.14, 0, 0, 0, 0, 1, 1, 1, cols.vest), // vest body
      part(B(0.16, 0.09, 0.28), 0.32, 1.45, 0, 0, 0, 0, 1, 1, 1, cols.vest), // shoulder pads
      part(B(0.16, 0.09, 0.28), -0.32, 1.45, 0, 0, 0, 0, 1, 1, 1, cols.vest),
      part(B(0.1, 0.13, 0.07), -0.14, 1.02, -0.19, 0, 0, 0, 1, 1, 1, cols.vest), // chest pouches
      part(B(0.1, 0.13, 0.07), 0, 1.02, -0.19, 0, 0, 0, 1, 1, 1, cols.vest),
      part(B(0.1, 0.13, 0.07), 0.14, 1.02, -0.19, 0, 0, 0, 1, 1, 1, cols.vest),
      part(B(0.3, 0.09, 0.26), 0, 1.5, 0, 0, 0, 0, 1, 1, 1, cols.vest), // collar
      limb(shoulderR, elbowR, 0.065, 0.06, 10, cols.vest), // right upper arm
      limb(elbowR, handR, 0.055, 0.05, 10, cols.vest), // right forearm
      limb(shoulderL, elbowL, 0.065, 0.06, 10, cols.vest), // left upper arm
      limb(elbowL, handL, 0.055, 0.05, 10, cols.vest), // left forearm
      part(B(0.42, 0.44, 0.05), 0, 1.18, -0.185, 0, 0, 0, 1, 1, 1, cols.vestDark), // chest plate
      part(B(0.52, 0.09, 0.32), 0, 0.8, 0, 0, 0, 0, 1, 1, 1, cols.vestDark), // belt
      part(S(0.17), 0, 1.69, 0.01, 0, 0, 0, 1, 0.85, 1.08, cols.helmet), // hard-hat dome
      part(C(0.2, 0.21, 0.035, 12), 0, 1.665, 0.01, 0, 0, 0, 1, 1, 1, cols.helmet), // brim
      part(B(0.34, 0.42, 0.13), 0, 1.14, 0.235, 0, 0, 0, 1, 1, 1, PACK_COLOR), // backpack
      part(C(0.075, 0.075, 0.38), 0, 1.38, 0.24, 0, 0, Math.PI / 2, 1, 1, 1, PACK_COLOR), // bedroll
    ]),
    skin: mergeParts([
      part(B(0.2, 0.22, 0.2), 0, 1.6, -0.01), // face
      part(C(0.07, 0.08, 0.12), 0, 1.5, 0), // neck
      part(B(0.07, 0.09, 0.1), 0.17, 1.2, -0.32), // right glove
      part(B(0.07, 0.09, 0.1), 0.14, 1.21, -0.46), // left glove
    ]),
    visor: mergeParts([
      part(B(0.23, 0.075, 0.05), 0, 1.635, -0.125), // goggle strip
    ]),
    gun: mergeParts([
      part(B(0.07, 0.1, 0.44), 0.18, 1.22, -0.3), // receiver
      part(C(0.024, 0.024, 0.32, 8), 0.18, 1.235, -0.64, Math.PI / 2), // barrel
      part(B(0.05, 0.15, 0.09), 0.18, 1.13, -0.26, 0.25), // magazine
      part(B(0.06, 0.09, 0.18), 0.18, 1.23, -0.05), // stock
      part(B(0.02, 0.05, 0.02), 0.18, 1.28, -0.55), // front sight
    ]),
    // Legs are built in hip-local space (hip at y 0): thigh, shin, knee pad,
    // boot — one vertex-coloured mesh per leg. Team-independent.
    leg: mergeParts([
      part(C(0.095, 0.085, 0.36), 0, -0.18, 0, 0, 0, 0, 1, 1, 1, PANTS),
      part(C(0.08, 0.07, 0.36), 0, -0.54, 0, 0, 0, 0, 1, 1, 1, PANTS),
      part(B(0.13, 0.12, 0.06), 0, -0.36, -0.09, 0, 0, 0, 1, 1, 1, PANTS), // knee pad
      part(B(0.17, 0.1, 0.3), 0, -0.72, -0.03, 0, 0, 0, 1, 1, 1, BOOT_COLOR), // boot
    ]),
  };
  _teamGeo[team] = g;
  return g;
}

// A body: detailed procedural character over the original invisible hit
// boxes. Torso and head are the hit meshes; the material is visible for
// bots, invisible for the player's own body.
export function createBodyMeshes(team, visible = true) {
  const g = teamGeometry(team);
  const mats = {
    torso: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.75 }),
    skin: new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 }),
    leg: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x10151c, roughness: 0.12, metalness: 0.85, envMapIntensity: 1.6 }),
    gun: new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.38, metalness: 1.0, envMapIntensity: 1.1 }),
  };
  if (!visible) {
    for (const m of Object.values(mats)) m.visible = false;
  }
  const group = new THREE.Group();
  // Hit boxes: invisible, never cast shadows, same dims as the old body.
  const torso = new THREE.Mesh(_hitTorsoGeo, _hitMat);
  torso.position.y = 1.12;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(_hitHeadGeo, _hitMat);
  head.position.y = 1.62;
  head.userData.part = 'head';
  group.add(torso, head);
  // Visual meshes: 6 per bot, the same count as the old boxy body.
  const visual = [
    [g.torso, mats.torso], [g.skin, mats.skin],
    [g.visor, mats.visor], [g.gun, mats.gun],
  ];
  for (const [geo, mat] of visual) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    group.add(m);
  }
  // Legs: groups pivoted at the hip so the walk swing rotates them there.
  function makeLeg(side) {
    const leg = new THREE.Group();
    leg.position.set(0.12 * side, 0.78, 0);
    const mesh = new THREE.Mesh(g.leg, mats.leg);
    mesh.castShadow = true;
    leg.add(mesh);
    group.add(leg);
    return leg;
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  return { group, torso, head, legL, legR };
}

export function createBots(scene, world, state, combat, random) {
  const losRay = new THREE.Raycaster();
  const losMeshes = world.shootables.filter((m) => {
    const box = new THREE.Box3().setFromObject(m);
    return box.max.y - box.min.y > 1.2;
  });
  const agents = [];
  const emptyKeys = new Set();
  const pathScratch = [];

  function makeAgent(id, name, team, isBot) {
    const meshes = createBodyMeshes(team, isBot);
    scene.add(meshes.group);
    const agent = {
      id, name, team, isBot,
      health: 100, alive: true,
      mover: null,
      weaponDef: 'smg', mag: 32, reserve: 96, cooldown: 0, reloadLeft: 0,
      state: 'route', path: [], pathI: 0, site: null, holdI: -1,
      target: null, seeT: 99, reactT: 0, burstLeft: 0, burstT: 0, pauseT: 0,
      perceiveT: random() * PERCEIVE_EVERY, perceiveI: 0,
      yawGoal: 0, strafeDir: 1, strafeT: 0, channelT: 0, channelKind: null,
      walkPhase: random() * 6, fall: 0, skill: 0.85 + random() * 0.35,
      meshes, eye: new THREE.Vector3(),
    };
    meshes.torso.userData.agent = agent;
    meshes.head.userData.agent = agent;
    return agent;
  }

  for (let i = 0; i < 4; i += 1) agents.push(makeAgent(`ct${i}`, CT_NAMES[i], 'ct', true));
  for (let i = 0; i < 5; i += 1) agents.push(makeAgent(`t${i}`, T_NAMES[i], 't', true));

  function setWeapon(agent, defId) {
    const def = WEAPONS[defId];
    agent.weaponDef = defId;
    agent.mag = def.mag;
    agent.reserve = def.reserve;
    agent.cooldown = 0;
    agent.reloadLeft = 0;
  }

  function routeTo(agent, x, z) {
    const from = nearestWaypoint(agent.mover.state.position.x, agent.mover.state.position.z);
    const to = nearestWaypoint(x, z);
    findPath(from, to, pathScratch);
    agent.path = pathScratch.slice();
    agent.pathI = 0;
    // Append the exact destination after the last waypoint.
    agent.path.push(-1);
    agent.destX = x;
    agent.destZ = z;
  }

  function resetRound(round) {
    const bomb = state.bomb;
    bomb.state = 'carried';
    bomb.site = null;
    bomb.timer = 0;
    bomb.progress = 0;
    bomb.defuser = null;
    const rifleRound = round >= 2;
    agents.forEach((agent, index) => {
      const spawn = MAP.spawns[agent.team][agent.team === 'ct' ? index : index - 4];
      if (!agent.mover) agent.mover = createMover(world.colliders, spawn[0], spawn[1], agent.team === 'ct' ? 0 : Math.PI);
      agent.mover.state.position.set(spawn[0], 0, spawn[1]);
      agent.mover.state.velocity.set(0, 0, 0);
      agent.mover.state.yaw = agent.team === 'ct' ? 0 : Math.PI;
      agent.health = 100;
      agent.alive = true;
      agent.fall = 0;
      agent.target = null;
      agent.seeT = 99;
      agent.channelT = 0;
      agent.channelKind = null;
      setWeapon(agent, rifleRound ? (index % 3 === 2 ? 'shotgun' : 'rifle') : 'smg');
      agent.meshes.group.rotation.set(0, 0, 0);
      agent.meshes.group.position.set(spawn[0], 0, spawn[1]);
      if (agent.team === 't') {
        const ti = index - 4;
        agent.site = ti < 2 ? 'A' : ti < 4 ? 'B' : random() < 0.5 ? 'A' : 'B';
        const site = MAP.sites[agent.site];
        routeTo(agent, site.x + (random() - 0.5) * 3, site.z + (random() - 0.5) * 3);
        agent.state = 'route';
      } else {
        agent.holdI = index;
        const hold = MAP.holds[index];
        routeTo(agent, hold[0], hold[1]);
        agent.state = 'route';
      }
    });
    // The carrier is always T bot 4.
    const carrier = agents[4 + 4];
    bomb.carrier = carrier;
  }

  function canSee(agent, enemy) {
    const ap = agent.mover.state.position;
    const ep = enemy.mover.state.position;
    const dx = ep.x - ap.x;
    const dz = ep.z - ap.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 48) return false;
    // Facing cone, unless the enemy is very close or just fired.
    const fx = -Math.sin(agent.mover.state.yaw);
    const fz = -Math.cos(agent.mover.state.yaw);
    const dot = (dx * fx + dz * fz) / (dist || 1);
    if (dot < FOV_COS && dist > 4 && !(enemy.justFired && dist < 25)) return false;
    // Smoke blocks sight.
    if (combat.smokeBlocks(ap.x, ap.z, ep.x, ep.z)) return false;
    // Line of sight to the chest.
    _eye.set(ap.x, ap.y + EYE_Y, ap.z);
    _chest.set(ep.x, ep.y + 1.1, ep.z);
    _dir.copy(_chest).sub(_eye);
    const len = _dir.length();
    losRay.set(_eye, _dir.normalize());
    losRay.far = len;
    const hits = losRay.intersectObjects(losMeshes, false);
    return hits.length === 0;
  }

  function perceive(agent, dt) {
    agent.perceiveT -= dt;
    if (agent.perceiveT > 0) return;
    agent.perceiveT = PERCEIVE_EVERY;
    // One enemy per tick, rotating through the list.
    const enemies = state.agents.filter((a) => a.team !== agent.team && a.alive);
    if (!enemies.length) return;
    agent.perceiveI = (agent.perceiveI + 1) % enemies.length;
    const enemy = enemies[agent.perceiveI];
    if (canSee(agent, enemy)) {
      if (agent.target !== enemy) {
        agent.target = enemy;
        agent.reactT = REACT_MIN + random() * (REACT_MAX - REACT_MIN);
        agent.burstLeft = 0;
      }
      agent.seeT = 0;
    }
  }

  function faceTarget(agent, dt, tx, tz) {
    const ap = agent.mover.state.position;
    const want = Math.atan2(-(tx - ap.x), -(tz - ap.z));
    let diff = want - agent.mover.state.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-6 * dt, Math.min(6 * dt, diff));
    agent.mover.state.yaw += turn;
  }

  function moveAlongPath(agent, dt) {
    if (!agent.path.length || agent.pathI >= agent.path.length) return true;
    const wp = agent.path[agent.pathI];
    let tx;
    let tz;
    if (wp === -1) { tx = agent.destX; tz = agent.destZ; } else { tx = MAP.waypoints[wp][0]; tz = MAP.waypoints[wp][1]; }
    const ap = agent.mover.state.position;
    const dx = tx - ap.x;
    const dz = tz - ap.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.7) { agent.pathI += 1; return agent.pathI >= agent.path.length; }
    faceTarget(agent, dt, tx, tz);
    const fx = -Math.sin(agent.mover.state.yaw);
    const fz = -Math.cos(agent.mover.state.yaw);
    const rx = Math.cos(agent.mover.state.yaw);
    const rz = -Math.sin(agent.mover.state.yaw);
    const forward = Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (dist || 1)));
    const strafe = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / (dist || 1)));
    agent.mover.step(dt, emptyKeys, forward, strafe, false);
    return false;
  }

  function fireAt(agent, dt) {
    const def = WEAPONS[agent.weaponDef];
    agent.cooldown -= dt;
    if (agent.reloadLeft > 0) {
      agent.reloadLeft -= dt;
      if (agent.reloadLeft <= 0) {
        const need = def.mag - agent.mag;
        const take = Math.min(need, agent.reserve);
        agent.mag += take;
        agent.reserve -= take;
      }
      return;
    }
    if (agent.mag <= 0) { agent.reloadLeft = def.reload; return; }
    if (agent.reactT > 0) { agent.reactT -= dt; return; }
    if (agent.pauseT > 0) { agent.pauseT -= dt; return; }
    if (agent.cooldown > 0) return;
    const target = agent.target;
    if (!target || !target.alive) return;
    agent.cooldown = def.gap;
    agent.mag -= 1;
    // Aim error grows with distance, target speed and the bot's skill.
    const ap = agent.mover.state.position;
    const tp = target.mover.state.position;
    const dist = Math.hypot(tp.x - ap.x, tp.z - ap.z);
    const speed = Math.hypot(target.mover.state.velocity.x, target.mover.state.velocity.z);
    const err = (0.012 + dist * 0.0011 + speed * 0.005) / agent.skill;
    _eye.set(ap.x, ap.y + EYE_Y, ap.z);
    _dir.set(tp.x - ap.x, (tp.y + 1.15) - (ap.y + EYE_Y), tp.z - ap.z).normalize();
    _dir.x += (random() * 2 - 1) * err;
    _dir.y += (random() * 2 - 1) * err * 0.7;
    _dir.z += (random() * 2 - 1) * err;
    _dir.normalize();
    const res = combat.shoot(agent, _eye, _dir, def, 0);
    state.noise.push({ x: ap.x, z: ap.z, radius: 22, until: state.time + 1.0 });
    state.events.push({ type: 'shot', agent, defId: agent.weaponDef, distant: true });
    agent.burstLeft -= 1;
    if (agent.burstLeft <= 0) {
      agent.pauseT = 0.45 + random() * 0.6;
      agent.burstLeft = 3 + Math.floor(random() * 3);
    }
    if (res && res.hit) {
      // A hit confirms the target; a kill clears it.
      if (res.killed) agent.target = null;
    }
  }

  function hear(agent) {
    if (agent.state === 'combat' || agent.state === 'plant' || agent.state === 'defuse') return;
    const ap = agent.mover.state.position;
    for (const n of state.noise) {
      if (state.time > n.until) continue;
      const d = Math.hypot(n.x - ap.x, n.z - ap.z);
      if (d < n.radius) {
        // Already investigating a noise in the same area: keep the current
        // path. Re-routing every step (a shot lands ~5x a second in a fight)
        // resets pathI to 0 and traps the bot shuttling to its nearest
        // waypoint instead of ever reaching the noise.
        if (agent.state === 'investigate') {
          const dd = Math.hypot(n.x - agent.destX, n.z - agent.destZ);
          if (dd < 4) { agent.investigateT = 4; return; }
        }
        routeTo(agent, n.x, n.z);
        agent.state = 'investigate';
        agent.investigateT = 4;
        return;
      }
    }
  }

  function stepAgent(agent, dt) {
    const body = agent.mover.state;
    if (!agent.alive) {
      agent.fall = Math.min(1, agent.fall + dt / 0.4);
      agent.meshes.group.rotation.x = -agent.fall * Math.PI * 0.5;
      agent.meshes.group.position.y = -agent.fall * 0.1;
      return;
    }
    agent.seeT += dt;
    perceive(agent, dt);
    const target = agent.target;
    const sees = target && target.alive && agent.seeT < 0.4;

    // Combat interrupts routing, planting and defusing.
    if (sees && agent.state !== 'combat') {
      if (agent.channelKind) { agent.channelKind = null; agent.channelT = 0; }
      agent.state = 'combat';
      agent.burstLeft = 3 + Math.floor(random() * 3);
      agent.pauseT = 0;
    } else if (!sees && agent.state === 'combat' && agent.seeT > 2.5) {
      agent.target = null;
      agent.state = agent.team === 't' ? 'route' : 'hold';
      if (agent.team === 't' && agent.path.length === 0) {
        const site = MAP.sites[agent.site];
        routeTo(agent, site.x, site.z);
      } else if (agent.team === 'ct' && agent.holdI >= 0) {
        const hold = MAP.holds[agent.holdI];
        routeTo(agent, hold[0], hold[1]);
      }
    }

    if (agent.state === 'combat' && target) {
      faceTarget(agent, dt, target.mover.state.position.x, target.mover.state.position.z);
      // Strafe so the bot is not a still target.
      agent.strafeT -= dt;
      if (agent.strafeT <= 0) { agent.strafeDir *= -1; agent.strafeT = 0.7 + random() * 0.8; }
      agent.mover.step(dt, emptyKeys, 0, agent.strafeDir * 0.6, false);
      fireAt(agent, dt);
    } else if (agent.state === 'route' || agent.state === 'investigate') {
      const arrived = moveAlongPath(agent, dt);
      if (arrived) {
        if (agent.state === 'investigate') {
          agent.investigateT -= dt;
          if (agent.investigateT <= 0) {
            // Back to routing — never to 'hold' directly: the hold branch
            // never walks a path, so a CT bot given a route there would sit
            // at its investigate spot forever. The route branch flips CT
            // bots to 'hold' when they arrive at their post.
            agent.state = 'route';
            if (agent.team === 'ct' && agent.holdI >= 0) {
              const hold = MAP.holds[agent.holdI];
              routeTo(agent, hold[0], hold[1]);
            } else if (agent.team === 't') {
              const site = MAP.sites[agent.site];
              routeTo(agent, site.x, site.z);
            }
          }
        } else if (agent.team === 'ct') {
          agent.state = 'hold';
          const hold = MAP.holds[agent.holdI];
          agent.yawGoal = hold[2];
        } else {
          // T bot reached its site: plant if carrier, else hold the site.
          const site = MAP.sites[agent.site];
          const d = Math.hypot(body.position.x - site.x, body.position.z - site.z);
          if (state.bomb.carrier === agent && d < 4.5 && state.bomb.state === 'carried') {
            agent.state = 'plant';
            agent.channelKind = 'plant';
            agent.channelT = 0;
          } else {
            agent.state = 'hold';
            agent.yawGoal = Math.atan2(-(0 - body.position.x), -(-12 - body.position.z));
          }
        }
      }
      hear(agent);
    } else if (agent.state === 'hold') {
      // Sweep the assigned facing; react to noise.
      const diff = agent.yawGoal - body.yaw;
      body.yaw += Math.max(-1.2 * dt, Math.min(1.2 * dt, diff)) + Math.sin(state.time * 0.5 + agent.walkPhase) * 0.15 * dt;
      hear(agent);
      // After the bomb is planted, CT bots rotate to the site.
      if (agent.team === 'ct' && state.bomb.state === 'planted' && state.bomb.site) {
        const site = MAP.sites[state.bomb.site];
        const d = Math.hypot(body.position.x - site.x, body.position.z - site.z);
        if (d > 12) {
          routeTo(agent, site.x, site.z);
          agent.state = 'route';
          agent.retaking = true;
        }
      }
      // Retaking CT bots defuse when they reach the bomb and it is safe.
      if (agent.team === 'ct' && state.bomb.state === 'planted') {
        const d = Math.hypot(body.position.x - state.bomb.x, body.position.z - state.bomb.z);
        if (d < 1.7 && !sees) {
          agent.state = 'defuse';
          agent.channelKind = 'defuse';
          agent.channelT = 0;
        }
      }
    } else if (agent.state === 'plant') {
      agent.channelT += dt;
      state.bomb.progress = agent.channelT / 3;
      if (agent.channelT >= 3) {
        state.bomb.state = 'planted';
        state.bomb.site = agent.site;
        state.bomb.x = body.position.x;
        state.bomb.z = body.position.z;
        state.bomb.timer = 40;
        state.bomb.progress = 0;
        state.events.push({ type: 'planted', site: agent.site });
        agent.state = 'hold';
        agent.channelKind = null;
        agent.yawGoal = body.yaw;
      }
    } else if (agent.state === 'defuse') {
      agent.channelT += dt;
      state.bomb.progress = agent.channelT / 5;
      state.bomb.defuser = agent;
      if (agent.channelT >= 5) {
        state.bomb.state = 'defused';
        state.events.push({ type: 'defused', agent });
        agent.state = 'hold';
        agent.channelKind = null;
      }
    }

    // Bomb pickup: a living T bot walking over a dropped bomb takes it.
    if (agent.team === 't' && state.bomb.state === 'dropped') {
      const d = Math.hypot(body.position.x - state.bomb.x, body.position.z - state.bomb.z);
      if (d < 1.3) {
        state.bomb.state = 'carried';
        state.bomb.carrier = agent;
        const site = MAP.sites[agent.site];
        routeTo(agent, site.x, site.z);
        agent.state = 'route';
      }
    }

    // Walk animation and mesh sync.
    const speed = Math.hypot(body.velocity.x, body.velocity.z);
    agent.walkPhase += dt * (4 + speed * 1.6);
    const swing = Math.min(1, speed / 4) * 0.45;
    agent.meshes.legL.rotation.x = Math.sin(agent.walkPhase) * swing;
    agent.meshes.legR.rotation.x = -Math.sin(agent.walkPhase) * swing;
    agent.meshes.group.position.set(body.position.x, body.position.y, body.position.z);
    agent.meshes.group.rotation.y = body.yaw;
    agent.eye.set(body.position.x, body.position.y + EYE_Y, body.position.z);
  }

  function step(dt) {
    if (state.phase !== 'live') return;
    for (const agent of agents) stepAgent(agent, dt);
    // Prune old noise.
    for (let i = state.noise.length - 1; i >= 0; i -= 1) {
      if (state.time > state.noise[i].until) state.noise.splice(i, 1);
    }
  }

  return {
    agents,
    step,
    resetRound,
    setWeapon,
  };
}
