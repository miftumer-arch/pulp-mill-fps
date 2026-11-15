// The one state store: match, round, bomb, agents, noise and feed.
// Simulation modules read and write it; rendering and HUD only read it.
export const PHASE = {
  MENU: 'menu',
  BUY: 'buy',
  LIVE: 'live',
  ROUND_END: 'roundEnd',
  MATCH_END: 'matchEnd',
};

export const ROUND_TIME = 100;
export const BOMB_TIME = 40;
export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export function createState() {
  return {
    time: 0,
    round: 1,
    ctScore: 0,
    tScore: 0,
    phase: PHASE.MENU,
    phaseT: 0,
    roundTime: ROUND_TIME,
    money: 1600,
    kills: 0,
    deaths: 0,
    lossStreak: 0,
    // Bomb: state idle | carried | planting | planted | defusing | exploded | defused
    bomb: { state: 'idle', site: null, x: 0, z: 0, timer: 0, progress: 0, carrier: null, defuser: null },
    agents: [],
    noise: [],
    feed: [],
    events: [],
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    buyOpen: false,
  };
}

export function pushFeed(state, text) {
  state.feed.push({ text, t: state.time });
  if (state.feed.length > 5) state.feed.shift();
}

export function pushEvent(state, event) {
  state.events.push(event);
}

export function aliveCount(state, team) {
  let n = 0;
  for (const a of state.agents) if (a.team === team && a.alive) n += 1;
  return n;
}

export function teamOf(agent) {
  return agent.team;
}
