import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { getMonthDays, isHoliday, classifyDay, getEffectiveRate } from '../js/calendar.js';

describe('calendar.js', () => {
  describe('getMonthDays', () => {
    it('returns 31 days for January', () => {
      const days = getMonthDays(2025, 1);
      assert.strictEqual(days.length, 31);
      assert.strictEqual(days[0].date, '2025-01-01');
      assert.strictEqual(days[30].date, '2025-01-31');
    });

    it('returns 28 days for non-leap year February', () => {
      const days = getMonthDays(2023, 2);
      assert.strictEqual(days.length, 28);
      assert.strictEqual(days[0].date, '2023-02-01');
      assert.strictEqual(days[27].date, '2023-02-28');
    });

    it('returns 29 days for leap year February', () => {
      const days = getMonthDays(2024, 2);
      assert.strictEqual(days.length, 29);
      assert.strictEqual(days[28].date, '2024-02-29');
    });

    it('returns 30 days for April', () => {
      const days = getMonthDays(2025, 4);
      assert.strictEqual(days.length, 30);
      assert.strictEqual(days[29].date, '2025-04-30');
    });

    it('returns correct dayOfWeek values', () => {
      // 2025-01-01 is a Wednesday (dayOfWeek = 3)
      const days = getMonthDays(2025, 1);
      assert.strictEqual(days[0].dayOfWeek, 3); // Wednesday
      assert.strictEqual(days[4].dayOfWeek, 0); // Sunday Jan 5
      assert.strictEqual(days[5].dayOfWeek, 1); // Monday Jan 6
    });

    it('returns dates in YYYY-MM-DD format with zero-padded month and day', () => {
      const days = getMonthDays(2025, 3);
      assert.strictEqual(days[0].date, '2025-03-01');
      assert.strictEqual(days[8].date, '2025-03-09');
    });

    it('handles December correctly (month 12)', () => {
      const days = getMonthDays(2025, 12);
      assert.strictEqual(days.length, 31);
      assert.strictEqual(days[0].date, '2025-12-01');
      assert.strictEqual(days[30].date, '2025-12-31');
    });

    it('handles century leap year (2000) correctly', () => {
      const days = getMonthDays(2000, 2);
      assert.strictEqual(days.length, 29);
    });

    it('handles century non-leap year (1900) correctly', () => {
      const days = getMonthDays(1900, 2);
      assert.strictEqual(days.length, 28);
    });
  });

  describe('isHoliday', () => {
    const holidays = [
      { type: 'public', date: '2025-02-01', name: 'Federal Territory Day' },
      { type: 'public', date: '2025-04-01', name: 'Hari Raya Aidilfitri' },
      { type: 'school', startDate: '2025-03-15', endDate: '2025-03-23', name: 'School Holiday 1' }
    ];

    it('returns true for exact public holiday match', () => {
      assert.strictEqual(isHoliday('2025-02-01', holidays), true);
      assert.strictEqual(isHoliday('2025-04-01', holidays), true);
    });

    it('returns false for non-holiday date', () => {
      assert.strictEqual(isHoliday('2025-02-02', holidays), false);
      assert.strictEqual(isHoliday('2025-06-15', holidays), false);
    });

    it('returns true for date within school holiday range (inclusive start)', () => {
      assert.strictEqual(isHoliday('2025-03-15', holidays), true);
    });

    it('returns true for date within school holiday range (inclusive end)', () => {
      assert.strictEqual(isHoliday('2025-03-23', holidays), true);
    });

    it('returns true for date in middle of school holiday range', () => {
      assert.strictEqual(isHoliday('2025-03-19', holidays), true);
    });

    it('returns false for date just before school holiday range', () => {
      assert.strictEqual(isHoliday('2025-03-14', holidays), false);
    });

    it('returns false for date just after school holiday range', () => {
      assert.strictEqual(isHoliday('2025-03-24', holidays), false);
    });

    it('returns false for empty holiday list', () => {
      assert.strictEqual(isHoliday('2025-02-01', []), false);
    });

    it('handles multiple school holiday ranges', () => {
      const multiHolidays = [
        { type: 'school', startDate: '2025-03-15', endDate: '2025-03-23', name: 'Holiday 1' },
        { type: 'school', startDate: '2025-06-01', endDate: '2025-06-14', name: 'Holiday 2' }
      ];
      assert.strictEqual(isHoliday('2025-06-07', multiHolidays), true);
      assert.strictEqual(isHoliday('2025-05-31', multiHolidays), false);
    });

    it('handles date that is both a public holiday and in a school holiday range', () => {
      const overlapping = [
        { type: 'public', date: '2025-03-17', name: 'Some Public Holiday' },
        { type: 'school', startDate: '2025-03-15', endDate: '2025-03-23', name: 'School Holiday' }
      ];
      assert.strictEqual(isHoliday('2025-03-17', overlapping), true);
    });
  });

  describe('classifyDay', () => {
    const holidays = [
      { type: 'public', date: '2025-02-01', name: 'Federal Territory Day' },
      { type: 'school', startDate: '2025-03-15', endDate: '2025-03-23', name: 'School Holiday 1' }
    ];

    // Precedence 1: At_Office flag takes highest priority
    it('returns "atOffice" when atOfficeFlags[date] is true', () => {
      const overrides = { '2025-02-03': 'justWork' };
      const atOffice = { '2025-02-03': true };
      // 2025-02-03 is Monday, has override, AND at-office — atOffice wins
      assert.strictEqual(classifyDay('2025-02-03', holidays, overrides, atOffice), 'atOffice');
    });

    it('returns "atOffice" even on a holiday when flag is set', () => {
      const atOffice = { '2025-02-01': true };
      // 2025-02-01 is a public holiday but atOffice flag overrides
      assert.strictEqual(classifyDay('2025-02-01', holidays, {}, atOffice), 'atOffice');
    });

    it('returns "atOffice" even on weekends when flag is set', () => {
      // 2025-02-02 is Sunday
      const atOffice = { '2025-02-02': true };
      assert.strictEqual(classifyDay('2025-02-02', holidays, {}, atOffice), 'atOffice');
    });

    // Precedence 2: User override (when no atOffice flag)
    it('returns override value when override exists and no atOffice flag', () => {
      const overrides = { '2025-02-03': 'justWork' };
      assert.strictEqual(classifyDay('2025-02-03', holidays, overrides, {}), 'justWork');
    });

    it('returns "justBabysitters" override', () => {
      const overrides = { '2025-02-08': 'justBabysitters' };
      // 2025-02-08 is Saturday, but override takes precedence
      assert.strictEqual(classifyDay('2025-02-08', holidays, overrides, {}), 'justBabysitters');
    });

    it('returns "onLeave" override', () => {
      const overrides = { '2025-02-10': 'onLeave' };
      assert.strictEqual(classifyDay('2025-02-10', holidays, overrides, {}), 'onLeave');
    });

    it('override takes precedence over holiday', () => {
      // 2025-02-01 is a public holiday, but override wins over holiday
      const overrides = { '2025-02-01': 'justWork' };
      assert.strictEqual(classifyDay('2025-02-01', holidays, overrides, {}), 'justWork');
    });

    // Precedence 3: Holiday match
    it('returns "sundayHoliday" for a public holiday date (no override, no atOffice)', () => {
      // 2025-02-01 is Saturday but it's a public holiday
      assert.strictEqual(classifyDay('2025-02-01', holidays, {}, {}), 'sundayHoliday');
    });

    it('returns "sundayHoliday" for date within school holiday range', () => {
      // 2025-03-17 is Monday but within school holiday
      assert.strictEqual(classifyDay('2025-03-17', holidays, {}, {}), 'sundayHoliday');
    });

    // Precedence 4: Day of week
    it('returns "weekday" for Monday through Friday (no holidays, overrides, or flags)', () => {
      // 2025-02-03 is Monday
      assert.strictEqual(classifyDay('2025-02-03', [], {}, {}), 'weekday');
      // 2025-02-04 is Tuesday
      assert.strictEqual(classifyDay('2025-02-04', [], {}, {}), 'weekday');
      // 2025-02-05 is Wednesday
      assert.strictEqual(classifyDay('2025-02-05', [], {}, {}), 'weekday');
      // 2025-02-06 is Thursday
      assert.strictEqual(classifyDay('2025-02-06', [], {}, {}), 'weekday');
      // 2025-02-07 is Friday
      assert.strictEqual(classifyDay('2025-02-07', [], {}, {}), 'weekday');
    });

    it('returns "saturday" for Saturday (no holidays, overrides, or flags)', () => {
      // 2025-02-08 is Saturday
      assert.strictEqual(classifyDay('2025-02-08', [], {}, {}), 'saturday');
    });

    it('returns "sundayHoliday" for Sunday (no holidays, overrides, or flags)', () => {
      // 2025-02-09 is Sunday
      assert.strictEqual(classifyDay('2025-02-09', [], {}, {}), 'sundayHoliday');
    });

    // Edge cases: null/undefined inputs
    it('handles null overrides gracefully', () => {
      assert.strictEqual(classifyDay('2025-02-03', [], null, null), 'weekday');
    });

    it('handles undefined overrides gracefully', () => {
      assert.strictEqual(classifyDay('2025-02-03', [], undefined, undefined), 'weekday');
    });

    // Mutually exclusive: always returns exactly one value from the valid set
    it('always returns a valid Day_Type string', () => {
      const validTypes = ['weekday', 'saturday', 'sundayHoliday', 'justWork', 'justBabysitters', 'atOffice', 'onLeave'];
      const testDates = ['2025-02-03', '2025-02-08', '2025-02-09', '2025-02-01'];
      const overrides = { '2025-02-03': 'justWork' };
      const atOffice = { '2025-02-09': true };

      for (const date of testDates) {
        const result = classifyDay(date, holidays, overrides, atOffice);
        assert.ok(validTypes.includes(result), `Expected valid Day_Type, got "${result}" for ${date}`);
      }
    });
  });

  describe('getEffectiveRate', () => {
    const rateTable = {
      weekday:        { goPlus: 2.10, card1: 1.39, card2: 0, parking: 0 },
      saturday:       { goPlus: 8.80, card1: 0, card2: 2.50, parking: 0 },
      sundayHoliday:  { goPlus: 0, card1: 0, card2: 0, parking: 0 },
      justWork:       { goPlus: 2.10, card1: 1.65, card2: 0, parking: 0 },
      justBabysitters:{ goPlus: 4.20, card1: 0, card2: 0, parking: 0 },
      atOffice:       { goPlus: 2.10, card1: 0, card2: 0, parking: 0 },
      onLeave:        { goPlus: 4.20, card1: 2.78, card2: 0, parking: 0 }
    };

    it('returns atOffice rate when isAtOffice is true, regardless of dayType', () => {
      assert.strictEqual(getEffectiveRate('weekday', true, rateTable, 'goPlus'), 2.10);
      assert.strictEqual(getEffectiveRate('saturday', true, rateTable, 'card1'), 0);
      assert.strictEqual(getEffectiveRate('onLeave', true, rateTable, 'goPlus'), 2.10);
    });

    it('returns rate from dayType row when isAtOffice is false', () => {
      assert.strictEqual(getEffectiveRate('weekday', false, rateTable, 'goPlus'), 2.10);
      assert.strictEqual(getEffectiveRate('weekday', false, rateTable, 'card1'), 1.39);
      assert.strictEqual(getEffectiveRate('saturday', false, rateTable, 'goPlus'), 8.80);
      assert.strictEqual(getEffectiveRate('saturday', false, rateTable, 'card2'), 2.50);
    });

    it('returns 0 for wallets with no rate on sundayHoliday', () => {
      assert.strictEqual(getEffectiveRate('sundayHoliday', false, rateTable, 'goPlus'), 0);
      assert.strictEqual(getEffectiveRate('sundayHoliday', false, rateTable, 'card1'), 0);
      assert.strictEqual(getEffectiveRate('sundayHoliday', false, rateTable, 'parking'), 0);
    });

    it('returns correct rates for justWork day type', () => {
      assert.strictEqual(getEffectiveRate('justWork', false, rateTable, 'goPlus'), 2.10);
      assert.strictEqual(getEffectiveRate('justWork', false, rateTable, 'card1'), 1.65);
    });

    it('returns correct rates for justBabysitters day type', () => {
      assert.strictEqual(getEffectiveRate('justBabysitters', false, rateTable, 'goPlus'), 4.20);
      assert.strictEqual(getEffectiveRate('justBabysitters', false, rateTable, 'card1'), 0);
    });

    it('returns correct rates for onLeave day type', () => {
      assert.strictEqual(getEffectiveRate('onLeave', false, rateTable, 'goPlus'), 4.20);
      assert.strictEqual(getEffectiveRate('onLeave', false, rateTable, 'card1'), 2.78);
    });

    it('atOffice override applies to all wallets', () => {
      assert.strictEqual(getEffectiveRate('weekday', true, rateTable, 'goPlus'), 2.10);
      assert.strictEqual(getEffectiveRate('weekday', true, rateTable, 'card1'), 0);
      assert.strictEqual(getEffectiveRate('weekday', true, rateTable, 'card2'), 0);
      assert.strictEqual(getEffectiveRate('weekday', true, rateTable, 'parking'), 0);
    });

    it('returns parking rate correctly', () => {
      assert.strictEqual(getEffectiveRate('weekday', false, rateTable, 'parking'), 0);
      assert.strictEqual(getEffectiveRate('saturday', false, rateTable, 'parking'), 0);
    });
  });

  // ===== Property-Based Tests =====
  // Property 1: Day classification is deterministic and mutually exclusive
  // **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 4.5**

  describe('Property 1: Day classification is deterministic and mutually exclusive', () => {
    const validDayTypes = ['weekday', 'saturday', 'sundayHoliday', 'justWork', 'justBabysitters', 'atOffice', 'onLeave'];
    const overrideTypes = ['justWork', 'justBabysitters', 'onLeave'];

    // Generator: arbitrary date string in "YYYY-MM-DD" format (valid dates)
    const arbDate = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }) // 28 guarantees valid for all months
    }).map(({ year, month, day }) => {
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    });

    // Generator: arbitrary holiday array (mix of public and school holidays)
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

    const arbHolidays = fc.array(fc.oneof(arbPublicHoliday, arbSchoolHoliday), { minLength: 0, maxLength: 10 });

    // Generator: arbitrary override map (subset of valid override types)
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

    // Generator: arbitrary atOffice flag map (boolean values)
    const arbAtOfficeFlags = fc.array(
      fc.record({
        date: arbDate,
        flag: fc.boolean()
      }),
      { minLength: 0, maxLength: 5 }
    ).map(entries => {
      const map = {};
      for (const { date, flag } of entries) map[date] = flag;
      return map;
    });

    it('always returns exactly one valid Day_Type string', () => {
      fc.assert(
        fc.property(
          arbDate, arbHolidays, arbOverrides, arbAtOfficeFlags,
          (date, holidays, overrides, atOfficeFlags) => {
            const result = classifyDay(date, holidays, overrides, atOfficeFlags);
            // Must be exactly one of the valid day types
            assert.ok(
              validDayTypes.includes(result),
              `Expected valid Day_Type, got "${result}" for date ${date}`
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns "atOffice" when atOfficeFlags[date] is true (highest precedence)', () => {
      fc.assert(
        fc.property(
          arbDate, arbHolidays, arbOverrides,
          (date, holidays, overrides) => {
            // Force atOffice flag to true for the test date
            const atOfficeFlags = { [date]: true };
            const result = classifyDay(date, holidays, overrides, atOfficeFlags);
            assert.strictEqual(result, 'atOffice',
              `Expected "atOffice" when flag is true, got "${result}" for date ${date}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns override value when override exists and no atOffice flag (second precedence)', () => {
      fc.assert(
        fc.property(
          arbDate, arbHolidays, fc.constantFrom(...overrideTypes),
          (date, holidays, overrideType) => {
            // Set override for date, ensure atOffice is NOT set
            const overrides = { [date]: overrideType };
            const atOfficeFlags = { [date]: false };
            const result = classifyDay(date, holidays, overrides, atOfficeFlags);
            assert.strictEqual(result, overrideType,
              `Expected "${overrideType}" override, got "${result}" for date ${date}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns "sundayHoliday" when date is a holiday and no atOffice or override (third precedence)', () => {
      fc.assert(
        fc.property(
          arbDate,
          (date) => {
            // Create a holiday that matches the date exactly
            const holidays = [{ type: 'public', date, name: 'Test Holiday' }];
            // No override, no atOffice
            const overrides = {};
            const atOfficeFlags = {};
            const result = classifyDay(date, holidays, overrides, atOfficeFlags);
            assert.strictEqual(result, 'sundayHoliday',
              `Expected "sundayHoliday" for holiday date ${date}, got "${result}"`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns day-of-week classification when no atOffice, no override, no holiday (lowest precedence)', () => {
      fc.assert(
        fc.property(
          arbDate,
          (date) => {
            // No holidays, no overrides, no atOffice flags
            const holidays = [];
            const overrides = {};
            const atOfficeFlags = {};
            const result = classifyDay(date, holidays, overrides, atOfficeFlags);

            // Parse date to determine expected day-of-week classification
            const [year, month, day] = date.split('-').map(Number);
            const dayOfWeek = new Date(year, month - 1, day).getDay();

            if (dayOfWeek === 0) {
              assert.strictEqual(result, 'sundayHoliday',
                `Expected "sundayHoliday" for Sunday ${date}, got "${result}"`);
            } else if (dayOfWeek === 6) {
              assert.strictEqual(result, 'saturday',
                `Expected "saturday" for Saturday ${date}, got "${result}"`);
            } else {
              assert.strictEqual(result, 'weekday',
                `Expected "weekday" for weekday ${date}, got "${result}"`);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('precedence: atOffice > override > holiday > day-of-week', () => {
      fc.assert(
        fc.property(
          arbDate, fc.constantFrom(...overrideTypes),
          (date, overrideType) => {
            // Set up a date that matches ALL conditions:
            // holiday, override, and atOffice flag — atOffice should win
            const holidays = [{ type: 'public', date, name: 'Test Holiday' }];
            const overrides = { [date]: overrideType };
            const atOfficeFlags = { [date]: true };

            const result = classifyDay(date, holidays, overrides, atOfficeFlags);
            assert.strictEqual(result, 'atOffice',
              `atOffice should beat override+holiday, got "${result}" for ${date}`);

            // Remove atOffice → override should win over holiday
            const result2 = classifyDay(date, holidays, overrides, {});
            assert.strictEqual(result2, overrideType,
              `Override should beat holiday, got "${result2}" for ${date}`);

            // Remove override → holiday should win over day-of-week
            const result3 = classifyDay(date, holidays, {}, {});
            assert.strictEqual(result3, 'sundayHoliday',
              `Holiday should beat day-of-week, got "${result3}" for ${date}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('classifyDay is deterministic (same inputs always produce same output)', () => {
      fc.assert(
        fc.property(
          arbDate, arbHolidays, arbOverrides, arbAtOfficeFlags,
          (date, holidays, overrides, atOfficeFlags) => {
            const result1 = classifyDay(date, holidays, overrides, atOfficeFlags);
            const result2 = classifyDay(date, holidays, overrides, atOfficeFlags);
            assert.strictEqual(result1, result2,
              `classifyDay not deterministic for date ${date}: got "${result1}" then "${result2}"`);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
