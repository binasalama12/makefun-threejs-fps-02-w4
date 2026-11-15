// hud.js — all of the DOM overlay work: health, armour of information a
// player needs mid-round (money, round, timer, ammunition, team score),
// the kill feed, the buy panel, and the big centre announcements.
// The 3D world never touches the DOM; main.js hands this class a plain
// state object once per frame and it writes only what changed.

export class Hud {
  constructor(doc) {
    this.el = {};
    const ids = [
      'hp', 'hpbar', 'money', 'round', 'timer', 'ammo-mag', 'ammo-reserve',
      'score-w', 'score-r', 'weapon-name', 'feed', 'banner', 'banner-sub',
      'objective', 'crosshair', 'hitmarker', 'buy', 'buy-money', 'buy-list',
      'overlay', 'overlay-title', 'overlay-copy', 'play', 'scoreboard',
      'sb-rows', 'vignette', 'plantbar', 'grenades',
    ];
    for (const id of ids) this.el[id] = doc.getElementById(id);
    this.last = {};
  }

  set(key, id, value) {
    if (this.last[key] !== value) {
      this.last[key] = value;
      this.el[id].textContent = value;
    }
  }

  update(s) {
    this.set('hp', 'hp', String(Math.max(0, Math.ceil(s.hp))));
    this.el.hpbar.style.width = `${Math.max(0, s.hp)}%`;
    this.el.hpbar.style.background = s.hp > 30 ? 'var(--ember)' : '#e2483a';
    this.set('money', 'money', `$${s.money}`);
    this.set('round', 'round', `ROUND ${s.round} / ${s.roundsTotal}`);
    const t = Math.max(0, Math.ceil(s.timeLeft));
    this.set('timer', 'timer', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    this.el.timer.style.color = s.planted ? '#e2483a' : '';
    this.set('ammo', 'ammo-mag', s.reloading ? '--' : String(s.mag));
    this.set('reserve', 'ammo-reserve', `/ ${s.reserve}`);
    this.set('sw', 'score-w', String(s.scoreW));
    this.set('sr', 'score-r', String(s.scoreR));
    this.set('wname', 'weapon-name', s.weaponName);
    this.set('gren', 'grenades', `CINDER GRENADE × ${s.grenades}  [G]`);
    this.set('obj', 'objective', s.objective);
    const spreadPx = 6 + s.spread * 620;
    this.el.crosshair.style.setProperty('--gap', `${spreadPx.toFixed(1)}px`);
    if (s.plantProgress > 0 && s.plantProgress < 1) {
      this.el.plantbar.style.display = 'block';
      this.el.plantbar.firstElementChild.style.width = `${s.plantProgress * 100}%`;
    } else {
      this.el.plantbar.style.display = 'none';
    }
  }

  hitmark(head) {
    const h = this.el.hitmarker;
    h.classList.add('on');
    h.style.setProperty('--hm', head ? '#ffd24a' : '#f5efe4');
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => h.classList.remove('on'), 110);
  }

  damageFlash() {
    const v = this.el.vignette;
    v.style.opacity = '1';
    clearTimeout(this._vT);
    this._vT = setTimeout(() => { v.style.opacity = '0'; }, 130);
  }

  feedLine(text, cls) {
    const div = document.createElement('div');
    div.className = `feed-line ${cls || ''}`;
    div.textContent = text;
    this.el.feed.prepend(div);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
    setTimeout(() => { div.style.opacity = '0'; }, 4200);
    setTimeout(() => { div.remove(); }, 4900);
  }

  banner(title, sub) {
    this.el.banner.textContent = title;
    this.el['banner-sub'].textContent = sub || '';
    this.el.banner.parentElement.classList.add('show');
    clearTimeout(this._bT);
    this._bT = setTimeout(() => this.el.banner.parentElement.classList.remove('show'), 2400);
  }

  showOverlay(title, copy, button) {
    this.el['overlay-title'].textContent = title;
    this.el['overlay-copy'].textContent = copy;
    this.el.play.textContent = button;
    this.el.overlay.hidden = false;
  }

  hideOverlay() {
    this.el.overlay.hidden = true;
  }

  showBuy(money, weapons, owned, grenadePrice, grenades) {
    this.el.buy.hidden = false;
    this.el['buy-money'].textContent = `FUNDS $${money}`;
    const list = this.el['buy-list'];
    list.innerHTML = '';
    weapons.forEach((w, i) => {
      const row = document.createElement('div');
      row.className = 'buy-row' + (owned === w.id ? ' owned' : money < w.price ? ' poor' : '');
      row.innerHTML = `<span class="buy-key">${i + 1}</span><span class="buy-name">${w.name}</span>` +
        `<span class="buy-stat">DMG ${w.damage} · MAG ${w.mag}</span>` +
        `<span class="buy-price">${owned === w.id ? 'IN HAND' : '$' + w.price}</span>`;
      list.appendChild(row);
    });
    const g = document.createElement('div');
    g.className = 'buy-row' + (money < grenadePrice ? ' poor' : '');
    g.innerHTML = `<span class="buy-key">6</span><span class="buy-name">Cinder Grenade</span>` +
      `<span class="buy-stat">BLAST ${85} · HELD ${grenades}</span><span class="buy-price">$${grenadePrice}</span>`;
    list.appendChild(g);
  }

  hideBuy() {
    this.el.buy.hidden = true;
  }

  showScoreboard(rows, title) {
    this.el.scoreboard.hidden = false;
    this.el.scoreboard.querySelector('h2').textContent = title;
    const body = this.el['sb-rows'];
    body.innerHTML = '';
    for (const r of rows) {
      const div = document.createElement('div');
      div.className = 'sb-row' + (r.me ? ' me' : '');
      div.innerHTML = `<span>${r.name}</span><span>${r.team}</span><span>${r.kills} K</span><span>${r.deaths} D</span><span>${r.alive ? 'STANDING' : 'DOWN'}</span>`;
      body.appendChild(div);
    }
  }

  hideScoreboard() {
    this.el.scoreboard.hidden = true;
  }
}
