/**
 * catan-alphabeta.js - local, dependency-free port of Catanatron's AlphaBetaPlayer
 * (expectiminimax with alpha-beta cutoffs, default depth 2) and its base value function.
 *
 * SOURCE
 *   Repo:   https://github.com/bcollazo/catanatron  (master @ 82aae93ab1f7c267218be0566df573ce477ec3d8)
 *   Files:  catanatron/catanatron/players/minimax.py          (AlphaBetaPlayer.alphabeta / decide)
 *           catanatron/catanatron/players/value.py            (base_fn, DEFAULT_WEIGHTS, value_production)
 *           catanatron/catanatron/players/tree_search_utils.py (execute_spectrum, list_prunned_actions)
 *           catanatron/catanatron/features.py                  (production / reachability / hand features)
 *           catanatron/catanatron/models/board.py              (buildable nodes, connected components)
 *
 * LICENSE - READ THIS
 *   Catanatron is licensed under GPL-3.0. This file is a faithful port (same algorithm,
 *   same feature terms, same weights), so it is a derivative work and is itself GPL-3.0.
 *   If you ship it in your game (including a public GitHub Pages site), the practical effect is:
 *     - your game's JS that includes/links this module should be released under GPL-3.0
 *       (source is already visible on GitHub Pages, but you also need the license text,
 *       notices, and to not add extra restrictions);
 *     - keep this header and credit to Bruno Collazo / Catanatron.
 *   If you cannot accept GPL for your game, do not ship this file - write your own
 *   evaluator from scratch instead. (Not legal advice.)
 *
 * WHAT IS PORTED (faithfully)
 *   - Search: AlphaBetaPlayer.alphabeta. Every single action is one ply (depth 2 = two actions,
 *     not two turns). Max nodes when the side to move is the bot, min nodes otherwise.
 *     Each action expands to [(state, probability)] outcomes (chance nodes: dice rolls,
 *     dev-card draws, robber steals) and the node value is the probability-weighted average.
 *     Alpha/beta are passed into chance children unchanged and cutoffs happen at the
 *     action loop, exactly as in the Python code. 20s time limit -> evaluate as leaf.
 *   - Value function: base_fn(DEFAULT_WEIGHTS) with all 13 terms (see WEIGHTS below).
 *   - Optional pruning (Catanatron's `prunning=True`, off by default like the original).
 *
 * NOTES ON THE ORIGINAL VALUE FUNCTION (so you are not surprised)
 *   - It only looks at ONE enemy: the next player after the bot in turn order.
 *   - It has no enemy-VP or enemy-longest-road term. "Blocking" is valued only through
 *     your own VPs (e.g. taking Longest Road = +2 public VP), enemy production, and your
 *     own reachable spots. Ports are not scored by the value fn (only used in pruning).
 *   - "hand diversity" = hand_synergy (distance to a city and to a settlement).
 *
 * =====================================================================================
 * ADAPTER - what YOUR game must provide
 * =====================================================================================
 *
 * 1) STATE SHAPE (plain object; build it from your game's state, or keep your game in it)
 *
 *   {
 *     hexes: [ { id, resource: 'WOOD'|'BRICK'|'SHEEP'|'WHEAT'|'ORE'|null, number: 2..12|null } ],
 *        // resource null = desert. Only land hexes.
 *     nodes: [ { id, hexes: [hexId,...], neighbors: [nodeId,...] } ],
 *        // every intersection touching at least one land hex. Static topology; reuse the
 *        // SAME array object across states (it is cached by identity). Edge = neighbor pair.
 *     buildings: { [nodeId]: { player: playerId, type: 'settlement'|'city' } },
 *     roads:     { ['a-b' with a<b]: playerId },          // use edgeKey(a, b)
 *     robberHex: hexId,
 *     players: [ {
 *        id,
 *        vp,                // PUBLIC victory points (buildings + longest road + largest army),
 *                           // NOT counting hidden VP dev cards
 *        hiddenVp: 0,       // VP dev cards in hand (only used to detect a win)
 *        resources: { WOOD, BRICK, SHEEP, WHEAT, ORE },   // counts
 *        devCardsInHand,    // count of unplayed dev cards (incl. VP cards)
 *        knightsPlayed,     // played knight cards
 *        longestRoadLength  // OPTIONAL: your own computed length; if omitted we compute it
 *     } ],
 *     turnOrder: [playerId,...],     // seating order (enemy = next after bot)
 *     currentPlayer: playerId,       // whose decision it is in THIS state
 *     winner: playerId|null          // OPTIONAL; else win = vp+hiddenVp >= opts.vpsToWin
 *   }
 *   Extra fields are fine (e.g. your own game object) - they are carried through untouched.
 *
 * 2) legalActions(state) -> Action[]
 *    Your game's own move generator for whoever is `state.currentPlayer`.
 *    Action objects can be anything your game understands.
 *
 * 3) applyAction(state, action) -> nextState  |  [ { state, p }, ... ]
 *    Your game's own rules. MUST NOT mutate `state` (return a copy), or pass
 *    opts.clone (e.g. structuredClone) so we copy before calling you.
 *    For random actions return the outcome spectrum. Helpers below build them the same
 *    way Catanatron does:
 *      rollOutcomes(state, action, (s, a, dice:[d1,d2]) => nextState)      // 11 sums, 1/36..6/36
 *      stealOutcomes(state, action, victimId, (s, a, resource) => next)    // 5 x 1/5
 *      devCardOutcomes(state, action, unknownDeck:{KNIGHT:n,...}, (s, a, card) => next)
 *    Returning a plain state = deterministic action (probability 1).
 *
 * 4) OPTIONAL opts.describeAction(action) -> { type, node?, hex?, victim?, ratio? }
 *    Only needed if you turn on opts.prune. type is one of Catanatron's names:
 *    'BUILD_SETTLEMENT', 'MARITIME_TRADE', 'MOVE_ROBBER', ... ; ratio = 2|3|4 for trades;
 *    also set state.phase = 'initial' during the setup placements.
 *
 * USAGE
 *   import { chooseAction } from './catan-alphabeta.js';
 *   const action = chooseAction(state, legalActions, applyAction, { depth: 2 });
 *   myGame.perform(action);
 *
 *   Options: { depth=2, weights=DEFAULT_WEIGHTS, botId=state.currentPlayer, maxTimeMs=20000,
 *              vpsToWin=10, prune=false, describeAction, clone, epsilon=null }
 *   Depth 2 is usually fast (<1s); 3 can get slow when many roads/trades are legal.
 */

// ------------------------------------------------------------------------------------
// Weights (value.py DEFAULT_WEIGHTS) - unchanged
// ------------------------------------------------------------------------------------
export const DEFAULT_WEIGHTS = Object.freeze({
  // Where to place. Note winning is best at all costs
  public_vps: 3e14,
  production: 1e8,
  enemy_production: -1e8,
  num_tiles: 1,
  // Towards where to expand and when
  reachable_production_0: 0,
  reachable_production_1: 1e4,
  buildable_nodes: 1e3,
  longest_road: 10,
  // Hand, when to hold and when to use.
  hand_synergy: 1e2,
  hand_resources: 1,
  discard_penalty: -5,
  hand_devs: 10,
  army_size: 10.1,
});

// value.py CONTENDER_WEIGHTS (Catanatron's "C" variant), included for completeness.
export const CONTENDER_WEIGHTS = Object.freeze({
  public_vps: 300000000000001.94,
  production: 100000002.04188395,
  enemy_production: -99999998.03389844,
  num_tiles: 2.91440418,
  reachable_production_0: 2.03820085,
  reachable_production_1: 10002.018773150001,
  buildable_nodes: 1001.86278466,
  longest_road: 12.127388499999999,
  hand_synergy: 102.40606877,
  hand_resources: 2.43644327,
  discard_penalty: -3.00141993,
  hand_devs: 10.721669799999999,
  army_size: 12.93844622,
});

export const RESOURCES = ['WOOD', 'BRICK', 'SHEEP', 'WHEAT', 'ORE'];
const TRANSLATE_VARIETY = 4; // each new resource is like 4 production points
const DEFAULT_DEPTH = 2;
const MAX_SEARCH_TIME_MS = 20000;

export function edgeKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Probability of rolling `number` with 2d6 (models/map.py number_probability). */
export function numberProbability(number) {
  if (number == null || number < 2 || number > 12) return 0;
  return (6 - Math.abs(7 - number)) / 36;
}

// ------------------------------------------------------------------------------------
// Static topology cache (per `state.nodes` array identity)
// ------------------------------------------------------------------------------------
const topoCache = new WeakMap();
function topo(state) {
  let t = topoCache.get(state.nodes);
  if (t && t.hexesRef === state.hexes) return t;
  const hexById = new Map(state.hexes.map((h) => [h.id, h]));
  const nodeById = new Map();
  const nodeProduction = new Map(); // nodeId -> {RES: proba} (robber ignored)
  for (const n of state.nodes) {
    nodeById.set(n.id, n);
    const prod = {};
    for (const hid of n.hexes) {
      const h = hexById.get(hid);
      if (h && h.resource) prod[h.resource] = (prod[h.resource] || 0) + numberProbability(h.number);
    }
    nodeProduction.set(n.id, prod);
  }
  t = { hexesRef: state.hexes, hexById, nodeById, nodeProduction };
  topoCache.set(state.nodes, t);
  return t;
}

const playerById = (state, id) => state.players.find((p) => p.id === id);
const buildingAt = (state, nodeId) => state.buildings[nodeId] || null;
const roadOwner = (state, a, b) => {
  const o = state.roads[edgeKey(a, b)];
  return o === undefined ? null : o;
};
const isEnemyNode = (state, nodeId, pid) => {
  const b = buildingAt(state, nodeId);
  return !!b && b.player !== pid;
};

function playerBuildings(state, pid, type) {
  const out = [];
  for (const k of Object.keys(state.buildings)) {
    const b = state.buildings[k];
    if (b && b.player === pid && (!type || b.type === type)) out.push(nodeKeyToId(state, k));
  }
  return out;
}
function nodeKeyToId(state, k) {
  // object keys are strings; recover the original id type
  const t = topo(state);
  if (t.nodeById.has(k)) return k;
  const n = Number(k);
  return t.nodeById.has(n) ? n : k;
}

/** Board-buildable nodes: empty and no building on a neighbor (distance rule). */
function boardBuildableIds(state) {
  const out = [];
  for (const n of state.nodes) {
    if (buildingAt(state, n.id)) continue;
    if (n.neighbors.some((m) => buildingAt(state, m))) continue;
    out.push(n.id);
  }
  return out;
}

/**
 * Connected components of a player's network (board.py connected_components):
 * start from own buildings and walk own roads; enemy-occupied nodes stop the walk.
 */
function connectedComponents(state, pid) {
  const t = topo(state);
  const starts = new Set(playerBuildings(state, pid));
  for (const k of Object.keys(state.roads)) {
    if (state.roads[k] !== pid) continue;
    const [a, b] = k.split('-');
    for (const x of [a, b]) {
      const id = nodeKeyToId(state, x);
      if (!isEnemyNode(state, id, pid)) starts.add(id);
    }
  }
  const seen = new Set();
  const comps = [];
  for (const s of starts) {
    if (seen.has(s)) continue;
    const comp = new Set();
    const stack = [s];
    while (stack.length) {
      const n = stack.pop();
      if (seen.has(n)) continue;
      seen.add(n);
      comp.add(n);
      if (isEnemyNode(state, n, pid)) continue;
      for (const m of t.nodeById.get(n).neighbors) {
        if (!seen.has(m) && roadOwner(state, n, m) === pid && !isEnemyNode(state, m, pid)) stack.push(m);
      }
    }
    comps.push(comp);
  }
  return comps;
}

/** Longest continuous road (edges), not passing through enemy buildings. */
export function computeLongestRoad(state, pid) {
  const t = topo(state);
  const adj = new Map();
  for (const k of Object.keys(state.roads)) {
    if (state.roads[k] !== pid) continue;
    const [a0, b0] = k.split('-');
    const a = nodeKeyToId(state, a0), b = nodeKeyToId(state, b0);
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push([b, k]);
    adj.get(b).push([a, k]);
  }
  let best = 0;
  const used = new Set();
  const dfs = (n, len, isStart) => {
    if (len > best) best = len;
    if (!isStart && isEnemyNode(state, n, pid)) return;
    for (const [m, k] of adj.get(n) || []) {
      if (used.has(k)) continue;
      used.add(k);
      dfs(m, len + 1, false);
      used.delete(k);
    }
  };
  for (const n of adj.keys()) dfs(n, 0, true);
  void t;
  return best;
}

// ------------------------------------------------------------------------------------
// Features (features.py)
// ------------------------------------------------------------------------------------
function effectiveProduction(state, pid) {
  // build_production_features(consider_robber=True)
  const t = topo(state);
  const prod = { WOOD: 0, BRICK: 0, SHEEP: 0, WHEAT: 0, ORE: 0 };
  for (const k of Object.keys(state.buildings)) {
    const b = state.buildings[k];
    if (!b || b.player !== pid) continue;
    const mult = b.type === 'city' ? 2 : 1;
    const node = t.nodeById.get(nodeKeyToId(state, k));
    for (const hid of node.hexes) {
      if (hid === state.robberHex) continue;
      const h = t.hexById.get(hid);
      if (h && h.resource) prod[h.resource] += mult * numberProbability(h.number);
    }
  }
  return prod;
}

/** value.py value_production */
export function valueProduction(prod, includeVariety = true) {
  const probaPoint = 2.778 / 100;
  let sum = 0, variety = 0;
  for (const r of RESOURCES) {
    sum += prod[r];
    if (prod[r] !== 0) variety += 1;
  }
  return sum + (includeVariety ? variety * TRANSLATE_VARIETY * probaPoint : 0);
}

function countProduction(nodes, state) {
  const t = topo(state);
  let total = 0;
  for (const n of nodes) {
    const p = t.nodeProduction.get(n);
    for (const r in p) total += p[r];
  }
  return total;
}

/** reachability_features for P0 only (the only player base_fn reads), levels 0 and 1. */
function reachability(state, pid, levels = 2) {
  const t = topo(state);
  const boardBuildable = boardBuildableIds(state); // buildable_node_ids(p0, initial=True)
  const ownedOrBuildable = new Set([...playerBuildings(state, pid), ...boardBuildable]);
  const zero = new Set();
  for (const c of connectedComponents(state, pid)) for (const n of c) zero.add(n);
  const inter = (s) => [...s].filter((n) => ownedOrBuildable.has(n));
  const out = [countProduction(inter(zero), state)];
  let last = zero;
  for (let level = 1; level <= levels; level++) {
    const levelNodes = new Set(last);
    for (const n of last) {
      if (isEnemyNode(state, n, pid)) continue;
      for (const m of t.nodeById.get(n).neighbors) {
        const o = roadOwner(state, n, m);
        if (o === null || o === pid) levelNodes.add(m); // edge not in enemy_roads
      }
    }
    out.push(countProduction(inter(levelNodes), state));
    last = levelNodes;
  }
  return out; // [reach0, reach1, reach2]
}

function nextPlayerAfter(state, pid) {
  const order = state.turnOrder || state.players.map((p) => p.id);
  const i = order.indexOf(pid);
  return order[(i + 1) % order.length];
}

/**
 * base_fn(DEFAULT_WEIGHTS)(game, p0) - heuristic value of `state` for player `pid`.
 * Returns { value, terms } when `explain` is true.
 */
export function evaluate(state, pid, weights = DEFAULT_WEIGHTS, explain = false) {
  const me = playerById(state, pid);
  const enemyId = nextPlayerAfter(state, pid);

  const production = valueProduction(effectiveProduction(state, pid), true);
  const enemyProduction = enemyId === pid ? 0 : valueProduction(effectiveProduction(state, enemyId), false);

  const longestRoadLength = me.longestRoadLength != null ? me.longestRoadLength : computeLongestRoad(state, pid);

  const [reach0, reach1] = reachability(state, pid, 2);

  const hand = me.resources || {};
  const h = (r) => hand[r] || 0;
  const distanceToCity = (Math.max(2 - h('WHEAT'), 0) + Math.max(3 - h('ORE'), 0)) / 5.0;
  const distanceToSettlement =
    (Math.max(1 - h('WHEAT'), 0) + Math.max(1 - h('SHEEP'), 0) + Math.max(1 - h('BRICK'), 0) + Math.max(1 - h('WOOD'), 0)) / 4.0;
  const handSynergy = (2 - distanceToCity - distanceToSettlement) / 2;

  const numInHand = RESOURCES.reduce((s, r) => s + h(r), 0);
  const discardPenalty = numInHand > 7 ? weights.discard_penalty : 0;

  const t = topo(state);
  const ownedTiles = new Set();
  for (const n of playerBuildings(state, pid)) for (const hid of t.nodeById.get(n).hexes) ownedTiles.add(hid);
  const numTiles = ownedTiles.size;

  // buildable_node_ids(p0) (non-initial): network nodes that pass the distance rule
  const bb = new Set(boardBuildableIds(state));
  const net = new Set();
  for (const c of connectedComponents(state, pid)) for (const n of c) if (bb.has(n)) net.add(n);
  const numBuildableNodes = net.size;
  const longestRoadFactor = numBuildableNodes === 0 ? weights.longest_road : 0.1;

  const terms = {
    public_vps: (me.vp || 0) * weights.public_vps,
    production: production * weights.production,
    enemy_production: enemyProduction * weights.enemy_production,
    reachable_production_0: reach0 * weights.reachable_production_0,
    reachable_production_1: reach1 * weights.reachable_production_1,
    hand_synergy: handSynergy * weights.hand_synergy,
    buildable_nodes: numBuildableNodes * weights.buildable_nodes,
    num_tiles: numTiles * weights.num_tiles,
    hand_resources: numInHand * weights.hand_resources,
    discard_penalty: discardPenalty,
    longest_road: longestRoadLength * longestRoadFactor,
    hand_devs: (me.devCardsInHand || 0) * weights.hand_devs,
    army_size: (me.knightsPlayed || 0) * weights.army_size,
  };
  let value = 0;
  for (const k in terms) value += terms[k];
  return explain ? { value, terms } : value;
}

// ------------------------------------------------------------------------------------
// Chance-node helpers (tree_search_utils.py execute_spectrum)
// ------------------------------------------------------------------------------------
/** ROLL: 11 outcomes, one representative dice pair per sum, weighted by 2d6 probability. */
export function rollOutcomes(state, action, applyWithDice) {
  const out = [];
  for (let roll = 2; roll <= 12; roll++) {
    const dice = [Math.floor(roll / 2), Math.ceil(roll / 2)];
    out.push({ state: applyWithDice(state, action, dice), p: numberProbability(roll) });
  }
  return out;
}

/** MOVE_ROBBER with a victim: 5 outcomes at 1/5 (Catanatron's simplification). */
export function stealOutcomes(state, action, victimId, applyWithStolen) {
  const victim = victimId == null ? null : playerById(state, victimId);
  const handSize = victim ? RESOURCES.reduce((s, r) => s + ((victim.resources || {})[r] || 0), 0) : 0;
  if (!victim || handSize === 0) return [{ state: applyWithStolen(state, action, null), p: 1 }];
  return RESOURCES.map((r) => {
    let s;
    try { s = applyWithStolen(state, action, r); } catch (e) { s = state; } // "flattened" like the original
    return { state: s, p: 1 / 5 };
  });
}

/** BUY_DEVELOPMENT_CARD: one outcome per card type in the unseen deck (deck + enemy hands). */
export function devCardOutcomes(state, action, unknownDeck, applyWithCard) {
  const total = Object.values(unknownDeck).reduce((a, b) => a + b, 0);
  const out = [];
  for (const card of Object.keys(unknownDeck)) {
    if (!unknownDeck[card]) continue;
    let s;
    try { s = applyWithCard(state, action, card); } catch (e) { s = state; }
    out.push({ state: s, p: unknownDeck[card] / total });
  }
  return out;
}

// ------------------------------------------------------------------------------------
// Pruning (list_prunned_actions) - optional
// ------------------------------------------------------------------------------------
function pruneActions(state, actions, ctx) {
  const d = ctx.describeAction;
  if (!d) return actions;
  const t = topo(state);
  let acts = actions;
  const types = new Set(acts.map((a) => d(a).type));
  if (types.has('BUILD_SETTLEMENT') && state.phase === 'initial') {
    acts = acts.filter((a) => {
      const i = d(a);
      return i.type !== 'BUILD_SETTLEMENT' || t.nodeById.get(i.node).hexes.length !== 1;
    });
  }
  if (types.has('MARITIME_TRADE')) {
    const hasThree = acts.some((a) => { const i = d(a); return i.type === 'MARITIME_TRADE' && i.ratio === 3; }) ||
      !!(ctx.hasThreeToOne && ctx.hasThreeToOne(state));
    if (hasThree) acts = acts.filter((a) => { const i = d(a); return !(i.type === 'MARITIME_TRADE' && i.ratio === 4); });
  }
  if (types.has('MOVE_ROBBER')) {
    const me = state.currentPlayer;
    const enemy = state.players.find((p) => p.id !== me).id; // first other color, as original
    const enemyTiles = new Set();
    for (const n of playerBuildings(state, enemy)) for (const h of t.nodeById.get(n).hexes) enemyTiles.add(h);
    const robber = acts.filter((a) => { const i = d(a); return i.type === 'MOVE_ROBBER' && enemyTiles.has(i.hex); });
    if (robber.length) {
      // NOTE: the original compares P1 production (with variety) minus own production after the move.
      const impact = (a) => {
        const outs = expand(state, a, ctx);
        const s = outs[0].state;
        return valueProduction(effectiveProduction(s, nextPlayerAfter(s, me)), true) - valueProduction(effectiveProduction(s, me), true);
      };
      let best = robber[0], bestV = -Infinity;
      for (const a of robber) { const v = impact(a); if (v > bestV) { bestV = v; best = a; } }
      acts = acts.filter((a) => d(a).type !== 'MOVE_ROBBER' || a === best);
    }
  }
  return acts;
}

// ------------------------------------------------------------------------------------
// Search (minimax.py AlphaBetaPlayer)
// ------------------------------------------------------------------------------------
function expand(state, action, ctx) {
  const input = ctx.clone ? ctx.clone(state) : state;
  const r = ctx.applyAction(input, action);
  if (Array.isArray(r)) return r.map((o) => ({ state: o.state, p: o.p != null ? o.p : o.proba }));
  return [{ state: r, p: 1 }];
}

function isTerminal(state, ctx) {
  if (state.winner != null) return true;
  return state.players.some((p) => (p.vp || 0) + (p.hiddenVp || 0) >= ctx.vpsToWin);
}

function getActions(state, ctx) {
  const acts = ctx.legalActions(state);
  return ctx.prune ? pruneActions(state, acts, ctx) : acts;
}

function alphabeta(state, depth, alpha, beta, ctx) {
  if (depth === 0 || isTerminal(state, ctx) || Date.now() >= ctx.deadline) {
    ctx.stats.leaves++;
    return [null, evaluate(state, ctx.botId, ctx.weights)];
  }
  const maximizing = state.currentPlayer === ctx.botId;
  const actions = getActions(state, ctx);
  if (!actions || actions.length === 0) return [null, evaluate(state, ctx.botId, ctx.weights)];
  ctx.stats.nodes++;

  let bestAction = null;
  let bestValue = maximizing ? -Infinity : Infinity;
  for (const action of actions) {
    const outcomes = expand(state, action, ctx);
    let expected = 0;
    for (const { state: child, p } of outcomes) {
      expected += p * alphabeta(child, depth - 1, alpha, beta, ctx)[1];
    }
    if (ctx.trace && depth === ctx.depth) ctx.trace.push({ action, value: expected });
    if (maximizing) {
      if (expected > bestValue) { bestAction = action; bestValue = expected; }
      alpha = Math.max(alpha, bestValue);
      if (alpha >= beta) break; // beta cutoff
    } else {
      if (expected < bestValue) { bestAction = action; bestValue = expected; }
      beta = Math.min(beta, bestValue);
      if (beta <= alpha) break; // alpha cutoff
    }
  }
  return [bestAction, bestValue];
}

/**
 * Pick an action for state.currentPlayer (or opts.botId).
 * @param state         neutral state (see ADAPTER)
 * @param legalActions  (state) => Action[]   (an array is accepted for the root only; then
 *                      the search can't look past the first ply and falls back to depth 1)
 * @param applyAction   (state, action) => nextState | [{state, p}]
 * @param opts          see header
 */
export function chooseAction(state, legalActions, applyAction, opts = {}) {
  let legalFn = legalActions;
  let depth = opts.depth != null ? opts.depth : DEFAULT_DEPTH;
  let rootActions;
  if (Array.isArray(legalActions)) {
    rootActions = legalActions;
    legalFn = opts.legalActions || null;
    if (!legalFn) depth = Math.min(depth, 1);
  }
  const ctx = {
    botId: opts.botId != null ? opts.botId : state.currentPlayer,
    weights: opts.weights || DEFAULT_WEIGHTS,
    depth,
    deadline: Date.now() + (opts.maxTimeMs || MAX_SEARCH_TIME_MS),
    vpsToWin: opts.vpsToWin || 10,
    prune: !!opts.prune,
    describeAction: opts.describeAction,
    hasThreeToOne: opts.hasThreeToOne,
    clone: opts.clone || null,
    applyAction,
    legalActions: (s) => (s === state && rootActions ? rootActions : legalFn(s)),
    stats: { nodes: 0, leaves: 0 },
    trace: opts.trace || null,
  };
  const actions = getActions(state, ctx);
  if (!actions.length) return null;
  if (actions.length === 1) return actions[0];
  if (opts.epsilon != null && Math.random() < opts.epsilon) {
    return actions[Math.floor(Math.random() * actions.length)];
  }
  const [best] = alphabeta(state, depth, -Infinity, Infinity, ctx);
  if (opts.stats) Object.assign(opts.stats, ctx.stats);
  return best == null ? actions[0] : best;
}

export default chooseAction;
