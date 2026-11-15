// The DOM HUD: crosshair, health, ammo, money, timer, score, feed, banners,
// buy menu and overlays. It never touches the simulation; main.js pushes
// numbers in and reads callbacks out. All text updates are cached so the DOM
// is only touched when a value actually changes.
import { BUY_CATALOG } from './economy.js';

const COPY = {
  start: {
    title: 'Pulp Mill',
    copy: 'An old paper mill, two crews, one bomb. Hold the sites, defuse the device, win five rounds.',
    action: 'Click to play',
  },
  paused: {
    title: 'Pulp Mill',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  dead: {
    title: 'You are down',
    copy: 'Your crew fights on. Next round you are back in.',
    action: 'Keep watching',
  },
  matchWin: {
    title: 'Mill held',
    copy: 'Five rounds to the Wardens. The mill keeps running.',
    action: 'Play again',
  },
  matchLose: {
    title: 'Mill lost',
    copy: 'The Raiders took five rounds. The mill is theirs — for now.',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const damage = $('damage');
  const healthBar = $('health-bar');
  const healthNum = $('health-num');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const smokeCount = $('smoke-count');
  const moneyEl = $('money');
  const timerEl = $('timer');
  const scoreCt = $('score-ct');
  const scoreT = $('score-t');
  const roundLabel = $('round-label');
  const feedEl = $('feed');
  const teamCt = $('team-ct');
  const teamT = $('team-t');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const bombStatus = $('bomb-status');
  const bombTimer = $('bomb-timer');
  const channel = $('channel');
  const channelFill = $('channel-fill');
  const channelLabel = $('channel-label');
  const buyMenu = $('buy');
  const buyMoney = $('buy-money');
  const buyItems = $('buy-items');
  const hint = $('hint');

  let lastHealth = -1;
  let lastMag = -1;
  let lastReserve = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastWeapon = '';
  let lastSmoke = -1;
  let hitTimer = 0;
  let bannerTimer = 0;
  let feedCount = 0;

  // Buy menu rows, built once from the catalog.
  let buyHandler = null;
  for (const item of BUY_CATALOG) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'buy-item';
    row.dataset.id = item.id;
    row.innerHTML = `<span class="buy-name"></span><span class="buy-desc"></span><span class="buy-price"></span>`;
    row.querySelector('.buy-name').textContent = item.name;
    row.querySelector('.buy-desc').textContent = item.desc;
    row.querySelector('.buy-price').textContent = `$${item.price}`;
    row.addEventListener('click', () => buyHandler && buyHandler(item.id));
    buyItems.appendChild(row);
  }

  return {
    setHealth(hp) {
      if (hp === lastHealth) return;
      lastHealth = hp;
      healthNum.textContent = String(Math.max(0, Math.ceil(hp)));
      healthBar.style.width = `${Math.max(0, hp)}%`;
      healthBar.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve) {
      if (mag === lastMag && reserve === lastReserve) return;
      lastMag = mag;
      lastReserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setWeapon(name, smokes) {
      if (name === lastWeapon && smokes === lastSmoke) return;
      lastWeapon = name;
      lastSmoke = smokes;
      weaponName.textContent = name;
      smokeCount.textContent = smokes > 0 ? `Smoke ×${smokes}` : '';
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyEl.textContent = `$${value}`;
      buyMoney.textContent = `$${value}`;
      for (const row of buyItems.children) {
        const item = BUY_CATALOG.find((c) => c.id === row.dataset.id);
        row.classList.toggle('cant', value < item.price);
      }
    },
    setTimer(seconds, planted) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (text === lastTimer) return;
      lastTimer = text;
      timerEl.textContent = text;
      timerEl.classList.toggle('danger', planted || seconds <= 10);
    },
    setScore(ct, t, round) {
      const text = `${ct}-${t}`;
      if (text === lastScore) return;
      lastScore = text;
      scoreCt.textContent = String(ct);
      scoreT.textContent = String(t);
      roundLabel.textContent = `ROUND ${round}`;
    },
    setTeams(ctNames, tNames) {
      teamCt.textContent = `Wardens ${ctNames}`;
      teamT.textContent = `Raiders ${tNames}`;
    },
    setSpread(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damage.classList.add('on');
      setTimeout(() => damage.classList.remove('on'), 180);
    },
    feed(text) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = text;
      feedEl.prepend(line);
      feedCount += 1;
      while (feedEl.children.length > 5) feedEl.lastChild.remove();
      setTimeout(() => line.remove(), 6000);
    },
    banner(titleText, subText, ms = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, ms);
    },
    hideBanner() { banner.hidden = true; },
    setBomb(text) {
      if (!text) { bombStatus.hidden = true; return; }
      bombStatus.hidden = false;
      bombTimer.textContent = text;
    },
    setChannel(label, progress) {
      if (!label) { channel.hidden = true; return; }
      channel.hidden = false;
      channelLabel.textContent = label;
      channelFill.style.width = `${Math.round(progress * 100)}%`;
    },
    setHint(text) {
      hint.textContent = text || '';
      hint.hidden = !text;
    },
    showBuy(open) {
      buyMenu.hidden = !open;
    },
    onBuy(handler) { buyHandler = handler; },
    showOverlay(mode, score) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
  };
}
