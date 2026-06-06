import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

describe('test infrastructure', () => {
  it('fast-check import works and can run a trivial property', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        // Addition is commutative
        assert.strictEqual(a + b, b + a);
      }),
      { numRuns: 100 }
    );
  });

  it('fast-check can generate and test with realistic RM amounts', () => {
    // Generate amounts in the range the app uses (0.01 to 999.99, in cents)
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99999 }), (cents) => {
        const amount = cents / 100;
        // Any positive RM amount rounded up to nearest 5 should be >= original
        const rounded = Math.ceil(amount / 5) * 5;
        assert.ok(rounded >= amount);
        assert.strictEqual(rounded % 5, 0);
      }),
      { numRuns: 100 }
    );
  });
});
