// Shared procedural-geometry helpers: merge indexed primitive parts into
// one draw mesh, with an optional per-part vertex colour. All three.js
// primitives carry position/normal/uv, so a merge is a plain attribute
// concat with re-based indices. Used by bots.js (characters) and world.js
// (merged dressing), so the helper lives here instead of twice.
import * as THREE from 'three';

export function mergeParts(parts) {
  const colored = parts.some((p) => p.color !== undefined);
  let vCount = 0;
  let iCount = 0;
  const geos = parts.map(({ geo, matrix }) => {
    const g = geo.clone().applyMatrix4(matrix);
    vCount += g.attributes.position.count;
    iCount += g.index.count;
    return g;
  });
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const col = colored ? new Float32Array(vCount * 3) : null;
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (let i = 0; i < geos.length; i += 1) {
    const g = geos[i];
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    if (col) {
      const c = new THREE.Color(parts[i].color ?? 0xffffff);
      for (let v = 0; v < n; v += 1) {
        col[(vo + v) * 3] = c.r;
        col[(vo + v) * 3 + 1] = c.g;
        col[(vo + v) * 3 + 2] = c.b;
      }
    }
    const gi = g.index.array;
    for (let j = 0; j < gi.length; j += 1) idx[io + j] = gi[j] + vo;
    vo += n;
    io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// A part placed by position / rotation / scale, with an optional colour.
export function part(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, color = undefined) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return { geo, matrix: new THREE.Matrix4().compose(_p, _q, _s), color };
}

// A cylinder stretched between two points (an arm segment, a barrel, a pipe).
export function limb(from, to, rTop, rBottom, seg = 10, color = undefined) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(rTop, rBottom, len, seg);
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return { geo, matrix: new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)), color };
}
