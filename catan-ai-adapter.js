/* Catan game adapter for the GPL-3.0 Catanatron-derived search module.
 * Copyright (C) 2026 Avraham's Developer. License: GPL-3.0-only.
 * Simulations never mutate the live board or hands. Only legal actions are returned.
 */
import { chooseAction, computeLongestRoad, numberProbability } from './catan-alphabeta.js';

const R = ['WOOD', 'BRICK', 'SHEEP', 'WHEAT', 'ORE'];
const COST = {
  ROAD: { WOOD: 1, BRICK: 1 },
  SETTLEMENT: { WOOD: 1, BRICK: 1, SHEEP: 1, WHEAT: 1 },
  CITY: { WHEAT: 2, ORE: 3 },
  DEV: { SHEEP: 1, WHEAT: 1, ORE: 1 },
};
const cardTypes = ['knight', 'vp', 'road', 'yop', 'mono'];
const cardResources = { forest: 'WOOD', hill: 'BRICK', pasture: 'SHEEP', field: 'WHEAT', mountain: 'ORE' };

export function snapshot(board, game) {
  // The upstream module parses road keys on '-', so coordinates such as '-42,14'
  // cannot be used as node IDs. Map the live game's vertex IDs to stable integers.
  const nodeKeys = Object.keys(board.vertices);
  const ids = new Map(nodeKeys.map((key,i) => [key,i]));
  const buildings = {}, roads = {}, ports = {};
  const nodes = nodeKeys.map((key,i) => {
    const v = board.vertices[key];
    if (v.building) buildings[i] = { ...v.building };
    if (v.port) ports[i] = v.port.toUpperCase();
    return { id: i, hexes: v.hexes.slice(), neighbors: v.adjEdges.map(eid => {
      const e = board.edges[eid];
      return ids.get(e.v1 === key ? e.v2 : e.v1);
    }) };
  });
  const edgeIds = {}, edgePairs = {};
  for (const e of Object.values(board.edges)) {
    const a = ids.get(e.v1), b = ids.get(e.v2);
    const key = edgeKey(a,b);
    edgeIds[key] = e.id;
    edgePairs[key] = [a,b];
    if (e.road != null) roads[key] = e.road;
  }
  const players = game.players.map((p, i) => ({
    id: i, vp: 0, hiddenVp: p.dev.vp + p.newDev.vp,
    resources: Object.fromEntries(R.map(r => [r, p.res[r.toLowerCase()] || 0])),
    devCardsInHand: cardTypes.reduce((n, t) => n + (p.dev[t] || 0) + (p.newDev[t] || 0), 0),
    knightsPlayed: p.knightsPlayed,
    roadsLeft: p.roadsLeft, settlementsLeft: p.settlementsLeft, citiesLeft: p.citiesLeft,
  }));
  const s = {
    hexes: board.hexes.map(h => ({ id: h.id, resource: cardResources[h.terrain] || null, number: h.num })),
    nodes, nodeKeys, buildings, roads, ports, edgeIds, edgePairs,
    robberHex: game.robberHex, players, turnOrder: players.map(p => p.id),
    currentPlayer: game.current, phase: game.phase === 'setup' ? 'initial' : 'build',
    bank: Object.fromEntries(R.map(r => [r, game.bank[r.toLowerCase()] || 0])),
    deck: game.devDeck.length,
    // Never inspect the order of the shuffled deck: a bot cannot know its next card.
    deckCounts: { knight: 14, vp: 5, road: 2, yop: 2, mono: 2 },
    longestRoad: game.longestRoad, largestArmy: game.largestArmy,
    vpsToWin: game.vpTarget || 10, winner: null,
  };
  updateVP(s);
  return s;
}

function edgeKey(a, b) { return a < b ? `${a}-${b}` : `${b}-${a}`; }
function nodeMap(s) { return new Map(s.nodes.map(n => [n.id, n])); }
function affordable(p, cost) { return R.every(r => p.resources[r] >= (cost[r] || 0)); }
function freeNode(s, n, map) {
  return !s.buildings[n.id] && n.neighbors.every(other => !s.buildings[other]) && map.has(n.id);
}
function connected(s, pid, n) { return n.neighbors.some(other => s.roads[edgeKey(n.id, other)] === pid); }
function roadLegal(s, pid, a, b) {
  if (s.roads[edgeKey(a,b)] !== undefined) return false;
  for (const id of [a,b]) {
    const building = s.buildings[id];
    if (building && building.player === pid) return true;
    if (building && building.player !== pid) continue;
    const n = s.nodes.find(node => node.id === id);
    if (connected(s, pid, n)) return true;
  }
  return false;
}
function ratio(s, pid, r) {
  let v = 4;
  for (const [node, port] of Object.entries(s.ports)) if (s.buildings[node]?.player === pid) {
    if (port === r) v = Math.min(v, 2);
    if (port === 'ANY') v = Math.min(v, 3);
  }
  return v;
}
function nearestNeed(s, pid) {
  const p = s.players[pid], map = nodeMap(s);
  const goals = [];
  if (p.citiesLeft && Object.values(s.buildings).some(b => b.player === pid && b.type === 'settlement')) goals.push(COST.CITY);
  if (p.settlementsLeft && s.nodes.some(n => freeNode(s,n,map) && connected(s,pid,n))) goals.push(COST.SETTLEMENT);
  if (p.roadsLeft && Object.keys(s.edgeIds).some(key => {
    const [a,b] = keyToPair(s,key); return roadLegal(s,pid,a,b);
  })) goals.push(COST.ROAD);
  // סחר עם הבנק מממן בנייה בלבד — לא קלף פיתוח.
  return goals;
}
function keyToPair(s,key) { return s.edgePairs[key]; }
function productionAt(s,n) { return n.hexes.reduce((total, id) => {
  const h = s.hexes[id];
  return total + (h.resource && h.id !== s.robberHex ? numberProbability(h.number) : 0);
}, 0); }
export function legalActions(s) {
  const pid = s.currentPlayer, p = s.players[pid];
  if (s.phase === 'initial') {
    const map = nodeMap(s);
    return s.nodes.filter(n => freeNode(s,n,map)).map(n => ({ type: 'SETTLEMENT', node: n.id, free: true }));
  }
  if (s.phase === 'roll') return [{ type: 'ROLL' }];
  const acts = [], map = nodeMap(s);
  if (p.citiesLeft && affordable(p,COST.CITY)) {
    for (const [id,b] of Object.entries(s.buildings))
      if (b.player === pid && b.type === 'settlement') acts.push({ type: 'CITY', node: id });
  }
  if (p.settlementsLeft && affordable(p,COST.SETTLEMENT)) {
    for (const n of s.nodes)
      if (freeNode(s,n,map) && connected(s,pid,n)) acts.push({ type: 'SETTLEMENT', node: n.id });
  }
  if (p.roadsLeft && affordable(p,COST.ROAD)) {
    const options = [];
    for (const key of Object.keys(s.edgeIds)) {
      const [a,b] = keyToPair(s,key);
      if (!roadLegal(s,pid,a,b)) continue;
      const nn = [map.get(a),map.get(b)];
      const score = Math.max(...nn.map(n => {
        const direct = freeNode(s,n,map) ? productionAt(s,n)+1 : 0;
        const next = Math.max(0,...n.neighbors
          .filter(other => s.roads[edgeKey(n.id,other)] === undefined && freeNode(s,map.get(other),map))
          .map(other => productionAt(s,map.get(other)) * 0.7));
        return direct + next;
      }));
      // אין טעם לבנות דרך שלא פותחת שום צומת בנייה — היא רק שורפת משאבים
      if (score > 0) options.push({ type: 'ROAD', edge: key, score });
    }
    options.sort((a,b) => b.score - a.score);
    acts.push(...options.slice(0,12).map(({ type,edge }) => ({ type,edge })));
  }
  // קלף פיתוח נקנה בלוגיקה הקלאסית של המשחק; החיפוש מחליט רק על בנייה והרחבה.
  // Only trades toward a buildable goal, and never exchange the same resource.
  const wanted = new Set();
  for (const goal of nearestNeed(s,pid))
    for (const r of R) if (p.resources[r] < (goal[r] || 0)) wanted.add(r);
  for (const get of wanted) if (s.bank[get] > 0) {
    for (const give of R) if (give !== get && p.resources[give] >= ratio(s,pid,give)) {
      const r = ratio(s,pid,give);
      // סחר 4:1 עם הבנק מותר רק אם הוא משלים בנייה מידית; נמלים (2:1/3:1) תמיד כדאיים יותר
      const after = Object.fromEntries(R.map(res =>
        [res, p.resources[res] + (res === get ? 1 : 0) - (res === give ? r : 0)]));
      const completes = [COST.CITY, COST.SETTLEMENT].some(cost =>
        R.every(res => after[res] >= (cost[res] || 0)));
      if (r <= 3 || completes) acts.push({ type: 'TRADE', give, get, ratio: r });
    }
  }
  acts.push({ type: 'END_TURN' });
  return acts;
}
function clone(s) {
  return { ...s, buildings: { ...s.buildings }, roads: { ...s.roads },
    players: s.players.map(p => ({ ...p, resources: { ...p.resources } })),
    bank: { ...s.bank }, deckCounts: { ...s.deckCounts } };
}
function updateVP(s, roadChanged = false) {
  const scores = s.players.map((p,i) => Object.values(s.buildings)
    .reduce((v,b) => v + (b.player === i ? b.type === 'city' ? 2 : 1 : 0),0));
  if (roadChanged) {
    const lens = s.players.map(p => computeLongestRoad(s,p.id));
    let holder = s.longestRoad;
    if (holder != null && lens[holder] < 5) holder = null;
    const needed = holder == null ? 5 : lens[holder] + 1;
    const leaders = lens.map((v,i) => ({v,i})).filter(x => x.v >= needed);
    leaders.sort((a,b) => b.v-a.v);
    if (leaders.length && (leaders.length === 1 || leaders[0].v > leaders[1].v)) holder = leaders[0].i;
    s.longestRoad = holder;
  }
  if (s.longestRoad != null) scores[s.longestRoad] += 2;
  if (s.largestArmy != null) scores[s.largestArmy] += 2;
  s.players.forEach((p,i) => { p.vp = scores[i]; });
  if (s.players[s.currentPlayer].vp + s.players[s.currentPlayer].hiddenVp >= s.vpsToWin) {
    s.winner = s.currentPlayer;
    // The upstream evaluator scores public VPs only; make winning with a hidden
    // victory-point card worth more than a merely promising nonterminal move.
    s.players[s.currentPlayer].vp = Math.max(s.players[s.currentPlayer].vp, s.vpsToWin + 1);
  }
}
function spend(s,p,cost) { for (const [r,n] of Object.entries(cost)) { p.resources[r] -= n; s.bank[r] += n; } }
function step(s,a) {
  const t = clone(s), pid = t.currentPlayer, p = t.players[pid];
  switch(a.type) {
    case 'SETTLEMENT':
      if (!a.free) spend(t,p,COST.SETTLEMENT);
      t.buildings[a.node] = { player: pid, type: 'settlement' };
      p.settlementsLeft--;
      updateVP(t); break;
    case 'CITY':
      spend(t,p,COST.CITY);
      t.buildings[a.node] = { player: pid, type: 'city' };
      p.citiesLeft--; p.settlementsLeft++;
      updateVP(t); break;
    case 'ROAD':
      spend(t,p,COST.ROAD);
      t.roads[a.edge] = pid; p.roadsLeft--;
      updateVP(t,true); break;
    case 'TRADE':
      p.resources[a.give] -= a.ratio; t.bank[a.give] += a.ratio;
      p.resources[a.get]++; t.bank[a.get]--;
      break;
    case 'END_TURN':
      t.currentPlayer = (pid+1) % t.players.length; t.phase = 'roll'; break;
    case 'ROLL':
      // Handled as a chance spectrum below.
      break;
    case 'DEV':
      // Handled as a chance spectrum below.
      break;
  }
  return t;
}
function roll(s,number) {
  const t = clone(s); t.phase='build';
  if (number === 7) {
    // Estimate 7's discard effect without inventing a deterministic robber steal.
    for (const p of t.players) {
      let n = R.reduce((sum,r) => sum+p.resources[r],0);
      if (n <= 7) continue;
      const discard = Math.floor(n/2);
      for (let j=0;j<discard;j++) {
        const r = R.reduce((best,x) => p.resources[x] > p.resources[best] ? x : best);
        p.resources[r]--; t.bank[r]++;
      }
    }
  } else {
    for (const h of t.hexes) if (h.number === number && h.id !== t.robberHex && h.resource) {
      for (const [id,b] of Object.entries(t.buildings)) {
        if (t.nodes[Number(id)].hexes.includes(h.id)) {
          const amount = b.type === 'city' ? 2 : 1;
          const award = Math.min(t.bank[h.resource],amount);
          t.bank[h.resource] -= award;
          t.players[b.player].resources[h.resource] += award;
        }
      }
    }
  }
  return t;
}
export function applyAction(s,a) {
  if (a.type === 'ROLL') return Array.from({length:11},(_,i) => ({
    state: roll(s,i+2), p: numberProbability(i+2)
  }));
  if (a.type === 'DEV') {
    if (!s.deck) return step(s,{type:'END_TURN'});
    return cardTypes.filter(card => s.deckCounts[card] > 0).map(card => {
      const t=clone(s), p=t.players[t.currentPlayer];
      spend(t,p,COST.DEV); t.deck--; t.deckCounts[card]--;
      p.devCardsInHand++;
      if (card === 'vp') p.hiddenVp++;
      updateVP(t);
      return { state:t, p:s.deckCounts[card]/cardTypes.reduce((n,c) => n+s.deckCounts[c],0) };
    });
  }
  return step(s,a);
}

export function chooseGameAction(board,game, setup = false) {
  const s = snapshot(board,game);
  const opts = { depth: setup ? 1 : 2, botId: game.current,
    vpsToWin: game.vpTarget || 10, maxTimeMs: setup ? 150 : 120,
    // Pruning in Catanatron assumes its own action types and phases.
    prune: false };
  const chosen = chooseAction(s, legalActions, applyAction, opts);
  if (!chosen) return null;
  if (chosen.node !== undefined) return { ...chosen, node: s.nodeKeys[chosen.node] };
  if (chosen.edge !== undefined) return { ...chosen, edge: s.edgeIds[chosen.edge] };
  return chosen;
}
