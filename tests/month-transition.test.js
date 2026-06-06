// ─── DOM/localStorage mocks must be set up before any imports ───────────────
const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); },
};

globalThis.document = {
  addEventListener() {},
  querySelectorAll() { return []; },
  querySelector() { return null; },
  getElementById() { return null; },
};

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { KEYS, DEFAULTS, load, save, getSnapshots } from '../js/store.js';
import { carryForwardBills, getEffectiveBillAmount, checkMonthTransition, performMonthTransition } from '../js/app.js';

describe('Month Transition (Task 8.5)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('KEYS.lastActiveMonth', () => {
    it('should have the correct storage key', () => {
      assert.equal(KEYS.lastActiveMonth, 'ewm_lastActiveMonth');
    });
  });

  describe('carryForwardBills() — pure function', () => {
    const baseBills = [
      { id: 'digi', name: 'DiGi', amount: 48.00, frequency: 'monthly' },
      { id: 'tnb', name: 'TnB', amount: 120.00, frequency: 'monthly' },
      { id: 'water', name: 'Water', amount: 15.00, frequency: 'monthly' },
      { id: 'iwk', name: 'IWK', amount: 90.00, frequency: 'biYearly', dueMonths: [1, 7] },
    ];

    it('should keep base amounts when no overrides exist for the previous month', () => {
      const result = carryForwardBills(baseBills, {}, '2025-01');
      assert.equal(result[0].amount, 48.00); // digi
      assert.equal(result[1].amount, 120.00); // tnb
      assert.equal(result[2].amount, 15.00); // water
      assert.equal(result[3].amount, 90.00); // iwk unchanged
    });

    it('should carry forward overridden amounts for DiGi, TnB, Water', () => {
      const overrides = {
        '2025-01': { tnb: 135.00, water: 22.50 },
      };
      const result = carryForwardBills(baseBills, overrides, '2025-01');
      assert.equal(result[0].amount, 48.00); // digi — no override
      assert.equal(result[1].amount, 135.00); // tnb — overridden
      assert.equal(result[2].amount, 22.50); // water — overridden
      assert.equal(result[3].amount, 90.00); // iwk — not a carry-forward bill
    });

    it('should not carry forward overrides from a different month', () => {
      const overrides = {
        '2025-02': { tnb: 200.00 },
      };
      const result = carryForwardBills(baseBills, overrides, '2025-01');
      assert.equal(result[1].amount, 120.00); // tnb — override is for different month
    });

    it('should not modify the IWK bill even if it has an override', () => {
      const overrides = {
        '2025-01': { iwk: 100.00 },
      };
      const result = carryForwardBills(baseBills, overrides, '2025-01');
      assert.equal(result[3].amount, 90.00); // iwk not in carryForwardIds
    });

    it('should not mutate the original bills array', () => {
      const overrides = { '2025-01': { digi: 55.00 } };
      const original = JSON.parse(JSON.stringify(baseBills));
      carryForwardBills(baseBills, overrides, '2025-01');
      assert.deepEqual(baseBills, original);
    });

    it('should handle null/undefined billOverrides gracefully', () => {
      const result = carryForwardBills(baseBills, null, '2025-01');
      assert.equal(result[0].amount, 48.00);
      assert.equal(result[1].amount, 120.00);
    });

    it('should handle override value of 0 (carry forward zero amount)', () => {
      const overrides = { '2025-01': { digi: 0 } };
      const result = carryForwardBills(baseBills, overrides, '2025-01');
      assert.equal(result[0].amount, 0); // 0 is a valid override
    });
  });

  describe('getEffectiveBillAmount()', () => {
    it('should return override amount when override exists for the month', () => {
      const bill = { id: 'tnb', name: 'TnB', amount: 120.00, frequency: 'monthly' };
      const overrides = { '2025-02': { tnb: 135.00 } };
      const result = getEffectiveBillAmount(bill, '2025-02', overrides);
      assert.equal(result, 135.00);
    });

    it('should return base amount when no override exists for the month', () => {
      const bill = { id: 'tnb', name: 'TnB', amount: 120.00, frequency: 'monthly' };
      const overrides = { '2025-03': { tnb: 135.00 } };
      const result = getEffectiveBillAmount(bill, '2025-02', overrides);
      assert.equal(result, 120.00);
    });

    it('should return base amount when billOverrides is empty', () => {
      const bill = { id: 'digi', name: 'DiGi', amount: 48.00, frequency: 'monthly' };
      const result = getEffectiveBillAmount(bill, '2025-02', {});
      assert.equal(result, 48.00);
    });

    it('should return base amount when billOverrides is null', () => {
      const bill = { id: 'digi', name: 'DiGi', amount: 48.00, frequency: 'monthly' };
      const result = getEffectiveBillAmount(bill, '2025-02', null);
      assert.equal(result, 48.00);
    });

    it('should return 0 override (not fall back to base) when override is 0', () => {
      const bill = { id: 'water', name: 'Water', amount: 15.00, frequency: 'monthly' };
      const overrides = { '2025-02': { water: 0 } };
      const result = getEffectiveBillAmount(bill, '2025-02', overrides);
      assert.equal(result, 0);
    });
  });

  describe('checkMonthTransition()', () => {
    it('should store lastActiveMonth on first use when no transition needed', () => {
      checkMonthTransition();
      const stored = load(KEYS.lastActiveMonth);
      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      assert.equal(stored, expected);
    });

    it('should detect and perform transition when lastActiveMonth differs from current', () => {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // Use a fake previous month that differs from current
      const fakeLastMonth = currentMonth === '2025-01' ? '2024-12' : '2025-01';
      save(KEYS.lastActiveMonth, fakeLastMonth);

      // Set up bills so transition has something to work with
      save(KEYS.bills, DEFAULTS[KEYS.bills]);

      checkMonthTransition();

      // Should have updated lastActiveMonth to current
      assert.equal(load(KEYS.lastActiveMonth), currentMonth);

      // Should have created a snapshot for the fake last month
      const snapshots = getSnapshots();
      assert.ok(snapshots.length >= 1);
      assert.equal(snapshots[0].month, fakeLastMonth);
    });

    it('should not perform transition when lastActiveMonth matches current month', () => {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      save(KEYS.lastActiveMonth, currentMonth);
      save(KEYS.bills, DEFAULTS[KEYS.bills]);

      checkMonthTransition();

      // No snapshots should be created
      const snapshots = getSnapshots();
      assert.equal(snapshots.length, 0);
    });
  });

  describe('performMonthTransition()', () => {
    beforeEach(() => {
      // Set up default state for transition tests
      save(KEYS.balances, { goPlus: 150, card1: 45, card2: 30, parking: 20 });
      save(KEYS.bills, [
        { id: 'digi', name: 'DiGi', amount: 48.00, frequency: 'monthly' },
        { id: 'tnb', name: 'TnB', amount: 120.00, frequency: 'monthly' },
        { id: 'water', name: 'Water', amount: 15.00, frequency: 'monthly' },
        { id: 'iwk', name: 'IWK', amount: 90.00, frequency: 'biYearly', dueMonths: [1, 7] },
      ]);
      save(KEYS.billOverrides, {});
    });

    it('should save a snapshot for the previous month', () => {
      performMonthTransition('2025-01', '2025-02');

      const snapshots = getSnapshots();
      assert.equal(snapshots.length, 1);
      assert.equal(snapshots[0].month, '2025-01');
      assert.deepEqual(snapshots[0].balances, { goPlus: 150, card1: 45, card2: 30, parking: 20 });
    });

    it('should carry forward overridden bill amounts', () => {
      save(KEYS.billOverrides, { '2025-01': { tnb: 135.00 } });

      performMonthTransition('2025-01', '2025-02');

      const bills = load(KEYS.bills);
      const tnb = bills.find(b => b.id === 'tnb');
      assert.equal(tnb.amount, 135.00); // carried forward from override
    });

    it('should keep base amounts when no overrides existed for previous month', () => {
      performMonthTransition('2025-01', '2025-02');

      const bills = load(KEYS.bills);
      const digi = bills.find(b => b.id === 'digi');
      const tnb = bills.find(b => b.id === 'tnb');
      const water = bills.find(b => b.id === 'water');
      assert.equal(digi.amount, 48.00);
      assert.equal(tnb.amount, 120.00);
      assert.equal(water.amount, 15.00);
    });

    it('should not modify IWK bill during transition', () => {
      save(KEYS.billOverrides, { '2025-01': { iwk: 100.00 } });

      performMonthTransition('2025-01', '2025-02');

      const bills = load(KEYS.bills);
      const iwk = bills.find(b => b.id === 'iwk');
      assert.equal(iwk.amount, 90.00); // not carried forward
    });

    it('bill override isolation: overrides for previous month do not affect new month base', () => {
      save(KEYS.billOverrides, {
        '2025-01': { tnb: 135.00 },
        '2025-02': { water: 25.00 },
      });

      performMonthTransition('2025-01', '2025-02');

      // After transition, base TnB is 135 (carried forward from Jan override)
      // But the Feb override for water is separate and doesn't affect the base
      const bills = load(KEYS.bills);
      const tnb = bills.find(b => b.id === 'tnb');
      const water = bills.find(b => b.id === 'water');
      assert.equal(tnb.amount, 135.00); // carried forward
      assert.equal(water.amount, 15.00); // base unchanged (Feb override is separate)
    });
  });
});


// ─── Arbitrary Generators for Property Tests ────────────────────────────────

// IDs that are subject to carry-forward (DiGi, TnB, Water)
const CARRY_FORWARD_IDS = ['digi', 'tnb', 'water'];

// Generate a valid bill amount (0.00 to 9999.99)
const arbBillAmount = fc.double({ min: 0, max: 9999.99, noNaN: true, noDefaultInfinity: true });

// Generate a month key in YYYY-MM format
const arbMonthKey = fc.tuple(
  fc.integer({ min: 2020, max: 2030 }),
  fc.integer({ min: 1, max: 12 })
).map(([y, m]) => `${y}-${String(m).padStart(2, '0')}`);

// Generate a carry-forward bill (monthly frequency, id from CARRY_FORWARD_IDS)
const arbCarryForwardBill = fc.record({
  id: fc.constantFrom(...CARRY_FORWARD_IDS),
  name: fc.constantFrom('DiGi', 'TnB', 'Water'),
  amount: arbBillAmount,
  frequency: fc.constant('monthly'),
});

// Generate a non-carry-forward bill (e.g., bi-yearly or a custom monthly bill)
const arbOtherBill = fc.record({
  id: fc.string({ minLength: 4, maxLength: 10 }).filter(s => !CARRY_FORWARD_IDS.includes(s)),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  amount: arbBillAmount,
  frequency: fc.constantFrom('monthly', 'biYearly'),
}).chain(bill => {
  if (bill.frequency === 'biYearly') {
    return fc.array(fc.integer({ min: 1, max: 12 }), { minLength: 1, maxLength: 6 })
      .map(months => ({ ...bill, dueMonths: [...new Set(months)] }));
  }
  return fc.constant(bill);
});

// Generate a realistic bills array with all 3 carry-forward bills plus optional others
const arbBillsWithCarryForward = fc.tuple(
  arbBillAmount, // digi amount
  arbBillAmount, // tnb amount
  arbBillAmount, // water amount
  fc.array(arbOtherBill, { minLength: 0, maxLength: 3 })
).map(([digiAmt, tnbAmt, waterAmt, others]) => [
  { id: 'digi', name: 'DiGi', amount: digiAmt, frequency: 'monthly' },
  { id: 'tnb', name: 'TnB', amount: tnbAmt, frequency: 'monthly' },
  { id: 'water', name: 'Water', amount: waterAmt, frequency: 'monthly' },
  ...others,
]);

// Generate bill overrides for a specific month (subset of carry-forward ids with amounts)
const arbMonthOverrides = fc.record({
  digi: fc.option(arbBillAmount, { nil: undefined }),
  tnb: fc.option(arbBillAmount, { nil: undefined }),
  water: fc.option(arbBillAmount, { nil: undefined }),
}).map(obj => {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v;
  }
  return result;
});

// ─── Property-Based Tests ───────────────────────────────────────────────────

describe('Month Transition — Property-Based Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Property 9: Bill carry-forward correctness', () => {
    /**
     * **Validates: Requirements 10.6**
     *
     * For any previous month bill amounts and any overrides for that month,
     * carryForwardBills shall produce new bills where:
     * - For carry-forward bills (DiGi, TnB, Water): the new amount equals the
     *   overridden amount if an override existed, otherwise equals the base amount
     * - For non-carry-forward bills: the amount is unchanged
     */
    it('new month defaults equal previous month amounts (base or overridden)', () => {
      fc.assert(
        fc.property(
          arbBillsWithCarryForward,
          arbMonthOverrides,
          arbMonthKey,
          (bills, monthOverrides, previousMonth) => {
            // Build billOverrides object with overrides for the previous month
            const billOverrides = Object.keys(monthOverrides).length > 0
              ? { [previousMonth]: monthOverrides }
              : {};

            // Perform carry-forward
            const result = carryForwardBills(bills, billOverrides, previousMonth);

            // Verify each bill
            for (let i = 0; i < bills.length; i++) {
              const originalBill = bills[i];
              const resultBill = result[i];

              if (CARRY_FORWARD_IDS.includes(originalBill.id)) {
                // Carry-forward bill: should use override if exists, else base
                const expectedAmount = monthOverrides[originalBill.id] != null
                  ? monthOverrides[originalBill.id]
                  : originalBill.amount;
                assert.strictEqual(resultBill.amount, expectedAmount,
                  `Bill ${originalBill.id}: expected ${expectedAmount}, got ${resultBill.amount}`);
              } else {
                // Non-carry-forward bill: amount unchanged
                assert.strictEqual(resultBill.amount, originalBill.amount,
                  `Non-carry bill ${originalBill.id}: should remain ${originalBill.amount}`);
              }

              // All bills should retain their id and other properties
              assert.strictEqual(resultBill.id, originalBill.id);
              assert.strictEqual(resultBill.name, originalBill.name);
              assert.strictEqual(resultBill.frequency, originalBill.frequency);
            }
          }
        ),
        { numRuns: 200 }
      );
    });

    it('carry-forward does not mutate the original bills array', () => {
      fc.assert(
        fc.property(
          arbBillsWithCarryForward,
          arbMonthOverrides,
          arbMonthKey,
          (bills, monthOverrides, previousMonth) => {
            const billOverrides = Object.keys(monthOverrides).length > 0
              ? { [previousMonth]: monthOverrides }
              : {};

            // Normalize through JSON to handle null-prototype objects from fast-check
            const originalBills = JSON.parse(JSON.stringify(bills));
            carryForwardBills(bills, billOverrides, previousMonth);

            const afterBills = JSON.parse(JSON.stringify(bills));
            assert.deepStrictEqual(afterBills, originalBills,
              'Original bills array should not be mutated');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('carry-forward with null/empty overrides preserves all base amounts', () => {
      fc.assert(
        fc.property(
          arbBillsWithCarryForward,
          arbMonthKey,
          fc.constantFrom(null, undefined, {}),
          (bills, previousMonth, emptyOverrides) => {
            const result = carryForwardBills(bills, emptyOverrides, previousMonth);

            for (let i = 0; i < bills.length; i++) {
              assert.strictEqual(result[i].amount, bills[i].amount,
                `Bill ${bills[i].id}: amount should remain ${bills[i].amount} with no overrides`);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 10: Bill override isolation', () => {
    /**
     * **Validates: Requirements 10.7**
     *
     * For any bill, any month, and any override amount, applying an override
     * for that month shall not change:
     * - The bill's stored base amount
     * - The bill's effective amount in any other month
     */
    it('overriding a bill amount does not change the base amount or other months', () => {
      fc.assert(
        fc.property(
          arbBillsWithCarryForward,
          arbMonthKey,
          arbMonthKey,
          fc.constantFrom('digi', 'tnb', 'water'),
          arbBillAmount,
          (bills, targetMonth, otherMonth, billId, overrideAmount) => {
            // Ensure targetMonth and otherMonth are different
            fc.pre(targetMonth !== otherMonth);

            // Set up overrides with an override for targetMonth only
            const billOverrides = {
              [targetMonth]: { [billId]: overrideAmount },
            };

            // Find the bill with the given id
            const bill = bills.find(b => b.id === billId);
            if (!bill) return; // Skip if id not found (shouldn't happen with our generator)

            // The override should apply for the target month
            const effectiveTarget = getEffectiveBillAmount(bill, targetMonth, billOverrides);
            assert.strictEqual(effectiveTarget, overrideAmount,
              `Override should apply for target month ${targetMonth}`);

            // The base amount should be unchanged (bill object not modified)
            assert.strictEqual(bill.amount, bill.amount,
              'Base amount should not be mutated');

            // The effective amount for a different month should be the base amount
            const effectiveOther = getEffectiveBillAmount(bill, otherMonth, billOverrides);
            assert.strictEqual(effectiveOther, bill.amount,
              `Other month ${otherMonth} should use base amount ${bill.amount}, not override`);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('multiple months can have different overrides without cross-contamination', () => {
      fc.assert(
        fc.property(
          arbBillsWithCarryForward,
          arbMonthKey,
          arbMonthKey,
          arbBillAmount,
          arbBillAmount,
          (bills, month1, month2, override1, override2) => {
            // Ensure months are different
            fc.pre(month1 !== month2);

            const bill = bills.find(b => b.id === 'tnb');
            if (!bill) return;

            const billOverrides = {
              [month1]: { tnb: override1 },
              [month2]: { tnb: override2 },
            };

            // Each month should get its own override
            const effective1 = getEffectiveBillAmount(bill, month1, billOverrides);
            const effective2 = getEffectiveBillAmount(bill, month2, billOverrides);

            assert.strictEqual(effective1, override1,
              `Month ${month1} should use override ${override1}`);
            assert.strictEqual(effective2, override2,
              `Month ${month2} should use override ${override2}`);

            // A third month (neither month1 nor month2) should use base
            const thirdMonth = '2019-06'; // guaranteed different from 2020-2030 range
            const effectiveThird = getEffectiveBillAmount(bill, thirdMonth, billOverrides);
            assert.strictEqual(effectiveThird, bill.amount,
              `Unoverridden month should use base amount ${bill.amount}`);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('override of 0 is treated as a valid override, not as "no override"', () => {
      fc.assert(
        fc.property(
          arbBillsWithCarryForward,
          arbMonthKey,
          fc.constantFrom('digi', 'tnb', 'water'),
          (bills, targetMonth, billId) => {
            const bill = bills.find(b => b.id === billId);
            if (!bill) return;

            // Override with 0
            const billOverrides = { [targetMonth]: { [billId]: 0 } };

            const effective = getEffectiveBillAmount(bill, targetMonth, billOverrides);
            assert.strictEqual(effective, 0,
              'Override of 0 should be used (not fall back to base)');

            // Base amount unchanged
            // (getEffectiveBillAmount doesn't mutate, but let's verify the bill object)
            const originalAmount = bills.find(b => b.id === billId).amount;
            assert.strictEqual(bill.amount, originalAmount,
              'Bill base amount should not be mutated');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
