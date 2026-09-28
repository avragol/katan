import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { snapshot, legalActions, applyAction, chooseGameAction } from '../catan-ai-adapter.js';
import { evaluate } from '../catan-alphabeta.js';

// Use the game's actual board generator rather than a second hand-drawn topology.
const code = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
const boardCode = code.slice(0, code.indexOf('// =========================================================\n// חוקיות בנייה')).replace(/const searchReady = import\([\s\S]*?return null; }\);/, 'const searchReady = Promise.resolve(null);');
const context = vm.createContext({ console, Math, document: {}, matchMedia: () => ({matches:false}) });
vm.runInContext(boardCode + '\nbuildBoard();', context);
const board = vm.runInContext('board', context);
const verts = Object.values(board.vertices);
const first = verts.find(v => v.hexes.length === 3);
first.building = { player: 0, type: 'settlement' };
const opponent = verts.find(v => v.hexes.length === 3 && !v.adjEdges.some(id => {
  const edge = board.edges[id]; return edge.v1 === first.id || edge.v2 === first.id;
}) && v.id !== first.id);
opponent.building = { player: 1, type: 'settlement' };
const game = {
  players: [0,1,2].map(i => ({res:{wood:2,brick:2,sheep:1,wheat:2,ore:3},
    dev:{knight:0,road:0,yop:0,mono:0,vp:0},newDev:{knight:0,road:0,yop:0,mono:0,vp:0},
    knightsPlayed:0,roadsLeft:15,settlementsLeft:i===2?5:4,citiesLeft:4})),
  bank:{wood:19,brick:19,sheep:19,wheat:19,ore:19},
  devDeck: Array(14).fill('knight').concat(Array(5).fill('vp'),['road','road','yop','yop','mono','mono']),
  phase:'play',current:0,robberHex:board.hexes.find(h=>h.terrain==='desert').id,
  longestRoad:null,largestArmy:null,vpTarget:10,
};
const s=snapshot(board,game);
const baseline=JSON.stringify(s);
assert.equal(s.nodes.length,Object.keys(board.vertices).length);
assert.equal(s.players[0].vp,1);
assert.equal(typeof evaluate(s,0),'number');
const actions=legalActions(s);
const baselineState=baseline; // pure snapshot string, reusable for derived states
for (const type of ['CITY','ROAD','END_TURN']) assert.ok(actions.some(a=>a.type===type),type);
// Dev-card purchases stay in the game's classic logic, so the search must not offer DEV.
assert.ok(!actions.some(a=>a.type==='DEV'),'DEV excluded from search actions');
// Bank trades must be port trades (ratio <= 3) or immediately complete a build.
for (const t of actions.filter(a=>a.type==='TRADE')) assert.ok(t.ratio<=3,t.give+'->'+t.get+'@'+t.ratio);
assert.ok(actions.some(a=>a.type==='ROAD' && a.edge.match(/^\d+-\d+$/)));
// 4:1 bank trade must appear only when it immediately completes a city/settlement.
{
  const rich = JSON.parse(baselineState);
  rich.players[0].resources = { WOOD:0, BRICK:0, SHEEP:0, WHEAT:6, ORE:2 };
  const acts = legalActions(rich);
  const trade = acts.find(a => a.type==='TRADE' && a.give==='WHEAT' && a.get==='ORE');
  assert.ok(trade && trade.ratio===4, 'completing 4:1 WHEAT->ORE must be offered');
  const after = applyAction(rich, trade);
  const hand = (Array.isArray(after) ? after[0].state : after).players[0].resources;
  assert.ok(hand.WHEAT>=2 && hand.ORE>=3, 'after the trade a city is affordable');
}
{
  const poor = JSON.parse(baselineState);
  poor.players[0].resources = { WOOD:0, BRICK:0, SHEEP:0, WHEAT:6, ORE:0 };
  const acts = legalActions(poor);
  assert.ok(!acts.some(a => a.type==='TRADE'), 'non-completing 4:1 must be blocked');
}

for (const a of actions.filter(x=>x.type!=='END_TURN')) {
  const next=applyAction(s,a);
  const sample=Array.isArray(next) ? next[0].state : next;
  assert.notEqual(sample,s);
  assert.equal(sample.currentPlayer,s.currentPlayer);
}
assert.equal(JSON.stringify(s),baseline,'simulation mutated live snapshot');
const t0=Date.now();
const selected=chooseGameAction(board,game);
assert.ok(selected);
assert.ok(['CITY','ROAD','SETTLEMENT','DEV','TRADE','END_TURN'].includes(selected.type));
if (selected.node) assert.ok(board.vertices[selected.node]);
if (selected.edge) assert.ok(board.edges[selected.edge]);
assert.equal(JSON.stringify(s),baseline,'selection mutated snapshot');
console.log('Real board:',s.nodes.length,'nodes;',actions.length,'legal actions; choice:',selected.type,'time:',Date.now()-t0,'ms');
const setup={...game,phase:'setup',current:2};
const ss=snapshot(board,setup);
const setupAction=chooseGameAction(board,setup,true);
assert.ok(setupAction?.type==='SETTLEMENT');
assert.ok(board.vertices[setupAction.node]);
assert.ok(legalActions(ss).some(a=>ss.nodeKeys[a.node]===setupAction.node));
console.log('Setup choice:',setupAction.node);
// Moving through several real-board branches must keep legal choices and the live
// board immutable even when roads and settlements have coordinate IDs with '-'.
let sim=snapshot(board,game);
for (let step=0;step<8;step++) {
  const options=legalActions(sim).filter(a=>a.type==='ROAD' || a.type==='TRADE' || a.type==='SETTLEMENT');
  if (!options.length) break;
  sim=applyAction(sim,options[0]);
  assert.equal(typeof evaluate(sim,0),'number');
}
assert.equal(board.vertices[first.id].building.type,'settlement');
assert.equal(board.vertices[opponent.id].building.type,'settlement');
assert.equal(Object.values(board.edges).filter(e=>e.road!=null).length,0);
const t1=Date.now();
const pick=chooseGameAction(board,{...game,players:game.players.map(p=>({...p,res:{wood:6,brick:6,sheep:3,wheat:5,ore:5}}))});
assert.ok(pick);
console.log('High-resource choice:',pick.type,'time:',Date.now()-t1,'ms');
// Reordering the hidden development deck cannot change the bot's information.
const reversed = snapshot(board,{...game,devDeck:[...game.devDeck].reverse()});
assert.deepEqual(reversed.deckCounts,s.deckCounts);
// Simulated dice outcomes must cover all eleven sums with total probability 1.
const rolled=applyAction({...s,phase:'roll'},{type:'ROLL'});
assert.equal(rolled.length,11);
assert.ok(Math.abs(rolled.reduce((n,x)=>n+x.p,0)-1)<1e-12);
assert.equal(rolled[0].state.phase,'build');
// A development purchase remains a probability distribution, not a peek.
const drawn=applyAction(s,{type:'DEV'});
assert.ok(Array.isArray(drawn) && drawn.length===5);
assert.ok(Math.abs(drawn.reduce((n,x)=>n+x.p,0)-1)<1e-12);
assert.equal(JSON.stringify(s),baseline);
console.log('Chance distributions, hidden deck order, and immutability: OK');
// Check the browser glue dispatches a search result to existing rule functions.
const start=code.indexOf('function performSearchAction(action) {');
const end=code.indexOf('function aiTryAction(p, skipDev = false) {',start);
assert.ok(start>0 && end>start);
const calls=[];
const liveContext=vm.createContext({
  state:{phase:'play',current:0,hasRolled:true,devDeck:['knight']},board,
  cur:()=>({isAI:true,citiesLeft:4,settlementsLeft:4,roadsLeft:15}),
  COST:{city:{wheat:2,ore:3},road:{wood:1,brick:1},settlement:{wood:1,brick:1,sheep:1,wheat:1},dev:{sheep:1,wheat:1,ore:1}},
  RES_TYPES:['wood','brick','sheep','wheat','ore'],
  ownSettlements:()=>[first.id],canAfford:()=>true,canPlaceRoad:()=>true,canPlaceSettlement:()=>true,
  placeCity:(...x)=>calls.push(['city',...x]),placeRoad:(...x)=>calls.push(['road',...x]),
  placeSettlement:(...x)=>calls.push(['settlement',...x]),buyDev:(...x)=>calls.push(['dev',...x]),
  bankTradeExec:(...x)=>{calls.push(['trade',...x]);return true;},aiTryAction:()=>false,
});
vm.runInContext(code.slice(start,end),liveContext);
assert.equal(vm.runInContext(`performSearchAction({type:'CITY',node:${JSON.stringify(first.id)}})`,liveContext),true);
assert.deepEqual(calls.pop(),['city',0,first.id]);
const edge=Object.values(board.edges)[0].id;
assert.equal(vm.runInContext(`performSearchAction({type:'ROAD',edge:${JSON.stringify(edge)}})`,liveContext),true);
assert.deepEqual(calls.pop(),['road',0,edge,false]);
assert.equal(vm.runInContext("performSearchAction({type:'TRADE',give:'WOOD',get:'ORE'})",liveContext),true);
assert.deepEqual(calls.pop(),['trade',0,'wood','ore']);
assert.equal(vm.runInContext("performSearchAction({type:'END_TURN'})",liveContext),false);
console.log('Live action dispatch: OK');
