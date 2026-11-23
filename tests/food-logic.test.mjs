// Tests for the pure-logic block of food.html.
// Run with: node --test
//
// The block between "PURE LOGIC START" and "PURE LOGIC END" in food.html is
// extracted and evaluated, so the app and the tests always share one copy.
// All numbers below are fictional sample data.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'food.html'), 'utf8');
const start = html.indexOf('// ---- PURE LOGIC START');
const end = html.indexOf('// ---- PURE LOGIC END');
assert.ok(start > 0 && end > start, 'pure logic markers not found in food.html');
const block = html.slice(html.indexOf('\n', start) + 1, html.lastIndexOf('\n', end));
const L = new Function(block + '\nreturn FoodLogic;')();

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

// ── Dates ──────────────────────────────────────────────────────────────────
test('localDateStr uses the local date, not UTC (22:30 near a month boundary)', () => {
  const d = new Date(2026, 10, 30, 22, 30); // Nov 30, 22:30 local
  assert.equal(L.localDateStr(d), '2026-11-30');
  const d2 = new Date(2026, 11, 31, 23, 59);
  assert.equal(L.localDateStr(d2), '2026-12-31');
});

test('addDays crosses month and year boundaries using calendar days', () => {
  assert.equal(L.addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(L.addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(L.addDays('2027-03-01', -1), '2027-02-28');
  // DST weekends (US/Canada: Mar 14 2027, Nov 7 2027) still move one calendar day
  assert.equal(L.addDays('2027-03-14', 1), '2027-03-15');
  assert.equal(L.addDays('2027-11-07', -1), '2027-11-06');
});

