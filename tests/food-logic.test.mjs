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


test('ageOn counts birthdays correctly', () => {
  assert.equal(L.ageOn('1990-06-15', '2026-06-14'), 35);
  assert.equal(L.ageOn('1990-06-15', '2026-06-15'), 36);
});

// ── Numbers ────────────────────────────────────────────────────────────────
test('parseNum tolerates commas and stray characters, rejects negatives', () => {
  assert.equal(L.parseNum('1,5'), 1.5);
  assert.equal(L.parseNum('1,200'), 1200);
  assert.equal(L.parseNum('12g'), 12);
  assert.equal(L.parseNum(' 2.5 '), 2.5);
  assert.equal(L.parseNum('1.2.3'), 1.23);
  assert.ok(Number.isNaN(L.parseNum('-5')));
  assert.ok(Number.isNaN(L.parseNum('')));
  assert.ok(Number.isNaN(L.parseNum('abc')));
});

test('validateNum enforces entry limits', () => {
  assert.equal(L.validateNum('5001', 'kcal').ok, false);
  assert.equal(L.validateNum('5000', 'kcal').ok, true);
  assert.equal(L.validateNum('301', 'proteinG').ok, false);
  assert.equal(L.validateNum('0.05', 'qty').ok, false);
  assert.equal(L.validateNum('20', 'qty').ok, true);
  assert.equal(L.validateNum('', 'kcal').empty, true);
});

test('display rounding: kcal integers, grams 1 decimal under 10', () => {
  assert.equal(L.fmtKcal(1234.6), '1,235');
  assert.equal(L.fmtG(4.34), '4.3');
  assert.equal(L.fmtG(37.3), '37');
});

// ── Entries and totals (Section 13) ─────────────────────────────────────────
const food = (id, kcal, proteinG, carbsG = 0, fatG = 0) => ({ id, name: id, servingLabel: '1', kcal, proteinG, carbsG, fatG, fiberG: 0 });

test('totals: shake + 2 eggs + 1 cup rice = 495 kcal, 37.3 g protein', () => {
  const entries = [
    L.makeEntry(food('shake', 150, 21), 1, 'breakfast', 'a', 0),
    L.makeEntry(food('egg', 70, 6), 2, 'breakfast', 'b', 0),
    L.makeEntry(food('rice', 205, 4.3), 1, 'lunch', 'c', 0),
  ];
  const t = L.computeTotals(entries);
  near(t.kcal, 495);
  near(t.proteinG, 37.3, 1e-9);
});

test('quantity scaling snapshots macros; later library edits do not change the entry', () => {
  const dal = food('dal', 200, 11);
  const e = L.makeEntry(dal, 1.5, 'lunch', 'x', 0);
  assert.equal(e.kcal, 300);
  dal.kcal = 250;
  assert.equal(e.kcal, 300);
  const e2 = L.scaleEntry(e, 0.5);
  near(e2.kcal, 100);
  near(e2.proteinG, 5.5);
});

test('quick add without protein is flagged as protein not logged', () => {
  const q = L.makeQuickEntry({ label: 'Restaurant dinner (estimate)', kcal: 900, meal: 'dinner' }, 'q', 0);
  assert.equal(q.quickAdd, true);
  assert.equal(q.proteinG, 0);
  assert.equal(L.proteinNotLogged([q]), true);
  const q2 = L.makeQuickEntry({ kcal: 300, proteinG: 20, meal: 'lunch' }, 'q2', 0);
  assert.equal(L.proteinNotLogged([q, q2]), false);
  assert.equal(L.proteinNotLogged([]), false);
});

test('treat budget counts only treat-meal entries', () => {
  const es = [
    L.makeEntry(food('mithai', 160, 2), 1, 'treat', 't', 0),
    L.makeEntry(food('rice', 205, 4.3), 1, 'lunch', 'r', 0),
  ];
  assert.equal(L.treatKcal(es), 160);
});

test('default meal by time of day', () => {
  assert.equal(L.defaultMealForTime(new Date(2026, 0, 1, 8, 0)), 'breakfast');
  assert.equal(L.defaultMealForTime(new Date(2026, 0, 1, 12, 30)), 'lunch');
  assert.equal(L.defaultMealForTime(new Date(2026, 0, 1, 16, 0)), 'snack');
  assert.equal(L.defaultMealForTime(new Date(2026, 0, 1, 20, 0)), 'dinner');
});

// ── Plan ──────────────────────────────────────────────────────────────────
test('Mifflin-St Jeor BMR', () => {
  near(L.mifflinBMR('male', 80, 180, 30), 10 * 80 + 6.25 * 180 - 150 + 5);
  near(L.mifflinBMR('female', 60, 165, 30), 10 * 60 + 6.25 * 165 - 150 - 161);
});

test('proposePlan for a fictional profile', () => {
  const p = L.proposePlan({ sex: 'male', ageYears: 40, heightIn: 69, weightLb: 200, goalWeightLb: 180, activityFactor: 1.4, ratePerWeekLb: 0.75 });
  assert.equal(p.maintenance, 2530);
  assert.equal(p.kcal, 2160);           // 2530 - 375, rounded to 10
  assert.equal(p.proteinG, 170);        // 0.95 g/lb of goal weight, nearest 5
  assert.equal(p.proteinMinG, 153);
  assert.equal(p.fatG, 60);             // 25% of kcal
  assert.equal(p.carbsG, 235);          // the rest
  assert.equal(p.treatBudgetKcal, 170); // 8%, nearest 10
  assert.equal(p.mode, 'cut');
  assert.equal(p.clamped, false);
});

test('proposePlan clamps to the calorie floor', () => {
  const p = L.proposePlan({ sex: 'female', ageYears: 50, heightIn: 60, weightLb: 130, goalWeightLb: 120, activityFactor: 1.3, ratePerWeekLb: 1.0 });
  assert.equal(p.kcal, 1500);
  assert.equal(p.clamped, true);
});

test('proposePlan with goal at or above current weight means maintain', () => {
  const p = L.proposePlan({ sex: 'other', ageYears: 30, heightIn: 66, weightLb: 150, goalWeightLb: 155, activityFactor: 1.4, ratePerWeekLb: 0.75 });
  assert.equal(p.mode, 'maintain');
  assert.equal(p.deficit, 0);
});

// ── Search ────────────────────────────────────────────────────────────────
test('search: token based, prefix beats substring, tags match', () => {
  const foods = [
    { id: '1', name: 'Dal (toor or moong, with tadka)', tags: ['indian'] },
    { id: '2', name: 'Sandal snack', tags: [] },
    { id: '3', name: 'Rice, cooked basmati', tags: ['indian', 'staple'] },
    { id: '4', name: 'Chicken curry, home style', tags: ['indian'] },
  ];
  assert.deepEqual(L.searchFoods(foods, 'dal').map(f => f.id), ['1', '2']);
  assert.deepEqual(L.searchFoods(foods, 'CHICK cur').map(f => f.id), ['4']);
  assert.deepEqual(L.searchFoods(foods, 'staple').map(f => f.id), ['3']);
  assert.deepEqual(L.searchFoods(foods, 'xyz'), []);
});

test('recentFoods orders by lastUsed and skips unused', () => {
  const foods = [{ id: 'a', lastUsed: 0 }, { id: 'b', lastUsed: 5 }, { id: 'c', lastUsed: 9 }];
  assert.deepEqual(L.recentFoods(foods).map(f => f.id), ['c', 'b']);
});
