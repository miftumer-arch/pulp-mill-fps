# Pulp Mill — three.js tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/miftumer-arch/pulp-mill-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/miftumer-arch/pulp-mill-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A 5v5 round-based tactical FPS in a single static page: plant/defuse, buy
economy, team bots, and one original map — an old paper mill ("Pulp Mill")
with a pulp hall, a drying yard, and a press machine splitting Mid. Built
with three.js 0.187.0 (vendored, no build step, no network requests, all art
procedural).

## Play it

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

Open the page, click **Play**, buy your gear, then **Lock in — start round**.
Pointer lock gives you mouse look.

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (pointer lock) |
| Click | Fire |
| R | Reload |
| Shift | Walk (accurate) · Ctrl | Crouch |
| Space | Jump |
| 1–4 | Pistol / SMG / Rifle / Shotgun |
| G | Throw smoke (if bought) |
| E | Plant / defuse (hold, near the device) |
| B | Buy menu (buy phase) |

**Rules:** first to 5 round wins takes the match (max 9 rounds, then sudden
death). Round time 100 s; bomb timer 40 s; plant takes 3 s, defuse 5 s. You
play CT ("Mill Wardens", defenders) with 4 bot teammates against 5 T bots
("Pulp Raiders"). Kill +$300, round win +$3000, loss +$1900 (streak bonus up
to $3400). Weapons: Mill Pistol (free), Ledger SMG $1500, Pulp Shotgun
$1200, Ream Rifle $2500, Smoke Canister $300.

## How it is built

- `game/index.html` — page + HUD (health, ammo, timer, score, buy menu).
- `game/src/` — one module per job: `state` (single store), `map` (layout,
  waypoint graph, BFS), `world` (scene, lights, sky, IBL), `textures`
  (procedural PBR canvas textures), `player` (acceleration movement, AABB
  collision), `weapons`, `combat` (hitscan, tracers, smoke), `bots` (route /
  hold / combat / investigate / plant / defuse state machine), `bomb`,
  `economy`, `audio` (procedural WebAudio), `hud`, `main` (fixed 60 Hz sim,
  round machine, deterministic screenshot poses).
- `game/vendor/three/` — three.js 0.187.0, byte-for-byte from the kit.
- `game/vendor/three-addons/` — r187 WebGL addons (EffectComposer,
  RenderPass, UnrealBloomPass, SSAOPass, OutputPass, RoomEnvironment).
- `screenshots/` — 4 real renders of this game's own code (`?shot=` poses).

Visuals: ACES tone mapping, PMREM/RoomEnvironment IBL, procedural PBR
textures (albedo + roughness + bump), warm sun + cool fill, half-res SSAO,
subtle bloom (muzzle flash, lamps, bomb light only), pooled VFX.

## Screenshots

Deterministic poses, same seed every run — open the game with
`?shot=cover|buy|plant|defuse&seed=1` to reproduce each pose exactly.

| File | Pose |
| --- | --- |
| `1-cover.jpg` | Mid-fight up Mid, raiders in the hall |
| `2-buy.jpg` | Buy phase at CT spawn |
| `3-plant.jpg` | Bomb armed at A, smoke over the site |
| `4-defuse.jpg` | Defusing at B, warden covering |
