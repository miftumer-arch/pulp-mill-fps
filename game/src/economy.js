// Money: earned per round and per kill, spent in the buy menu between rounds.
// Win $3000, loss $1900 (+$500 for a second straight loss, +$1000 after that,
// capped at $3400). A kill pays $300. The player starts round 1 with $1600:
// enough for an SMG or a shotgun, not yet a rifle.
import { WEAPONS, SMOKE } from './weapons.js';

export const START_MONEY = 1600;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3000;
export const LOSS_REWARD = 1900;

export const BUY_CATALOG = [
  { id: 'rifle', name: WEAPONS.rifle.name, price: WEAPONS.rifle.price, desc: 'Auto rifle · 30 rounds · accurate' },
  { id: 'smg', name: WEAPONS.smg.name, price: WEAPONS.smg.price, desc: 'Fast SMG · 32 rounds · close range' },
  { id: 'shotgun', name: WEAPONS.shotgun.name, price: WEAPONS.shotgun.price, desc: '8-pellet spread · devastating up close' },
  { id: 'smoke', name: SMOKE.name, price: SMOKE.price, desc: 'Blocks sight for 12 s · throw with G' },
  { id: 'ammo', name: 'Ammo refill', price: 200, desc: 'Top up every magazine you own' },
];

export function lossReward(lossStreak) {
  if (lossStreak <= 1) return LOSS_REWARD;
  if (lossStreak === 2) return 2400;
  return 2900;
}

// Apply a round's rewards to the player's money. Returns the amounts for the HUD.
export function applyRoundRewards(state, winnerTeam, playerTeam) {
  const won = winnerTeam === playerTeam;
  const streak = won ? 0 : state.lossStreak + 1;
  state.lossStreak = won ? 0 : streak;
  const roundPay = won ? WIN_REWARD : lossReward(streak);
  state.money += roundPay;
  return { won, roundPay };
}
