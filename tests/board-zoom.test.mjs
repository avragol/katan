// בדיקות המתמטיקה של זום הלוח (bv* מ-game.js, ללא DOM)
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../game.js', import.meta.url), 'utf8');
const start = src.indexOf('const BOARD_BASE_VIEW');
const end = src.indexOf('function applyBoardView');
assert.ok(start > 0 && end > start, 'zoom math block not found in game.js');
const math = src.slice(start, end);
const ctx = {};
new Function('module', math + '\nmodule.exports = { BOARD_BASE_VIEW, BOARD_ZOOM_MAX, bvClamp, bvZoomAt, bvPanBy };')(ctx);
const { BOARD_BASE_VIEW: B, bvClamp, bvZoomAt, bvPanBy } = ctx.exports;

const base = { x: B.x, y: B.y, w: B.w, h: B.h };
const eq = (a, b, msg, eps = 1e-6) => {
  assert.ok(Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps &&
    Math.abs(a.w - b.w) < eps && Math.abs(a.h - b.h) < eps, msg);
};

// 1. איפוס: זום אחורה מעבר ל-1x חוזר בדיוק לתצוגת הבסיס
eq(bvZoomAt(base, 0, 0, 0.5), base, 'zoom out below 1x snaps to base');
eq(bvZoomAt(bvZoomAt(base, 0, 0, 1 / 1.25), 0, 0, 0.5), base, 'zoom back down to base');

// 2. עוגן: הנקודה שמסביבה מגדילים נשארת באותו מיקום יחסי בתצוגה
const anchor = { x: 100, y: -50 };
const z = bvZoomAt(base, anchor.x, anchor.y, 2);
const relBefore = { x: (anchor.x - base.x) / base.w, y: (anchor.y - base.y) / base.h };
const relAfter = { x: (anchor.x - z.x) / z.w, y: (anchor.y - z.y) / z.h };
assert.ok(Math.abs(relBefore.x - relAfter.x) < 1e-9 && Math.abs(relBefore.y - relAfter.y) < 1e-9,
  'anchor keeps its on-screen position through the zoom');
assert.ok(Math.abs(z.w - B.w / 2) < 1e-6, 'zoom 2x halves the viewBox width');

// 3. מקסימום 3x — לא מעבר
const z9 = bvZoomAt(base, 0, 0, 9);
assert.ok(z9.w >= B.w / 3 - 1e-6 && z9.w <= B.w / 3 + 1e-6, 'zoom clamps at 3x');

// 4. גלילה נחסמת בשוליים: מרכז התצוגה לא בורח מהלוח
let v = bvZoomAt(base, 0, 0, 2.5);
const far = bvPanBy(v, 100000, 100000);
assert.ok(far.x + far.w / 2 <= B.x + B.w + 60 + 1e-6 && far.y + far.h / 2 <= B.y + B.h + 60 + 1e-6,
  'pan clamps to board margins');
const farNeg = bvPanBy(v, -100000, -100000);
assert.ok(farNeg.x + farNeg.w / 2 >= B.x - 60 - 1e-6 && farNeg.y + farNeg.h / 2 >= B.y - 60 - 1e-6,
  'pan clamps on the negative side too');

// 5. יחס גובה-רוחב נשמר בכל מצב
for (const t of [z, z9, far, farNeg]) {
  assert.ok(Math.abs(t.h / t.w - B.h / B.w) < 1e-9, 'aspect ratio preserved');
}

// 6. רצף: זום → גלילה → זום → איפוס לגמרי לא מותיר מצב שבור
let seq = bvZoomAt(base, -100, 100, 3);
seq = bvPanBy(seq, 50, -50);
seq = bvZoomAt(seq, 0, 0, 1 / 2);
seq = bvZoomAt(seq, 0, 0, 1 / 3);
eq(seq, base, 'full zoom-out returns exactly to base');

// 7. בלי זום אין גלילה (מגבלה מוכרת: גרירה רלוונטית רק בזום)
const noZoom = bvPanBy(base, 300, 300);
eq(noZoom, base, 'panning at 1x stays at base');

console.log('Board zoom math: 7/7 OK');
