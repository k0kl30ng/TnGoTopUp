import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { projectWallet, projectCurrentMonth, projectNextMonth, roundUpRM5, calculateTopUp, calculateBillsTotal, calculateAllTopUps } from '../js/calc.js';
import { classifyDay, getEffectiveRate } from '../js/calendar.js';

// Default rate table from requirements
const defaultRateTable = {
  weekday:        { goPlus: 2.10, card1: 1.39, card2: 0, parking: 0 },
  saturday:       { goPlus: 8.80, card1: 0, card2: 2.50, parking: 0 },
  sundayHoliday:  { goPlus: 0, card1: 0, card2: 0, parking: 0 },
  justWork:       { goPlus: 2.10, card1: 1.65, card2: 0, parking: 0 },
  justBabysitters:{ goPlus: 4.20, card1: 0, card2: 0, parking: 0 },
  atOffice:       { goPlus: 2.10, card1: 0, card2: 0, parking: 0 },
  onLeave:        { goPlus: 4.20, card1: 2.78, card2: 0, parking: 0 }
};

const defaultMonthlyMisc = { goPlus: 0, card1: 0, card2: 0, parking: 0 };

describe('calc.js', () => {
  describe('projectWallet', () => {
    it('should return only monthlyMisc when days array is empty', () => {
      const misc = { goPlus: 10, card1: 5, card2: 0, parking: 0 };
      const result = projectWallet('goPlus', [], defaultRateTable, misc, {}, {}, []);
      assert.equal(result, 10);
    });

    it('should sum weekday rates for a single weekday', () => {
      // 2025-02-03 is a Monday
      const days = [{ date: '2025-02-03', dayOfWeek: 1 }];
      const result = projectWallet('goPlus', days, defaultRateTable, defaultMonthlyMisc, {}, {}, []);
      assert.equal(result, 2.10);
    });

    it('should sum rates for mixed day types', () => {
      // Mon + Sat → weekday(2.10) + saturday(8.80) = 10.90 for goPlus
      const days = [
        { date: '2025-02-03', dayOfWeek: 1 }, // Monday
        { date: '2025-02-08', dayOfWeek: 6 }, // Saturday
      ];
      const result = projectWallet('goPlus', days, defaultRateTable, defaultMonthlyMisc, {}, {}, []);
      assert.ok(Math.abs(result - 10.90) < 0.001);
    });

    it('should add monthlyMisc exactly once', () => {
      const misc = { goPlus: 50, card1: 0, card2: 0, parking: 0 };
      const days = [
        { date: '2025-02-03', dayOfWeek: 1 }, // weekday
        { date: '2025-02-04', dayOfWeek: 2 }, // weekday
      ];
      // 2 weekdays × 2.10 + 50 misc = 54.20
      const result = projectWallet('goPlus', days, defaultRateTable, misc, {}, {}, []);
      assert.ok(Math.abs(result - 54.20) < 0.001);
    });

    it('should respect day overrides', () => {
      // Override Monday to onLeave: rate is 4.20 for goPlus instead of 2.10
      const days = [{ date: '2025-02-03', dayOfWeek: 1 }];
      const overrides = { '2025-02-03': 'onLeave' };
      const result = projectWallet('goPlus', days, defaultRateTable, defaultMonthlyMisc, overrides, {}, []);
      assert.ok(Math.abs(result - 4.20) < 0.001);
    });

    it('should respect atOffice flags', () => {
      // AtOffice overrides everything: rate is 2.10 for goPlus
      const days = [{ date: '2025-02-08', dayOfWeek: 6 }]; // Saturday
      const atOfficeFlags = { '2025-02-08': true };
      const result = projectWallet('goPlus', days, defaultRateTable, defaultMonthlyMisc, {}, atOfficeFlags, []);
      assert.ok(Math.abs(result - 2.10) < 0.001);
    });

    it('should use sundayHoliday rate for holidays', () => {
      // Monday that's a public holiday → sundayHoliday rate (0 for goPlus)
      const days = [{ date: '2025-02-03', dayOfWeek: 1 }];
      const holidays = [{ type: 'public', date: '2025-02-03', name: 'Test Holiday' }];
      const result = projectWallet('goPlus', days, defaultRateTable, defaultMonthlyMisc, {}, {}, holidays);
      assert.equal(result, 0);
    });
  });

  describe('projectCurrentMonth', () => {
    it('should project remaining days from today to month-end', () => {
      // Feb 2025 has 28 days. If today is Feb 27, only 2 days remain (27th Thu, 28th Fri)
      const result = projectCurrentMonth('2025-02-27', defaultRateTable, defaultMonthlyMisc, {}, {}, []);
      // 2 weekdays for goPlus: 2 × 2.10 = 4.20
      assert.ok(Math.abs(result.goPlus - 4.20) < 0.001);
    });

    it('should return projections for all 4 wallets', () => {
      const result = projectCurrentMonth('2025-02-28', defaultRateTable, defaultMonthlyMisc, {}, {}, []);
      assert.ok('goPlus' in result);
      assert.ok('card1' in result);
      assert.ok('card2' in result);
      assert.ok('parking' in result);
    });

    it('should return only monthlyMisc when today is the last day and it is a Sunday', () => {
      // 2025-03-30 is a Sunday (last non-last day), 2025-03-31 is a Monday
      // Let's pick a month ending on Sunday: August 2025 ends on Sunday the 31st
      // Actually let's just check: if today is the last day and it's a Sunday, rate is 0
      const misc = { goPlus: 25, card1: 0, card2: 0, parking: 0 };
      // 2025-08-31 is a Sunday
      const result = projectCurrentMonth('2025-08-31', defaultRateTable, misc, {}, {}, []);
      // sundayHoliday rate (0) + misc (25) = 25
      assert.ok(Math.abs(result.goPlus - 25) < 0.001);
    });

    it('should accept a Date object as today', () => {
      const today = new Date(2025, 1, 27); // Feb 27, 2025
      const result = projectCurrentMonth(today, defaultRateTable, defaultMonthlyMisc, {}, {}, []);
      // 2 weekdays for goPlus: 2 × 2.10 = 4.20
      assert.ok(Math.abs(result.goPlus - 4.20) < 0.001);
    });
  });

  describe('projectNextMonth', () => {
    it('should project all days in the given month', () => {
      // Feb 2025: 28 days. Compute expected goPlus:
      // Mon-Fri weekdays × 2.10 + Saturdays × 8.80 + Sundays × 0
      // Feb 2025: starts on Saturday. 4 Saturdays (1,8,15,22), 4 Sundays (2,9,16,23), 20 weekdays
      const result = projectNextMonth(2025, 2, defaultRateTable, defaultMonthlyMisc, {}, {}, []);
      // goPlus: 20 × 2.10 + 4 × 8.80 + 4 × 0 = 42 + 35.2 = 77.2
      assert.ok(Math.abs(result.goPlus - 77.20) < 0.001);
    });

    it('should return projections for all 4 wallets', () => {
      const result = projectNextMonth(2025, 3, defaultRateTable, defaultMonthlyMisc, {}, {}, []);
      assert.ok('goPlus' in result);
      assert.ok('card1' in result);
      assert.ok('card2' in result);
      assert.ok('parking' in result);
    });

    it('should include monthlyMisc in projection', () => {
      const misc = { goPlus: 100, card1: 0, card2: 0, parking: 0 };
      const result = projectNextMonth(2025, 2, defaultRateTable, misc, {}, {}, []);
      // Same as above (77.20) + 100 misc = 177.20
      assert.ok(Math.abs(result.goPlus - 177.20) < 0.001);
    });

    it('should handle leap year February', () => {
      // 2024 is a leap year, Feb has 29 days
      const result = projectNextMonth(2024, 2, defaultRateTable, defaultMonthlyMisc, {}, {}, []);
      // Feb 2024: starts on Thursday. 
      // Weekdays: 21 (Thu 1, Fri 2, Mon 5–Fri 9: 5, Mon 12–Fri 16: 5, Mon 19–Fri 23: 5, Mon 26–Thu 29: 4 → wait)
      // Let me count: 1(Thu), 2(Fri), 5(Mon), 6(Tue), 7(Wed), 8(Thu), 9(Fri), 12(Mon), 13(Tue), 14(Wed), 15(Thu), 16(Fri), 19(Mon), 20(Tue), 21(Wed), 22(Thu), 23(Fri), 26(Mon), 27(Tue), 28(Wed), 29(Thu) = 21 weekdays
      // Saturdays: 3, 10, 17, 24 = 4
      // Sundays: 4, 11, 18, 25 = 4
      // goPlus: 21 × 2.10 + 4 × 8.80 + 4 × 0 = 44.10 + 35.20 = 79.30
      assert.ok(Math.abs(result.goPlus - 79.30) < 0.001);
    });
  });

  describe('roundUpRM5', () => {
    it('rounds 23.50 up to 25', () => {
      assert.equal(roundUpRM5(23.50), 25);
    });

    it('keeps exact multiple 20.00 unchanged', () => {
      assert.equal(roundUpRM5(20.00), 20);
    });

    it('returns 0 for 0', () => {
      assert.equal(roundUpRM5(0), 0);
    });

    it('returns 0 for negative values', () => {
      assert.equal(roundUpRM5(-5), 0);
    });

    it('keeps exact multiple 15 unchanged', () => {
      assert.equal(roundUpRM5(15), 15);
    });

    it('rounds 15.01 up to 20', () => {
      assert.equal(roundUpRM5(15.01), 20);
    });

    it('rounds 1 up to 5', () => {
      assert.equal(roundUpRM5(1), 5);
    });
  });

  describe('calculateTopUp', () => {
    it('should return 0 when balance exceeds all obligations', () => {
      // balance=100, currProj=20, nextProj=30, minBal=20
      // estimatedEnd = 100 - 20 = 80; raw = 20 + 30 - 80 = -30 → 0
      const result = calculateTopUp('card1', 100, 20, 30, 20);
      assert.equal(result, 0);
    });

    it('should calculate top-up when balance is insufficient', () => {
      // balance=50, currProj=30, nextProj=40, minBal=20
      // estimatedEnd = 50 - 30 = 20; raw = 20 + 40 - 20 = 40 → roundUpRM5(40) = 40
      const result = calculateTopUp('card1', 50, 30, 40, 20);
      assert.equal(result, 40);
    });

    it('should round up non-multiple-of-5 results', () => {
      // balance=45, currProj=30, nextProj=40, minBal=20
      // estimatedEnd = 45 - 30 = 15; raw = 20 + 40 - 15 = 45 → roundUpRM5(45) = 45
      const result = calculateTopUp('card2', 45, 30, 40, 20);
      assert.equal(result, 45);
    });

    it('should round up fractional results to nearest RM5', () => {
      // balance=47, currProj=30, nextProj=40, minBal=20
      // estimatedEnd = 47 - 30 = 17; raw = 20 + 40 - 17 = 43 → roundUpRM5(43) = 45
      const result = calculateTopUp('card2', 47, 30, 40, 20);
      assert.equal(result, 45);
    });

    it('should return 0 when raw amount is exactly zero', () => {
      // balance=60, currProj=20, nextProj=20, minBal=20
      // estimatedEnd = 60 - 20 = 40; raw = 20 + 20 - 40 = 0 → 0
      const result = calculateTopUp('parking', 60, 20, 20, 20);
      assert.equal(result, 0);
    });

    it('should handle zero current balance needing full top-up', () => {
      // balance=0, currProj=0, nextProj=50, minBal=15
      // estimatedEnd = 0 - 0 = 0; raw = 15 + 50 - 0 = 65 → roundUpRM5(65) = 65
      const result = calculateTopUp('parking', 0, 0, 50, 15);
      assert.equal(result, 65);
    });

    it('should handle case where current month spending depletes balance', () => {
      // balance=30, currProj=30, nextProj=28, minBal=20
      // estimatedEnd = 30 - 30 = 0; raw = 20 + 28 - 0 = 48 → roundUpRM5(48) = 50
      const result = calculateTopUp('card1', 30, 30, 28, 20);
      assert.equal(result, 50);
    });

    it('should not use the wallet parameter in calculation', () => {
      // Same inputs, different wallet names — same result
      const result1 = calculateTopUp('card1', 50, 20, 40, 20);
      const result2 = calculateTopUp('parking', 50, 20, 40, 20);
      assert.equal(result1, result2);
    });
  });
});


// ===== Property-Based Tests =====
// Property 3: Top-up formula for linked wallets
// **Validates: Requirements 9.1, 9.2**

describe('Property 3: Top-up formula for linked wallets', () => {
  const linkedWallets = ['card1', 'card2', 'parking'];

  // Generator: linked wallet name
  const arbLinkedWallet = fc.constantFrom(...linkedWallets);

  // Generator: non-negative balance (0 to 99999.99)
  const arbBalance = fc.double({ min: 0, max: 99999.99, noNaN: true, noDefaultInfinity: true });

  // Generator: non-negative projection (0 to 9999.99)
  const arbProjection = fc.double({ min: 0, max: 9999.99, noNaN: true, noDefaultInfinity: true });

  // Generator: minimum balance (0 to 999.99)
  const arbMinimumBalance = fc.double({ min: 0, max: 999.99, noNaN: true, noDefaultInfinity: true });

  it('raw top-up equals max(0, minBal + nextProj - (bal - currProj))', () => {
    fc.assert(
      fc.property(
        arbLinkedWallet, arbBalance, arbProjection, arbProjection, arbMinimumBalance,
        (wallet, currentBalance, currentMonthProjection, nextMonthProjection, minimumBalance) => {
          const result = calculateTopUp(wallet, currentBalance, currentMonthProjection, nextMonthProjection, minimumBalance);

          // Compute expected raw amount
          const estimatedEndBalance = currentBalance - currentMonthProjection;
          const rawAmount = Math.max(0, minimumBalance + nextMonthProjection - estimatedEndBalance);
          const expected = roundUpRM5(rawAmount);

          assert.strictEqual(result, expected,
            `calculateTopUp("${wallet}", ${currentBalance}, ${currentMonthProjection}, ${nextMonthProjection}, ${minimumBalance}) = ${result}, expected ${expected}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('final top-up is always roundUpRM5 of the raw amount', () => {
    fc.assert(
      fc.property(
        arbLinkedWallet, arbBalance, arbProjection, arbProjection, arbMinimumBalance,
        (wallet, currentBalance, currentMonthProjection, nextMonthProjection, minimumBalance) => {
          const result = calculateTopUp(wallet, currentBalance, currentMonthProjection, nextMonthProjection, minimumBalance);

          // Result must be 0 or a positive multiple of 5
          if (result > 0) {
            assert.strictEqual(result % 5, 0,
              `Top-up ${result} should be a multiple of 5`);
          } else {
            assert.strictEqual(result, 0,
              `Top-up should be exactly 0 when no top-up needed`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ===== Property-Based Tests =====
// Property 5: RM5 rounding correctness
// **Validates: Requirements 9.3, 9.5**

describe('Property 5: RM5 rounding correctness', () => {
  // Generator: positive numbers (0.01 to 99999)
  const arbPositiveNumber = fc.double({ min: 0.01, max: 99999, noNaN: true, noDefaultInfinity: true });

  // Generator: non-positive numbers (-99999 to 0)
  const arbNonPositiveNumber = fc.double({ min: -99999, max: 0, noNaN: true, noDefaultInfinity: true });

  // Generator: exact multiples of 5 (positive)
  const arbMultipleOf5 = fc.integer({ min: 1, max: 9999 }).map(n => n * 5);

  it('result is always >= input for positive numbers', () => {
    fc.assert(
      fc.property(arbPositiveNumber, (x) => {
        const result = roundUpRM5(x);
        assert.ok(result >= x,
          `roundUpRM5(${x}) = ${result}, expected >= ${x}`);
      }),
      { numRuns: 100 }
    );
  });

  it('result is always a multiple of 5 for positive numbers', () => {
    fc.assert(
      fc.property(arbPositiveNumber, (x) => {
        const result = roundUpRM5(x);
        assert.strictEqual(result % 5, 0,
          `roundUpRM5(${x}) = ${result}, expected result % 5 === 0`);
      }),
      { numRuns: 100 }
    );
  });

  it('result - input is always less than 5 for positive numbers', () => {
    fc.assert(
      fc.property(arbPositiveNumber, (x) => {
        const result = roundUpRM5(x);
        assert.ok(result - x < 5,
          `roundUpRM5(${x}) = ${result}, difference ${result - x} expected < 5`);
      }),
      { numRuns: 100 }
    );
  });

  it('returns 0 for non-positive numbers', () => {
    fc.assert(
      fc.property(arbNonPositiveNumber, (x) => {
        const result = roundUpRM5(x);
        assert.strictEqual(result, 0,
          `roundUpRM5(${x}) = ${result}, expected 0 for non-positive input`);
      }),
      { numRuns: 100 }
    );
  });

  it('returns input unchanged for exact multiples of 5', () => {
    fc.assert(
      fc.property(arbMultipleOf5, (x) => {
        const result = roundUpRM5(x);
        assert.strictEqual(result, x,
          `roundUpRM5(${x}) = ${result}, expected ${x} for exact multiple of 5`);
      }),
      { numRuns: 100 }
    );
  });
});


// ===== Property-Based Tests =====
// Property 2: Projection equals sum of effective daily rates plus monthly misc
// **Validates: Requirements 6.3, 7.1, 7.2, 8.1, 8.2**

describe('Property 2: Projection equals sum of effective daily rates plus monthly misc', () => {
  const validDayTypes = ['weekday', 'saturday', 'sundayHoliday', 'justWork', 'justBabysitters', 'atOffice', 'onLeave'];
  const overrideTypes = ['justWork', 'justBabysitters', 'onLeave'];
  const wallets = ['goPlus', 'card1', 'card2', 'parking'];

  // Generator: wallet name
  const arbWallet = fc.constantFrom(...wallets);

  // Generator: rate table with 7 day-type keys, each with 4 wallet amounts
  const arbWalletRates = fc.record({
    goPlus: fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
    card1: fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
    card2: fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
    parking: fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true })
  });

  const arbRateTable = fc.record({
    weekday: arbWalletRates,
    saturday: arbWalletRates,
    sundayHoliday: arbWalletRates,
    justWork: arbWalletRates,
    justBabysitters: arbWalletRates,
    atOffice: arbWalletRates,
    onLeave: arbWalletRates
  });

  // Generator: date string in "YYYY-MM-DD" format (valid dates, day capped at 28)
  const arbDate = fc.record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 })
  }).map(({ year, month, day }) => {
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  });

  // Generator: array of { date, dayOfWeek } day objects (unique dates)
  const arbDays = fc.array(arbDate, { minLength: 0, maxLength: 31 })
    .map(dates => {
      // Deduplicate dates
      const unique = [...new Set(dates)];
      return unique.map(dateStr => {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dayOfWeek = new Date(y, m - 1, d).getDay();
        return { date: dateStr, dayOfWeek };
      });
    });

  // Generator: overrides map (date → override type)
  const arbOverrides = fc.array(
    fc.record({
      date: arbDate,
      type: fc.constantFrom(...overrideTypes)
    }),
    { minLength: 0, maxLength: 5 }
  ).map(entries => {
    const map = {};
    for (const { date, type } of entries) map[date] = type;
    return map;
  });

  // Generator: atOffice flags map (date → true)
  const arbAtOfficeFlags = fc.array(arbDate, { minLength: 0, maxLength: 5 })
    .map(dates => {
      const map = {};
      for (const date of dates) map[date] = true;
      return map;
    });

  // Generator: holidays (public and school)
  const arbPublicHoliday = arbDate.map(date => ({
    type: 'public', date, name: 'Holiday'
  }));

  const arbSchoolHoliday = fc.record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    startDay: fc.integer({ min: 1, max: 20 }),
    duration: fc.integer({ min: 1, max: 7 })
  }).map(({ year, month, startDay, duration }) => {
    const mm = String(month).padStart(2, '0');
    const sd = String(startDay).padStart(2, '0');
    const endDay = Math.min(startDay + duration, 28);
    const ed = String(endDay).padStart(2, '0');
    return {
      type: 'school',
      startDate: `${year}-${mm}-${sd}`,
      endDate: `${year}-${mm}-${ed}`,
      name: 'School Holiday'
    };
  });

  const arbHolidays = fc.array(
    fc.oneof(arbPublicHoliday, arbSchoolHoliday),
    { minLength: 0, maxLength: 5 }
  );

  // Generator: monthlyMisc (positive numbers for each wallet)
  const arbMonthlyMisc = fc.record({
    goPlus: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
    card1: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
    card2: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
    parking: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true })
  });

  it('projection === sum of getEffectiveRate(day) for each day + monthlyMisc[wallet]', () => {
    fc.assert(
      fc.property(
        arbWallet, arbRateTable, arbDays, arbOverrides, arbAtOfficeFlags, arbHolidays, arbMonthlyMisc,
        (wallet, rateTable, days, overrides, atOfficeFlags, holidays, monthlyMisc) => {
          // Compute projection via the function under test
          const projection = projectWallet(wallet, days, rateTable, monthlyMisc, overrides, atOfficeFlags, holidays);

          // Compute expected value by manually summing effective rates + monthly misc
          let expectedSum = 0;
          for (const day of days) {
            const dayType = classifyDay(day.date, holidays, overrides, atOfficeFlags);
            const isAtOffice = !!(atOfficeFlags[day.date]);
            const rate = getEffectiveRate(dayType, isAtOffice, rateTable, wallet);
            expectedSum += rate;
          }
          expectedSum += (monthlyMisc[wallet] || 0);

          // Use floating point tolerance
          assert.ok(
            Math.abs(projection - expectedSum) < 0.001,
            `Projection (${projection}) should equal sum of rates + misc (${expectedSum}) for wallet "${wallet}" over ${days.length} days`
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ===== Unit Tests for calculateBillsTotal =====

describe('calculateBillsTotal', () => {
  const defaultBills = [
    { id: 'digi', name: 'DiGi', amount: 48.00, frequency: 'monthly' },
    { id: 'tnb', name: 'TnB', amount: 120.00, frequency: 'monthly' },
    { id: 'water', name: 'Water', amount: 15.00, frequency: 'monthly' },
    { id: 'iwk', name: 'IWK', amount: 90.00, frequency: 'biYearly', dueMonths: [1, 7] }
  ];

  it('should sum all monthly bills for any month', () => {
    const bills = [
      { id: 'digi', name: 'DiGi', amount: 48.00, frequency: 'monthly' },
      { id: 'tnb', name: 'TnB', amount: 120.00, frequency: 'monthly' }
    ];
    const result = calculateBillsTotal(bills, 5);
    assert.ok(Math.abs(result - 168.00) < 0.001);
  });

  it('should include biYearly bill when targetMonth is in dueMonths', () => {
    const result = calculateBillsTotal(defaultBills, 1); // January — IWK due
    // 48 + 120 + 15 + 90 = 273
    assert.ok(Math.abs(result - 273.00) < 0.001);
  });

  it('should exclude biYearly bill when targetMonth is NOT in dueMonths', () => {
    const result = calculateBillsTotal(defaultBills, 3); // March — IWK not due
    // 48 + 120 + 15 = 183
    assert.ok(Math.abs(result - 183.00) < 0.001);
  });

  it('should include biYearly bill for July (second due month)', () => {
    const result = calculateBillsTotal(defaultBills, 7); // July — IWK due
    // 48 + 120 + 15 + 90 = 273
    assert.ok(Math.abs(result - 273.00) < 0.001);
  });

  it('should return 0 for empty bills array', () => {
    const result = calculateBillsTotal([], 6);
    assert.equal(result, 0);
  });

  it('should handle only biYearly bills', () => {
    const bills = [
      { id: 'iwk', name: 'IWK', amount: 90.00, frequency: 'biYearly', dueMonths: [1, 7] }
    ];
    // Month 1: due
    assert.ok(Math.abs(calculateBillsTotal(bills, 1) - 90.00) < 0.001);
    // Month 4: not due
    assert.equal(calculateBillsTotal(bills, 4), 0);
  });

  it('should handle biYearly bill with no dueMonths array', () => {
    const bills = [
      { id: 'x', name: 'X', amount: 50.00, frequency: 'biYearly' }
    ];
    // No dueMonths → never included
    const result = calculateBillsTotal(bills, 6);
    assert.equal(result, 0);
  });
});


// ===== Property-Based Tests =====
// Property 6: Bills total for a given month
// **Validates: Requirements 10.3**

describe('Property 6: Bills total for a given month', () => {
  // Generator: target month (1–12)
  const arbTargetMonth = fc.integer({ min: 1, max: 12 });

  // Generator: a monthly bill
  const arbMonthlyBill = fc.record({
    id: fc.string({ minLength: 1, maxLength: 10 }),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    amount: fc.double({ min: 0, max: 9999.99, noNaN: true, noDefaultInfinity: true }),
    frequency: fc.constant('monthly')
  });

  // Generator: a bi-yearly bill with random dueMonths
  const arbBiYearlyBill = fc.record({
    id: fc.string({ minLength: 1, maxLength: 10 }),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    amount: fc.double({ min: 0, max: 9999.99, noNaN: true, noDefaultInfinity: true }),
    frequency: fc.constant('biYearly'),
    dueMonths: fc.uniqueArray(fc.integer({ min: 1, max: 12 }), { minLength: 1, maxLength: 6 })
  });

  // Generator: mixed bill list (monthly and bi-yearly)
  const arbBills = fc.array(
    fc.oneof(arbMonthlyBill, arbBiYearlyBill),
    { minLength: 0, maxLength: 10 }
  );

  it('result equals sum of all monthly amounts + sum of bi-yearly amounts where dueMonths includes target', () => {
    fc.assert(
      fc.property(arbBills, arbTargetMonth, (bills, targetMonth) => {
        const result = calculateBillsTotal(bills, targetMonth);

        // Manually compute expected total
        let expected = 0;
        for (const bill of bills) {
          if (bill.frequency === 'monthly') {
            expected += bill.amount;
          } else if (bill.frequency === 'biYearly') {
            if (bill.dueMonths && bill.dueMonths.includes(targetMonth)) {
              expected += bill.amount;
            }
          }
        }

        assert.ok(
          Math.abs(result - expected) < 0.001,
          `calculateBillsTotal returned ${result}, expected ${expected} for targetMonth=${targetMonth} with ${bills.length} bills`
        );
      }),
      { numRuns: 100 }
    );
  });
});


// ===== Unit Tests for calculateAllTopUps =====

describe('calculateAllTopUps', () => {
  it('should return all zero top-ups when balances exceed all obligations', () => {
    const balances = { goPlus: 500, card1: 200, card2: 200, parking: 200 };
    const currentProj = { goPlus: 10, card1: 10, card2: 10, parking: 10 };
    const nextProj = { goPlus: 20, card1: 20, card2: 20, parking: 20 };
    const minimumBalances = { goPlus: 20, card1: 20, card2: 20, parking: 15 };
    const billsTotal = 0;

    const result = calculateAllTopUps(balances, currentProj, nextProj, minimumBalances, billsTotal);

    assert.equal(result.goPlus, 0);
    assert.equal(result.card1, 0);
    assert.equal(result.card2, 0);
    assert.equal(result.parking, 0);
    assert.equal(result.bankToGoPlus, 0);
  });

  it('should include linked wallet top-ups in Go_Plus total', () => {
    // card1 needs top-up: balance=30, currProj=20, nextProj=30, min=20
    //   estimatedEnd = 30 - 20 = 10; raw = 20 + 30 - 10 = 40 → roundUpRM5(40) = 40
    // card2 and parking need 0
    // goPlus own: balance=100, currProj=10, nextProj=20, min=20
    //   own = max(0, 20 + 20 - (100 - 10)) = max(0, 40 - 90) = 0
    // goPlus total: roundUpRM5(max(0, 0 + 40 + 0 + 0 + 0)) = 40
    const balances = { goPlus: 100, card1: 30, card2: 200, parking: 200 };
    const currentProj = { goPlus: 10, card1: 20, card2: 10, parking: 10 };
    const nextProj = { goPlus: 20, card1: 30, card2: 20, parking: 20 };
    const minimumBalances = { goPlus: 20, card1: 20, card2: 20, parking: 15 };
    const billsTotal = 0;

    const result = calculateAllTopUps(balances, currentProj, nextProj, minimumBalances, billsTotal);

    assert.equal(result.card1, 40);
    assert.equal(result.card2, 0);
    assert.equal(result.parking, 0);
    assert.equal(result.goPlus, 40);
    assert.equal(result.bankToGoPlus, 40);
  });

  it('should include billsTotal in Go_Plus top-up', () => {
    // All linked wallets have enough balance (no top-up needed)
    // goPlus own: balance=100, currProj=10, nextProj=20, min=20
    //   own = max(0, 20 + 20 - (100 - 10)) = max(0, 40 - 90) = 0
    // goPlus total: roundUpRM5(max(0, 0 + 0 + 0 + 0 + 183)) = roundUpRM5(183) = 185
    const balances = { goPlus: 100, card1: 200, card2: 200, parking: 200 };
    const currentProj = { goPlus: 10, card1: 10, card2: 10, parking: 10 };
    const nextProj = { goPlus: 20, card1: 20, card2: 20, parking: 20 };
    const minimumBalances = { goPlus: 20, card1: 20, card2: 20, parking: 15 };
    const billsTotal = 183;

    const result = calculateAllTopUps(balances, currentProj, nextProj, minimumBalances, billsTotal);

    assert.equal(result.goPlus, 185);
    assert.equal(result.bankToGoPlus, 185);
  });

  it('should combine Go_Plus own need with linked wallet top-ups and bills', () => {
    // goPlus own: balance=50, currProj=30, nextProj=40, min=20
    //   own = max(0, 20 + 40 - (50 - 30)) = max(0, 60 - 20) = 40
    // card1: balance=10, currProj=5, nextProj=30, min=20
    //   estimatedEnd = 10 - 5 = 5; raw = 20 + 30 - 5 = 45 → roundUpRM5(45) = 45
    // card2: balance=50, currProj=10, nextProj=10, min=20
    //   estimatedEnd = 50 - 10 = 40; raw = 20 + 10 - 40 = -10 → 0
    // parking: balance=10, currProj=0, nextProj=0, min=15
    //   estimatedEnd = 10 - 0 = 10; raw = 15 + 0 - 10 = 5 → roundUpRM5(5) = 5
    // goPlus total: roundUpRM5(max(0, 40 + 45 + 0 + 5 + 100)) = roundUpRM5(190) = 190
    const balances = { goPlus: 50, card1: 10, card2: 50, parking: 10 };
    const currentProj = { goPlus: 30, card1: 5, card2: 10, parking: 0 };
    const nextProj = { goPlus: 40, card1: 30, card2: 10, parking: 0 };
    const minimumBalances = { goPlus: 20, card1: 20, card2: 20, parking: 15 };
    const billsTotal = 100;

    const result = calculateAllTopUps(balances, currentProj, nextProj, minimumBalances, billsTotal);

    assert.equal(result.card1, 45);
    assert.equal(result.card2, 0);
    assert.equal(result.parking, 5);
    assert.equal(result.goPlus, 190);
    assert.equal(result.bankToGoPlus, 190);
  });

  it('should round Go_Plus total up to nearest RM5', () => {
    // goPlus own: balance=50, currProj=30, nextProj=40, min=20
    //   own = max(0, 20 + 40 - (50 - 30)) = max(0, 60 - 20) = 40
    // All linked wallets need 0 top-up
    // billsTotal = 3
    // goPlus total: roundUpRM5(max(0, 40 + 0 + 0 + 0 + 3)) = roundUpRM5(43) = 45
    const balances = { goPlus: 50, card1: 200, card2: 200, parking: 200 };
    const currentProj = { goPlus: 30, card1: 10, card2: 10, parking: 10 };
    const nextProj = { goPlus: 40, card1: 20, card2: 20, parking: 20 };
    const minimumBalances = { goPlus: 20, card1: 20, card2: 20, parking: 15 };
    const billsTotal = 3;

    const result = calculateAllTopUps(balances, currentProj, nextProj, minimumBalances, billsTotal);

    assert.equal(result.goPlus, 45);
    assert.equal(result.bankToGoPlus, 45);
  });

  it('should return bankToGoPlus equal to goPlus top-up', () => {
    const balances = { goPlus: 20, card1: 20, card2: 20, parking: 10 };
    const currentProj = { goPlus: 10, card1: 10, card2: 10, parking: 5 };
    const nextProj = { goPlus: 50, card1: 30, card2: 25, parking: 10 };
    const minimumBalances = { goPlus: 20, card1: 20, card2: 20, parking: 15 };
    const billsTotal = 200;

    const result = calculateAllTopUps(balances, currentProj, nextProj, minimumBalances, billsTotal);

    assert.equal(result.goPlus, result.bankToGoPlus);
  });

  it('should handle zero balances needing full top-up', () => {
    // All wallets at zero, current projections zero, next projections non-zero
    // card1: estimatedEnd=0; raw = 20 + 50 - 0 = 70 → 70
    // card2: estimatedEnd=0; raw = 20 + 30 - 0 = 50 → 50
    // parking: estimatedEnd=0; raw = 15 + 10 - 0 = 25 → 25
    // goPlus own: max(0, 20 + 80 - (0 - 0)) = 100
    // goPlus total: roundUpRM5(100 + 70 + 50 + 25 + 50) = roundUpRM5(295) = 295
    const balances = { goPlus: 0, card1: 0, card2: 0, parking: 0 };
    const currentProj = { goPlus: 0, card1: 0, card2: 0, parking: 0 };
    const nextProj = { goPlus: 80, card1: 50, card2: 30, parking: 10 };
    const minimumBalances = { goPlus: 20, card1: 20, card2: 20, parking: 15 };
    const billsTotal = 50;

    const result = calculateAllTopUps(balances, currentProj, nextProj, minimumBalances, billsTotal);

    assert.equal(result.card1, 70);
    assert.equal(result.card2, 50);
    assert.equal(result.parking, 25);
    assert.equal(result.goPlus, 295);
    assert.equal(result.bankToGoPlus, 295);
  });
});


// ===== Property-Based Tests =====
// Property 4: Go_Plus top-up includes downstream obligations
// **Validates: Requirements 9.4, 11.1**

describe('Property 4: Go_Plus top-up includes downstream obligations', () => {
  // Generator: wallet balances (0 to 99999.99)
  const arbBalances = fc.record({
    goPlus: fc.double({ min: 0, max: 99999.99, noNaN: true, noDefaultInfinity: true }),
    card1: fc.double({ min: 0, max: 99999.99, noNaN: true, noDefaultInfinity: true }),
    card2: fc.double({ min: 0, max: 99999.99, noNaN: true, noDefaultInfinity: true }),
    parking: fc.double({ min: 0, max: 99999.99, noNaN: true, noDefaultInfinity: true })
  });

  // Generator: projections (0 to 9999.99)
  const arbProjection = fc.record({
    goPlus: fc.double({ min: 0, max: 9999.99, noNaN: true, noDefaultInfinity: true }),
    card1: fc.double({ min: 0, max: 9999.99, noNaN: true, noDefaultInfinity: true }),
    card2: fc.double({ min: 0, max: 9999.99, noNaN: true, noDefaultInfinity: true }),
    parking: fc.double({ min: 0, max: 9999.99, noNaN: true, noDefaultInfinity: true })
  });

  // Generator: minimum balances (0 to 999.99)
  const arbMinimumBalances = fc.record({
    goPlus: fc.double({ min: 0, max: 999.99, noNaN: true, noDefaultInfinity: true }),
    card1: fc.double({ min: 0, max: 999.99, noNaN: true, noDefaultInfinity: true }),
    card2: fc.double({ min: 0, max: 999.99, noNaN: true, noDefaultInfinity: true }),
    parking: fc.double({ min: 0, max: 999.99, noNaN: true, noDefaultInfinity: true })
  });

  // Generator: bills total (0 to 9999.99)
  const arbBillsTotal = fc.double({ min: 0, max: 9999.99, noNaN: true, noDefaultInfinity: true });

  it('Go_Plus top-up = roundUpRM5(max(0, goPlus_own_need + card1TopUp + card2TopUp + parkingTopUp + billsTotal))', () => {
    fc.assert(
      fc.property(
        arbBalances, arbProjection, arbProjection, arbMinimumBalances, arbBillsTotal,
        (balances, currentProj, nextProj, minimumBalances, billsTotal) => {
          const result = calculateAllTopUps(balances, currentProj, nextProj, minimumBalances, billsTotal);

          // Manually compute expected Go_Plus top-up
          const card1TopUp = calculateTopUp('card1', balances.card1, currentProj.card1, nextProj.card1, minimumBalances.card1);
          const card2TopUp = calculateTopUp('card2', balances.card2, currentProj.card2, nextProj.card2, minimumBalances.card2);
          const parkingTopUp = calculateTopUp('parking', balances.parking, currentProj.parking, nextProj.parking, minimumBalances.parking);

          const goPlusOwnNeed = Math.max(0,
            minimumBalances.goPlus + nextProj.goPlus - (balances.goPlus - currentProj.goPlus)
          );

          const expectedGoPlusTopUp = roundUpRM5(
            Math.max(0, goPlusOwnNeed + card1TopUp + card2TopUp + parkingTopUp + billsTotal)
          );

          assert.strictEqual(result.goPlus, expectedGoPlusTopUp,
            `Go_Plus top-up: got ${result.goPlus}, expected ${expectedGoPlusTopUp} ` +
            `(ownNeed=${goPlusOwnNeed}, card1=${card1TopUp}, card2=${card2TopUp}, parking=${parkingTopUp}, bills=${billsTotal})`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('bankToGoPlus always equals Go_Plus top-up', () => {
    fc.assert(
      fc.property(
        arbBalances, arbProjection, arbProjection, arbMinimumBalances, arbBillsTotal,
        (balances, currentProj, nextProj, minimumBalances, billsTotal) => {
          const result = calculateAllTopUps(balances, currentProj, nextProj, minimumBalances, billsTotal);

          assert.strictEqual(result.bankToGoPlus, result.goPlus,
            `bankToGoPlus (${result.bankToGoPlus}) should equal goPlus top-up (${result.goPlus})`);
        }
      ),
      { numRuns: 100 }
    );
  });
});
