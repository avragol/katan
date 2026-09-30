// בדיקות יחידה ל-resumeDecision — החלטה טהורה כיצד להמשיך משחק שמור
import { readFileSync } from 'node:fs';

const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); process.exit(1); }
};

const src = readFileSync(new URL('../game.js', import.meta.url), 'utf8');
const start = src.indexOf('function resumeDecision');
const end = src.indexOf('function quitGame');
assert(start > 0 && end > start, 'resumeDecision extraction bounds');
const resumeDecision = new Function(src.slice(start, end) + '\nreturn resumeDecision;')();

const mk = (over) => Object.assign({
  phase: 'play', current: 0, hasRolled: false,
  players: [{ isAI: true }, { isAI: true }],
}, over);

let n = 0;
assert(resumeDecision(null) === 'none', 'null state');
n++;
assert(resumeDecision(mk({ phase: 'setup' })) === 'setup', 'setup phase');
n++;
assert(resumeDecision(mk({ phase: 'ended' })) === 'none', 'ended phase');
n++;
assert(resumeDecision(mk({ players: [{ isAI: false }] })) === 'none', 'human current turn');
n++;
assert(resumeDecision(mk({})) === 'fresh', 'AI turn, not yet rolled');
n++;
assert(resumeDecision(mk({ hasRolled: true })) === 'mid', 'AI mid-turn (already rolled)');
n++;
// שמירה שנלכדה באמצע תור עם דגלים נוספים — עדיין 'mid'
assert(resumeDecision(mk({ hasRolled: true, aiActions: 5, aiTraded: true, aiBoughtDev: true })) === 'mid', 'mid-turn with extra flags');
n++;
console.log(`resume: ${n}/${n} passed`);
