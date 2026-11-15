// Procedural PBR canvas textures: every surface in the mill is painted here,
// no image files. Each surface returns an albedo map (sRGB) plus a roughness
// map (linear) and a bump map, at 512 px for hero surfaces. Nothing is a flat
// colour: base noise, wear, stains and edge darkening (cheap baked AO) on all
// of them. Roughness maps are light grey (rough) with darker worn-smooth
// patches, so materials separate by response, not hue alone.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')];
}

function grain(ctx, size, amount, light, dark) {
  for (let i = 0; i < amount; i += 1) {
    ctx.fillStyle = Math.random() > 0.5 ? light : dark;
    ctx.globalAlpha = 0.05 + Math.random() * 0.12;
    const s = 1 + Math.random() * 2;
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  ctx.globalAlpha = 1;
}

function blotches(ctx, size, count, color, alpha, rMin, rMax) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha * (0.5 + Math.random() * 0.5);
    const r = rMin + Math.random() * (rMax - rMin);
    ctx.beginPath();
    ctx.ellipse(Math.random() * size, Math.random() * size, r, r * (0.5 + Math.random()), Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Roughness canvas: start near-white (rough), then paint darker worn patches.
// patchMin is the floor of the patch grey: a patch darker than ~200 (roughness
// ~0.72 after the material multiplier) turns into a mirror for the 2.6 sun at
// grazing angles and blooms into a white glint on flat floors — the mill
// floor and the site rings are clamped to 200, worn metal keeps 150.
function roughCanvas(size, base = 235, patches = 10, patchMin = 150) {
  const [c, ctx] = canvas(size);
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < patches; i += 1) {
    const g = patchMin + Math.floor(Math.random() * (210 - patchMin));
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.globalAlpha = 0.25 + Math.random() * 0.3;
    const r = 12 + Math.random() * 50;
    ctx.beginPath();
    ctx.ellipse(Math.random() * size, Math.random() * size, r, r * 0.6, Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return c;
}

function tex(c, rx = 1, ry = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function pbr(albedo, rx, ry, roughBase = 235, patchMin = 150) {
  const size = albedo.width;
  return {
    map: tex(albedo, rx, ry, true),
    roughnessMap: tex(roughCanvas(size, roughBase, 10, patchMin), rx, ry, false),
    bumpMap: tex(albedo, rx, ry, false),
  };
}

export function makeTextures() {
  const S = 512;

  // Concrete floor: warm grey with paper dust, oil stains and cracks.
  const [fc, fx] = canvas(S);
  fx.fillStyle = '#716c5e';
  fx.fillRect(0, 0, S, S);
  grain(fx, S, 5200, '#a39d8a', '#5d594e');
  blotches(fx, S, 26, '#4c4636', 0.16, 20, 80);
  blotches(fx, S, 40, '#d9c9a3', 0.1, 6, 34);
  fx.strokeStyle = 'rgba(40,38,30,0.5)';
  fx.lineWidth = 1;
  for (let i = 0; i < 9; i += 1) {
    fx.beginPath();
    let x = Math.random() * S;
    let y = Math.random() * S;
    fx.moveTo(x, y);
    for (let j = 0; j < 4; j += 1) { x += (Math.random() - 0.5) * 130; y += (Math.random() - 0.5) * 130; fx.lineTo(x, y); }
    fx.stroke();
  }
  // Expansion-joint grid every 128 px: reads as poured slabs.
  fx.strokeStyle = 'rgba(30,28,22,0.22)';
  fx.lineWidth = 2;
  for (let i = 0; i <= S; i += 128) {
    fx.beginPath(); fx.moveTo(i, 0); fx.lineTo(i, S); fx.stroke();
    fx.beginPath(); fx.moveTo(0, i); fx.lineTo(S, i); fx.stroke();
  }

  // Brick wall: courses of varied brick with dark mortar and soot at the top.
  const [bc, bx] = canvas(S);
  bx.fillStyle = '#5d4034';
  bx.fillRect(0, 0, S, S);
  const bh = 32;
  const bw = 84;
  for (let row = 0; row < S / bh; row += 1) {
    const off = (row % 2) * bw * 0.5;
    for (let col = -1; col < S / bw + 1; col += 1) {
      const v = Math.random();
      bx.fillStyle = v > 0.66 ? PALETTE.brick : v > 0.33 ? '#7d5240' : PALETTE.brickDark;
      bx.fillRect(col * bw + off + 2, row * bh + 2, bw - 4, bh - 4);
      bx.fillStyle = 'rgba(255,255,255,0.06)';
      bx.fillRect(col * bw + off + 2, row * bh + 2, bw - 4, 5);
      bx.fillStyle = 'rgba(0,0,0,0.18)';
      bx.fillRect(col * bw + off + 2, row * bh + bh - 6, bw - 4, 4);
    }
  }
  grain(bx, S, 2600, '#a06a50', '#3a2a22');
  const grad = bx.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, 'rgba(20,18,14,0.4)');
  grad.addColorStop(0.35, 'rgba(20,18,14,0)');
  bx.fillStyle = grad;
  bx.fillRect(0, 0, S, S);

  // Timber planks: horizontal boards with grain lines and knots.
  const [tc, tx] = canvas(S);
  tx.fillStyle = PALETTE.timberDark;
  tx.fillRect(0, 0, S, S);
  const ph = 64;
  for (let row = 0; row < S / ph; row += 1) {
    tx.fillStyle = row % 2 ? PALETTE.timber : '#86643f';
    tx.fillRect(0, row * ph + 2, S, ph - 4);
    tx.strokeStyle = 'rgba(30,20,10,0.55)';
    tx.lineWidth = 1;
    for (let g = 0; g < 9; g += 1) {
      tx.beginPath();
      const y = row * ph + 8 + Math.random() * (ph - 16);
      tx.moveTo(0, y);
      tx.bezierCurveTo(S * 0.3, y + (Math.random() - 0.5) * 10, S * 0.7, y + (Math.random() - 0.5) * 10, S, y);
      tx.stroke();
    }
    tx.fillStyle = 'rgba(40,26,12,0.6)';
    tx.beginPath();
    tx.ellipse(Math.random() * S, row * ph + ph / 2, 7, 4, 0, 0, Math.PI * 2);
    tx.fill();
  }
  grain(tx, S, 1800, '#a37c4e', '#3a2a16');

  // Paper roll end: concentric off-white rings with a dark core.
  const [pc, px] = canvas(S);
  px.fillStyle = '#d5c6a4';
  px.fillRect(0, 0, S, S);
  px.strokeStyle = 'rgba(120,100,70,0.35)';
  for (let r = 24; r < 360; r += 9 + Math.random() * 8) {
    px.beginPath();
    px.arc(S / 2, S / 2, r, 0, Math.PI * 2);
    px.lineWidth = 1 + Math.random() * 2;
    px.stroke();
  }
  px.fillStyle = '#4a3a26';
  px.beginPath();
  px.arc(S / 2, S / 2, 24, 0, Math.PI * 2);
  px.fill();
  grain(px, S, 1400, '#ffffff', '#8a7a5c');

  // Corrugated teal metal: vertical ribs with rust streaks.
  const [mc, mx] = canvas(S);
  mx.fillStyle = PALETTE.tealDark;
  mx.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 32) {
    const g = mx.createLinearGradient(x, 0, x + 32, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.35)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    mx.fillStyle = g;
    mx.fillRect(x, 0, 32, S);
  }
  for (let i = 0; i < 18; i += 1) {
    mx.fillStyle = 'rgba(160,70,30,0.28)';
    const x = Math.random() * S;
    mx.fillRect(x, Math.random() * S * 0.4, 3 + Math.random() * 5, S);
  }
  grain(mx, S, 2200, '#7fb0a4', '#12281f');

  // Hazard stripes: diagonal rust/paper chevrons for site markers.
  const [hc, hx] = canvas(256);
  hx.fillStyle = PALETTE.paper;
  hx.fillRect(0, 0, 256, 256);
  hx.fillStyle = PALETTE.accent;
  for (let i = -256; i < 512; i += 64) {
    hx.beginPath();
    hx.moveTo(i, 256);
    hx.lineTo(i + 32, 256);
    hx.lineTo(i + 32 + 256, 0);
    hx.lineTo(i + 256, 0);
    hx.closePath();
    hx.fill();
  }
  grain(hx, 256, 800, '#ffffff', '#7a4a28');

  // Pulp vat water: murky green-grey with slow swirls.
  const [wc, wx] = canvas(256);
  wx.fillStyle = '#5d6b52';
  wx.fillRect(0, 0, 256, 256);
  wx.strokeStyle = 'rgba(220,225,200,0.16)';
  wx.lineWidth = 3;
  for (let i = 0; i < 8; i += 1) {
    wx.beginPath();
    wx.arc(Math.random() * 256, Math.random() * 256, 14 + Math.random() * 40, 0, Math.PI * 2);
    wx.stroke();
  }
  blotches(wx, 256, 16, '#3d4a38', 0.25, 8, 30);
  grain(wx, 256, 900, '#a8b89a', '#2c3628');

  // Blob shadow: radial black falloff, stamped under props for contact grounding.
  const [sc, sx] = canvas(128);
  const sg = sx.createRadialGradient(64, 64, 4, 64, 64, 62);
  sg.addColorStop(0, 'rgba(0,0,0,0.5)');
  sg.addColorStop(0.7, 'rgba(0,0,0,0.22)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  sx.fillStyle = sg;
  sx.fillRect(0, 0, 128, 128);

  // AO strip: dark gradient for wall-floor junctions, laid as thin planes.
  const [ac, ax] = canvas(64);
  const ag = ax.createLinearGradient(0, 0, 64, 0);
  ag.addColorStop(0, 'rgba(0,0,0,0.55)');
  ag.addColorStop(1, 'rgba(0,0,0,0)');
  ax.fillStyle = ag;
  ax.fillRect(0, 0, 64, 64);

  return {
    floor: pbr(fc, 8, 8, 235, 220),
    brick: pbr(bc, 3, 2, 240),
    timber: pbr(tc, 2, 2, 210),
    paper: pbr(pc, 1, 1, 240),
    metal: pbr(mc, 2, 1, 150),
    hazard: { map: tex(hc, 1, 1, true), roughnessMap: tex(roughCanvas(256, 220, 10, 200), 1, 1, false), bumpMap: null },
    water: { map: tex(wc, 1, 1, true), roughnessMap: tex(roughCanvas(256, 60), 1, 1, false), bumpMap: null },
    blob: tex(sc, 1, 1, false),
    aoStrip: tex(ac, 1, 1, false),
  };
}
