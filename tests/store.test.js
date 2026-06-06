import { describe, it, beforeEach, before } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { KEYS, DEFAULTS, load, save, exportAll, importAll, saveSnapshot, getSnapshots } from '../js/store.js';

// ─── localStorage mock for Node.js ─────────────────────────────────────────
const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
  clear() { storage.clear(); },
};

describe('store.js', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('KEYS', () => {
    it('should export all required storage key constants', () => {
      assert.equal(KEYS.rateTable, 'ewm_rateTable');
      assert.equal(KEYS.balances, 'ewm_balances');
      assert.equal(KEYS.monthlyMisc, 'ewm_monthlyMisc');
      assert.equal(KEYS.minimumBalances, 'ewm_minimumBalances');
      assert.equal(KEYS.bills, 'ewm_bills');
      assert.equal(KEYS.dayOverrides, 'ewm_dayOverrides');
      assert.equal(KEYS.atOffice, 'ewm_atOffice');
      assert.equal(KEYS.holidays, 'ewm_holidays');
      assert.equal(KEYS.billOverrides, 'ewm_billOverrides');
      assert.equal(KEYS.snapshots, 'ewm_snapshots');
    });
  });

  describe('DEFAULTS', () => {
    it('should have default rate table with correct values (Req 1.3)', () => {
      const rt = DEFAULTS[KEYS.rateTable];
      assert.deepEqual(rt.weekday, { goPlus: 2.10, card1: 1.39, card2: 0, parking: 0 });
      assert.deepEqual(rt.saturday, { goPlus: 8.80, card1: 0, card2: 2.50, parking: 0 });
      assert.deepEqual(rt.sundayHoliday, { goPlus: 0, card1: 0, card2: 0, parking: 0 });
      assert.deepEqual(rt.justWork, { goPlus: 2.10, card1: 1.65, card2: 0, parking: 0 });
      assert.deepEqual(rt.justBabysitters, { goPlus: 4.20, card1: 0, card2: 0, parking: 0 });
      assert.deepEqual(rt.atOffice, { goPlus: 2.10, card1: 0, card2: 0, parking: 0 });
      assert.deepEqual(rt.onLeave, { goPlus: 4.20, card1: 2.78, card2: 0, parking: 0 });
    });

    it('should have default bills with correct values (Req 10.4)', () => {
      const bills = DEFAULTS[KEYS.bills];
      assert.equal(bills.length, 4);
      assert.deepEqual(bills[0], { id: 'digi', name: 'DiGi', amount: 0, frequency: 'monthly' });
      assert.deepEqual(bills[1], { id: 'tnb', name: 'TnB', amount: 0, frequency: 'monthly' });
      assert.deepEqual(bills[2], { id: 'water', name: 'Water', amount: 0, frequency: 'monthly' });
      assert.deepEqual(bills[3], { id: 'iwk', name: 'IWK', amount: 90.00, frequency: 'biYearly', dueMonths: [1, 7] });
    });

    it('should have default minimum balances (Req 14.1)', () => {
      assert.deepEqual(DEFAULTS[KEYS.minimumBalances], { goPlus: 20, card1: 20, card2: 20, parking: 15 });
    });

    it('should have default balances of zero', () => {
      assert.deepEqual(DEFAULTS[KEYS.balances], { goPlus: 0, card1: 0, card2: 0, parking: 0 });
    });

    it('should have default monthly misc of zero', () => {
      assert.deepEqual(DEFAULTS[KEYS.monthlyMisc], { goPlus: 0, card1: 0, card2: 0, parking: 0 });
    });

    it('should have empty defaults for overrides and holidays', () => {
      assert.deepEqual(DEFAULTS[KEYS.dayOverrides], {});
      assert.deepEqual(DEFAULTS[KEYS.atOffice], {});
      assert.deepEqual(DEFAULTS[KEYS.holidays], []);
      assert.deepEqual(DEFAULTS[KEYS.billOverrides], {});
      assert.deepEqual(DEFAULTS[KEYS.snapshots], []);
    });
  });

  describe('load()', () => {
    it('should return default value when key does not exist in localStorage', () => {
      const result = load(KEYS.rateTable);
      assert.deepEqual(result, DEFAULTS[KEYS.rateTable]);
    });

    it('should return explicit default when key does not exist and default is provided', () => {
      const result = load('nonexistent_key', { custom: true });
      assert.deepEqual(result, { custom: true });
    });

    it('should return parsed JSON when key exists in localStorage', () => {
      const data = { goPlus: 100, card1: 50, card2: 25, parking: 10 };
      localStorage.setItem(KEYS.balances, JSON.stringify(data));
      const result = load(KEYS.balances);
      assert.deepEqual(result, data);
    });

    it('should return default if stored value is corrupted JSON', () => {
      localStorage.setItem(KEYS.balances, 'not valid json {{{');
      const result = load(KEYS.balances);
      assert.deepEqual(result, DEFAULTS[KEYS.balances]);
    });

    it('should return explicit default if stored value is corrupted and default provided', () => {
      localStorage.setItem(KEYS.balances, 'broken');
      const result = load(KEYS.balances, { fallback: true });
      assert.deepEqual(result, { fallback: true });
    });
  });

  describe('save()', () => {
    it('should persist value as JSON string in localStorage', () => {
      const data = { goPlus: 200, card1: 75, card2: 30, parking: 15 };
      save(KEYS.balances, data);
      const stored = localStorage.getItem(KEYS.balances);
      assert.deepEqual(JSON.parse(stored), data);
    });

    it('should handle arrays', () => {
      const bills = [{ id: 'test', name: 'Test', amount: 10, frequency: 'monthly' }];
      save(KEYS.bills, bills);
      const stored = localStorage.getItem(KEYS.bills);
      assert.deepEqual(JSON.parse(stored), bills);
    });

    it('should overwrite existing value', () => {
      save(KEYS.balances, { goPlus: 50, card1: 0, card2: 0, parking: 0 });
      save(KEYS.balances, { goPlus: 100, card1: 10, card2: 5, parking: 0 });
      const result = load(KEYS.balances);
      assert.deepEqual(result, { goPlus: 100, card1: 10, card2: 5, parking: 0 });
    });
  });

  describe('exportAll()', () => {
    it('should return a JSON string containing all keys with defaults when nothing is saved', () => {
      const result = exportAll();
      const parsed = JSON.parse(result);
      // Should contain all keys
      for (const storageKey of Object.values(KEYS)) {
        assert.ok(storageKey in parsed, `Expected key ${storageKey} in export`);
      }
      // Defaults should be used
      assert.deepEqual(parsed[KEYS.rateTable], DEFAULTS[KEYS.rateTable]);
      assert.deepEqual(parsed[KEYS.balances], DEFAULTS[KEYS.balances]);
      assert.deepEqual(parsed[KEYS.bills], DEFAULTS[KEYS.bills]);
    });

    it('should export saved values rather than defaults', () => {
      const customBalances = { goPlus: 500, card1: 100, card2: 50, parking: 30 };
      save(KEYS.balances, customBalances);
      const result = exportAll();
      const parsed = JSON.parse(result);
      assert.deepEqual(parsed[KEYS.balances], customBalances);
    });

    it('should return valid JSON string', () => {
      const result = exportAll();
      assert.equal(typeof result, 'string');
      assert.doesNotThrow(() => JSON.parse(result));
    });
  });

  describe('importAll()', () => {
    // Helper to create a valid import object
    function makeValidImport(overrides = {}) {
      const base = {};
      for (const storageKey of Object.values(KEYS)) {
        base[storageKey] = DEFAULTS[storageKey];
      }
      return { ...base, ...overrides };
    }

    it('should return success when importing valid data', () => {
      const data = makeValidImport();
      const result = importAll(JSON.stringify(data));
      assert.deepEqual(result, { success: true });
    });

    it('should replace all localStorage data on success', () => {
      const customBalances = { goPlus: 999, card1: 888, card2: 777, parking: 666 };
      const data = makeValidImport({ [KEYS.balances]: customBalances });
      importAll(JSON.stringify(data));
      const stored = load(KEYS.balances);
      assert.deepEqual(stored, customBalances);
    });

    it('should return error for invalid JSON', () => {
      const result = importAll('not valid json {{{');
      assert.equal(result.success, false);
      assert.ok(result.error.length > 0);
    });

    it('should return error for null JSON value', () => {
      const result = importAll('null');
      assert.equal(result.success, false);
    });

    it('should return error for array JSON value', () => {
      const result = importAll('[]');
      assert.equal(result.success, false);
    });

    it('should return error when a required key is missing', () => {
      const data = makeValidImport();
      delete data[KEYS.snapshots];
      const result = importAll(JSON.stringify(data));
      assert.equal(result.success, false);
      assert.ok(result.error.includes(KEYS.snapshots));
    });

    it('should return error when rateTable is not an object', () => {
      const data = makeValidImport({ [KEYS.rateTable]: 'not an object' });
      const result = importAll(JSON.stringify(data));
      assert.equal(result.success, false);
      assert.ok(result.error.includes('rateTable'));
    });

    it('should return error when rateTable missing a day type', () => {
      const rt = { ...DEFAULTS[KEYS.rateTable] };
      delete rt.weekday;
      const data = makeValidImport({ [KEYS.rateTable]: rt });
      const result = importAll(JSON.stringify(data));
      assert.equal(result.success, false);
      assert.ok(result.error.includes('weekday'));
    });

    it('should return error when rateTable day type missing a wallet', () => {
      const rt = JSON.parse(JSON.stringify(DEFAULTS[KEYS.rateTable]));
      delete rt.weekday.goPlus;
      const data = makeValidImport({ [KEYS.rateTable]: rt });
      const result = importAll(JSON.stringify(data));
      assert.equal(result.success, false);
      assert.ok(result.error.includes('goPlus'));
    });

    it('should return error when rateTable wallet value is not a number', () => {
      const rt = JSON.parse(JSON.stringify(DEFAULTS[KEYS.rateTable]));
      rt.weekday.goPlus = 'five';
      const data = makeValidImport({ [KEYS.rateTable]: rt });
      const result = importAll(JSON.stringify(data));
      assert.equal(result.success, false);
      assert.ok(result.error.includes('number'));
    });

    it('should return error when balances is not an object', () => {
      const data = makeValidImport({ [KEYS.balances]: [1, 2, 3] });
      const result = importAll(JSON.stringify(data));
      assert.equal(result.success, false);
      assert.ok(result.error.includes('balances'));
    });

    it('should return error when balances wallet value is not a number', () => {
      const data = makeValidImport({ [KEYS.balances]: { goPlus: 'abc', card1: 0, card2: 0, parking: 0 } });
      const result = importAll(JSON.stringify(data));
      assert.equal(result.success, false);
    });

    it('should return error when bills is not an array', () => {
      const data = makeValidImport({ [KEYS.bills]: {} });
      const result = importAll(JSON.stringify(data));
      assert.equal(result.success, false);
      assert.ok(result.error.includes('bills'));
    });

    it('should return error when a bill is missing required fields', () => {
      const data = makeValidImport({ [KEYS.bills]: [{ id: 'test' }] });
      const result = importAll(JSON.stringify(data));
      assert.equal(result.success, false);
    });

    it('should return error when dayOverrides value is not a string', () => {
      const data = makeValidImport({ [KEYS.dayOverrides]: { '2025-01-01': 123 } });
      const result = importAll(JSON.stringify(data));
      assert.equal(result.success, false);
      assert.ok(result.error.includes('dayOverrides'));
    });

    it('should return error when atOffice value is not a boolean', () => {
      const data = makeValidImport({ [KEYS.atOffice]: { '2025-01-01': 'yes' } });
      const result = importAll(JSON.stringify(data));
      assert.equal(result.success, false);
      assert.ok(result.error.includes('atOffice'));
    });

    it('should return error when holidays is not an array', () => {
      const data = makeValidImport({ [KEYS.holidays]: {} });
      const result = importAll(JSON.stringify(data));
      assert.equal(result.success, false);
    });

    it('should return error when snapshots is not an array', () => {
      const data = makeValidImport({ [KEYS.snapshots]: 'not array' });
      const result = importAll(JSON.stringify(data));
      assert.equal(result.success, false);
    });

    it('should return error when billOverrides is not an object', () => {
      const data = makeValidImport({ [KEYS.billOverrides]: [] });
      const result = importAll(JSON.stringify(data));
      assert.equal(result.success, false);
    });

    it('should preserve existing data on validation failure', () => {
      // Save some initial data
      const originalBalances = { goPlus: 100, card1: 50, card2: 25, parking: 10 };
      save(KEYS.balances, originalBalances);

      // Try invalid import
      const result = importAll('invalid json!');
      assert.equal(result.success, false);

      // Verify original data is unchanged
      const stored = load(KEYS.balances);
      assert.deepEqual(stored, originalBalances);
    });

    it('should preserve existing data when required key is missing', () => {
      const originalBalances = { goPlus: 200, card1: 60, card2: 30, parking: 15 };
      save(KEYS.balances, originalBalances);

      const data = makeValidImport();
      delete data[KEYS.rateTable]; // Remove a required key
      const result = importAll(JSON.stringify(data));
      assert.equal(result.success, false);

      // Original data unchanged
      assert.deepEqual(load(KEYS.balances), originalBalances);
    });

    it('should handle round-trip: exportAll then importAll', () => {
      // Set up custom data
      const customBalances = { goPlus: 300, card1: 150, card2: 75, parking: 40 };
      save(KEYS.balances, customBalances);

      // Export
      const exported = exportAll();

      // Clear and reimport
      localStorage.clear();
      const result = importAll(exported);
      assert.deepEqual(result, { success: true });

      // Verify data restored
      assert.deepEqual(load(KEYS.balances), customBalances);
    });
  });

  describe('saveSnapshot()', () => {
    it('should save a new snapshot when none exist', () => {
      const data = {
        balances: { goPlus: 150, card1: 45, card2: 30, parking: 20 },
        projections: { goPlus: 85.20, card1: 32.10, card2: 12.50, parking: 0 },
        topUps: { goPlus: 180, card1: 35, card2: 15, parking: 0 },
        billsTotal: 273.00,
      };

      saveSnapshot('2025-01', data);

      const stored = JSON.parse(localStorage.getItem(KEYS.snapshots));
      assert.equal(stored.length, 1);
      assert.equal(stored[0].month, '2025-01');
      assert.deepEqual(stored[0].balances, data.balances);
      assert.deepEqual(stored[0].projections, data.projections);
      assert.deepEqual(stored[0].topUps, data.topUps);
      assert.equal(stored[0].billsTotal, 273.00);
    });

    it('should add a new snapshot alongside existing ones', () => {
      const jan = {
        balances: { goPlus: 100, card1: 40, card2: 20, parking: 15 },
        projections: { goPlus: 70, card1: 25, card2: 10, parking: 0 },
        topUps: { goPlus: 150, card1: 30, card2: 10, parking: 0 },
        billsTotal: 200.00,
      };
      const feb = {
        balances: { goPlus: 120, card1: 50, card2: 25, parking: 18 },
        projections: { goPlus: 80, card1: 30, card2: 15, parking: 0 },
        topUps: { goPlus: 160, card1: 35, card2: 15, parking: 0 },
        billsTotal: 250.00,
      };

      saveSnapshot('2025-01', jan);
      saveSnapshot('2025-02', feb);

      const stored = JSON.parse(localStorage.getItem(KEYS.snapshots));
      assert.equal(stored.length, 2);
      assert.equal(stored[0].month, '2025-01');
      assert.equal(stored[1].month, '2025-02');
    });

    it('should update an existing snapshot for the same month', () => {
      const original = {
        balances: { goPlus: 100, card1: 40, card2: 20, parking: 15 },
        projections: { goPlus: 70, card1: 25, card2: 10, parking: 0 },
        topUps: { goPlus: 150, card1: 30, card2: 10, parking: 0 },
        billsTotal: 200.00,
      };
      const updated = {
        balances: { goPlus: 200, card1: 60, card2: 35, parking: 20 },
        projections: { goPlus: 90, card1: 35, card2: 15, parking: 5 },
        topUps: { goPlus: 180, card1: 40, card2: 20, parking: 5 },
        billsTotal: 300.00,
      };

      saveSnapshot('2025-01', original);
      saveSnapshot('2025-01', updated);

      const stored = JSON.parse(localStorage.getItem(KEYS.snapshots));
      assert.equal(stored.length, 1);
      assert.equal(stored[0].month, '2025-01');
      assert.deepEqual(stored[0].balances, updated.balances);
      assert.deepEqual(stored[0].projections, updated.projections);
      assert.deepEqual(stored[0].topUps, updated.topUps);
      assert.equal(stored[0].billsTotal, 300.00);
    });
  });

  describe('getSnapshots()', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('should return empty array when no snapshots exist', () => {
      const result = getSnapshots();
      assert.deepEqual(result, []);
    });

    it('should return snapshots sorted by month ascending', () => {
      // Save out of order
      saveSnapshot('2025-03', {
        balances: { goPlus: 300, card1: 60, card2: 30, parking: 20 },
        projections: { goPlus: 90, card1: 35, card2: 15, parking: 0 },
        topUps: { goPlus: 200, card1: 40, card2: 20, parking: 0 },
        billsTotal: 280.00,
      });
      saveSnapshot('2025-01', {
        balances: { goPlus: 100, card1: 40, card2: 20, parking: 15 },
        projections: { goPlus: 70, card1: 25, card2: 10, parking: 0 },
        topUps: { goPlus: 150, card1: 30, card2: 10, parking: 0 },
        billsTotal: 200.00,
      });
      saveSnapshot('2025-02', {
        balances: { goPlus: 200, card1: 50, card2: 25, parking: 18 },
        projections: { goPlus: 80, card1: 30, card2: 12, parking: 0 },
        topUps: { goPlus: 170, card1: 35, card2: 15, parking: 0 },
        billsTotal: 240.00,
      });

      const result = getSnapshots();
      assert.equal(result.length, 3);
      assert.equal(result[0].month, '2025-01');
      assert.equal(result[1].month, '2025-02');
      assert.equal(result[2].month, '2025-03');
    });

    it('should not mutate the stored array', () => {
      saveSnapshot('2025-01', {
        balances: { goPlus: 100, card1: 40, card2: 20, parking: 15 },
        projections: { goPlus: 70, card1: 25, card2: 10, parking: 0 },
        topUps: { goPlus: 150, card1: 30, card2: 10, parking: 0 },
        billsTotal: 200.00,
      });

      const result1 = getSnapshots();
      result1.push({ month: '2099-12', balances: {}, projections: {}, topUps: {}, billsTotal: 0 });

      const result2 = getSnapshots();
      assert.equal(result2.length, 1);
    });
  });
});


// ─── Arbitrary Generators for Property Tests ────────────────────────────────

const DAY_TYPE_KEYS = ['weekday', 'saturday', 'sundayHoliday', 'justWork', 'justBabysitters', 'atOffice', 'onLeave'];
const WALLET_KEYS = ['goPlus', 'card1', 'card2', 'parking'];
const VALID_DAY_TYPES = ['weekday', 'saturday', 'sundayHoliday', 'justWork', 'justBabysitters', 'atOffice', 'onLeave'];

// Wallet amounts object: { goPlus, card1, card2, parking } with numbers in given range
function arbWalletAmounts(min, max) {
  return fc.record({
    goPlus: fc.double({ min, max, noNaN: true, noDefaultInfinity: true }),
    card1: fc.double({ min, max, noNaN: true, noDefaultInfinity: true }),
    card2: fc.double({ min, max, noNaN: true, noDefaultInfinity: true }),
    parking: fc.double({ min, max, noNaN: true, noDefaultInfinity: true }),
  });
}

// Rate table: 7 day-type keys each with 4 wallet amounts (0–999.99)
const arbRateTable = fc.record({
  weekday: arbWalletAmounts(0, 999.99),
  saturday: arbWalletAmounts(0, 999.99),
  sundayHoliday: arbWalletAmounts(0, 999.99),
  justWork: arbWalletAmounts(0, 999.99),
  justBabysitters: arbWalletAmounts(0, 999.99),
  atOffice: arbWalletAmounts(0, 999.99),
  onLeave: arbWalletAmounts(0, 999.99),
});

// Balances: 4 wallet amounts (0–99999.99)
const arbBalances = arbWalletAmounts(0, 99999.99);

// Monthly misc: 4 wallet amounts (0–9999.99)
const arbMonthlyMisc = arbWalletAmounts(0, 9999.99);

// Minimum balances: 4 wallet amounts (0–999.99)
const arbMinimumBalances = arbWalletAmounts(0, 999.99);

// Bill object
const arbBill = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  amount: fc.double({ min: 0, max: 9999.99, noNaN: true, noDefaultInfinity: true }),
  frequency: fc.constantFrom('monthly', 'biYearly'),
}).chain(bill => {
  if (bill.frequency === 'biYearly') {
    return fc.array(fc.integer({ min: 1, max: 12 }), { minLength: 1, maxLength: 6 }).map(dueMonths => ({
      ...bill,
      dueMonths: [...new Set(dueMonths)],
    }));
  }
  return fc.constant(bill);
});

// Bills list
const arbBills = fc.array(arbBill, { minLength: 0, maxLength: 10 });

// Date string YYYY-MM-DD
const arbDateStr = fc.tuple(
  fc.integer({ min: 2020, max: 2030 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 1, max: 28 })
).map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

// Day overrides: object with YYYY-MM-DD keys → valid day type string values
const arbDayOverrides = fc.dictionary(
  arbDateStr,
  fc.constantFrom('justWork', 'justBabysitters', 'onLeave')
);

// At office: object with YYYY-MM-DD keys → boolean values
const arbAtOffice = fc.dictionary(arbDateStr, fc.boolean());

// Holidays: array of public or school holiday objects
const arbPublicHoliday = fc.record({
  type: fc.constant('public'),
  date: arbDateStr,
  name: fc.string({ minLength: 1, maxLength: 30 }),
});

const arbSchoolHoliday = fc.tuple(arbDateStr, arbDateStr, fc.string({ minLength: 1, maxLength: 30 })).map(
  ([d1, d2, name]) => ({
    type: 'school',
    startDate: d1 < d2 ? d1 : d2,
    endDate: d1 < d2 ? d2 : d1,
    name,
  })
);

const arbHolidays = fc.array(fc.oneof(arbPublicHoliday, arbSchoolHoliday), { minLength: 0, maxLength: 10 });

// Bill overrides: object with YYYY-MM keys → object values
const arbMonthKey = fc.tuple(
  fc.integer({ min: 2020, max: 2030 }),
  fc.integer({ min: 1, max: 12 })
).map(([y, m]) => `${y}-${String(m).padStart(2, '0')}`);

const arbBillOverrides = fc.dictionary(
  arbMonthKey,
  fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.double({ min: 0, max: 9999.99, noNaN: true, noDefaultInfinity: true }))
);

// Snapshot object
const arbSnapshot = fc.record({
  month: arbMonthKey,
  balances: arbWalletAmounts(0, 99999.99),
  projections: arbWalletAmounts(0, 99999.99),
  topUps: arbWalletAmounts(0, 99999.99),
  billsTotal: fc.double({ min: 0, max: 99999.99, noNaN: true, noDefaultInfinity: true }),
});

const arbSnapshots = fc.array(arbSnapshot, { minLength: 0, maxLength: 5 });

// Full valid app state
const arbValidState = fc.record({
  rateTable: arbRateTable,
  balances: arbBalances,
  monthlyMisc: arbMonthlyMisc,
  minimumBalances: arbMinimumBalances,
  bills: arbBills,
  dayOverrides: arbDayOverrides,
  atOffice: arbAtOffice,
  holidays: arbHolidays,
  billOverrides: arbBillOverrides,
  snapshots: arbSnapshots,
  lastActiveMonth: fc.oneof(fc.constant(null), arbMonthKey),
});

// ─── Helpers for Property Tests ──────────────────────────────────────────────

/**
 * Normalize an object through JSON round-trip to strip null prototypes
 * that fast-check's record/dictionary generators produce.
 * This ensures deepStrictEqual works correctly since localStorage
 * round-trips always produce standard prototype objects.
 */
function normalize(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Save a full state to localStorage and return the normalized version
 * (what you'd get back after a JSON round-trip through localStorage).
 */
function saveFullState(state) {
  save(KEYS.rateTable, state.rateTable);
  save(KEYS.balances, state.balances);
  save(KEYS.monthlyMisc, state.monthlyMisc);
  save(KEYS.minimumBalances, state.minimumBalances);
  save(KEYS.bills, state.bills);
  save(KEYS.dayOverrides, state.dayOverrides);
  save(KEYS.atOffice, state.atOffice);
  save(KEYS.holidays, state.holidays);
  save(KEYS.billOverrides, state.billOverrides);
  save(KEYS.snapshots, state.snapshots);
  save(KEYS.lastActiveMonth, state.lastActiveMonth !== undefined ? state.lastActiveMonth : null);
}

/**
 * Read all keys from localStorage and return as a plain object.
 */
function loadFullState() {
  return {
    rateTable: load(KEYS.rateTable),
    balances: load(KEYS.balances),
    monthlyMisc: load(KEYS.monthlyMisc),
    minimumBalances: load(KEYS.minimumBalances),
    bills: load(KEYS.bills),
    dayOverrides: load(KEYS.dayOverrides),
    atOffice: load(KEYS.atOffice),
    holidays: load(KEYS.holidays),
    billOverrides: load(KEYS.billOverrides),
    snapshots: load(KEYS.snapshots),
    lastActiveMonth: load(KEYS.lastActiveMonth),
  };
}

// ─── Property-Based Tests: Export/Import ────────────────────────────────────

describe('store.js — Property-Based Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Property 7: Data export/import round-trip', () => {
    /**
     * **Validates: Requirements 12.2, 12.3, 12.4**
     *
     * For any valid app state, exporting via exportAll() and then importing via
     * importAll() SHALL produce an app state identical to the original.
     */
    it('exportAll() → importAll() produces identical state', () => {
      fc.assert(
        fc.property(arbValidState, (state) => {
          // 1. Save all keys to localStorage with the generated state
          localStorage.clear();
          saveFullState(state);

          // 2. Capture the normalized state (what localStorage actually stores after JSON round-trip)
          const expectedState = loadFullState();

          // 3. Export
          const exported = exportAll();

          // 4. Clear storage
          localStorage.clear();

          // 5. Import
          const result = importAll(exported);
          assert.deepEqual(result, { success: true });

          // 6. Verify all keys match the expected (normalized) state
          const restoredState = loadFullState();
          assert.deepEqual(restoredState, expectedState);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 8: Invalid import preserves existing data', () => {
    /**
     * **Validates: Requirements 12.5**
     *
     * For any current app state and any string that is not a valid export JSON,
     * calling importAll() SHALL return an error and leave the app state unchanged.
     */

    // Generator: completely malformed strings (not parseable as JSON)
    const arbMalformedJson = fc.oneof(
      fc.string().filter(s => { try { JSON.parse(s); return false; } catch { return true; } }),
      fc.constant('{not valid json{{{'),
      fc.constant('undefined'),
      fc.constant('{missing: quotes}'),
      fc.constant('{"unclosed": '),
    );

    // Generator: valid JSON but wrong type (null, array, number, string)
    const arbWrongTypeJson = fc.oneof(
      fc.constant('null'),
      fc.constant('[]'),
      fc.constant('[1, 2, 3]'),
      fc.integer().map(n => JSON.stringify(n)),
      fc.string().map(s => JSON.stringify(s)),
      fc.constant('true'),
      fc.constant('false'),
    );

    // Generator: object missing required keys
    const arbMissingKeysJson = arbValidState.chain(state => {
      const allKeys = Object.values(KEYS);
      return fc.constantFrom(...allKeys).map(keyToRemove => {
        const obj = {};
        obj[KEYS.rateTable] = state.rateTable;
        obj[KEYS.balances] = state.balances;
        obj[KEYS.monthlyMisc] = state.monthlyMisc;
        obj[KEYS.minimumBalances] = state.minimumBalances;
        obj[KEYS.bills] = state.bills;
        obj[KEYS.dayOverrides] = state.dayOverrides;
        obj[KEYS.atOffice] = state.atOffice;
        obj[KEYS.holidays] = state.holidays;
        obj[KEYS.billOverrides] = state.billOverrides;
        obj[KEYS.snapshots] = state.snapshots;
        delete obj[keyToRemove];
        return JSON.stringify(obj);
      });
    });

    // Generator: object with wrong value types for specific keys
    const arbWrongValueTypesJson = fc.constantFrom(
      // rateTable is a string instead of object
      JSON.stringify({ ...makeFullState(), [KEYS.rateTable]: 'not an object' }),
      // balances is an array instead of object
      JSON.stringify({ ...makeFullState(), [KEYS.balances]: [1, 2, 3, 4] }),
      // bills is an object instead of array
      JSON.stringify({ ...makeFullState(), [KEYS.bills]: { a: 1 } }),
      // dayOverrides has number values instead of strings
      JSON.stringify({ ...makeFullState(), [KEYS.dayOverrides]: { '2025-01-01': 123 } }),
      // atOffice has string values instead of booleans
      JSON.stringify({ ...makeFullState(), [KEYS.atOffice]: { '2025-01-01': 'yes' } }),
      // holidays is an object instead of array
      JSON.stringify({ ...makeFullState(), [KEYS.holidays]: {} }),
      // snapshots is a string instead of array
      JSON.stringify({ ...makeFullState(), [KEYS.snapshots]: 'not array' }),
      // billOverrides is an array instead of object
      JSON.stringify({ ...makeFullState(), [KEYS.billOverrides]: [] }),
      // monthlyMisc has string values
      JSON.stringify({ ...makeFullState(), [KEYS.monthlyMisc]: { goPlus: 'x', card1: 0, card2: 0, parking: 0 } }),
      // minimumBalances has boolean values
      JSON.stringify({ ...makeFullState(), [KEYS.minimumBalances]: { goPlus: true, card1: 20, card2: 20, parking: 15 } }),
    );

    it('malformed JSON preserves existing data and returns error', () => {
      fc.assert(
        fc.property(arbValidState, arbMalformedJson, (state, invalidJson) => {
          // Set up known state
          localStorage.clear();
          saveFullState(state);

          // Capture normalized state before import attempt
          const stateBefore = loadFullState();

          // Attempt invalid import
          const result = importAll(invalidJson);

          // Must return error
          assert.equal(result.success, false);
          assert.equal(typeof result.error, 'string');
          assert.ok(result.error.length > 0);

          // State unchanged
          const stateAfter = loadFullState();
          assert.deepEqual(stateAfter, stateBefore);
        }),
        { numRuns: 100 }
      );
    });

    it('wrong type JSON (null, array, number, string, boolean) preserves existing data', () => {
      fc.assert(
        fc.property(arbValidState, arbWrongTypeJson, (state, invalidJson) => {
          localStorage.clear();
          saveFullState(state);
          const stateBefore = loadFullState();

          const result = importAll(invalidJson);

          assert.equal(result.success, false);
          assert.equal(typeof result.error, 'string');
          assert.ok(result.error.length > 0);

          const stateAfter = loadFullState();
          assert.deepEqual(stateAfter, stateBefore);
        }),
        { numRuns: 100 }
      );
    });

    it('object with missing required keys preserves existing data', () => {
      fc.assert(
        fc.property(arbValidState, arbMissingKeysJson, (state, invalidJson) => {
          localStorage.clear();
          saveFullState(state);
          const stateBefore = loadFullState();

          const result = importAll(invalidJson);

          assert.equal(result.success, false);
          assert.equal(typeof result.error, 'string');
          assert.ok(result.error.length > 0);

          const stateAfter = loadFullState();
          assert.deepEqual(stateAfter, stateBefore);
        }),
        { numRuns: 100 }
      );
    });

    it('object with wrong value types preserves existing data', () => {
      fc.assert(
        fc.property(arbValidState, arbWrongValueTypesJson, (state, invalidJson) => {
          localStorage.clear();
          saveFullState(state);
          const stateBefore = loadFullState();

          const result = importAll(invalidJson);

          assert.equal(result.success, false);
          assert.equal(typeof result.error, 'string');
          assert.ok(result.error.length > 0);

          const stateAfter = loadFullState();
          assert.deepEqual(stateAfter, stateBefore);
        }),
        { numRuns: 100 }
      );
    });
  });
});

// Helper function for wrong value type generator
function makeFullState() {
  const obj = {};
  for (const key of Object.values(KEYS)) {
    obj[key] = DEFAULTS[key];
  }
  return obj;
}
