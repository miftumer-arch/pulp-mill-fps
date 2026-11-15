// The bomb: a small device with a blinking light, its 40-second timer, and
// the explosion. Planting and defusing channels live in bots.js / main.js;
// this module owns the visible device and the countdown.
import * as THREE from 'three';

export function createBomb(scene, state) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.2, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.5, metalness: 0.6 }),
  );
  body.castShadow = true;
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2211, emissiveIntensity: 0 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), lightMat);
  lamp.position.set(0.14, 0.12, 0);
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6),
    new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.8 }),
  );
  antenna.position.set(-0.16, 0.2, 0);
  group.add(body, lamp, antenna);
  group.visible = false;
  scene.add(group);

  // Explosion: an expanding fireball + a light that dies fast.
  const blastMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, depthWrite: false });
  const blast = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), blastMat);
  blast.visible = false;
  scene.add(blast);
  const blastLight = new THREE.PointLight(0xff8844, 0, 30, 1.5);
  scene.add(blastLight);
  let blastT = 0;
  let beepT = 0;

  function place(x, z) {
    group.position.set(x, 0.1, z);
    group.visible = true;
    beepT = 0;
  }

  function hide() {
    group.visible = false;
    lightMat.emissiveIntensity = 0;
  }

  function explode() {
    const x = state.bomb.x;
    const z = state.bomb.z;
    blast.position.set(x, 1.2, z);
    blast.visible = true;
    blastT = 0.9;
    blastLight.position.set(x, 2, z);
    blastLight.intensity = 400;
    hide();
    state.events.push({ type: 'explosion', x, z });
  }

  function step(dt) {
    if (state.bomb.state === 'planted') {
      state.bomb.timer -= dt;
      // Beeps accelerate as the timer runs down.
      beepT -= dt;
      const interval = 0.35 + (state.bomb.timer / 40) * 0.65;
      if (beepT <= 0) {
        beepT = interval;
        lightMat.emissiveIntensity = 3;
        state.events.push({ type: 'beep', final: state.bomb.timer < 5 });
        setTimeout(() => { lightMat.emissiveIntensity = 0.4; }, 90);
      }
      if (state.bomb.timer <= 0) {
        state.bomb.state = 'exploded';
        explode();
      }
    }
    if (blastT > 0) {
      blastT -= dt;
      const k = 1 - blastT / 0.9;
      blast.scale.setScalar(1 + k * 9);
      blastMat.opacity = Math.max(0, 0.85 * (1 - k));
      blastLight.intensity = Math.max(0, 400 * (1 - k));
      if (blastT <= 0) { blast.visible = false; blastLight.intensity = 0; }
    }
  }

  return { step, place, hide, explode, group };
}
