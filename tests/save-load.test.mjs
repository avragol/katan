// בדיקות שמירה/טעינה של משחק — saveGame/loadGame/hasSave/clearSave
// מריץ את בלוק השמירה מ-game.js בתוך סביבת Node עם localStorage מדומה.
import { readFileSync } from 'node:fs';

const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); process.exit(1); }
};

const src = readFileSync(new URL('../game.js', import.meta.url), 'utf8');
const start = src.indexOf('const SAVE_KEY');
const end = src.indexOf('function quitGame');
assert(start > 0 && end > start, 'save block extraction bounds');

const code = src.slice(start, end);

// localStorage מדומה
function mockStorage() {
  const m = new Map();
  return {
    setItem: (k, v) => m.set(k, String(v)),
    getItem: k => (m.has(k) ? m.get(k) : null),
    removeItem: k => m.delete(k),
    _map: m,
  };
}

function makeHarness(state, board, elapsed) {
  const storage = mockStorage();
  const api = new Function('localStorage', 'state', 'board', 'getElapsed',
    code + '\nreturn { saveGame, loadGame, hasSave, clearSave };')(
    storage, state, board, () => elapsed);
  return { storage, api };
}

// 1. שמירה: מופיעה ב-localStorage כפורמט v2 עם state ו-board
let h = makeHarness(
  { phase: 'play', vpTarget: 10, players: [{ name: 'אני', res: { wood: 2 } }], fx: { edges: new Set(['a|b']), verts: new Set(['x,y']) }, log: ['התחלה'] },
  { hexes: [{ q: 0, r: 0, terrain: 'wood', num: 5, verts: ['x,y'] }], vertices: { 'x,y': { id: 'x,y', building: { player: 0 } } } },
  137
);
h.api.saveGame();
assert(h.api.hasSave(), '1. hasSave true after save');
let stored = JSON.parse(h.storage._map.get('katan_save'));
assert(stored.v === 2 && stored.state && stored.board, '1. stored as v2 with state+board');
assert(stored.state.fx.edges[0] === 'a|b', '1. fx Set serialized to array');
assert(stored.state.elapsedAtSave === 137, '1. elapsed time captured');
assert(stored.board.hexes[0].num === 5, '1. board snapshot included');

// 2. הלוך-וחזור: הפרמטרים משוחזרים, fx חוזר להיות Sets, והבניינים על הלוח נשמרים
const round = h.api.loadGame();
assert(round && round.v === 2, '2. load returns v2 save');
assert(round.state.players[0].res.wood === 2, '2. state fields restored');
assert(round.state.fx.edges instanceof Set && round.state.fx.verts instanceof Set, '2. fx restored as Sets');
assert(round.state.fx.edges.has('a|b'), '2. fx contents restored');
assert(round.board.vertices['x,y'].building.player === 0, '2. on-board buildings restored');
assert(JSON.stringify(round.board) === JSON.stringify(stored.board), '2. board round-trip identical');

// 3. פורמט ישן (state בלבד, בלי board) — נדחה ונמחק
let h2 = makeHarness(null, null, 0);
h2.storage._map.set('katan_save', JSON.stringify({ phase: 'play', players: [] }));
const legacy = h2.api.loadGame();
assert(legacy === null, '3. legacy save rejected');
assert(!h2.storage._map.has('katan_save'), '3. legacy save removed');

// 4. JSON שבור — null בלי קריסה
h2.storage._map.set('katan_save', '{oops');
assert(h2.api.loadGame() === null, '4. corrupt JSON returns null');

// 5. שמירה בזמן שלב "ended" לא נכתבת
let h3 = makeHarness({ phase: 'ended', fx: null }, { hexes: [] }, 0);
h3.api.saveGame();
assert(!h3.api.hasSave(), '5. no save for ended game');

// 6. clearSave מנקה
let h4 = makeHarness({ phase: 'play', fx: null }, { hexes: [] }, 0);
h4.api.saveGame();
h4.api.clearSave();
assert(!h4.api.hasSave(), '6. clearSave empties storage');

console.log('Save/Load: 6/6 OK');
