// Pulp Mill: boot, the one loop, and the round machine.
// A fixed 60 Hz simulation feeds rendering at the display's rate; the sim
// (movement, bots, bomb, economy) never reads the frame rate.
// ?shot=cover|buy|plant|defuse with &seed=N sets up a deterministic frame for
// a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/three-addons/environments/RoomEnvironment.js';
import { EffectComposer } from '../vendor/three-addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three-addons/postprocessing/RenderPass.js';
import { SSAOPass } from '../vendor/three-addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from '../vendor/three-addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three-addons/postprocessing/OutputPass.js';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';
import { mulberry32 } from './rng.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createMover } from './player.js';
import { createWeapon, WEAPONS } from './weapons.js';
import { createCombat } from './combat.js';
import { createBots, createBodyMeshes } from './bots.js';
import { createBomb } from './bomb.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createState, PHASE, ROUND_TIME, BOMB_TIME, WIN_ROUNDS } from './state.js';
import { START_MONEY, KILL_REWARD, applyRoundRewards } from './economy.js';

const FIXED_STEP = 1 / 60;
const BUY_SECONDS = 5;
const ROUND_END_SECONDS = 4.5;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
// Since r182 PCFShadowMap is already soft; PCFSoftShadowMap only falls back to it.
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

// IBL: a baked RoomEnvironment so metals read as metal instead of flat grey.
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.7;
  pmrem.dispose();
}

// Image pipeline: HDR scene -> half-res SSAO -> bloom -> tone map + sRGB.
// Bloom lives in HDR before OutputPass; that order is law. ?post=0 renders
// straight to the canvas for the no-post validation baseline.
const usePost = params.get('post') !== '0';
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const ssaoPass = new SSAOPass(scene, camera, Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2));
composer.addPass(ssaoPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.35, 0.72);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

function renderFrame() {
  if (usePost) composer.render();
  else renderer.render(scene, camera);
}

const state = createState();
const world = createWorld(scene);
const combat = createCombat(scene, world, state);
const audio = createAudio();
const hud = createHud();
const bomb = createBomb(scene, state);
const bots = createBots(scene, world, state, combat, random);

// The player: a Warden with an invisible body (bots still shoot at it).
const playerMover = createMover(world.colliders, 0, 15.5, 0);
const playerMeshes = createBodyMeshes('ct', false);
scene.add(playerMeshes.group);
const player = {
  id: 'you', name: 'You', team: 'ct', isBot: false,
  health: 100, alive: true, mover: playerMover, justFired: false,
  meshes: playerMeshes,
};
playerMeshes.torso.userData.agent = player;
playerMeshes.head.userData.agent = player;
state.agents = [player, ...bots.agents];
combat.registerHitMeshes(bots.agents.flatMap((a) => [a.meshes.torso, a.meshes.head]));
combat.registerHitMeshes([playerMeshes.torso, playerMeshes.head]);

const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 100;
const cameraDir = new THREE.Vector3();
const grenades = [];
const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2f6f66, roughness: 0.5, metalness: 0.4 });

let weapon = null;
let owned = ['pistol'];
let primary = null;
let smokes = 0;
let deadEye = 1.6;
let shakeT = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let defuseT = 0;
let stepCount = 0;

function equip(defId) {
  if (weapon) weapon.dispose();
  weapon = createWeapon(camera, defId);
  player.weaponDef = defId;
  hud.setWeapon(WEAPONS[defId].name, smokes);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
}

function syncCamera() {
  const body = playerMover.state;
  let shakeX = 0;
  let shakeY = 0;
  if (shakeT > 0) {
    shakeX = (Math.random() - 0.5) * 0.02 * shakeT;
    shakeY = (Math.random() - 0.5) * 0.02 * shakeT;
  }
  camera.position.set(body.position.x + shakeX, body.position.y + deadEye + shakeY, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function syncPlayerMesh() {
  const body = playerMover.state;
  playerMeshes.group.position.set(body.position.x, body.position.y, body.position.z);
  playerMeshes.group.rotation.y = body.yaw;
}

function startMatch() {
  state.round = 0;
  state.ctScore = 0;
  state.tScore = 0;
  state.kills = 0;
  state.deaths = 0;
  state.money = START_MONEY;
  state.matchWinner = null;
  state.lossStreak = 0;
  owned = ['pistol'];
  primary = null;
  smokes = 0;
  equip('pistol');
  hud.setMoney(state.money);
  hud.setScore(0, 0, 1);
  startRound();
}

function startRound() {
  state.round += 1;
  state.phase = PHASE.BUY;
  state.phaseT = 0;
  state.roundTime = ROUND_TIME;
  state.roundWinner = null;
  state.roundReason = '';
  state.bomb.state = 'idle';
  state.bomb.progress = 0;
  state.bomb.defuser = null;
  state.bomb.carrier = null;
  bomb.hide();
  defuseT = 0;
  // Respawn the player at the CT spawn and refill the magazines.
  player.health = 100;
  player.alive = true;
  deadEye = 1.6;
  playerMover.state.position.set(0, 0, 15.5);
  playerMover.state.velocity.set(0, 0, 0);
  playerMover.state.yaw = 0;
  playerMover.state.pitch = 0;
  if (weapon) weapon.refill();
  bots.resetRound(state.round);
  hud.setHealth(100);
  hud.setScore(state.ctScore, state.tScore, state.round);
  hud.setBomb(null);
  hud.setChannel(null, 0);
  hud.setHint('Buy your gear — click Lock in when ready');
  hud.showBuy(true);
  document.getElementById('buy-round').textContent = String(state.round);
  syncPlayerMesh();
  syncCamera();
}

function endRound(winner, reason) {
  if (state.phase !== PHASE.LIVE) return;
  state.phase = PHASE.ROUND_END;
  state.phaseT = 0;
  state.roundWinner = winner;
  state.roundReason = reason;
  if (winner === 'ct') state.ctScore += 1;
  else state.tScore += 1;
  const res = applyRoundRewards(state, winner, 'ct');
  hud.setMoney(state.money);
  hud.setScore(state.ctScore, state.tScore, state.round);
  hud.showBuy(false);
  hud.hideOverlay();
  hud.setHint('');
  const won = winner === 'ct';
  hud.banner(won ? 'Round to the Wardens' : 'Round to the Raiders', `${reason} · +$${res.roundPay}`, 4200);
  if (won) audio.roundWin();
  else audio.roundLose();
  if (document.pointerLockElement) document.exitPointerLock();
}

function endMatch() {
  state.phase = PHASE.MATCH_END;
  state.matchWinner = state.ctScore > state.tScore ? 'ct' : 't';
  hud.showOverlay(state.matchWinner === 'ct' ? 'matchWin' : 'matchLose', state.ctScore);
  if (document.pointerLockElement) document.exitPointerLock();
}

function buy(itemId) {
  if (state.phase !== PHASE.BUY) return;
  const catalog = { rifle: 2500, smg: 1500, shotgun: 1200, smoke: 300, ammo: 200 };
  const price = catalog[itemId];
  if (price === undefined || state.money < price) return;
  state.money -= price;
  if (itemId === 'smoke') {
    smokes = Math.min(2, smokes + 1);
  } else if (itemId === 'ammo') {
    if (weapon) weapon.refill();
  } else {
    if (!owned.includes(itemId)) owned.push(itemId);
    primary = itemId;
    equip(itemId);
  }
  audio.buy();
  hud.setMoney(state.money);
  hud.setWeapon(weapon.state.def.name, smokes);
}

function throwSmoke() {
  if (smokes <= 0 || state.phase !== PHASE.LIVE || !player.alive) return;
  smokes -= 1;
  hud.setWeapon(weapon.state.def.name, smokes);
  camera.getWorldDirection(cameraDir);
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.position.copy(camera.position).addScaledVector(cameraDir, 0.5);
  mesh.castShadow = true;
  scene.add(mesh);
  grenades.push({
    mesh,
    vel: new THREE.Vector3(cameraDir.x * 13, cameraDir.y * 13 + 4.5, cameraDir.z * 13),
    fuse: 0.9,
    landed: false,
  });
  audio.smoke();
}

function shootPlayer(spread) {
  if (!weapon.takeRound()) {
    audio.dryFire();
    weapon.reload();
    return;
  }
  camera.getWorldDirection(cameraDir);
  cameraDir.x += (random() * 2 - 1) * spread;
  cameraDir.y += (random() * 2 - 1) * spread;
  cameraDir.z += (random() * 2 - 1) * spread;
  cameraDir.normalize();
  const res = combat.shoot(player, camera.position, cameraDir, weapon.state.def, 0);
  weapon.pullTrigger();
  playerMover.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  player.justFired = true;
  state.noise.push({ x: playerMover.state.position.x, z: playerMover.state.position.z, radius: 22, until: state.time + 1.0 });
  audio.shot(weapon.state.def.id);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  if (res.hit) {
    hud.hitMarker(res.killed, res.killed ? 300 : 90);
    audio.hit(res.headshot);
    if (res.killed) {
      audio.kill();
      state.kills += 1;
      state.money += KILL_REWARD;
      hud.setMoney(state.money);
    }
  }
  if (weapon.state.mag === 0) weapon.reload();
}

function drainEvents() {
  for (const ev of state.events) {
    if (ev.type === 'damage') {
      if (ev.target === player) {
        hud.damageFlash();
        audio.hurt();
        hud.setHealth(player.health);
        if (!player.alive) {
          state.deaths += 1;
          hud.showOverlay('dead', state.ctScore);
          if (document.pointerLockElement) document.exitPointerLock();
        }
      }
    } else if (ev.type === 'kill') {
      const a = ev.attacker ? ev.attacker.name : '—';
      const t = ev.target.name;
      hud.feed(`${a} ▸ ${t}`);
      if (ev.target === player) {
        // handled in the damage event above
      }
    } else if (ev.type === 'shot') {
      const d = Math.hypot(ev.agent.mover.state.position.x - playerMover.state.position.x, ev.agent.mover.state.position.z - playerMover.state.position.z);
      if (d < 42) audio.shot(ev.defId, true);
    } else if (ev.type === 'beep') {
      audio.beep(ev.final);
    } else if (ev.type === 'planted') {
      hud.banner('Bomb planted', `Device armed at Site ${ev.site} — defuse it`, 3000);
      hud.feed(`Bomb planted at Site ${ev.site}`);
      audio.plant();
    } else if (ev.type === 'defused') {
      hud.feed('Bomb defused');
    } else if (ev.type === 'explosion') {
      audio.explosion();
      shakeT = 1;
    } else if (ev.type === 'smoke') {
      audio.smoke();
    }
  }
  state.events.length = 0;
}

function updateTeamsHud() {
  const ct = state.agents.filter((a) => a.team === 'ct' && a.alive).map((a) => a.name).join(' ');
  const t = state.agents.filter((a) => a.team === 't' && a.alive).map((a) => a.name).join(' ');
  hud.setTeams(ct, t);
}

function checkRoundEnd() {
  if (state.phase !== PHASE.LIVE) return;
  const ctAlive = state.agents.filter((a) => a.team === 'ct' && a.alive).length;
  const tAlive = state.agents.filter((a) => a.team === 't' && a.alive).length;
  if (state.bomb.state === 'exploded') { endRound('t', 'Bomb detonated'); return; }
  if (state.bomb.state === 'defused') { endRound('ct', 'Bomb defused'); return; }
  if (tAlive === 0) { endRound('ct', 'Raiders eliminated'); return; }
  if (ctAlive === 0) { endRound('t', 'Wardens eliminated'); return; }
  if (state.roundTime <= 0 && state.bomb.state !== 'planted') { endRound('ct', 'Time expired — mill held'); }
}

function step(dt) {
  state.time += dt;
  stepCount += 1;
  const phase = state.phase;

  if (phase === PHASE.BUY) {
    state.phaseT += dt;
    // Buy phase: look around only, no movement.
    if (state.phaseT >= BUY_SECONDS) {
      state.phase = PHASE.LIVE;
      state.phaseT = 0;
      hud.showBuy(false);
      hud.setHint('');
      hud.banner(`Round ${state.round}`, state.round === 1 ? 'Defend both sites' : '', 1800);
    }
  } else if (phase === PHASE.LIVE) {
    state.roundTime -= dt;
    // Player movement and actions.
    if (player.alive) {
      playerMover.step(dt, input.state.keys);
      if (input.state.firing && weapon.ready()) shootPlayer(shot ? 0 : weapon.spread(playerMover.groundSpeed()));
      if (input.takePressed('KeyR')) { weapon.reload(); audio.reload(); }
      if (input.takePressed('Digit1') && primary) equip(primary);
      if (input.takePressed('Digit2')) equip('pistol');
      if (input.takePressed('KeyG')) throwSmoke();
      if (input.takePressed('KeyB')) hud.showBuy(false);
      // Defuse: hold E near the bomb.
      if (state.bomb.state === 'planted') {
        const d = Math.hypot(playerMover.state.position.x - state.bomb.x, playerMover.state.position.z - state.bomb.z);
        if (d < 1.8 && input.state.keys.has('KeyE')) {
          defuseT += dt;
          state.bomb.progress = defuseT / 5;
          state.bomb.defuser = player;
          hud.setChannel('Defusing…', state.bomb.progress);
          if (stepCount % 30 === 0) audio.defuseTick();
          if (defuseT >= 5) {
            state.bomb.state = 'defused';
            state.events.push({ type: 'defused', agent: player });
            hud.setChannel(null, 0);
            defuseT = 0;
          }
        } else {
          if (defuseT > 0) { defuseT = 0; state.bomb.progress = 0; }
          hud.setChannel(null, 0);
        }
      }
    } else {
      deadEye += (0.55 - deadEye) * Math.min(1, dt * 3);
    }
    // Grenades fly.
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.vel.y -= 14 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      if (g.mesh.position.y <= 0.1 && !g.landed) {
        g.landed = true;
        g.mesh.position.y = 0.1;
        g.vel.set(0, 0, 0);
      }
      g.fuse -= dt;
      if (g.fuse <= 0) {
        combat.deploySmoke(g.mesh.position.x, g.mesh.position.z);
        scene.remove(g.mesh);
        grenades.splice(i, 1);
      }
    }
    bots.step(dt);
    bomb.step(dt);
    // Bomb timer HUD.
    if (state.bomb.state === 'planted') {
      const s = Math.max(0, Math.ceil(state.bomb.timer));
      hud.setBomb(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} — SITE ${state.bomb.site}`);
      hud.setTimer(state.bomb.timer, true);
    } else {
      hud.setBomb(null);
      hud.setTimer(state.roundTime, false);
    }
    // Defuse hint when the player is near the bomb.
    if (state.bomb.state === 'planted' && player.alive) {
      const d = Math.hypot(playerMover.state.position.x - state.bomb.x, playerMover.state.position.z - state.bomb.z);
      if (d < 4) hud.setHint(d < 1.8 ? 'Hold E to defuse' : 'Bomb planted — get to the device');
      else hud.setHint('');
    }
    checkRoundEnd();
  } else if (phase === PHASE.ROUND_END) {
    state.phaseT += dt;
    bots.step(dt);
    bomb.step(dt);
    if (state.phaseT >= ROUND_END_SECONDS) {
      const over = state.ctScore >= WIN_ROUNDS || state.tScore >= WIN_ROUNDS || (state.round >= 9 && state.ctScore !== state.tScore);
      if (over) endMatch();
      else startRound();
    }
  }

  if (weapon) weapon.step(dt);
  combat.step(dt);
  player.justFired = false;
  if (stepCount % 30 === 0) updateTeamsHud();
  if (shakeT > 0) shakeT = Math.max(0, shakeT - dt * 1.4);
  drainEvents();
  syncPlayerMesh();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (player.alive || state.phase === PHASE.BUY) playerMover.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderFrame();
}

function onLockChange(locked) {
  if (shot) return;
  audio.unlock();
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.showBuy(false);
  } else if (state.phase === PHASE.LIVE || state.phase === PHASE.BUY) {
    if (player.alive) hud.showOverlay('paused', state.ctScore);
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (state.phase === PHASE.MENU || state.phase === PHASE.MATCH_END) {
    // Start the match: the buy menu opens with the mouse free, so the player
    // can click items. Locking in happens from the buy menu or a canvas click.
    startMatch();
    hud.hideOverlay();
  } else {
    hud.hideOverlay();
    hud.showBuy(false);
    input.requestLock();
  }
});

// Lock in from the buy menu, or by clicking the game itself.
document.getElementById('buy-done').addEventListener('click', () => {
  audio.unlock();
  hud.showBuy(false);
  input.requestLock();
});
renderer.domElement.addEventListener('click', () => {
  if (shot) return;
  if (!input.state.locked && (state.phase === PHASE.LIVE || state.phase === PHASE.BUY) && player.alive) {
    hud.showBuy(false);
    input.requestLock();
  }
});

hud.onBuy((id) => buy(id));
window.addEventListener('keydown', (event) => {
  if (state.phase !== PHASE.BUY) return;
  const index = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(event.code);
  if (index >= 0) {
    const ids = ['rifle', 'smg', 'shotgun', 'smoke', 'ammo'];
    buy(ids[index]);
  }
  if (event.code === 'KeyB') hud.showBuy(false);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Deterministic screenshot poses -------------------------------------
function poseAgent(agent, x, z, yaw) {
  agent.mover.state.position.set(x, 0, z);
  agent.mover.state.velocity.set(0, 0, 0);
  agent.mover.state.yaw = yaw;
  agent.mover.state.pitch = 0;
  agent.health = 100;
  agent.alive = true;
  agent.fall = 0;
  agent.meshes.group.position.set(x, 0, z);
  agent.meshes.group.rotation.set(0, yaw, 0);
}

// Poses settle without the bots: only the weapon, tracers, smoke and the
// bomb clock advance, so nobody moves or shoots during a capture.
function settle(steps) {
  for (let i = 0; i < steps; i += 1) {
    state.time += FIXED_STEP;
    if (weapon) weapon.step(FIXED_STEP);
    combat.step(FIXED_STEP);
    bomb.step(FIXED_STEP);
    syncPlayerMesh();
  }
}

function aimAt(x, y, z) {
  const body = playerMover.state;
  const dx = x - body.position.x;
  const dy = y - (body.position.y + body.eye);
  const dz = z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  startMatch();
  // Skip the buy phase: go straight to a live round with a fixed clock.
  state.phase = PHASE.LIVE;
  state.phaseT = 0;
  state.roundTime = 92;
  state.ctScore = 1;
  state.tScore = 1;
  state.round = 2;
  state.money = 4100;
  hud.setMoney(4100);
  hud.setScore(1, 1, 2);
  hud.setHealth(100);
  equip('rifle');
  weapon.refill();
  smokes = 1;
  hud.setWeapon('Ream Rifle', 1);
  const ct = bots.agents.filter((a) => a.team === 'ct');
  const t = bots.agents.filter((a) => a.team === 't');
  // Freeze the bots where the pose puts them.
  for (const a of bots.agents) { a.state = 'hold'; a.path = []; a.target = null; }

  if (name === 'cover') {
    // Player off-axis at mid-south, diagonal view up Mid into the hall: two
    // raiders visible either side of the press machine, one warden to the left.
    poseAgent(player, 2.5, 9.5, 0);
    poseAgent(ct[0], -3.5, 7.0, 0.2);
    poseAgent(t[0], -3.5, 2.5, 2.4);
    poseAgent(t[1], -0.5, 3.5, 2.7);
    poseAgent(t[2], -6.5, -9.5, 2.4);
    settle(30);
    aimAt(-2.5, 1.3, -4);
  } else if (name === 'buy') {
    state.phase = PHASE.BUY;
    state.phaseT = 0;
    poseAgent(player, 0, 14.5, 0);
    poseAgent(ct[0], -3, 13.5, 0.3);
    poseAgent(ct[1], 3.5, 14, -0.3);
    document.getElementById('buy-round').textContent = '2';
    hud.showBuy(true);
    settle(10);
    aimAt(0, 1.5, -8);
  } else if (name === 'plant') {
    // Bomb armed at A, smoke drifting over the site, player pushing in.
    state.bomb.state = 'planted';
    state.bomb.site = 'A';
    state.bomb.x = -14;
    state.bomb.z = -8.5;
    state.bomb.timer = 32;
    bomb.place(-14, -8.5);
    hud.setBomb('0:32 — SITE A');
    combat.deploySmoke(-13, -7);
    poseAgent(player, -10, -1, 0.6);
    poseAgent(t[0], -15.5, -11.5, 2.2);
    poseAgent(t[1], -12, -11, 2.8);
    poseAgent(ct[0], -11, -5, 0.5);
    settle(30);
    aimAt(-14.5, 1.0, -8.5);
  } else {
    // Defuse: player kneeling on the device at B, a warden covering the door.
    state.bomb.state = 'planted';
    state.bomb.site = 'B';
    state.bomb.x = 16;
    state.bomb.z = -9;
    state.bomb.timer = 18;
    bomb.place(16, -9);
    poseAgent(player, 16, -4.6, 0);
    poseAgent(ct[0], 13.5, -5.5, -0.5);
    poseAgent(t[0], 18.5, -12, 2.6);
    defuseT = 3;
    state.bomb.progress = 0.6;
    hud.setChannel('Defusing…', 0.6);
    hud.setBomb('0:18 — SITE B');
    settle(20);
    aimAt(16, 0.5, -9);
  }
  // The buy menu opens with the round: only the buy shot keeps it.
  if (name !== 'buy') hud.showBuy(false);
  if (name !== 'buy') hud.setHint('');
  hud.setTimer(state.bomb.state === 'planted' ? state.bomb.timer : 92, state.bomb.state === 'planted');
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderFrame();
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

equip('pistol');
hud.setMoney(START_MONEY);
hud.setHealth(100);
hud.setAmmo(weapon.state.mag, weapon.state.reserve);
syncCamera();

// Debug handles for automated playtests and lighting probes: read-only state.
window.__game = { state, input, bots, get player() { return player; }, get weapon() { return weapon; } };
Object.assign(window, { renderer, scene });
if (shot) runShot(shot);
else requestAnimationFrame(frame);
