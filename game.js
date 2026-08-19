'use strict';

/* =========================================================
   קטאן — משחק לוח מקומי (HTML/CSS/JS) בעברית
   ========================================================= */

// ===== קבועים =====
const HEX = 58;
const SQRT3 = Math.sqrt(3);
const SVG_NS = 'http://www.w3.org/2000/svg';

const TERRAIN_POOL = [
  'forest','forest','forest','forest',
  'pasture','pasture','pasture','pasture',
  'field','field','field','field',
  'hill','hill','hill',
  'mountain','mountain','mountain',
  'desert'
];
const NUMBER_POOL = [2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12];

const TERRAINS = {
  forest:   { name: 'יער',   res: 'wood',  color: '#3d7a3c', emoji: '🌲' },
  pasture:  { name: 'אחו',   res: 'sheep', color: '#9ecf5a', emoji: '🐑' },
  field:    { name: 'שדה',   res: 'wheat', color: '#e6c245', emoji: '🌾' },
  hill:     { name: 'גבעות', res: 'brick', color: '#c96a35', emoji: '🧱' },
  mountain: { name: 'הרים',  res: 'ore',   color: '#95a0a8', emoji: '⛰️' },
  desert:   { name: 'מדבר',  res: null,    color: '#dcc98f', emoji: '🌵' }
};

const RES_TYPES = ['wood','brick','sheep','wheat','ore'];
const RES = {
  wood:  { name: 'עץ',    icon: '🌲', color: '#2f5d2e' },
  brick: { name: 'טיט',   icon: '🧱', color: '#b05a2a' },
  sheep: { name: 'כבשה',  icon: '🐑', color: '#7fb04a' },
  wheat: { name: 'חיטה',  icon: '🌾', color: '#c9a227' },
  ore:   { name: 'אבן',   icon: '⛰️', color: '#6e7a83' }
};

const COST = {
  road:       { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wheat: 1, sheep: 1 },
  city:       { wheat: 2, ore: 3 },
  dev:        { sheep: 1, wheat: 1, ore: 1 }
};

const DEV_INFO = {
  knight: { name: 'אביר',          icon: '⚔️', desc: 'הזז את השודד וגנוב קלף' },
  road:   { name: 'בניית דרכים',   icon: '🛤️', desc: 'בנה 2 דרכים בחינם' },
  yop:    { name: 'שנת שפע',       icon: '🎁', desc: 'קח 2 משאבים מהבנק' },
  mono:   { name: 'מונופול',       icon: '💰', desc: 'קח משאב אחד מכל השחקנים' },
  vp:     { name: 'נקודת ניצחון',  icon: '⭐', desc: 'נקודה סמויה' }
};

const PLAYER_COLORS = [
  { id: 'red',    name: 'אדום',  hex: '#c0392b' },
  { id: 'blue',   name: 'כחול',  hex: '#2e6da4' },
  { id: 'orange', name: 'כתום',  hex: '#e67e22' },
  { id: 'white',  name: 'לבן',   hex: '#f0ead6' }
];

const PIP_POS = {
  1: [[50,50]],
  2: [[27,27],[73,73]],
  3: [[27,27],[50,50],[73,73]],
  4: [[27,27],[27,73],[73,27],[73,73]],
  5: [[27,27],[27,73],[50,50],[73,27],[73,73]],
  6: [[27,27],[27,50],[27,73],[73,27],[73,50],[73,73]]
};

// ===== עזרים כלליים =====
const $ = id => document.getElementById(id);
// מסך מגע: מטרות לחיצה גדולות יותר על הלוח
const IS_COARSE = (typeof matchMedia === 'function') && matchMedia('(pointer: coarse)').matches;
const rand = n => Math.floor(Math.random() * n);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function sumVals(obj) { return Object.values(obj).reduce((s, v) => s + v, 0); }
function pipCount(num) { return num ? 6 - Math.abs(num - 7) : 0; }

// ===== מצב גלובלי =====
let board = null;
let state = null;

function cur() { return state.players[state.current]; }
function handSize(p) { return sumVals(p.res); }
function humanCount() { return state.players.filter(p => !p.isAI).length; }

// =========================================================
// בניית הלוח
// =========================================================
function buildBoard() {
  const coords = [];
  for (let q = -2; q <= 2; q++)
    for (let r = -2; r <= 2; r++)
      if (Math.abs(q + r) <= 2) coords.push([q, r]);

  // הגרלת שטחים ומספרים, בלי 6/8 צמודים
  let hexes;
  while (true) {
    const terr = shuffle(TERRAIN_POOL.slice());
    const nums = shuffle(NUMBER_POOL.slice());
    let ni = 0;
    const tmp = coords.map(([q, r], i) => ({
      q, r, terrain: terr[i],
      num: terr[i] === 'desert' ? null : nums[ni++]
    }));
    const map = {};
    tmp.forEach(h => map[h.q + ',' + h.r] = h);
    let ok = true;
    for (const h of tmp) {
      if (h.num !== 6 && h.num !== 8) continue;
      for (const [dq, dr] of [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]) {
        const n = map[(h.q + dq) + ',' + (h.r + dr)];
        if (n && (n.num === 6 || n.num === 8)) ok = false;
      }
    }
    if (ok) { hexes = tmp; break; }
  }

  const vertices = {};
  const edges = {};
  hexes.forEach((h, idx) => {
    h.id = idx;
    h.cx = HEX * SQRT3 * (h.q + h.r / 2);
    h.cy = HEX * 1.5 * h.r;
    h.corners = [];
    h.verts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      const x = h.cx + HEX * Math.cos(a);
      const y = h.cy + HEX * Math.sin(a);
      h.corners.push([x, y]);
      const key = Math.round(x) + ',' + Math.round(y);
      if (!vertices[key]) vertices[key] = { id: key, x, y, hexes: [], adjEdges: [], building: null, port: null };
      vertices[key].hexes.push(idx);
      h.verts.push(key);
    }
    for (let i = 0; i < 6; i++) {
      const pair = [h.verts[i], h.verts[(i + 1) % 6]].sort();
      const key = pair.join('|');
      if (!edges[key]) edges[key] = { id: key, v1: pair[0], v2: pair[1], hexes: [], road: null, port: null };
      edges[key].hexes.push(idx);
    }
  });
  Object.values(edges).forEach(e => {
    vertices[e.v1].adjEdges.push(e.id);
    vertices[e.v2].adjEdges.push(e.id);
  });

  // נמלים: 9 נמלים על קצוות החוף
  const boundary = Object.values(edges).filter(e => e.hexes.length === 1);
  const midOf = e => ({
    x: (vertices[e.v1].x + vertices[e.v2].x) / 2,
    y: (vertices[e.v1].y + vertices[e.v2].y) / 2
  });
  boundary.sort((a, b) => {
    const ma = midOf(a), mb = midOf(b);
    return Math.atan2(ma.y, ma.x) - Math.atan2(mb.y, mb.x);
  });
  const portIdx = [0, 3, 7, 10, 13, 17, 20, 23, 27];
  const portTypes = shuffle(['any','any','any','any','wood','brick','sheep','wheat','ore']);
  portIdx.forEach((bi, i) => {
    const e = boundary[bi];
    if (!e) return;
    e.port = portTypes[i];
    vertices[e.v1].port = portTypes[i];
    vertices[e.v2].port = portTypes[i];
  });

  board = { hexes, vertices, edges };
}

function otherVert(eid, vid) {
  const e = board.edges[eid];
  return e.v1 === vid ? e.v2 : e.v1;
}

// =========================================================
// חוקיות בנייה
// =========================================================
function canPlaceSettlement(pi, vid, needRoad) {
  const v = board.vertices[vid];
  if (v.building) return false;
  for (const eid of v.adjEdges) {
    if (board.vertices[otherVert(eid, vid)].building) return false; // חוק המרחק
  }
  if (needRoad) {
    return v.adjEdges.some(eid => board.edges[eid].road === pi);
  }
  return true;
}

function canPlaceRoad(pi, eid) {
  const e = board.edges[eid];
  if (e.road !== null) return false;
  for (const vid of [e.v1, e.v2]) {
    const v = board.vertices[vid];
    if (v.building && v.building.player === pi) return true;
    if (v.building && v.building.player !== pi) continue; // יישוב יריב חוסם מעבר
    if (v.adjEdges.some(id => id !== eid && board.edges[id].road === pi)) return true;
  }
  return false;
}

function legalSettlementSpots(pi, needRoad) {
  return Object.keys(board.vertices).filter(vid => canPlaceSettlement(pi, vid, needRoad));
}
function legalRoadEdges(pi) {
  return Object.keys(board.edges).filter(eid => canPlaceRoad(pi, eid));
}
function ownSettlements(pi) {
  return Object.keys(board.vertices).filter(vid => {
    const b = board.vertices[vid].building;
    return b && b.player === pi && b.type === 'settlement';
  });
}
function canAfford(p, cost) {
  return Object.keys(cost).every(r => (p.res[r] || 0) >= cost[r]);
}
function payCost(p, cost) {
  let d = 0;
  for (const r in cost) {
    p.res[r] -= cost[r];
    state.bank[r] += cost[r];
    flyRes(r, fromPcard(p.idx), toBank, cost[r], d);
    d += cost[r] * 130;
  }
}
function gainRes(p, r, n) {
  const give = Math.min(n, state.bank[r]);
  p.res[r] += give;
  state.bank[r] -= give;
  return give;
}

// =========================================================
// בנייה בפועל (משותף לאדם ולמחשב)
// =========================================================
function placeRoad(pi, eid, free) { SOUNDS.build();
  const p = state.players[pi];
  if (!free) payCost(p, COST.road);
  board.edges[eid].road = pi;
  state.fx.edges.add(eid);
  p.roadsLeft--;
  log(p.name + ' בנה דרך 🛤️');
  updateAwards();
  checkWin();
}

function placeSettlement(pi, vid, free) { SOUNDS.build();
  const p = state.players[pi];
  if (!free) payCost(p, COST.settlement);
  board.vertices[vid].building = { player: pi, type: 'settlement' };
  state.fx.verts.add(vid);
  p.settlementsLeft--;
  log(p.name + ' בנה יישוב 🏠');
  updateAwards(); // יישוב חדש יכול לשבור דרך של יריב
  checkWin();
}

function placeCity(pi, vid) { SOUNDS.city();
  const p = state.players[pi];
  payCost(p, COST.city);
  board.vertices[vid].building = { player: pi, type: 'city' };
  state.fx.verts.add(vid);
  p.settlementsLeft++;
  p.citiesLeft--;
  log(p.name + ' שדרג יישוב לעיר 🏛️');
  checkWin();
}

function buyDev(pi) { SOUNDS.dev();
  const p = state.players[pi];
  payCost(p, COST.dev);
  const card = state.devDeck.pop();
  p.newDev[card]++; saveGame();
  log(p.name + ' קנה קלף פיתוח 🃏');
  fly('🃏', '#6b4a8a', () => fromBank(), toPcard(pi), 1, 350);
  checkWin(); // ייתכן קלף נקודת ניצחון מנצח
}

// =========================================================
// ניקוד, דרך ארוכה, צבא גדול
// =========================================================
function longestRoadLen(pi) {
  const startVerts = new Set();
  Object.values(board.edges).forEach(e => {
    if (e.road === pi) { startVerts.add(e.v1); startVerts.add(e.v2); }
  });
  const visited = new Set();
  function dfs(vid) {
    let best = 0;
    for (const eid of board.vertices[vid].adjEdges) {
      const e = board.edges[eid];
      if (e.road !== pi || visited.has(eid)) continue;
      visited.add(eid);
      const w = otherVert(eid, vid);
      const wb = board.vertices[w].building;
      const blocked = wb && wb.player !== pi;
      const len = 1 + (blocked ? 0 : dfs(w));
      visited.delete(eid);
      if (len > best) best = len;
    }
    return best;
  }
  let best = 0;
  for (const vid of startVerts) best = Math.max(best, dfs(vid));
  return best;
}

function updateAwards() {
  // הדרך הארוכה ביותר
  const lens = state.players.map((_, i) => longestRoadLen(i));
  state.roadLens = lens;
  let holder = state.longestRoad;
  if (holder !== null && lens[holder] < 5) holder = null;
  const contest = holder === null ? 5 : lens[holder] + 1;
  let bestLen = 0, bestPi = null, tie = false;
  lens.forEach((l, i) => {
    if (l >= contest) {
      if (l > bestLen) { bestLen = l; bestPi = i; tie = false; }
      else if (l === bestLen) tie = true;
    }
  });
  if (bestPi !== null && !tie && bestPi !== holder) {
    holder = bestPi;
    log('🛣️ ' + state.players[bestPi].name + ' לקח את "הדרך הארוכה ביותר" (' + bestLen + ')');
  }
  if (holder !== state.longestRoad) state.longestRoad = holder;

  // הצבא הגדול ביותר
  let army = state.largestArmy;
  const need = army === null ? 3 : state.players[army].knightsPlayed + 1;
  state.players.forEach((p, i) => {
    if (p.knightsPlayed >= need && (army === null || p.knightsPlayed > state.players[army].knightsPlayed)) {
      army = i;
    }
  });
  if (army !== state.largestArmy) {
    state.largestArmy = army;
    log('🛡️ ' + state.players[army].name + ' לקח את "הצבא הגדול ביותר"');
  }
}

function totalVP(pi, includeHidden) {
  let vp = 0;
  Object.values(board.vertices).forEach(v => {
    if (v.building && v.building.player === pi)
      vp += v.building.type === 'city' ? 2 : 1;
  });
  if (state.longestRoad === pi) vp += 2;
  if (state.largestArmy === pi) vp += 2;
  if (includeHidden) vp += state.players[pi].dev.vp + state.players[pi].newDev.vp;
  return vp;
}

function checkWin() {
  if (state.phase !== 'play') return;
  const pi = state.current;
  if (totalVP(pi, true) >= 10) endGame(pi);
}

function endGame(winner) {
  state.phase = 'ended';
  clearSave();
  SOUNDS.win();
  state.mode = null;
  log('🏆 ' + state.players[winner].name + ' ניצח במשחק!');
  renderAll();
  let rows = state.players.map((p, i) => {
    const vp = totalVP(i, true);
    const hidden = p.dev.vp + p.newDev.vp;
    return { name: p.name, hex: p.color.hex, vp, hidden };
  }).sort((a, b) => b.vp - a.vp);
  const m = showModal(`
    <h2>🏆 ניצחון!</h2>
    <p class="m-sub">${esc(state.players[winner].name)} הגיע ל-10 נקודות וניצח במשחק</p>
    <table class="win-table">
      <tr><th>שחקן</th><th>נקודות</th><th>מתוכן קלפים סמויים</th></tr>
      ${rows.map(r => `<tr><td><span style="color:${r.hex}">●</span> ${esc(r.name)}</td><td>${r.vp}</td><td>${r.hidden}</td></tr>`).join('')}
    </table>
    <div class="m-actions"><button class="m-btn" id="m-new">משחק חדש</button></div>
  `);
  m.querySelector('#m-new').onclick = () => location.reload();
}

// =========================================================
// יומן
// =========================================================
function log(msg) {
  state.log.push(msg);
  const el = $('log');
  const d = document.createElement('div');
  d.textContent = msg;
  el.appendChild(d);
  while (el.children.length > 120) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// =========================================================
// חלונות קופצים
// =========================================================
function showModal(html) {
  $('overlay').classList.remove('hidden');
  const m = $('modal');
  m.innerHTML = html;
  return m;
}
function closeModal() {
  $('overlay').classList.add('hidden');
  $('modal').innerHTML = '';
}

function showHandoff(p, cb) {
  if (humanCount() < 2) { cb(); return; }
  const m = showModal(`
    <h2>העברת תור</h2>
    <div class="handoff-big"><span style="color:${p.color.hex}">●</span></div>
    <p class="m-sub">העבירו את המסך אל <b>${esc(p.name)}</b>. שאר השחקנים — לא להציץ בקלפים!</p>
    <div class="m-actions"><button class="m-btn" id="m-ready">אני ${esc(p.name)}, מוכן ✔</button></div>
  `);
  m.querySelector('#m-ready').onclick = () => { closeModal(); cb(); };
}

// =========================================================
// אנימציות — קלפים עפים בין הלוח, הבנק והשחקנים
// =========================================================
function centerOf(el) {
  try {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  } catch (e) { return null; }
}
function hexPoint(hexId) {
  try {
    const svg = $('board');
    const h = board.hexes[hexId];
    const pt = new DOMPoint(h.cx, h.cy).matrixTransform(svg.getScreenCTM());
    return { x: pt.x, y: pt.y };
  } catch (e) { return null; }
}
const fromPcard = pi => () => centerOf($('pcard-' + pi));
const toPcard = pi => () => $('pcard-' + pi);
const fromBank = () => centerOf($('bank-info'));
const toBank = () => $('bank-info');
const fromHex = hid => () => hexPoint(hid);

// icon עף מנקודת מוצא אל אלמנט יעד; count עותקים בהפרשי זמן קטנים
function fly(icon, bg, fromFn, toFn, count = 1, startDelay = 0) {
  const c = Math.min(count, 4);
  for (let i = 0; i < c; i++) {
    setTimeout(() => {
      try {
        const from = fromFn();
        const toEl = toFn();
        if (!from || !toEl) return;
        const to = centerOf(toEl);
        if (!to) return;
        const d = document.createElement('div');
        d.className = 'fly-card';
        d.textContent = icon;
        if (bg) d.style.background = bg;
        d.style.left = (from.x - 17) + 'px';
        d.style.top = (from.y - 22) + 'px';
        document.body.appendChild(d);
        requestAnimationFrame(() => {
          d.style.transform = `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(.45)`;
          d.style.opacity = '0.1';
        });
        setTimeout(() => d.remove(), 1000);
      } catch (e) { /* בסביבה ללא DOM מלא — מדלגים על האנימציה */ }
    }, startDelay + i * 130);
  }
}
function flyRes(r, fromFn, toFn, count, startDelay) {
  fly(RES[r].icon, RES[r].color, fromFn, toFn, count, startDelay || 0);
}

function animateDice(d1, d2, done) {
  const e1 = $('die1'), e2 = $('die2');
  e1.classList.add('rolling'); e2.classList.add('rolling');
  let ticks = 0;
  const spin = () => {
    if (ticks++ < 8) {
      renderDie(e1, 1 + rand(6));
      renderDie(e2, 1 + rand(6));
      setTimeout(spin, 75);
    } else {
      e1.classList.remove('rolling'); e2.classList.remove('rolling');
      renderDie(e1, d1); renderDie(e2, d2);
      e1.classList.add('landed'); e2.classList.add('landed');
      setTimeout(() => {
        e1.classList.remove('landed'); e2.classList.remove('landed');
        done();
      }, 260);
    }
  };
  spin();
}

// =========================================================
// מחולל צעדי משחק — קוביות וייצור
// =========================================================
function renderDie(el, n) {
  el.innerHTML = '';
  if (!n) return;
  for (const [x, y] of PIP_POS[n]) {
    const pip = document.createElement('div');
    pip.className = 'pip';
    pip.style.left = x + '%';
    pip.style.top = y + '%';
    el.appendChild(pip);
  }
}

function rollDice() { SOUNDS.dice();
  if (state.hasRolled || state.phase !== 'play') return;
  const d1 = 1 + rand(6), d2 = 1 + rand(6);
  state.dice = [d1, d2];
  state.hasRolled = true;
  renderTop(); // מסתיר את כפתור ההטלה בזמן האנימציה
  animateDice(d1, d2, () => {
    const sum = d1 + d2;
    log('🎲 ' + cur().name + ' הטיל ' + sum);
    if (sum === 7) {
      startRobberFlow(() => {
        renderAll();
        if (cur().isAI && state.phase === 'play') setTimeout(aiContinue, 700);
      });
    } else {
      produce(sum);
    }
    renderAll();
    if (sum !== 7 && cur().isAI && state.phase === 'play') setTimeout(aiContinue, 700);
  });
}

function produce(roll) { SOUNDS.click();
  const gains = state.players.map(() => ({}));
  const events = []; // מאיזה אריח יצא כל משאב — בשביל האנימציה
  for (const h of board.hexes) {
    if (h.num !== roll || h.id === state.robberHex) continue;
    const res = TERRAINS[h.terrain].res;
    if (!res) continue;
    for (const vid of h.verts) {
      const b = board.vertices[vid].building;
      if (!b) continue;
      const n = b.type === 'city' ? 2 : 1;
      gains[b.player][res] = (gains[b.player][res] || 0) + n;
      events.push({ hexId: h.id, player: b.player, res, n });
    }
  }
  // מגבלת בנק: אם אין מספיק קלפים ויש יותר ממקבל אחד — אף אחד לא מקבל
  for (const r of RES_TYPES) {
    const total = gains.reduce((s, g) => s + (g[r] || 0), 0);
    if (!total) continue;
    if (total > state.bank[r]) {
      const recips = gains.filter(g => g[r]).length;
      if (recips === 1) {
        gains.find(g => g[r])[r] = state.bank[r];
      } else {
        gains.forEach(g => delete g[r]);
        log('הבנק ריק — אין חלוקת ' + RES[r].name);
      }
    }
  }
  gains.forEach((g, i) => {
    const parts = [];
    for (const r in g) {
      if (g[r] > 0) {
        gainRes(state.players[i], r, g[r]);
        parts.push(g[r] + ' ' + RES[r].name);
      }
    }
    if (parts.length) log(state.players[i].name + ' קיבל: ' + parts.join(', '));
  });
  // אנימציה: המשאב עף מהאריח אל כרטיס השחקן
  events
    .filter(e => gains[e.player][e.res] > 0)
    .forEach((e, i) => flyRes(e.res, fromHex(e.hexId), toPcard(e.player), e.n, i * 170));
}

// =========================================================
// השודד
// =========================================================
function startRobberFlow(done) {
  const q = state.players.filter(p => handSize(p) > 7);
  const next = () => {
    const p = q.shift();
    if (!p) { moveRobberPhase(done); return; }
    if (p.isAI) { aiDiscard(p); next(); }
    else showHandoff(p, () => showDiscardModal(p, next));
  };
  next();
}

function moveRobberPhase(done) {
  if (cur().isAI) {
    aiRobber();
    done();
  } else {
    state.mode = 'robber';
    state.robberDone = done;
    renderAll();
  }
}

function humanPlaceRobber(hexId) { SOUNDS.robber();
  state.robberHex = hexId;
  log(cur().name + ' הזיז את השודד 🥷');
  state.mode = null;
  const victims = robberVictims(hexId);
  const finish = () => {
    const d = state.robberDone;
    state.robberDone = null;
    renderAll();
    if (d) d();
  };
  if (victims.length === 0) { finish(); }
  else if (victims.length === 1) { stealFrom(state.current, victims[0]); finish(); }
  else {
    const m = showModal(`
      <h2>גניבת קלף</h2>
      <p class="m-sub">בחר ממי לגנוב קלף אקראי:</p>
      ${victims.map(vi => `
        <button class="victim-btn" data-v="${vi}">
          <span style="color:${state.players[vi].color.hex}">●</span>
          ${esc(state.players[vi].name)} (${handSize(state.players[vi])} קלפים)
        </button>`).join('')}
    `);
    m.querySelectorAll('.victim-btn').forEach(b => {
      b.onclick = () => {
        closeModal();
        stealFrom(state.current, +b.dataset.v);
        finish();
      };
    });
  }
}

function robberVictims(hexId) {
  const set = new Set();
  for (const vid of board.hexes[hexId].verts) {
    const b = board.vertices[vid].building;
    if (b && b.player !== state.current && handSize(state.players[b.player]) > 0)
      set.add(b.player);
  }
  return [...set];
}

function stealFrom(thief, victim) {
  const v = state.players[victim];
  const pool = [];
  for (const r of RES_TYPES) for (let i = 0; i < v.res[r]; i++) pool.push(r);
  if (!pool.length) return;
  const r = pool[rand(pool.length)];
  v.res[r]--;
  state.players[thief].res[r]++;
  log(state.players[thief].name + ' גנב קלף מ' + v.name);
  fly('🂠', '#5a4632', fromPcard(v.idx), toPcard(thief), 1, 0);
}

function showDiscardModal(p, next) {
  const need = Math.floor(handSize(p) / 2);
  const sel = {};
  RES_TYPES.forEach(r => sel[r] = 0);
  const render = () => {
    const chosen = sumVals(sel);
    const m = showModal(`
      <h2>יותר מדי קלפים!</h2>
      <p class="m-sub">${esc(p.name)}: יש לך ${handSize(p)} קלפים. עליך להשליך ${need} (נבחרו ${chosen})</p>
      ${RES_TYPES.filter(r => p.res[r] > 0).map(r => `
        <div class="stepper-row" data-r="${r}">
          <span class="st-name">${RES[r].icon} ${RES[r].name} (יש ${p.res[r]})</span>
          <button class="st-minus">−</button>
          <span class="st-val">${sel[r]}</span>
          <button class="st-plus">+</button>
        </div>`).join('')}
      <div class="m-actions">
        <button class="m-btn" id="m-discard" ${chosen === need ? '' : 'disabled'}>השלך</button>
      </div>
    `);
    m.querySelectorAll('.stepper-row').forEach(row => {
      const r = row.dataset.r;
      row.querySelector('.st-plus').onclick = () => {
        if (sel[r] < p.res[r] && sumVals(sel) < need) { sel[r]++; render(); }
      };
      row.querySelector('.st-minus').onclick = () => {
        if (sel[r] > 0) { sel[r]--; render(); }
      };
    });
    m.querySelector('#m-discard').onclick = () => {
      let d = 0;
      for (const r of RES_TYPES) {
        p.res[r] -= sel[r];
        state.bank[r] += sel[r];
        if (sel[r]) { flyRes(r, fromPcard(p.idx), toBank, sel[r], d); d += sel[r] * 130; }
      }
      log(p.name + ' השליך ' + need + ' קלפים');
      closeModal();
      renderAll();
      next();
    };
  };
  render();
}

// =========================================================
// קלפי פיתוח
// =========================================================
function canPlayDev(p, type) {
  if (state.devPlayed || state.phase !== 'play') return false;
  if (state.mode !== null && !p.isAI) return false; // לא באמצע הצבה או הזזת שודד
  if (type === 'vp') return false;
  if (p.dev[type] <= 0) return false;
  if (type === 'road') return p.roadsLeft > 0 && legalRoadEdges(state.current).length > 0;
  if (type === 'yop') return RES_TYPES.some(r => state.bank[r] > 0);
  return true;
}

function playDev(type) { if (type === 'knight') SOUNDS.knight(); else SOUNDS.dev();
  const p = cur();
  if (!canPlayDev(p, type)) return;
  p.dev[type]--;
  state.devPlayed = true;
  log(p.name + ' הפעיל קלף: ' + DEV_INFO[type].name + ' ' + DEV_INFO[type].icon);

  if (type === 'knight') {
    p.knightsPlayed++;
    updateAwards();
    checkWin();
    if (state.phase !== 'play') return;
    moveRobberPhase(() => renderAll());
  } else if (type === 'road') {
    state.freeRoads = Math.min(2, p.roadsLeft);
    state.mode = 'build-road';
    renderAll();
  } else if (type === 'yop') {
    showYopModal();
  } else if (type === 'mono') {
    showMonoModal();
  }
  saveGame();
  renderAll();
}

function showYopModal() {
  const opts = RES_TYPES.filter(r => state.bank[r] > 0)
    .map(r => `<option value="${r}">${RES[r].icon} ${RES[r].name}</option>`).join('');
  const m = showModal(`
    <h2>🎁 שנת שפע</h2>
    <p class="m-sub">בחר 2 משאבים לקבל מהבנק:</p>
    <select class="m-select" id="yop1">${opts}</select>
    <select class="m-select" id="yop2">${opts}</select>
    <div class="m-actions"><button class="m-btn" id="m-ok">קח</button></div>
  `);
  m.querySelector('#m-ok').onclick = () => {
    const r1 = m.querySelector('#yop1').value;
    const r2 = m.querySelector('#yop2').value;
    gainRes(cur(), r1, 1);
    gainRes(cur(), r2, 1);
    flyRes(r1, fromBank, toPcard(state.current), 1, 0);
    flyRes(r2, fromBank, toPcard(state.current), 1, 200);
    log(cur().name + ' קיבל ' + RES[r1].name + ' + ' + RES[r2].name);
    closeModal();
    renderAll();
  };
}

function showMonoModal() {
  const m = showModal(`
    <h2>💰 מונופול</h2>
    <p class="m-sub">בחר משאב — כל השחקנים ימסרו לך את כל הקלפים שלהם מהסוג הזה:</p>
    ${RES_TYPES.map(r => `<button class="res-pick-btn" data-r="${r}">${RES[r].icon} ${RES[r].name}</button>`).join('')}
  `);
  m.querySelectorAll('.res-pick-btn').forEach(b => {
    b.onclick = () => {
      const r = b.dataset.r;
      let taken = 0, d = 0;
      state.players.forEach((p, i) => {
        if (i === state.current) return;
        if (p.res[r]) { flyRes(r, fromPcard(i), toPcard(state.current), p.res[r], d); d += 260; }
        taken += p.res[r];
        cur().res[r] += p.res[r];
        p.res[r] = 0;
      });
      log(cur().name + ' לקח במונופול ' + taken + ' ' + RES[r].name);
      closeModal();
      renderAll();
    };
  });
}

// =========================================================
// מסחר
// =========================================================
function tradeRatio(pi, r) {
  let ratio = 4;
  Object.values(board.vertices).forEach(v => {
    if (v.building && v.building.player === pi && v.port) {
      if (v.port === r) ratio = Math.min(ratio, 2);
      else if (v.port === 'any') ratio = Math.min(ratio, 3);
    }
  });
  return ratio;
}

function bankTradeExec(pi, giveRes, getRes) { SOUNDS.trade();
  const p = state.players[pi];
  const ratio = tradeRatio(pi, giveRes);
  if (p.res[giveRes] < ratio || state.bank[getRes] < 1) return false;
  p.res[giveRes] -= ratio;
  state.bank[giveRes] += ratio;
  gainRes(p, getRes, 1);
  flyRes(giveRes, fromPcard(pi), toBank, ratio, 0);
  flyRes(getRes, fromBank, toPcard(pi), 1, 420);
  log(p.name + ' סחר עם הבנק: ' + ratio + ' ' + RES[giveRes].name + ' ← 1 ' + RES[getRes].name);
  return true;
}

function showBankTradeModal() {
  const p = cur();
  const giveOpts = RES_TYPES.filter(r => p.res[r] >= tradeRatio(state.current, r));
  if (!giveOpts.length) return;
  const m = showModal(`
    <h2>⚖️ מסחר עם הבנק</h2>
    <p class="m-sub">בחר מה לתת ומה לקבל (היחס לפי הנמלים שלך):</p>
    <div class="trade-cols">
      <div class="trade-col">
        <h4>נותן</h4>
        <select class="m-select" id="t-give">
          ${giveOpts.map(r => `<option value="${r}">${RES[r].icon} ${RES[r].name} (${tradeRatio(state.current, r)}:1, יש ${p.res[r]})</option>`).join('')}
        </select>
      </div>
      <div class="trade-col">
        <h4>מקבל</h4>
        <select class="m-select" id="t-get">
          ${RES_TYPES.filter(r => state.bank[r] > 0).map(r => `<option value="${r}">${RES[r].icon} ${RES[r].name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="m-actions">
      <button class="m-btn" id="m-ok">בצע החלפה</button>
      <button class="m-btn gray" id="m-cancel">סגור</button>
    </div>
  `);
  m.querySelector('#m-ok').onclick = () => {
    const g = m.querySelector('#t-give').value;
    const t = m.querySelector('#t-get').value;
    if (g === t) return;
    bankTradeExec(state.current, g, t);
    closeModal();
    renderAll();
  };
  m.querySelector('#m-cancel').onclick = closeModal;
}

const dealText = r => RES_TYPES.filter(x => r[x] > 0).map(x => r[x] + ' ' + RES[x].name).join(', ') || 'כלום';

function showPlayerTradeModal() {
  const p = cur();
  const give = {}, get = {};
  RES_TYPES.forEach(r => { give[r] = 0; get[r] = 0; });

  const render = () => {
    const m = showModal(`
      <h2>🤝 הצעת מסחר לכולם</h2>
      <p class="m-sub">ההצעה תוצג לכל השחקנים. כל אחד יוכל להסכים, לסרב או להציע הצעה נגדית.</p>
      <div class="trade-cols">
        <div class="trade-col">
          <h4>אני נותן</h4>
          ${RES_TYPES.map(r => `
            <div class="stepper-row" data-side="give" data-r="${r}">
              <span class="st-name">${RES[r].icon} ${RES[r].name}</span>
              <button class="st-minus">−</button><span class="st-val">${give[r]}</span><button class="st-plus">+</button>
            </div>`).join('')}
        </div>
        <div class="trade-col">
          <h4>אני מקבל</h4>
          ${RES_TYPES.map(r => `
            <div class="stepper-row" data-side="get" data-r="${r}">
              <span class="st-name">${RES[r].icon} ${RES[r].name}</span>
              <button class="st-minus">−</button><span class="st-val">${get[r]}</span><button class="st-plus">+</button>
            </div>`).join('')}
        </div>
      </div>
      <div class="m-actions">
        <button class="m-btn" id="m-offer" ${sumVals(give) > 0 && sumVals(get) > 0 ? '' : 'disabled'}>📢 הצע לכולם</button>
        <button class="m-btn gray" id="m-cancel">סגור</button>
      </div>
    `);
    m.querySelectorAll('.stepper-row').forEach(row => {
      const side = row.dataset.side === 'give' ? give : get;
      const r = row.dataset.r;
      row.querySelector('.st-plus').onclick = () => {
        if (row.dataset.side === 'give' && side[r] >= p.res[r]) return;
        side[r]++;
        render();
      };
      row.querySelector('.st-minus').onclick = () => { if (side[r] > 0) { side[r]--; render(); } };
    });
    m.querySelector('#m-cancel').onclick = closeModal;
    m.querySelector('#m-offer').onclick = () => proposeTradeToAll(give, get);
  };
  render();
}

// ביצוע עסקה בפועל: pi נותן give ומקבל get מ-qi
function executeTrade(pi, qi, give, get) { SOUNDS.trade();
  const p = state.players[pi], q = state.players[qi];
  if (RES_TYPES.some(r => (give[r] || 0) > p.res[r] || (get[r] || 0) > q.res[r])) {
    log('אין מספיק קלפים לביצוע העסקה — בוטלה');
    return false;
  }
  let d = 0;
  RES_TYPES.forEach(r => {
    p.res[r] += (get[r] || 0) - (give[r] || 0);
    q.res[r] += (give[r] || 0) - (get[r] || 0);
    if (give[r]) { flyRes(r, fromPcard(pi), toPcard(qi), give[r], d); d += give[r] * 130; }
    if (get[r]) { flyRes(r, fromPcard(qi), toPcard(pi), get[r], d + 150); d += get[r] * 130; }
  });
  log('🤝 ' + p.name + ' ו' + q.name + ' ביצעו עסקת חליפין');
  return true;
}

// הצעה לכולם: אוספים תגובה מכל שחקן (הסכמה / סירוב / הצעה נגדית)
function proposeTradeToAll(give, get) {
  const p = cur();
  if (RES_TYPES.some(r => give[r] > p.res[r])) return;
  closeModal();
  log('📢 ' + p.name + ' מציע לכולם: נותן ' + dealText(give) + ' תמורת ' + dealText(get));
  const others = state.players.map((q, i) => i).filter(i => i !== state.current);
  const responses = [];
  const next = k => {
    if (k >= others.length) { showTradeResults(give, get, responses); return; }
    const qi = others[k], q = state.players[qi];
    if (q.isAI) {
      responses.push({ player: qi, ...aiRespondTrade(q, give, get) });
      next(k + 1);
    } else {
      showHandoff(q, () => showRespondModal(qi, give, get, resp => {
        responses.push(resp);
        next(k + 1);
      }));
    }
  };
  next(0);
}

// חלון תגובה לשחקן אנושי: מסכים / נגדית / דוחה
const handLine = q => RES_TYPES.filter(r => q.res[r] > 0)
  .map(r => RES[r].icon + ' ' + q.res[r]).join('&nbsp;&nbsp;') || 'אין קלפים';

function showRespondModal(qi, give, get, cb) {
  const q = state.players[qi];
  const p = cur();
  const canAccept = RES_TYPES.every(r => get[r] <= q.res[r]);
  const m = showModal(`
    <h2>הצעת עסקה מ${esc(p.name)}</h2>
    <p style="text-align:center;font-size:16px">תקבל: <b>${dealText(give)}</b><br>תיתן: <b>${dealText(get)}</b></p>
    <p class="m-sub">היד שלך: ${handLine(q)}</p>
    ${canAccept ? '' : '<p class="m-sub">⚠️ אין לך מספיק קלפים כדי להסכים</p>'}
    <div class="m-actions">
      <button class="m-btn" id="m-yes" ${canAccept ? '' : 'disabled'}>מסכים ✔</button>
      <button class="m-btn" id="m-counter" style="background:#2e6da4;border-color:#1d4a73">הצעה נגדית ↩</button>
      <button class="m-btn gray" id="m-no">דוחה ✖</button>
    </div>
  `);
  m.querySelector('#m-yes').onclick = () => { closeModal(); cb({ player: qi, type: 'accept' }); };
  m.querySelector('#m-no').onclick = () => { closeModal(); cb({ player: qi, type: 'decline' }); };
  m.querySelector('#m-counter').onclick = () => showCounterBuilder(qi, give, get, cb);
}

// בונה הצעה נגדית: מה שהמגיב נותן = מה שהמציע יקבל, ולהפך
function showCounterBuilder(qi, give, get, cb) {
  const q = state.players[qi];
  const rGive = {}, rWant = {};
  RES_TYPES.forEach(r => { rGive[r] = get[r] || 0; rWant[r] = give[r] || 0; });
  RES_TYPES.forEach(r => { rGive[r] = Math.min(rGive[r], q.res[r]); });
  const render = () => {
    const m = showModal(`
      <h2>הצעה נגדית של ${esc(q.name)}</h2>
      <p class="m-sub">היד שלך: ${handLine(q)}</p>
      <div class="trade-cols">
        <div class="trade-col">
          <h4>אני נותן</h4>
          ${RES_TYPES.map(r => `
            <div class="stepper-row" data-side="give" data-r="${r}">
              <span class="st-name">${RES[r].icon} ${RES[r].name}</span>
              <button class="st-minus">−</button><span class="st-val">${rGive[r]}</span><button class="st-plus">+</button>
            </div>`).join('')}
        </div>
        <div class="trade-col">
          <h4>אני מקבל</h4>
          ${RES_TYPES.map(r => `
            <div class="stepper-row" data-side="want" data-r="${r}">
              <span class="st-name">${RES[r].icon} ${RES[r].name}</span>
              <button class="st-minus">−</button><span class="st-val">${rWant[r]}</span><button class="st-plus">+</button>
            </div>`).join('')}
        </div>
      </div>
      <div class="m-actions">
        <button class="m-btn" id="m-send" ${sumVals(rGive) > 0 && sumVals(rWant) > 0 ? '' : 'disabled'}>שלח הצעה נגדית</button>
        <button class="m-btn gray" id="m-back">חזרה</button>
      </div>
    `);
    m.querySelectorAll('.stepper-row').forEach(row => {
      const side = row.dataset.side === 'give' ? rGive : rWant;
      const r = row.dataset.r;
      row.querySelector('.st-plus').onclick = () => {
        if (row.dataset.side === 'give' && side[r] >= q.res[r]) return;
        side[r]++; render();
      };
      row.querySelector('.st-minus').onclick = () => { if (side[r] > 0) { side[r]--; render(); } };
    });
    m.querySelector('#m-back').onclick = () => showRespondModal(qi, give, get, cb);
    m.querySelector('#m-send').onclick = () => {
      closeModal();
      // המרה לנקודת המבט של המציע: הוא ייתן rWant ויקבל rGive
      cb({ player: qi, type: 'counter', give: { ...rWant }, get: { ...rGive } });
    };
  };
  render();
}

// סיכום התגובות אצל המציע
function showTradeResults(give, get, responses) {
  const p = cur();
  const show = () => {
    const rows = responses.map((resp, idx) => {
      const q = state.players[resp.player];
      const nameHtml = `<span style="color:${q.color.hex}">●</span> <b>${esc(q.name)}</b>`;
      if (resp.type === 'accept') {
        const ok = RES_TYPES.every(r => (give[r] || 0) <= p.res[r] && (get[r] || 0) <= q.res[r]);
        return `<div class="stepper-row">${nameHtml}&nbsp;— מסכים לעסקה
          <button class="m-btn" style="margin-inline-start:auto;padding:4px 14px;font-size:14px" data-idx="${idx}" ${ok ? '' : 'disabled'}>בצע ✔</button></div>`;
      }
      if (resp.type === 'counter') {
        const ok = RES_TYPES.every(r => (resp.give[r] || 0) <= p.res[r] && (resp.get[r] || 0) <= q.res[r]);
        return `<div class="stepper-row" style="flex-wrap:wrap">${nameHtml}&nbsp;— נגדית: תיתן <b>${dealText(resp.give)}</b>, תקבל <b>${dealText(resp.get)}</b>
          <button class="m-btn" style="margin-inline-start:auto;padding:4px 14px;font-size:14px" data-idx="${idx}" ${ok ? '' : 'disabled'}>קבל ✔</button></div>`;
      }
      return `<div class="stepper-row" style="opacity:.65">${nameHtml}&nbsp;— דחה ✖</div>`;
    }).join('');
    const m = showModal(`
      <h2>תגובות להצעה</h2>
      <p class="m-sub">הצעת: נותן <b>${dealText(give)}</b> תמורת <b>${dealText(get)}</b></p>
      ${rows}
      <div class="m-actions"><button class="m-btn gray" id="m-none">סגור בלי עסקה</button></div>
    `);
    m.querySelectorAll('button[data-idx]').forEach(b => {
      b.onclick = () => {
        const resp = responses[+b.dataset.idx];
        const g = resp.type === 'counter' ? resp.give : give;
        const t = resp.type === 'counter' ? resp.get : get;
        closeModal();
        executeTrade(state.current, resp.player, g, t);
        renderAll();
      };
    });
    m.querySelector('#m-none').onclick = () => { closeModal(); renderAll(); };
  };
  // אם היו מגיבים אנושיים — מחזירים את המסך למציע
  if (responses.some(r => !state.players[r.player].isAI)) showHandoff(p, show);
  else show();
}

// =========================================================
// שלב ההקמה
// =========================================================
function startSetup() {
  const n = state.players.length;
  state.firstPlayer = rand(n); // הגרלת שחקן פותח
  const order = [];
  for (let i = 0; i < n; i++) order.push((state.firstPlayer + i) % n);
  state.setup = { queue: order.concat(order.slice().reverse()), i: 0, vertex: null };
  state.phase = 'setup';
  log('🎲 הוגרל שחקן פותח: ' + state.players[state.firstPlayer].name);
  log('שלב ההקמה: כל שחקן מציב 2 יישובים ו-2 דרכים');
  setupNext();
}

function setupNext() { saveGame();
  const s = state.setup;
  if (s.i >= s.queue.length) {
    state.phase = 'play';
    state.current = state.firstPlayer;
    log('— המשחק מתחיל! —');
    startTurn();
    return;
  }
  state.current = s.queue[s.i];
  state.mode = 'setup-settlement';
  renderAll();
  if (cur().isAI) {
    setTimeout(aiSetupPlace, 650);
  } else {
    showHandoff(cur(), () => { state.viewer = state.current; renderAll(); });
  }
}

function setupPlaceSettlement(vid) {
  const s = state.setup;
  const pi = state.current;
  board.vertices[vid].building = { player: pi, type: 'settlement' };
  state.players[pi].settlementsLeft--;
  s.vertex = vid;
  log(cur().name + ' הציב יישוב 🏠');
  // סיבוב שני — מקבלים משאבים מהאריחים הסמוכים
  if (s.i >= state.players.length) {
    const parts = [];
    let d = 0;
    for (const hid of board.vertices[vid].hexes) {
      const res = TERRAINS[board.hexes[hid].terrain].res;
      if (res && gainRes(cur(), res, 1)) {
        parts.push(RES[res].name);
        flyRes(res, fromHex(hid), toPcard(pi), 1, d);
        d += 170;
      }
    }
    if (parts.length) log(cur().name + ' קיבל: ' + parts.join(', '));
  }
  state.fx.verts.add(vid);
  state.mode = 'setup-road';
  renderAll();
}

function setupPlaceRoad(eid) {
  board.edges[eid].road = state.current;
  state.fx.edges.add(eid);
  cur().roadsLeft--;
  log(cur().name + ' הציב דרך 🛤️');
  state.setup.i++;
  state.setup.vertex = null;
  state.mode = null;
  renderAll();
  setTimeout(setupNext, cur().isAI ? 350 : 80);
}

// =========================================================
// ניהול תורות
// =========================================================
function startTurn() {
  state.hasRolled = false;
  state.devPlayed = false;
  state.freeRoads = 0;
  state.aiTraded = false;
  state.mode = null;
  log('— התור של ' + cur().name + ' —');
  renderAll();
  if (cur().isAI) setTimeout(aiTurn, 800);
  else showHandoff(cur(), () => { state.viewer = state.current; renderAll(); });
}

function endTurn() {
  if (state.phase !== 'play') return;
  const p = cur();
  // קלפים שנקנו הופכים זמינים
  for (const t in p.newDev) { p.dev[t] += p.newDev[t]; p.newDev[t] = 0; }
  state.current = (state.current + 1) % state.players.length;
  saveGame();
  startTurn();
}

// =========================================================
// בינה מלאכותית פשוטה
// =========================================================
function vertexPips(vid) {
  return board.vertices[vid].hexes.reduce((s, hid) => s + pipCount(board.hexes[hid].num), 0);
}
const RES_WEIGHT = { wood: 0.15, brick: 0.15, sheep: 0.05, wheat: 0.35, ore: 0.3 };
function vertexScore(pi, vid) {
  // פיפס משוקללים: חיטה ואבן שוות מעט יותר
  let score = 0;
  for (const hid of board.vertices[vid].hexes) {
    const h = board.hexes[hid];
    const r = TERRAINS[h.terrain].res;
    score += pipCount(h.num) * (r ? 1 + RES_WEIGHT[r] : 0);
  }
  // גיוון משאבים
  const have = new Set();
  Object.values(board.vertices).forEach(v => {
    if (v.building && v.building.player === pi)
      v.hexes.forEach(hid => { const r = TERRAINS[board.hexes[hid].terrain].res; if (r) have.add(r); });
  });
  board.vertices[vid].hexes.forEach(hid => {
    const r = TERRAINS[board.hexes[hid].terrain].res;
    if (r && !have.has(r)) score += 1.2;
  });
  if (board.vertices[vid].port) score += 0.5;
  return score + Math.random() * 0.3;
}

function aiSetupPlace() {
  const pi = state.current;
  // יישוב
  const spots = legalSettlementSpots(pi, false);
  spots.sort((a, b) => vertexScore(pi, b) - vertexScore(pi, a));
  setupPlaceSettlement(spots[0]);
  // דרך — לכיוון הצומת הפנוי הטוב ביותר במרחק 2
  setTimeout(() => {
    const vid = state.setup.vertex;
    const options = board.vertices[vid].adjEdges.filter(eid => !board.edges[eid].road);
    let best = options[0], bestScore = -1;
    for (const eid of options) {
      const w = otherVert(eid, vid);
      let s = 0;
      for (const eid2 of board.vertices[w].adjEdges) {
        const u = otherVert(eid2, w);
        if (canPlaceSettlement(pi, u, false)) s = Math.max(s, vertexPips(u));
      }
      if (s > bestScore) { bestScore = s; best = eid; }
    }
    setupPlaceRoad(best);
  }, 500);
}

function robberBlocksMe(pi) {
  return board.hexes[state.robberHex].verts.some(vid => {
    const b = board.vertices[vid].building;
    return b && b.player === pi;
  });
}

function aiTurn() {
  if (state.phase !== 'play') return;
  const p = cur();
  // אביר לפני הטלה אם השודד חוסם אותי
  if (!state.devPlayed && p.dev.knight > 0 && robberBlocksMe(state.current)) {
    p.dev.knight--;
    p.knightsPlayed++;
    state.devPlayed = true;
    log(p.name + ' הפעיל אביר ⚔️');
    updateAwards();
    aiRobber();
    if (state.phase !== 'play') return;
  }
  state.aiActions = 0;
  rollDice(); // ממשיך דרך aiContinue
}

function aiContinue() {
  if (state.phase !== 'play' || !cur().isAI) return;
  const p = cur();
  state.aiActions = (state.aiActions || 0) + 1;
  let acted = false;
  if (state.aiActions <= 16) acted = aiTryAction(p);
  renderAll();
  if (state.phase !== 'play') return;
  // כשאין מהלך זמין — ניסיון יזום למסחר עם שחקנים (פעם אחת בתור)
  if (!acted && !state.aiTraded && Math.random() < 0.65) {
    const offer = aiBuildOffer(p);
    if (offer) {
      state.aiTraded = true;
      aiProposeTrade(p, offer, () => {
        if (state.phase === 'play' && cur().isAI) setTimeout(aiContinue, 550);
      });
      return;
    }
  }
  if (acted) {
    setTimeout(aiContinue, 550);
  } else {
    aiMaybeDev(p);
    renderAll();
    if (state.phase !== 'play') return;
    saveGame(); setTimeout(endTurn, 650);
  }
}

function aiTryAction(p) {
  const pi = state.current;
  // עיר
  if (p.citiesLeft > 0 && canAfford(p, COST.city)) {
    const setts = ownSettlements(pi);
    if (setts.length) {
      setts.sort((a, b) => vertexPips(b) - vertexPips(a));
      placeCity(pi, setts[0]);
      return true;
    }
  }
  // יישוב
  if (p.settlementsLeft > 0 && canAfford(p, COST.settlement)) {
    const spots = legalSettlementSpots(pi, true);
    if (spots.length) {
      spots.sort((a, b) => vertexScore(pi, b) - vertexScore(pi, a));
      placeSettlement(pi, spots[0], false);
      return true;
    }
  }
  // דרך — רק אם היא מקדמת יישוב עתידי (אין נקודה חוקית ועדיין יש יישובים להציב)
  if (p.roadsLeft > 0 && canAfford(p, COST.road)) {
    const noSpot = legalSettlementSpots(pi, true).length === 0;
    const wantsExpand = noSpot && p.settlementsLeft > 0;
    // לא לבזבז דרכים אם כבר מחזיק בדרך הארוכה בפער
    const roadSpam = state.longestRoad === pi && Math.random() < 0.8;
    if (wantsExpand && !roadSpam && p.roadsLeft > 1) {
      const e = aiBestRoad(pi);
      if (e) { placeRoad(pi, e, false); return true; }
    }
    // מרוץ על הדרך הארוכה: אם קרוב לקחת אותה (הפרש 1) — שווה לבנות
    if (!noSpot && state.roadLens) {
      const myLen = state.roadLens[pi];
      const holder = state.longestRoad;
      if (holder !== null && holder !== pi && myLen >= state.roadLens[holder] - 1 && myLen >= 4) {
        const e = aiBestRoad(pi);
        if (e) { placeRoad(pi, e, false); return true; }
      }
    }
  }
  // מסחר עם הבנק כדי להשלים את היעד — לפני בזבוז על קלפי פיתוח
  if (aiTryBankTrade(p)) return true;
  // קלף פיתוח: כשאי אפשר להתקדם ליעד, או כשיש עודף משאבים
  if (state.devDeck.length && canAfford(p, COST.dev)) {
    const goal = aiGoal(p);
    const goalMiss = RES_TYPES.reduce((s, r) => s + Math.max(0, (goal[r] || 0) - p.res[r]), 0);
    if (goalMiss >= 2 || handSize(p) >= 8 || Math.random() < 0.25) {
      buyDev(pi);
      return true;
    }
  }
  return false;
}

function aiBestRoad(pi) {
  const edges = legalRoadEdges(pi);
  if (!edges.length) return null;
  let best = null, bestScore = -1;
  for (const eid of edges) {
    const e = board.edges[eid];
    let s = Math.random();
    for (const vid of [e.v1, e.v2]) {
      // צומת בנייה מיידי בקצה הדרך
      if (canPlaceSettlement(pi, vid, false)) s += vertexPips(vid) + 4;
      // מבט שני קדימה: צומת בנייה במרחק דרך אחת נוספת
      for (const eid2 of board.vertices[vid].adjEdges) {
        if (eid2 === eid || board.edges[eid2].road !== null) continue;
        const u = otherVert(eid2, vid);
        if (canPlaceSettlement(pi, u, false)) s += vertexPips(u) * 0.5;
      }
    }
    if (s > bestScore) { bestScore = s; best = eid; }
  }
  return best;
}

function aiTryBankTrade(p) {
  const pi = state.current;
  const goals = [];
  if (p.citiesLeft > 0 && ownSettlements(pi).length) goals.push('city');
  if (p.settlementsLeft > 0 && legalSettlementSpots(pi, true).length) goals.push('settlement');
  if (state.devDeck.length) goals.push('dev');
  if (p.roadsLeft > 0 && legalRoadEdges(pi).length) goals.push('road');
  for (const g of goals) {
    const cost = COST[g];
    const missing = [];
    for (const r of RES_TYPES) {
      const m = (cost[r] || 0) - p.res[r];
      for (let k = 0; k < m; k++) missing.push(r);
    }
    if (missing.length === 0 || missing.length > 3) continue;
    const mr = missing[0];
    // מעדיפים לסחור מהמשאב עם היחס הזול ביותר והעודף הגדול ביותר
    let bestR = null, bestKey = -1;
    for (const r of RES_TYPES) {
      if (missing.includes(r)) continue;
      const ratio = tradeRatio(pi, r);
      const spare = p.res[r] - (cost[r] || 0);
      if (spare >= ratio && state.bank[mr] > 0) {
        const key = spare - ratio * 0.5;
        if (key > bestKey) { bestKey = key; bestR = r; }
      }
    }
    if (bestR) return bankTradeExec(pi, bestR, mr);
  }
  return false;
}

function aiMaybeDev(p) {
  if (state.devPlayed) return;
  const pi = state.current;
  if (p.dev.road > 0 && canPlayDev(p, 'road')) {
    p.dev.road--;
    state.devPlayed = true;
    log(p.name + ' הפעיל: בניית דרכים 🛤️');
    for (let i = 0; i < Math.min(2, p.roadsLeft); i++) {
      const e = aiBestRoad(pi);
      if (e) placeRoad(pi, e, true);
      if (state.phase !== 'play') return;
    }
  } else if (p.dev.yop > 0 && canPlayDev(p, 'yop')) {
    p.dev.yop--;
    state.devPlayed = true;
    // בוחרים את מה שחסר ליעד הנוכחי
    const goal = aiGoal(p);
    const wants = [];
    for (const r of RES_TYPES) {
      const miss = (goal[r] || 0) - p.res[r];
      for (let k = 0; k < miss && state.bank[r] > 0; k++) wants.push(r);
    }
    while (wants.length < 2) {
      const avail = RES_TYPES.filter(r => state.bank[r] > 0);
      if (!avail.length) break;
      wants.push(avail[rand(avail.length)]);
    }
    const r1 = wants[0], r2 = wants[1] || wants[0];
    gainRes(p, r1, 1); gainRes(p, r2, 1);
    flyRes(r1, fromBank, toPcard(state.current), 1, 0);
    flyRes(r2, fromBank, toPcard(state.current), 1, 200);
    log(p.name + ' הפעיל שנת שפע וקיבל ' + RES[r1].name + ' + ' + RES[r2].name);
  } else if (p.dev.mono > 0 && canPlayDev(p, 'mono')) {
    p.dev.mono--;
    state.devPlayed = true;
    // המשאב שהכי חסר ליעד; אם אין חסר — זה שיש לי הכי מעט ממנו
    const goal = aiGoal(p);
    let r = null, bestMiss = 0;
    for (const x of RES_TYPES) {
      const miss = (goal[x] || 0) - p.res[x];
      if (miss > bestMiss) { bestMiss = miss; r = x; }
    }
    if (!r) r = RES_TYPES.reduce((a, b) => p.res[a] <= p.res[b] ? a : b);
    let taken = 0, d = 0;
    state.players.forEach((q, i) => {
      if (i === state.current) return;
      if (q.res[r]) { flyRes(r, fromPcard(i), toPcard(state.current), q.res[r], d); d += 260; }
      taken += q.res[r];
      p.res[r] += q.res[r];
      q.res[r] = 0;
    });
    log(p.name + ' הפעיל מונופול על ' + RES[r].name + ' ולקח ' + taken);
  } else if (p.dev.knight > 0 && aiKnightWorthwhile(p)) {
    p.dev.knight--;
    p.knightsPlayed++;
    state.devPlayed = true;
    log(p.name + ' הפעיל אביר ⚔️');
    updateAwards();
    checkWin();
    if (state.phase !== 'play') return;
    aiRobber();
  }
}

// האם שווה להפעיל אביר עכשיו: חסימה עליי, או מרוץ על הצבא הגדול
function aiKnightWorthwhile(p) {
  const pi = p.idx;
  if (robberBlocksMe(pi)) return true;
  const after = p.knightsPlayed + 1;
  const holder = state.largestArmy;
  if (holder === null) {
    if (after >= 3) return true;                       // לוקח את הצבא הגדול
    if (after === 2 && Math.random() < 0.5) return true; // מתקדם לקראתו
  } else if (holder !== pi && after > state.players[holder].knightsPlayed) {
    return true;                                       // חוטף את התואר
  }
  return Math.random() < 0.15;
}

function aiRobber() {
  const pi = state.current;
  // מזהים את המוביל כדי להציק לו
  let leader = null, leaderVP = -1;
  state.players.forEach((q, i) => {
    if (i === pi) return;
    const vp = totalVP(i, false);
    if (vp > leaderVP) { leaderVP = vp; leader = i; }
  });
  let candidates = board.hexes.filter(h => {
    if (h.id === state.robberHex) return false;
    let enemy = false, mine = false;
    for (const vid of h.verts) {
      const b = board.vertices[vid].building;
      if (b) { if (b.player === pi) mine = true; else enemy = true; }
    }
    return enemy && !mine;
  });
  if (!candidates.length) candidates = board.hexes.filter(h => h.id !== state.robberHex);
  let best = candidates[0], bestScore = -1;
  for (const h of candidates) {
    let s = Math.random();
    for (const vid of h.verts) {
      const b = board.vertices[vid].building;
      if (b && b.player !== pi) {
        let w = pipCount(h.num) * (b.type === 'city' ? 2 : 1);
        if (b.player === leader) w *= 1.7; // עדיפות לחסימת המוביל
        s += w;
      }
    }
    if (s > bestScore) { bestScore = s; best = h; }
  }
  state.robberHex = best.id;
  log(cur().name + ' הזיז את השודד 🥷');
  const victims = robberVictims(best.id);
  if (victims.length) {
    victims.sort((a, b) => totalVP(b, false) - totalVP(a, false));
    stealFrom(pi, victims[0]);
  }
  renderAll();
}

function aiDiscard(p) {
  let need = Math.floor(handSize(p) / 2);
  const goal = aiGoal(p); // שומרים על מה שנחוץ ליעד
  let d = 0;
  while (need > 0) {
    let bestR = null, bestSurplus = -Infinity;
    for (const r of RES_TYPES) {
      if (p.res[r] === 0) continue;
      const surplus = p.res[r] - (goal[r] || 0);
      if (surplus > bestSurplus) { bestSurplus = surplus; bestR = r; }
    }
    p.res[bestR]--;
    state.bank[bestR]++;
    flyRes(bestR, fromPcard(p.idx), toBank, 1, d);
    d += 110;
    need--;
  }
  log(p.name + ' השליך חצי מהקלפים');
}

// היעד הנוכחי של המחשב: הבנייה שהכי קרוב להשיג
function aiGoal(p) {
  const pi = p.idx;
  const options = [];
  if (p.settlementsLeft > 0 && legalSettlementSpots(pi, true).length) options.push(COST.settlement);
  if (p.citiesLeft > 0 && ownSettlements(pi).length) options.push(COST.city);
  if (!options.length && p.settlementsLeft > 0 && p.roadsLeft > 0 && legalRoadEdges(pi).length) options.push(COST.road);
  if (!options.length) options.push(COST.dev);
  let best = options[0], bestMiss = 99;
  for (const c of options) {
    let miss = 0;
    for (const r of RES_TYPES) miss += Math.max(0, (c[r] || 0) - p.res[r]);
    if (miss < bestMiss) { bestMiss = miss; best = c; }
  }
  return best;
}

// כמה שווה משאב עבור שחקן מחשב (לפי הצורך ליעד ולפי עודפים)
function aiValue(q, r) {
  const goal = aiGoal(q);
  let v = 1;
  if ((goal[r] || 0) > q.res[r]) v += 0.9;   // חסר ליעד
  if (q.res[r] === 0) v += 0.25;
  if (q.res[r] >= 4) v -= 0.35;              // עודף גדול
  return v;
}

// q הוא המחשב: מקבל give, נותן get (בנקודת המבט של המציע)
function aiEvaluateTrade(q, give, get) {
  if (RES_TYPES.some(r => (get[r] || 0) > q.res[r])) return false;
  if (sumVals(get) === 0 || sumVals(give) === 0) return false;
  let vIn = 0, vOut = 0;
  for (const r of RES_TYPES) {
    vIn += (give[r] || 0) * aiValue(q, r);
    vOut += (get[r] || 0) * aiValue(q, r);
  }
  return vIn > vOut + 0.1;
}

// הצעה נגדית של המחשב, אם ההצעה המקורית לא כדאית
function aiCounterTrade(q, give, get) {
  // ניסיון 1: לשלם קלף אחד פחות (להוריד את היקר ביותר עבורי)
  if (sumVals(get) >= 2) {
    let dropR = null, dropV = -1;
    for (const r of RES_TYPES) {
      if ((get[r] || 0) > 0 && aiValue(q, r) > dropV) { dropV = aiValue(q, r); dropR = r; }
    }
    const get2 = { ...get, [dropR]: get[dropR] - 1 };
    if (aiEvaluateTrade(q, give, get2)) return { give: { ...give }, get: get2 };
  }
  // ניסיון 2: לבקש מהמציע עוד יחידה ממה שכבר הציע
  let addR = null, addV = -1;
  for (const r of RES_TYPES) {
    if ((give[r] || 0) > 0 && aiValue(q, r) > addV) { addV = aiValue(q, r); addR = r; }
  }
  if (addR) {
    const give2 = { ...give, [addR]: give[addR] + 1 };
    if (aiEvaluateTrade(q, give2, get)) return { give: give2, get: { ...get } };
  }
  return null;
}

function aiRespondTrade(q, give, get) {
  if (aiEvaluateTrade(q, give, get)) {
    log(q.name + ' מסכים להצעה ✔');
    return { type: 'accept' };
  }
  const c = aiCounterTrade(q, give, get);
  if (c) {
    log(q.name + ' מציע הצעה נגדית ↩');
    return { type: 'counter', give: c.give, get: c.get };
  }
  log(q.name + ' דחה את ההצעה ❌');
  return { type: 'decline' };
}

// המחשב בונה הצעת מסחר משלו: עודף תמורת מה שחסר ליעד
function aiBuildOffer(p) {
  if (!state.hasRolled) return null;
  const goal = aiGoal(p);
  let missTotal = 0;
  for (const r of RES_TYPES) missTotal += Math.max(0, (goal[r] || 0) - p.res[r]);
  if (missTotal === 0 || missTotal > 2) return null; // מציעים רק כשקרובים ליעד
  // המשאב החסר ביותר
  let want = null, bestMiss = 0;
  for (const r of RES_TYPES) {
    const miss = (goal[r] || 0) - p.res[r];
    if (miss > bestMiss) { bestMiss = miss; want = r; }
  }
  // העודף הגדול ביותר שאינו נחוץ ליעד
  let giveR = null, bestSpare = 0;
  for (const r of RES_TYPES) {
    if (r === want) continue;
    const spare = p.res[r] - (goal[r] || 0);
    if (spare > bestSpare) { bestSpare = spare; giveR = r; }
  }
  if (!want || !giveR) return null;
  const give = {}, get = {};
  RES_TYPES.forEach(r => { give[r] = 0; get[r] = 0; });
  give[giveR] = bestSpare >= 3 ? 2 : 1; // נדיב יותר כשיש עודף גדול
  get[want] = 1;
  return { give, get };
}

// המחשב מציע לכולם ובוחר את התגובה הטובה ביותר
function aiProposeTrade(p, offer, done) {
  const { give, get } = offer;
  log('📢 ' + p.name + ' מציע לכולם: נותן ' + dealText(give) + ' תמורת ' + dealText(get));
  const others = state.players.map((q, i) => i).filter(i => i !== state.current);
  const responses = [];
  const next = k => {
    if (k >= others.length) {
      aiPickTradeResponse(p, give, get, responses);
      renderAll();
      done();
      return;
    }
    const qi = others[k], q = state.players[qi];
    if (q.isAI) {
      responses.push({ player: qi, ...aiRespondTrade(q, give, get) });
      next(k + 1);
    } else {
      showHandoff(q, () => showRespondModal(qi, give, get, resp => {
        responses.push(resp);
        next(k + 1);
      }));
    }
  };
  next(0);
}

function aiPickTradeResponse(p, give, get, responses) {
  const pi = p.idx;
  // קודם כל הסכמות מלאות
  for (const a of shuffle(responses.filter(r => r.type === 'accept'))) {
    if (executeTrade(pi, a.player, give, get)) return;
  }
  // אחר כך ההצעה הנגדית המשתלמת ביותר
  let best = null, bestGain = 0.1;
  for (const c of responses.filter(r => r.type === 'counter')) {
    if (RES_TYPES.some(r => (c.give[r] || 0) > p.res[r])) continue;
    let gain = 0;
    for (const r of RES_TYPES) {
      gain += (c.get[r] || 0) * aiValue(p, r) - (c.give[r] || 0) * aiValue(p, r);
    }
    if (gain > bestGain) { bestGain = gain; best = c; }
  }
  if (best) { executeTrade(pi, best.player, best.give, best.get); return; }
  if (responses.length) log(p.name + ' לא מצא עסקה מתאימה');
}

// =========================================================
// ציור הלוח
// =========================================================
let gRoads, gBuild, gRobberFig, gHi;

function scaleCorners(h, f) {
  return h.corners.map(([x, y]) => [h.cx + (x - h.cx) * f, h.cy + (y - h.cy) * f]);
}
function ptsAttr(pts) { return pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '); }

function renderBoardStatic() {
  const svg = $('board');
  svg.innerHTML = '';

  // חוף חול מסביב לאי
  const gCoast = svgEl('g', {}, svg);
  for (const h of board.hexes) {
    svgEl('polygon', { points: ptsAttr(scaleCorners(h, 1.16)), fill: '#e2cf97', stroke: 'none' }, gCoast);
  }

  // אריחי שטח
  const gHex = svgEl('g', {}, svg);
  for (const h of board.hexes) {
    const t = TERRAINS[h.terrain];
    const poly = svgEl('polygon', {
      points: ptsAttr(h.corners), fill: t.color, 'class': 'hex-poly'
    }, gHex);
    poly.addEventListener('click', () => onHexClick(h.id));
    svgEl('text', {
      x: h.cx, y: h.cy - 18, 'text-anchor': 'middle', 'class': 'hex-emoji'
    }, gHex).textContent = t.emoji;

    if (h.num) {
      const hot = (h.num === 6 || h.num === 8);
      const g = svgEl('g', { 'class': 'token', id: 'token-' + h.id }, gHex);
      svgEl('circle', { cx: h.cx, cy: h.cy + 16, r: 19, 'class': 'token-circle' }, g);
      const tx = svgEl('text', {
        x: h.cx, y: h.cy + 21, 'class': 'token-num' + (hot ? ' hot' : '')
      }, g);
      tx.textContent = h.num;
      const pips = pipCount(h.num);
      const w = (pips - 1) * 5;
      for (let i = 0; i < pips; i++) {
        svgEl('circle', {
          cx: h.cx - w / 2 + i * 5, cy: h.cy + 28, r: 1.7,
          'class': 'token-pip' + (hot ? ' hot' : '')
        }, g);
      }
    }
  }

  // נמלים
  const gPorts = svgEl('g', {}, svg);
  for (const e of Object.values(board.edges)) {
    if (!e.port) continue;
    const v1 = board.vertices[e.v1], v2 = board.vertices[e.v2];
    const mx = (v1.x + v2.x) / 2, my = (v1.y + v2.y) / 2;
    const hex = board.hexes[e.hexes[0]];
    const dx = mx - hex.cx, dy = my - hex.cy;
    const dl = Math.hypot(dx, dy);
    const px = mx + dx / dl * 34, py = my + dy / dl * 34;
    svgEl('line', { x1: v1.x, y1: v1.y, x2: px, y2: py, 'class': 'pier' }, gPorts);
    svgEl('line', { x1: v2.x, y1: v2.y, x2: px, y2: py, 'class': 'pier' }, gPorts);
    svgEl('circle', { cx: px, cy: py, r: 17, 'class': 'port-circle' }, gPorts);
    const icon = svgEl('text', { x: px, y: py - 1, 'class': 'port-icon' }, gPorts);
    icon.textContent = e.port === 'any' ? '❓' : RES[e.port].icon;
    const txt = svgEl('text', { x: px, y: py + 11, 'class': 'port-text' }, gPorts);
    txt.textContent = e.port === 'any' ? '3:1' : '2:1';
  }

  // שכבות דינמיות
  gRoads = svgEl('g', {}, svg);
  gBuild = svgEl('g', {}, svg);
  // דמות השודד נבנית פעם אחת ומחליקה בין אריחים (מעבר CSS)
  gRobberFig = svgEl('g', { id: 'robber-fig' }, svg);
  svgEl('path', { d: 'M-8,12 Q-8,-5 0,-5 Q8,-5 8,12 Z', fill: '#33302c', stroke: '#111', 'stroke-width': 1.5 }, gRobberFig);
  svgEl('circle', { cx: 0, cy: -9, r: 5.5, fill: '#33302c', stroke: '#111', 'stroke-width': 1.5 }, gRobberFig);
  const rh0 = board.hexes[state.robberHex];
  gRobberFig.style.transform = `translate(${rh0.cx - 23}px, ${rh0.cy + 14}px)`;
  gHi = svgEl('g', {}, svg);
}

function renderBoardDyn() {
  gRoads.innerHTML = '';
  gBuild.innerHTML = '';
  gHi.innerHTML = '';

  // דרכים
  for (const e of Object.values(board.edges)) {
    if (e.road === null) continue;
    const v1 = board.vertices[e.v1], v2 = board.vertices[e.v2];
    // מקצרים מעט כדי לא לכסות צמתים
    const t = 0.14;
    const x1 = v1.x + (v2.x - v1.x) * t, y1 = v1.y + (v2.y - v1.y) * t;
    const x2 = v2.x + (v1.x - v2.x) * t, y2 = v2.y + (v1.y - v2.y) * t;
    const fresh = state.fx.edges.has(e.id);
    const cls = fresh ? 'pop-in' : '';
    svgEl('line', { x1, y1, x2, y2, stroke: '#26160a', 'stroke-width': 10.5, 'stroke-linecap': 'round', 'class': cls }, gRoads);
    svgEl('line', { x1, y1, x2, y2, stroke: state.players[e.road].color.hex, 'stroke-width': 6.5, 'stroke-linecap': 'round', 'class': cls }, gRoads);
    if (fresh) state.fx.edges.delete(e.id);
  }

  // מבנים
  for (const v of Object.values(board.vertices)) {
    if (!v.building) continue;
    const p = state.players[v.building.player];
    const path = v.building.type === 'city'
      ? 'M-15,9 L-15,-3 L-5,-3 L-5,-13 L1,-17 L7,-13 L7,-3 L15,-3 L15,9 Z'
      : 'M0,-13 L11,-4 L11,9 L-11,9 L-11,-4 Z';
    const g = svgEl('g', {
      transform: `translate(${v.x},${v.y})`,
      'class': state.fx.verts.has(v.id) ? 'pop-in' : ''
    }, gBuild);
    svgEl('path', {
      d: path, fill: p.color.hex, stroke: '#26160a', 'stroke-width': 2,
      transform: v.building.type === 'city' ? 'scale(1.15)' : ''
    }, g);
    if (state.fx.verts.has(v.id)) state.fx.verts.delete(v.id);
  }

  // השודד — מחליק אל האריח הנוכחי
  const rh = board.hexes[state.robberHex];
  const token = $('token-' + rh.id);
  document.querySelectorAll('.token').forEach(t => t.setAttribute('opacity', 1));
  if (token) token.setAttribute('opacity', 0.35);
  gRobberFig.style.transform = `translate(${rh.cx - 23}px, ${rh.cy + 14}px)`;

  // הדגשות לפי מצב
  const mode = state.mode;
  const pi = state.current;
  const humanActive = !cur().isAI;
  if (mode && humanActive) {
    if (mode === 'setup-settlement' || mode === 'build-settlement') {
      const need = mode === 'build-settlement';
      for (const vid of legalSettlementSpots(pi, need)) {
        const v = board.vertices[vid];
        const c = svgEl('circle', { cx: v.x, cy: v.y, r: IS_COARSE ? 15 : 10, 'class': 'hi-vert' }, gHi);
        c.addEventListener('click', () => onVertexClick(vid));
      }
    } else if (mode === 'build-city') {
      for (const vid of ownSettlements(pi)) {
        const v = board.vertices[vid];
        const c = svgEl('circle', { cx: v.x, cy: v.y, r: IS_COARSE ? 17 : 13, 'class': 'hi-vert' }, gHi);
        c.addEventListener('click', () => onVertexClick(vid));
      }
    } else if (mode === 'setup-road' || mode === 'build-road') {
      let edges;
      if (mode === 'setup-road') {
        const sv = state.setup.vertex;
        edges = board.vertices[sv].adjEdges.filter(eid => !board.edges[eid].road);
      } else {
        edges = legalRoadEdges(pi);
      }
      for (const eid of edges) {
        const e = board.edges[eid];
        const v1 = board.vertices[e.v1], v2 = board.vertices[e.v2];
        const l = svgEl('line', { x1: v1.x, y1: v1.y, x2: v2.x, y2: v2.y, 'class': 'hi-edge' }, gHi);
        l.addEventListener('click', () => onEdgeClick(eid));
      }
    } else if (mode === 'robber') {
      for (const h of board.hexes) {
        if (h.id === state.robberHex) continue;
        const poly = svgEl('polygon', { points: ptsAttr(scaleCorners(h, 0.92)), 'class': 'hi-hex' }, gHi);
        poly.addEventListener('click', () => onHexClick(h.id));
      }
    }
  }
}

// ===== קליקים על הלוח =====
function onVertexClick(vid) {
  if (cur().isAI) return;
  const pi = state.current;
  if (state.mode === 'setup-settlement' && canPlaceSettlement(pi, vid, false)) {
    setupPlaceSettlement(vid);
  } else if (state.mode === 'build-settlement' && canPlaceSettlement(pi, vid, true)) {
    placeSettlement(pi, vid, false);
    state.mode = null;
    renderAll();
  } else if (state.mode === 'build-city') {
    const b = board.vertices[vid].building;
    if (b && b.player === pi && b.type === 'settlement') {
      placeCity(pi, vid);
      state.mode = null;
      renderAll();
    }
  }
}

function onEdgeClick(eid) {
  if (cur().isAI) return;
  const pi = state.current;
  if (state.mode === 'setup-road') {
    const sv = state.setup.vertex;
    if (board.edges[eid].road === null &&
        (board.edges[eid].v1 === sv || board.edges[eid].v2 === sv)) {
      setupPlaceRoad(eid);
    }
  } else if (state.mode === 'build-road' && canPlaceRoad(pi, eid)) {
    if (state.freeRoads > 0) {
      placeRoad(pi, eid, true);
      state.freeRoads--;
      if (state.freeRoads <= 0 || legalRoadEdges(pi).length === 0 || cur().roadsLeft === 0) {
        state.freeRoads = 0;
        state.mode = null;
      }
    } else {
      placeRoad(pi, eid, false);
      state.mode = null;
    }
    renderAll();
  }
}

function onHexClick(hid) {
  if (cur().isAI) return;
  if (state.mode === 'robber' && hid !== state.robberHex) {
    humanPlaceRobber(hid);
  }
}

// =========================================================
// ציור לוחות צד
// =========================================================
function renderPlayers() {
  const el = $('players-panel');
  el.innerHTML = '';
  state.players.forEach((p, i) => {
    const publicVP = totalVP(i, false);
    const isCur = i === state.current;
    const showTotal = isCur && !p.isAI;
    const d = document.createElement('div');
    d.className = 'pcard' + (isCur ? ' current' : '');
    d.id = 'pcard-' + i;
    d.innerHTML = `
      <div class="p-head">
        <span style="color:${p.color.hex};font-size:19px">●</span>
        <span>${esc(p.name)}${p.isAI ? ' 🤖' : ''}</span>
        <span class="p-vp">⭐ ${showTotal ? totalVP(i, true) : publicVP}</span>
      </div>
      <div class="p-stats">
        <span>🂠 ${handSize(p)}</span>
        <span>🃏 ${sumVals(p.dev) + sumVals(p.newDev)}</span>
        <span>⚔️ ${p.knightsPlayed}</span>
        <span>🛤️ ${state.roadLens ? state.roadLens[i] : 0}</span>
        ${state.longestRoad === i ? '<span class="badge">🛣️ דרך ארוכה</span>' : ''}
        ${state.largestArmy === i ? '<span class="badge">🛡️ צבא גדול</span>' : ''}
      </div>`;
    el.appendChild(d);
  });
}

function renderHand() {
  const el = $('hand-panel');
  // תמיד מציגים את היד של השחקן האנושי הפעיל (viewer), גם בתור של המחשב
  const vi = state.viewer;
  if (vi === null) {
    el.innerHTML = `<h3>היד שלי</h3><div class="ai-note">🤖 משחק בין מחשבים</div>`;
    return;
  }
  const p = state.players[vi];
  const myTurn = vi === state.current && state.phase === 'play';
  let html = `<h3>היד של ${esc(p.name)}${myTurn ? '' : ' <small>(ממתין לתור)</small>'}</h3><div class="res-cards">`;
  for (const r of RES_TYPES) {
    html += `
      <div class="res-card" style="background:${RES[r].color}">
        <span class="rc-icon">${RES[r].icon}</span>
        <span class="rc-count">${p.res[r]}</span>
      </div>`;
  }
  html += '</div>';

  const devEntries = [];
  for (const t of ['knight','road','yop','mono','vp']) {
    const n = p.dev[t], fresh = p.newDev[t];
    if (n + fresh === 0) continue;
    const canPlay = myTurn && canPlayDev(p, t);
    devEntries.push(`
      <div class="dev-item">
        <span>${DEV_INFO[t].icon}</span>
        <span>${DEV_INFO[t].name}</span>
        <span class="dev-count">×${n + fresh}${fresh ? ' (חדש: ' + fresh + ')' : ''}</span>
        ${t !== 'vp' ? `<button data-dev="${t}" ${canPlay ? '' : 'disabled'}>הפעל</button>` : ''}
      </div>`);
  }
  if (devEntries.length) html += `<div class="dev-list">${devEntries.join('')}</div>`;

  const ports = [];
  RES_TYPES.forEach(r => { if (tradeRatio(vi, r) === 2) ports.push(RES[r].icon + ' 2:1'); });
  if (RES_TYPES.some(r => tradeRatio(vi, r) === 3)) ports.push('❓ 3:1');
  if (ports.length) html += `<div class="ports-line">נמלים: ${ports.join(' | ')}</div>`;

  el.innerHTML = html;
  el.querySelectorAll('button[data-dev]').forEach(b => {
    b.onclick = () => playDev(b.dataset.dev);
  });
}

function renderActions() {
  const el = $('actions-panel');
  const p = cur();
  if (state.phase !== 'play' || p.isAI) {
    el.innerHTML = `<h3>פעולות</h3><div class="ai-note">${state.phase === 'setup' ? 'שלב ההקמה' : state.phase === 'ended' ? 'המשחק הסתיים' : '...'}</div>`;
    return;
  }
  const rolled = state.hasRolled;
  const inMode = state.mode !== null;
  const can = {
    road: rolled && !inMode && p.roadsLeft > 0 && canAfford(p, COST.road) && legalRoadEdges(state.current).length > 0,
    sett: rolled && !inMode && p.settlementsLeft > 0 && canAfford(p, COST.settlement) && legalSettlementSpots(state.current, true).length > 0,
    city: rolled && !inMode && p.citiesLeft > 0 && canAfford(p, COST.city) && ownSettlements(state.current).length > 0,
    dev: rolled && !inMode && state.devDeck.length > 0 && canAfford(p, COST.dev),
    bank: rolled && !inMode && RES_TYPES.some(r => p.res[r] >= tradeRatio(state.current, r)),
    trade: rolled && !inMode && handSize(p) > 0,
    end: rolled && !inMode
  };
  el.innerHTML = `
    <h3>פעולות</h3>
    <button class="act-btn" id="a-road" ${can.road ? '' : 'disabled'}>🛤️ בנה דרך (נותרו ${p.roadsLeft})</button>
    <button class="act-btn" id="a-sett" ${can.sett ? '' : 'disabled'}>🏠 בנה יישוב (נותרו ${p.settlementsLeft})</button>
    <button class="act-btn" id="a-city" ${can.city ? '' : 'disabled'}>🏛️ בנה עיר (נותרו ${p.citiesLeft})</button>
    <button class="act-btn" id="a-dev" ${can.dev ? '' : 'disabled'}>🃏 קנה קלף פיתוח (${state.devDeck.length} בחפיסה)</button>
    <button class="act-btn" id="a-bank" ${can.bank ? '' : 'disabled'}>⚖️ מסחר עם הבנק</button>
    <button class="act-btn" id="a-trade" ${can.trade ? '' : 'disabled'}>🤝 מסחר עם שחקן</button>
    <button class="act-btn primary" id="a-end" ${can.end ? '' : 'disabled'}>סיים תור ⏭</button>
  `;
  $('a-road').onclick = () => { state.mode = 'build-road'; renderAll(); };
  $('a-sett').onclick = () => { state.mode = 'build-settlement'; renderAll(); };
  $('a-city').onclick = () => { state.mode = 'build-city'; renderAll(); };
  $('a-dev').onclick = () => { buyDev(state.current); renderAll(); };
  $('a-bank').onclick = showBankTradeModal;
  $('a-trade').onclick = showPlayerTradeModal;
  $('a-end').onclick = endTurn;
}

function renderTop() {
  const p = cur();
  $('turn-indicator').innerHTML =
    `<span style="color:${p.color.hex};font-size:22px">●</span> התור של ${esc(p.name)}${p.isAI ? ' 🤖' : ''}`;
  renderDie($('die1'), state.dice ? state.dice[0] : 0);
  renderDie($('die2'), state.dice ? state.dice[1] : 0);
  const showRoll = state.phase === 'play' && !state.hasRolled && !p.isAI;
  $('roll-btn').classList.toggle('hidden', !showRoll);
  $('bank-info').innerHTML = RES_TYPES.map(r =>
    `<span class="b-item">${RES[r].icon} ${state.bank[r]}</span>`).join('') +
    `<span class="b-item">🃏 ${state.devDeck.length}</span>`;
}

function renderBanner() {
  const b = $('mode-banner');
  const c = $('cancel-btn');
  const texts = {
    'setup-settlement': 'בחר מקום ליישוב הפתיחה 🏠',
    'setup-road': 'בחר מקום לדרך הפתיחה 🛤️',
    'build-settlement': 'בחר מקום ליישוב 🏠',
    'build-road': state.freeRoads > 0 ? `בחר מקום לדרך חינם (${state.freeRoads} נותרו) 🛤️` : 'בחר מקום לדרך 🛤️',
    'build-city': 'בחר יישוב לשדרוג לעיר 🏛️',
    'robber': 'בחר משבצת להצבת השודד 🥷'
  };
  const show = state.mode && !cur().isAI;
  b.classList.toggle('hidden', !show);
  if (show) b.textContent = texts[state.mode] || '';
  const cancellable = show && ['build-road','build-settlement','build-city'].includes(state.mode) && state.freeRoads === 0;
  c.classList.toggle('hidden', !cancellable);
}

function renderAll() {
  renderBoardDyn();
  renderPlayers();
  renderHand();
  renderActions();
  renderTop();
  renderBanner();
}

// =========================================================
// מסך פתיחה והתחלת משחק
// =========================================================
let chosenCount = 3;

function buildSetupRows() {
  const el = $('player-rows');
  el.innerHTML = '';
  for (let i = 0; i < chosenCount; i++) {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `
      <span class="color-dot" style="background:${PLAYER_COLORS[i].hex}"></span>
      <input type="text" id="pname-${i}" value="${i === 0 ? 'אני' : ['דולב', 'ארז-ברז', 'אליהו'][i - 1]}" maxlength="14">
      <select id="ptype-${i}">
        <option value="human" ${i === 0 ? 'selected' : ''}>👤 אדם</option>
        <option value="ai" ${i === 0 ? '' : 'selected'}>🤖 מחשב</option>
      </select>`;
    el.appendChild(row);
  }
}

function startGame() {
  const players = [];
  for (let i = 0; i < chosenCount; i++) {
    const name = $('pname-' + i).value.trim() || ('שחקן ' + (i + 1));
    const isAI = $('ptype-' + i).value === 'ai';
    players.push({
      idx: i, name, isAI,
      color: PLAYER_COLORS[i],
      res: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
      dev: { knight: 0, road: 0, yop: 0, mono: 0, vp: 0 },
      newDev: { knight: 0, road: 0, yop: 0, mono: 0, vp: 0 },
      knightsPlayed: 0,
      roadsLeft: 15, settlementsLeft: 5, citiesLeft: 4
    });
  }

  buildBoard();

  const devDeck = [];
  for (let i = 0; i < 14; i++) devDeck.push('knight');
  for (let i = 0; i < 5; i++) devDeck.push('vp');
  for (let i = 0; i < 2; i++) devDeck.push('road');
  for (let i = 0; i < 2; i++) devDeck.push('yop');
  for (let i = 0; i < 2; i++) devDeck.push('mono');
  shuffle(devDeck);

  state = {
    phase: 'setup',
    players,
    current: 0,
    dice: null,
    hasRolled: false,
    devPlayed: false,
    freeRoads: 0,
    mode: null,
    robberHex: board.hexes.findIndex(h => h.terrain === 'desert'),
    robberDone: null,
    bank: { wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19 },
    devDeck,
    longestRoad: null,
    largestArmy: null,
    roadLens: players.map(() => 0),
    log: [],
    aiActions: 0,
    firstPlayer: 0,
    fx: { edges: new Set(), verts: new Set() },
    viewer: players.findIndex(p => !p.isAI) === -1 ? null : players.findIndex(p => !p.isAI)
  };

  clearSave();
  $('setup-screen').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('end-game-btn').classList.remove('hidden');
  renderBoardStatic();
  log('ברוכים הבאים לקטאן! 🏝️');
  startSetup();
}

// =========================================================
// PWA — מניפסט ואייקונים שנוצרים בזמן ריצה (הכול בקובץ אחד)
// =========================================================
let installEvent = null;

function pwaIcon(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  // רקע ים
  x.fillStyle = '#2e6da4';
  x.fillRect(0, 0, size, size);
  // משושה חול עם מסגרת עץ
  const cx = size / 2, cy = size / 2, R = size * 0.4;
  x.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    const px = cx + R * Math.cos(a), py = cy + R * Math.sin(a);
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }
  x.closePath();
  x.fillStyle = '#e6c245';
  x.fill();
  x.lineWidth = size * 0.045;
  x.strokeStyle = '#8a5a2b';
  x.stroke();
  // האות ק
  x.fillStyle = '#7a1f1f';
  x.font = 'bold ' + Math.round(size * 0.42) + 'px Arial';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('ק', cx, cy + size * 0.03);
  return c.toDataURL('image/png');
}

function initPWA() {
  try {
    const manifest = {
      name: 'קטאן',
      short_name: 'קטאן',
      description: 'משחק לוח של התיישבות, מסחר ובנייה — בעברית',
      lang: 'he',
      dir: 'rtl',
      start_url: location.href.split('#')[0],
      scope: location.href.replace(/[^/]*$/, ''),
      display: 'fullscreen',
      orientation: 'landscape',
      background_color: '#5b3a22',
      theme_color: '#2c1a0c',
      icons: [
        { src: pwaIcon(192), sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: pwaIcon(512), sizes: '512x512', type: 'image/png', purpose: 'any' }
      ]
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    $('manifest-link').href = URL.createObjectURL(blob);
    // אייקון ל-iOS (שם ההתקנה היא דרך תפריט השיתוף)
    const ap = document.createElement('link');
    ap.rel = 'apple-touch-icon';
    ap.href = pwaIcon(180);
    document.head.appendChild(ap);
  } catch (e) { /* סביבה בלי Canvas או Blob — מוותרים על ההתקנה */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    // לא מבטלים את הבאנר של הדפדפן; שומרים את האירוע גם לכפתור שלנו
    installEvent = e;
    const b = $('install-btn');
    if (b) b.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => {
    const b = $('install-btn');
    if (b) b.classList.add('hidden');
  });
}


// =========================================================
// סאונד — Web Audio API (טונים סינתטיים, בלי קבצים חיצוניים)
// =========================================================
let audioCtx = null;
let soundOn = true;

function getAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq, dur, type = 'sine', vol = 0.15) {
  if (!soundOn) return;
  const ctx = getAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}

function playSequence(notes) {
  if (!soundOn) return;
  notes.forEach(n => setTimeout(() => playTone(n.f, n.d, n.t || 'sine', n.v || 0.15), n.delay || 0));
}

const SOUNDS = {
  dice: () => playSequence([
    {f: 200, d: 0.08, t: 'square', v: 0.1},
    {f: 180, d: 0.06, t: 'square', v: 0.08, delay: 90},
    {f: 160, d: 0.05, t: 'square', v: 0.06, delay: 170}
  ]),
  build: () => playTone(440, 0.12, 'triangle', 0.12),
  city: () => playSequence([
    {f: 440, d: 0.1, t: 'triangle', v: 0.12},
    {f: 660, d: 0.12, t: 'triangle', v: 0.12, delay: 100}
  ]),
  trade: () => playSequence([
    {f: 523, d: 0.08, t: 'sine', v: 0.1},
    {f: 659, d: 0.08, t: 'sine', v: 0.1, delay: 80},
    {f: 784, d: 0.1, t: 'sine', v: 0.1, delay: 160}
  ]),
  dev: () => playTone(300, 0.15, 'sawtooth', 0.08),
  knight: () => playSequence([
    {f: 150, d: 0.1, t: 'sawtooth', v: 0.1},
    {f: 100, d: 0.15, t: 'sawtooth', v: 0.1, delay: 100}
  ]),
  robber: () => playTone(80, 0.3, 'sawtooth', 0.12),
  win: () => playSequence([
    {f: 523, d: 0.15, t: 'triangle', v: 0.15},
    {f: 659, d: 0.15, t: 'triangle', v: 0.15, delay: 150},
    {f: 784, d: 0.15, t: 'triangle', v: 0.15, delay: 300},
    {f: 1047, d: 0.4, t: 'triangle', v: 0.15, delay: 450}
  ]),
  click: () => playTone(800, 0.03, 'sine', 0.05)
};

// =========================================================
// שמירת משחק — localStorage
// =========================================================
const SAVE_KEY = 'katan_save';

function saveGame() {
  if (!state || state.phase === 'ended') return;
  try {
    const save = JSON.parse(JSON.stringify(state));
    // Sets לא שורדים JSON — נהפוך למערכים
    if (save.fx) {
      save.fx = { edges: [...state.fx.edges], verts: [...state.fx.verts] };
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (e) { /* שמירה נכשלה — לא קריטי */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved.fx) {
      saved.fx = { edges: new Set(saved.fx.edges || []), verts: new Set(saved.fx.verts || []) };
    }
    return saved;
  } catch (e) { return null; }
}

function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

function hasSave() {
  return !!localStorage.getItem(SAVE_KEY);
}

// =========================================================
// סיום משחק ידני
// =========================================================
function quitGame() {
  showModal(`
    <h2>סיים משחק?</h2>
    <p class="m-sub">המשחק הנוכחי ייעצר וכל ההתקדמות תאבד.</p>
    <div class="m-actions">
      <button class="m-btn" id="q-yes">כן, סיים</button>
      <button class="m-btn" id="q-no">ביטול</button>
    </div>
  `);
  $('q-yes').onclick = () => {
    clearSave();
    // נקה timers של AI
    let maxId = setTimeout(() => {}, 0);
    for (let i = 0; i <= maxId; i++) clearTimeout(i);
    closeModal();
    location.reload();
  };
  $('q-no').onclick = () => closeModal();
}

// ===== חיווט ראשוני =====
document.addEventListener('DOMContentLoaded', () => {
  initPWA();
  const ib = $('install-btn');
  if (ib) ib.onclick = () => {
    if (!installEvent) return;
    try { installEvent.prompt(); } catch (e) {}
    installEvent = null;
    ib.classList.add('hidden');
  };
  buildSetupRows();
  document.querySelectorAll('#pcount button').forEach(b => {
    b.onclick = () => {
      chosenCount = +b.dataset.n;
      document.querySelectorAll('#pcount button').forEach(x => x.classList.toggle('active', x === b));
      buildSetupRows();
    };
  });
  $('start-btn').onclick = startGame;
  $('roll-btn').onclick = rollDice;

  // כפתור סאונד
  const sb = $('sound-btn');
  if (sb) sb.onclick = () => {
    soundOn = !soundOn;
    sb.textContent = soundOn ? '🔊' : '🔇';
    if (soundOn) SOUNDS.click();
  };

  // כפתור סיים משחק
  const eg = $('end-game-btn');
  if (eg) eg.onclick = quitGame;

  // המשך משחק שמור
  if (hasSave()) {
    const setupCard = document.querySelector('.setup-card');
    if (setupCard) {
      const btn = document.createElement('button');
      btn.className = 'big-btn';
      btn.style.cssText = 'margin-bottom:14px;background:linear-gradient(180deg,#2e6da4,#1a4a7a);';
      btn.textContent = '▶ המשך משחק שמור';
      btn.onclick = () => {
        const saved = loadGame();
        if (!saved) { location.reload(); return; }
        state = saved;
        $('setup-screen').classList.add('hidden');
        $('game').classList.remove('hidden');
        $('end-game-btn').classList.remove('hidden');
        renderBoardStatic();
        renderAll();
        if (cur() && cur().isAI) {
          if (state.phase === 'setup') setTimeout(setupNext, 500);
          else if (state.phase === 'play') setTimeout(aiTurn, 800);
        }
      };
      setupCard.insertBefore(btn, setupCard.firstChild);
    }
  }
  $('cancel-btn').onclick = () => {
    if (['build-road','build-settlement','build-city'].includes(state.mode) && state.freeRoads === 0) {
      state.mode = null;
      renderAll();
    }
  };
});

