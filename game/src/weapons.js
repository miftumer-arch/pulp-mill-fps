// Weapons: the authored definitions, and the first-person view model.
// One definition per gun; the simulation reads damage, spread and timing from
// here, so a balance change is one number in one place. Bots use the same defs.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Mill Pistol', price: 0, slot: 2, auto: false,
    mag: 12, reserve: 48, damage: 22, headMult: 3, pellets: 1,
    gap: 0.16, reload: 1.4, spreadStill: 0.004, spreadMove: 0.03, range: 60, kick: 0.012,
  },
  smg: {
    id: 'smg', name: 'Ledger SMG', price: 1500, slot: 1, auto: true,
    mag: 32, reserve: 96, damage: 18, headMult: 3, pellets: 1,
    gap: 0.085, reload: 1.8, spreadStill: 0.006, spreadMove: 0.036, range: 45, kick: 0.009,
  },
  rifle: {
    id: 'rifle', name: 'Ream Rifle', price: 2500, slot: 1, auto: true,
    mag: 30, reserve: 90, damage: 26, headMult: 3, pellets: 1,
    gap: 0.1, reload: 2.1, spreadStill: 0.0025, spreadMove: 0.03, range: 80, kick: 0.014,
  },
  shotgun: {
    id: 'shotgun', name: 'Pulp Shotgun', price: 1200, slot: 1, auto: false,
    mag: 6, reserve: 24, damage: 9, headMult: 2, pellets: 8,
    gap: 0.8, reload: 2.6, spreadStill: 0.02, spreadMove: 0.05, range: 22, kick: 0.03,
  },
};

export const SMOKE = { id: 'smoke', name: 'Smoke Canister', price: 300 };

// A live weapon: definition + magazine state + view model on the camera.
export function createWeapon(camera, defId) {
  const def = WEAPONS[defId];
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.timberDark), roughness: 0.7, metalness: 0.15 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.45, metalness: 0.6 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.6, metalness: 0.3 });

  const model = new THREE.Group();
  // Each gun gets its own silhouette: pistol is short, SMG compact, rifle long
  // with a paper-wrapped grip, shotgun wide with twin barrels.
  const len = defId === 'pistol' ? 0.22 : defId === 'smg' ? 0.34 : defId === 'shotgun' ? 0.5 : 0.46;
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.1, len), body);
  model.add(receiver);
  const barrel = new THREE.Mesh(
    new THREE.BoxGeometry(defId === 'shotgun' ? 0.09 : 0.045, 0.045, len * 0.8),
    defId === 'shotgun' ? body : grip,
  );
  barrel.position.set(0, 0.025, -len * 0.85);
  model.add(barrel);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.2), grip);
  stock.position.set(0, -0.02, len * 0.55);
  model.add(stock);
  if (defId === 'rifle' || defId === 'smg') {
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), accent);
    mag.position.set(0, -0.12, -0.02);
    mag.rotation.x = 0.15;
    model.add(mag);
  }
  if (defId === 'rifle') {
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.12), body);
    sight.position.set(0, 0.075, -0.05);
    model.add(sight);
  }
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  // HDR flash colour (values above 1) so the bloom pass picks it up.
  const flashMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  flashMat.color.setRGB(3.0, 1.8, 0.9);
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), flashMat);
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color('#ffb45e'), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = { def, mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0 };

  return {
    state,
    model,
    step(dt) {
      state.cooldown = Math.max(0, state.cooldown - dt);
      state.flash = Math.max(0, state.flash - dt);
      state.kick += (0 - state.kick) * Math.min(1, dt * 14);
      model.position.z = -0.42 + state.kick;
      model.position.y = -0.2 + state.kick * 0.4;
      model.rotation.x = state.kick * 2.2;
      flash.visible = state.flash > 0;
      flash.rotation.z = state.flash * 30;
      flashLight.intensity = state.flash > 0 ? 18 : 0;
      if (state.reloadLeft > 0) {
        state.reloadLeft = Math.max(0, state.reloadLeft - dt);
        model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
        if (state.reloadLeft === 0) {
          const need = def.mag - state.mag;
          const take = Math.min(need, state.reserve);
          state.mag += take;
          state.reserve -= take;
        }
      }
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def.gap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed) {
      return def.spreadStill + Math.min(1, speed / 5.2) * def.spreadMove;
    },
    refill() {
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    dispose() {
      camera.remove(model, flash, flashLight);
    },
  };
}
