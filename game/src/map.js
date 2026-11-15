// Pulp Mill level data: one flat gameplay plane, 44 x 36 m.
// x runs west(-) to east(+), z runs north(-, T spawn) to south(+, CT spawn).
// A site = Pulp Hall (west), B site = Drying Yard (east), Mid = the mill hall.
// Walls, props, sites, spawns and the bot waypoint graph are all authored here;
// world.js turns them into meshes, player.js/bots.js turn them into colliders/nav.
// Nothing here moves: the map is data, not behaviour.

export const MAP = {
  bounds: { minX: -22, maxX: 22, minZ: -18, maxZ: 18 },
  // Walls: centre x,z, width (x), depth (z), height, material key.
  walls: [
    // Outer shell, 4.2 m brick.
    { x: 0, z: -18, w: 44.8, d: 0.8, h: 4.2, mat: 'brick' },
    { x: 0, z: 18, w: 44.8, d: 0.8, h: 4.2, mat: 'brick' },
    { x: -22, z: 0, w: 0.8, d: 36.8, h: 4.2, mat: 'brick' },
    { x: 22, z: 0, w: 0.8, d: 36.8, h: 4.2, mat: 'brick' },
    // Mill hall north wall (z=-5), door gap x -2..2.
    { x: -5.5, z: -5, w: 7, d: 0.6, h: 3.4, mat: 'brick' },
    { x: 5.5, z: -5, w: 7, d: 0.6, h: 3.4, mat: 'brick' },
    // Mill hall south wall (z=5), door gap x -3..3.
    { x: -6, z: 5, w: 6, d: 0.6, h: 3.4, mat: 'brick' },
    { x: 6, z: 5, w: 6, d: 0.6, h: 3.4, mat: 'brick' },
    // Mill hall west wall (x=-9), door gap z -1..1.
    { x: -9, z: -3, w: 0.6, d: 4, h: 3.4, mat: 'brick' },
    { x: -9, z: 3, w: 0.6, d: 4, h: 3.4, mat: 'brick' },
    // Mill hall east wall (x=9), door gap z -1..1.
    { x: 9, z: -3, w: 0.6, d: 4, h: 3.4, mat: 'brick' },
    { x: 9, z: 3, w: 0.6, d: 4, h: 3.4, mat: 'brick' },
    // A Long divider: forces the west lane past the pulp tanks.
    { x: -13, z: -13.5, w: 6, d: 0.6, h: 2.6, mat: 'timber' },
    // B Long divider, mirrored.
    { x: 13, z: -13.5, w: 6, d: 0.6, h: 2.6, mat: 'timber' },
    // CT-side lane walls: A connector and B connector each get one corner wall.
    { x: -13, z: 8, w: 0.6, d: 8, h: 2.6, mat: 'timber' },
    { x: 13, z: 8, w: 0.6, d: 8, h: 2.6, mat: 'timber' },
    // (No low yard walls in the north yard: the waypoint graph's cross-yard
    // edges run straight through where they would stand, and bots have no
    // wall-following — they would press against them forever.)
  ],
  // Props: kind, centre, size/rotation. Each gets a box collider (vats use a square one).
  props: [
    // A site: two pulp vats, roll stacks, crates.
    { kind: 'vat', x: -17.5, z: -11, r: 2.1 },
    // (Second vat sits at (-11.5,-6.5), east of the site: (-13.5,-6.5) stood
    // directly on the site -> south-exit edge and blocked it.)
    { kind: 'vat', x: -11.5, z: -6.5, r: 1.8 },
    { kind: 'roll', x: -19.5, z: -6, r: 0.8 },
    { kind: 'roll', x: -19.5, z: -6, r: 0.8, y: 1.15, stack: true },
    // (Roll that stood at (-12.5,-11.5) removed: its box sat on the lane-mouth
    // waypoint and on the 3->6 edge.)
    { kind: 'crate', x: -18.5, z: -9.5, s: 1.2 },
    { kind: 'crate', x: -18.5, z: -9.5, s: 1.2, y: 1.2, stack: true },
    { kind: 'crate', x: -17, z: -4.5, s: 1.2 },
    // B site: drying racks, roll stacks, crates.
    { kind: 'rack', x: 17.5, z: -11, rot: 0 },
    { kind: 'rack', x: 13.5, z: -6.5, rot: Math.PI / 2 },
    { kind: 'roll', x: 19.5, z: -6, r: 0.8 },
    { kind: 'roll', x: 11, z: -14.5, r: 0.8 },
    { kind: 'crate', x: 18.5, z: -9.5, s: 1.2 },
    { kind: 'crate', x: 14.5, z: -4.5, s: 1.2 },
    // Mid hall: the press machine splits the hall into two paths.
    { kind: 'machine', x: 0, z: 0 },
    { kind: 'crate', x: -6.5, z: -2.5, s: 1.2 },
    { kind: 'crate', x: 6.5, z: 2.5, s: 1.2 },
    // North yard cover on the lanes.
    { kind: 'roll', x: -16, z: -13.5, r: 0.8 },
    { kind: 'roll', x: 16, z: -13.5, r: 0.8 },
    { kind: 'crate', x: -3.5, z: -9, s: 1.2 },
    { kind: 'crate', x: 3.5, z: -9, s: 1.2 },
    { kind: 'beam', x: -11, z: -2, rot: 0 },
    { kind: 'beam', x: 11, z: -2, rot: 0 },
    // South yard cover in front of CT spawn.
    { kind: 'crate', x: -5, z: 11, s: 1.2 },
    { kind: 'crate', x: 5, z: 11, s: 1.2 },
    { kind: 'roll', x: -9, z: 13, r: 0.8 },
    { kind: 'roll', x: 9, z: 13, r: 0.8 },
    { kind: 'barrel', x: -11.5, z: 7.5, r: 0.45 },
    { kind: 'barrel', x: 11.5, z: 7.5, r: 0.45 },
    { kind: 'barrel', x: -8, z: 14.5, r: 0.45 },
    { kind: 'barrel', x: 8, z: 14.5, r: 0.45 },
  ],
  sites: {
    // A sits between the two vats, in the open — (-16,-9) was inside vat 1's box.
    A: { name: 'Pulp Hall', x: -14, z: -9, r: 4.6 },
    B: { name: 'Drying Yard', x: 16, z: -9, r: 4.6 },
  },
  spawns: {
    ct: [[-5, 15.5], [-2, 16], [0, 15.5], [2, 16], [5, 15.5]],
    t: [[-5, -15.5], [-2, -16], [0, -15.5], [2, -16], [5, -15.5]],
  },
  // CT hold positions: [x, z, faceYaw] — two on the sites, one mid, two connectors.
  // The site holds sit south of the vats/racks, in the open — (-15,-6.5) was
  // inside vat 2's box and (15,-6.5) inside rack 2's.
  holds: [
    [-17.5, -2, 0.3], [16.5, -4, -0.3], [0, 3.5, 0], [-12.5, 1.5, 0.53], [12.5, 1.5, -0.53],
  ],
  // Waypoint graph for bots. Nodes are [x, z]; edges are index pairs.
  waypoints: [
    [-5, -15.5], [0, -15.5], [5, -15.5], // 0-2 T spawn
    [-8, -12], [0, -11.5], [8, -12], // 3-5 north yard
    [-13, -12], [14, -12], // 6-7 lane mouths (clear of the vats/racks)
    [-14, -9], [16, -9], // 8-9 sites
    [0, -5], // 10 mid door north
    [-4.5, 0], [4.5, 0], // 11-12 hall sides
    [0, 7], // 13 mid door south (clear of the machine's belt)
    [0, 10], // 14 CT mid
    [-5, 15.5], [0, 15.5], [5, 15.5], // 15-17 CT spawn
    [-13, 1], [13, 1], // 18-19 connectors
    [-16, -2], [16, -2], // 20-21 site south exits
    [-12, -9.5], [12, -9.5], // 22-23 hall side doors (west/east)
    [-12, 3], [12, 3], // 24-25 south of hall doors
  ],
  // Edges are straight lines a bot walks: none may cross a wall or a prop
  // box (bots have no wall-following, so a crossed edge strands them).
  // Removed: the hall-side diagonals (11-23, 12-22 and their mirrors) and the
  // cross-hall diagonals (22-25, 23-24) cut through the hall's north wall;
  // the connector-to-mid edges (24-14, 25-14) cut through the south wall.
  edges: [
    [0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 6], [5, 7], [3, 4], [4, 5],
    [6, 8], [7, 9], [4, 10], [10, 11], [10, 12], [11, 13], [12, 13],
    [13, 14], [14, 15], [14, 16], [14, 17],
    [8, 20], [9, 21], [20, 18], [21, 19], [18, 24], [19, 25],
    [6, 22], [7, 23], [18, 15], [19, 17], [20, 24], [21, 25],
    [3, 22], [5, 23],
  ],
};

// Nearest waypoint index to a point (squared distance, no allocation in the loop
// beyond the caller's scratch — callers pass a preallocated result object).
export function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  const wps = MAP.waypoints;
  for (let i = 0; i < wps.length; i += 1) {
    const dx = wps[i][0] - x;
    const dz = wps[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Breadth-first shortest path over the waypoint graph; returns an array of
// waypoint indices from `from` to `to` (reused scratch array, cleared by caller).
const _prev = new Int16Array(64);
const _queue = new Int16Array(64);
export function findPath(from, to, out) {
  out.length = 0;
  if (from === to) { out.push(to); return out; }
  _prev.fill(-1);
  let qh = 0;
  let qt = 0;
  _queue[qt++] = from;
  _prev[from] = from;
  while (qh < qt) {
    const cur = _queue[qh++];
    if (cur === to) break;
    for (const [a, b] of MAP.edges) {
      let nxt = -1;
      if (a === cur) nxt = b;
      else if (b === cur) nxt = a;
      if (nxt >= 0 && _prev[nxt] === -1) { _prev[nxt] = cur; _queue[qt++] = nxt; }
    }
  }
  if (_prev[to] === -1) { out.push(to); return out; }
  let node = to;
  const rev = [];
  while (node !== from) { rev.push(node); node = _prev[node]; }
  rev.push(from);
  for (let i = rev.length - 1; i >= 0; i -= 1) out.push(rev[i]);
  return out;
}
