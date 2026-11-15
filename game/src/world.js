// The mill, built from map data: floor, walls, props, site markers, lights and sky.
// Every box here is a collider for players/bots and a surface a bullet stops on.
// Visuals are procedural geometry + canvas textures from textures.js; no model files.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';
import { makeTextures } from './textures.js';
import { mergeParts, part } from './merge.js';

export function createWorld(scene) {
  const textures = makeTextures();
  // Material table: roles separate by roughness/metalness response, not hue.
  // Albedo + roughness + bump on every hero surface; env response tuned so
  // bare steel reads as metal and concrete as matte under the same sun.
  const mats = {
    floor: new THREE.MeshStandardMaterial({ ...textures.floor, roughness: 1.0, metalness: 0, envMapIntensity: 0.2, bumpScale: 0.03 }),
    brick: new THREE.MeshStandardMaterial({ ...textures.brick, roughness: 0.94, metalness: 0, envMapIntensity: 0.3, bumpScale: 0.04 }),
    timber: new THREE.MeshStandardMaterial({ ...textures.timber, roughness: 0.8, metalness: 0.02, envMapIntensity: 0.5, bumpScale: 0.02 }),
    timberDark: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.timberDark), roughness: 0.9 }),
    concrete: new THREE.MeshStandardMaterial({ ...textures.floor, color: new THREE.Color(PALETTE.concrete), roughness: 0.95, metalness: 0, envMapIntensity: 0.3 }),
    paper: new THREE.MeshStandardMaterial({ ...textures.paper, roughness: 0.92, metalness: 0, envMapIntensity: 0.15, bumpScale: 0.01 }),
    metal: new THREE.MeshStandardMaterial({ ...textures.metal, roughness: 0.5, metalness: 0.6, envMapIntensity: 0.9, bumpScale: 0.02 }),
    // Painted press machine: clearcoat over teal, the one hero prop.
    machine: new THREE.MeshPhysicalMaterial({ ...textures.metal, roughness: 0.45, metalness: 0.5, clearcoat: 0.9, clearcoatRoughness: 0.15, envMapIntensity: 1.0 }),
    steel: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.38, metalness: 1.0, envMapIntensity: 1.1 }),
    rust: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.85, metalness: 0.3, envMapIntensity: 0.5 }),
    water: new THREE.MeshStandardMaterial({ ...textures.water, roughness: 0.15, metalness: 0.05, envMapIntensity: 1.0 }),
    hazard: new THREE.MeshStandardMaterial({ ...textures.hazard, roughness: 0.8, metalness: 0 }),
    paperSheet: new THREE.MeshStandardMaterial({ color: new THREE.Color('#a89a78'), roughness: 0.95, side: THREE.DoubleSide, envMapIntensity: 0.15 }),
  };

  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  function addMesh(mesh, collider = true) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collider) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function box(w, h, d, x, y, z, mat, collider = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat]);
    mesh.position.set(x, y, z);
    return addMesh(mesh, collider);
  }

  // Sky: a gradient dome (warm horizon, cool zenith) with a sun disc, plus
  // dark distant skyline silhouettes. The dome ignores fog.
  const skyGeo = new THREE.SphereGeometry(150, 24, 14);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    uniforms: {},
    vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        vec3 zenith = vec3(0.30, 0.42, 0.55);
        vec3 mid = vec3(0.58, 0.66, 0.72);
        vec3 horizon = vec3(0.82, 0.70, 0.52);
        vec3 c = h > 0.25 ? mix(mid, zenith, smoothstep(0.25, 0.9, h)) : mix(horizon, mid, smoothstep(-0.05, 0.25, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(7, 24),
    new THREE.MeshBasicMaterial({ fog: false, toneMapped: false }),
  );
  sunDisc.material.color.setRGB(2.6, 2.0, 1.2);
  sunDisc.position.set(78, 92, 42);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);

  // Floor: one big slab, plus scattered paper scraps for wear.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(46, 38), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  const scrapGeo = new THREE.PlaneGeometry(0.5, 0.7);
  for (let i = 0; i < 26; i += 1) {
    const scrap = new THREE.Mesh(scrapGeo, mats.paperSheet);
    scrap.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI);
    scrap.position.set(-21 + Math.random() * 42, 0.012, -17 + Math.random() * 34);
    scrap.receiveShadow = true;
    group.add(scrap);
  }

  // Walls from map data.
  for (const w of MAP.walls) box(w.w, w.h, w.d, w.x, w.h / 2, w.z, w.mat);
  // Timber caps along the top of the outer walls, so the skyline reads.
  box(45, 0.3, 0.5, 0, 4.35, -18, 'timber', false);
  box(45, 0.3, 0.5, 0, 4.35, 18, 'timber', false);
  box(0.5, 0.3, 37, -22, 4.35, 0, 'timber', false);
  box(0.5, 0.3, 37, 22, 4.35, 0, 'timber', false);

  // Props.
  const rollGeo = new THREE.CylinderGeometry(0.8, 0.8, 1.1, 20);
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.0, 16);
  const crateGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  for (const p of MAP.props) {
    if (p.kind === 'vat') {
      const vat = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 1.05, 1.4, 24), mats.metal);
      vat.position.set(p.x, 0.7, p.z);
      addMesh(vat);
      const water = new THREE.Mesh(new THREE.CircleGeometry(p.r * 0.92, 24), mats.water);
      water.rotation.x = -Math.PI / 2;
      water.position.set(p.x, 1.32, p.z);
      water.receiveShadow = true;
      group.add(water);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(p.r, 0.07, 8, 24), mats.rust);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(p.x, 1.42, p.z);
      group.add(rim);
    } else if (p.kind === 'roll') {
      const roll = new THREE.Mesh(rollGeo, mats.paper);
      roll.position.set(p.x, (p.y ?? 0) + 0.55, p.z);
      if (p.r !== 0.8) roll.scale.set(p.r / 0.8, 1, p.r / 0.8);
      addMesh(roll);
    } else if (p.kind === 'crate') {
      const crate = new THREE.Mesh(crateGeo, mats.timber);
      crate.position.set(p.x, (p.y ?? 0) + 0.6, p.z);
      crate.rotation.y = p.rot ?? 0.3;
      addMesh(crate);
    } else if (p.kind === 'rack') {
      const rack = new THREE.Group();
      rack.position.set(p.x, 0, p.z);
      rack.rotation.y = p.rot ?? 0;
      const post = new THREE.BoxGeometry(0.12, 2.3, 0.12);
      const bar = new THREE.BoxGeometry(3.2, 0.1, 0.1);
      for (const sx of [-1.55, 1.55]) {
        const postMesh = new THREE.Mesh(post, mats.steel);
        postMesh.position.set(sx, 1.15, 0);
        postMesh.castShadow = true;
        rack.add(postMesh);
      }
      for (const by of [0.7, 1.4, 2.1]) {
        const barMesh = new THREE.Mesh(bar, mats.steel);
        barMesh.position.set(0, by, 0);
        barMesh.castShadow = true;
        rack.add(barMesh);
      }
      const sheetGeo = new THREE.PlaneGeometry(0.9, 1.1);
      for (let s = 0; s < 3; s += 1) {
        const sheet = new THREE.Mesh(sheetGeo, mats.paperSheet);
        sheet.position.set(-1 + s, 1.55, 0.02);
        sheet.rotation.z = (Math.random() - 0.5) * 0.12;
        sheet.castShadow = true;
        rack.add(sheet);
      }
      group.add(rack);
      // The collider must follow the rack's rotation: a rack turned 90 degrees
      // is a bar along z, not along x. (An unrotated box here blocked an
      // invisible bar across the B site for both bots and the player.)
      const rackSize = (p.rot ?? 0) ? new THREE.Vector3(0.4, 2.3, 3.3) : new THREE.Vector3(3.3, 2.3, 0.4);
      colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(p.x, 1.15, p.z), rackSize));
      shootables.push(...rack.children);
    } else if (p.kind === 'beam') {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 0.6), mats.timber);
      beam.position.set(p.x, 0.25, p.z);
      beam.rotation.y = p.rot ?? 0;
      addMesh(beam);
    } else if (p.kind === 'machine') {
      const machine = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 2.2), mats.machine);
      machine.position.set(p.x, 1.2, p.z);
      addMesh(machine);
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3.6, 16), mats.steel);
      roller.rotation.z = Math.PI / 2;
      roller.position.set(p.x, 2.55, p.z);
      addMesh(roller);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.4, 12), mats.rust);
      pipe.position.set(p.x - 1.4, 1.7, p.z + 1.2);
      addMesh(pipe);
      const belt = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.18, 1.0), mats.timberDark);
      belt.position.set(p.x, 0.55, p.z + 1.6);
      addMesh(belt);
    } else if (p.kind === 'barrel') {
      const barrel = new THREE.Mesh(barrelGeo, p.x < 0 ? mats.rust : mats.metal);
      barrel.position.set(p.x, 0.5, p.z);
      addMesh(barrel);
    }
  }

  // Dressing, visual only — no colliders, so the waypoint graph and the
  // bot audit stay valid. Roof joists over the hall and yards, rust pipes
  // along the north and west walls, paper stacks on the site crates. Each
  // group merges to one mesh (one draw call) via the shared merge helper.
  const joistGeo = new THREE.BoxGeometry(44, 0.25, 0.4);
  const joists = new THREE.Mesh(mergeParts([-12, -4, 4, 12].map((jz) => part(joistGeo, 0, 4.0, jz))), mats.timberDark);
  joists.castShadow = true;
  group.add(joists);
  const pipeGeo = new THREE.CylinderGeometry(0.09, 0.09, 30, 10);
  const dropGeo = new THREE.CylinderGeometry(0.09, 0.09, 3.4, 10);
  const pipeWGeo = new THREE.CylinderGeometry(0.09, 0.09, 24, 10);
  const pipes = new THREE.Mesh(mergeParts([
    part(pipeGeo, 0, 3.6, -17.5, 0, 0, Math.PI / 2),
    part(dropGeo, -12, 1.9, -17.5),
    part(dropGeo, 12, 1.9, -17.5),
    part(pipeWGeo, -21.5, 3.6, 0, Math.PI / 2),
  ]), mats.rust);
  pipes.castShadow = true;
  group.add(pipes);
  const sheetStackGeo = new THREE.BoxGeometry(0.9, 0.05, 0.65);
  const sheetParts = [];
  for (const [sx, sz, n] of [[-17, -4.5, 3], [14.5, -4.5, 3], [-5, 11, 2]]) {
    for (let s = 0; s < n; s += 1) {
      sheetParts.push(part(sheetStackGeo, sx, 1.24 + s * 0.06, sz, 0, (s - 1) * 0.12, 0));
    }
  }
  const sheets = new THREE.Mesh(mergeParts(sheetParts), mats.paperSheet);
  sheets.castShadow = true;
  sheets.receiveShadow = true;
  group.add(sheets);

  // Site markers: a hazard ring on the floor and a hanging sign board.
  for (const key of ['A', 'B']) {
    const site = MAP.sites[key];
    const ring = new THREE.Mesh(new THREE.RingGeometry(site.r - 0.35, site.r, 40), mats.hazard);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    ring.receiveShadow = true;
    group.add(ring);
    const sign = makeSign(key, site.name);
    sign.position.set(site.x, 3.1, site.z);
    group.add(sign);
  }

  // Contact grounding: a soft blob shadow under every prop, and a stretched
  // blob along each wall base as cheap baked AO. Nothing floats.
  const blobMat = new THREE.MeshBasicMaterial({ map: textures.blob, transparent: true, depthWrite: false, opacity: 0.55 });
  const blobGeo = new THREE.PlaneGeometry(1, 1);
  function blob(x, z, w, d) {
    const m = new THREE.Mesh(blobGeo, blobMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015, z);
    m.scale.set(w, d, 1);
    m.receiveShadow = true;
    group.add(m);
  }
  for (const p of MAP.props) {
    if (p.kind === 'vat') blob(p.x, p.z, p.r * 2.9, p.r * 2.9);
    else if (p.kind === 'roll') blob(p.x, p.z, 2.2, 2.2);
    else if (p.kind === 'crate') blob(p.x, p.z, 2.0, 2.0);
    else if (p.kind === 'rack') blob(p.x, p.z, 4.2, 1.2);
    else if (p.kind === 'beam') blob(p.x, p.z, 4.4, 1.4);
    else if (p.kind === 'machine') blob(p.x, p.z, 5.6, 3.6);
    else if (p.kind === 'barrel') blob(p.x, p.z, 1.5, 1.5);
  }
  for (const w of MAP.walls) {
    const len = Math.max(w.w, w.d) + 0.8;
    if (w.w >= w.d) blob(w.x, w.z, len, 1.5);
    else blob(w.x, w.z, 1.5, len);
  }

  // Background dressing outside the walls: the mill chimney, rooftops and a
  // water tower, all dark silhouettes against the sky.
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 16, 16), mats.brick);
  chimney.position.set(-26, 8, -24);
  group.add(chimney);
  const roof1 = new THREE.Mesh(new THREE.BoxGeometry(14, 3, 8), mats.timberDark);
  roof1.position.set(28, 1.5, -24);
  group.add(roof1);
  const roof2 = new THREE.Mesh(new THREE.BoxGeometry(10, 2.4, 7), mats.concrete);
  roof2.position.set(-30, 1.2, 14);
  group.add(roof2);
  const towerLegs = new THREE.Mesh(new THREE.BoxGeometry(3, 7, 3), mats.timberDark);
  towerLegs.position.set(26, 3.5, 26);
  group.add(towerLegs);
  const towerTank = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, 14), mats.metal);
  towerTank.position.set(26, 8.5, 26);
  group.add(towerTank);

  // Lighting: warm late-afternoon sun, cool sky fill, and lamps that hang where
  // they are seen (hall centre, both sites, CT mid). Every local light has an emitter.
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(new THREE.Color('#a3b8c4'), 42, 120);
  const sky = new THREE.HemisphereLight(new THREE.Color('#cfe0ea'), new THREE.Color(PALETTE.concreteDark), 0.85);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.sun), 2.6);
  sun.position.set(28, 38, 16);
  sun.target.position.set(0, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 110;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#9fb8c8'), 0.5);
  fill.position.set(-20, 14, 22);
  scene.add(fill);
  const lampMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a2f1e'), emissive: new THREE.Color('#ffb45e'), emissiveIntensity: 2.2 });
  for (const [lx, lz, li] of [[0, 0, 26], [-16, -9, 16], [16, -9, 16], [0, 12, 12]]) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), lampMat);
    bulb.position.set(lx, 3.3, lz);
    group.add(bulb);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), mats.steel);
    cord.position.set(lx, 3.8, lz);
    group.add(cord);
    const light = new THREE.PointLight(new THREE.Color('#ffb45e'), li, 13, 1.6);
    light.position.set(lx, 3.1, lz);
    scene.add(light);
  }

  return { colliders, shootables, group, mats };
}

function makeSign(letter, name) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2f28';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#c65a2e';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 248, 120);
  ctx.fillStyle = '#efe8d6';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(letter, 128, 66);
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillStyle = '#c65a2e';
  ctx.fillText(name.toUpperCase(), 128, 104);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.2),
    new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }),
  );
  board.castShadow = true;
  const hanger = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6),
    new THREE.MeshStandardMaterial({ color: 0x454b54, roughness: 0.5, metalness: 0.7 }),
  );
  hanger.position.y = 0.9;
  const g = new THREE.Group();
  g.add(board, hanger);
  return g;
}
