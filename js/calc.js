// calc.js — Projection, top-up, bills calculation

import { getMonthDays, classifyDay, getEffectiveRate } from './calendar.js';

const WALLETS = ['goPlus', 'card1', 'card2', 'parking'];

/**
 * Projects total expense for a single wallet over a set of days.
 * Sums the effective rate for each day + adds monthlyMisc once.
 *
 * @param {string} wallet - One of "goPlus", "card1", "card2", "parking"
 * @param {Array<{date: string, dayOfWeek: number}>} days - Days to project over
 * @param {object} rateTable - Rate table object (rows per Day_Type, columns per wallet)
 * @param {object} monthlyMisc - Monthly misc amounts per wallet
 * @param {object} overrides - Map of "YYYY-MM-DD" → Day_Type override
 * @param {object} atOfficeFlags - Map of "YYYY-MM-DD" → boolean
 * @param {Array} holidays - Array of holiday entries
 * @returns {number} Total projected expense for the wallet over the given days
 */
export function projectWallet(wallet, days, rateTable, monthlyMisc, overrides, atOfficeFlags, holidays) {
  let total = 0;

  for (const day of days) {
    const dayType = classifyDay(day.date, holidays, overrides, atOfficeFlags);
    const isAtOffice = !!(atOfficeFlags && atOfficeFlags[day.date]);
    const rate = getEffectiveRate(dayType, isAtOffice, rateTable, wallet);
    total += rate;
  }

  // Add monthly misc exactly once
  total += (monthlyMisc[wallet] || 0);

  return total;
}

/**
 * Projects remaining expenses from today to month-end for all 4 wallets.
 *
 * @param {string|Date} today - A Date object or "YYYY-MM-DD" string
 * @param {object} rateTable - Rate table object
 * @param {object} monthlyMisc - Monthly misc amounts per wallet
 * @param {object} overrides - Map of "YYYY-MM-DD" → Day_Type override
 * @param {object} atOfficeFlags - Map of "YYYY-MM-DD" → boolean
 * @param {Array} holidays - Array of holiday entries
 * @returns {{goPlus: number, card1: number, card2: number, parking: number}} Projections for each wallet
 */
export function projectCurrentMonth(today, rateTable, monthlyMisc, overrides, atOfficeFlags, holidays) {
  // Normalise today to a "YYYY-MM-DD" string
  let todayStr;
  if (typeof today === 'string') {
    todayStr = today;
  } else {
    // Date object
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    todayStr = `${y}-${m}-${d}`;
  }

  const [year, month] = todayStr.split('-').map(Number);
  const allDays = getMonthDays(year, month);

  // Filter to days from today onwards (inclusive)
  const remainingDays = allDays.filter(day => day.date >= todayStr);

  const result = {};
  for (const wallet of WALLETS) {
    result[wallet] = projectWallet(wallet, remainingDays, rateTable, monthlyMisc, overrides, atOfficeFlags, holidays);
  }

  return result;
}

/**
 * Projects total expenses for all days in the specified month for all 4 wallets.
 *
 * @param {number} year - Full year (e.g. 2025)
 * @param {number} month - 1-indexed month (1=January, 12=December)
 * @param {object} rateTable - Rate table object
 * @param {object} monthlyMisc - Monthly misc amounts per wallet
 * @param {object} overrides - Map of "YYYY-MM-DD" → Day_Type override
 * @param {object} atOfficeFlags - Map of "YYYY-MM-DD" → boolean
 * @param {Array} holidays - Array of holiday entries
 * @returns {{goPlus: number, card1: number, card2: number, parking: number}} Projections for each wallet
 */
export function projectNextMonth(year, month, rateTable, monthlyMisc, overrides, atOfficeFlags, holidays) {
  const allDays = getMonthDays(year, month);

  const result = {};
  for (const wallet of WALLETS) {
    result[wallet] = projectWallet(wallet, allDays, rateTable, monthlyMisc, overrides, atOfficeFlags, holidays);
  }

  return result;
}

/**
 * Rounds up to the nearest RM5.
 * Returns 0 if amount <= 0.
 * Exact multiples of 5 are returned unchanged.
 * @param {number} amount
 * @returns {number}
 */
export function roundUpRM5(amount) {
  if (amount <= 0) return 0;
  return Math.ceil(amount / 5) * 5;
}

/**
 * Calculates the top-up amount for a linked wallet (Card_1, Card_2, Parking).
 * Formula: roundUpRM5(max(0, minimumBalance + nextMonthProjection - (currentBalance - currentMonthProjection)))
 *
 * @param {string} wallet - Wallet identifier (for identification only, not used in calculation)
 * @param {number} currentBalance - Current balance of the wallet
 * @param {number} currentMonthProjection - Projected remaining expenses for the current month
 * @param {number} nextMonthProjection - Projected expenses for the entire next month
 * @param {number} minimumBalance - Minimum balance to retain in the wallet
 * @returns {number} Final top-up amount rounded up to RM5 (0 if no top-up needed)
 */
export function calculateTopUp(wallet, currentBalance, currentMonthProjection, nextMonthProjection, minimumBalance) {
  const estimatedEndBalance = currentBalance - currentMonthProjection;
  const raw = minimumBalance + nextMonthProjection - estimatedEndBalance;
  return roundUpRM5(raw);
}

/**
 * Calculates all 4 wallet top-ups plus the bank-to-Go_Plus transfer amount.
 * Go_Plus acts as the downstream hub: its top-up includes its own need
 * plus all linked wallet top-ups and bills.
 *
 * Algorithm:
 * 1. Calculate linked wallet top-ups (card1, card2, parking) using calculateTopUp
 * 2. Calculate Go_Plus own need: max(0, minBal + nextProj - (balance - currProj))
 * 3. Go_Plus total = roundUpRM5(own_need + card1TopUp + card2TopUp + parkingTopUp + billsTotal)
 * 4. bankToGoPlus = Go_Plus total (the single transfer from bank)
 *
 * @param {{goPlus: number, card1: number, card2: number, parking: number}} balances - Current balances
 * @param {{goPlus: number, card1: number, card2: number, parking: number}} currentProj - Current month projections
 * @param {{goPlus: number, card1: number, card2: number, parking: number}} nextProj - Next month projections
 * @param {{goPlus: number, card1: number, card2: number, parking: number}} minimumBalances - Minimum balances
 * @param {number} billsTotal - Total bills amount for the next month
 * @returns {{goPlus: number, card1: number, card2: number, parking: number, bankToGoPlus: number}}
 */
export function calculateAllTopUps(balances, currentProj, nextProj, minimumBalances, billsTotal) {
  // Step 1: Calculate linked wallet top-ups (already rounded to RM5)
  const card1TopUp = calculateTopUp('card1', balances.card1, currentProj.card1, nextProj.card1, minimumBalances.card1);
  const card2TopUp = calculateTopUp('card2', balances.card2, currentProj.card2, nextProj.card2, minimumBalances.card2);
  const parkingTopUp = calculateTopUp('parking', balances.parking, currentProj.parking, nextProj.parking, minimumBalances.parking);

  // Step 2: Calculate Go_Plus own need (raw, before rounding)
  const goPlusOwnNeed = Math.max(0,
    minimumBalances.goPlus + nextProj.goPlus - (balances.goPlus - currentProj.goPlus)
  );

  // Step 3: Go_Plus total includes own need + all downstream needs, then round
  const goPlusTopUp = roundUpRM5(
    Math.max(0, goPlusOwnNeed + card1TopUp + card2TopUp + parkingTopUp + billsTotal)
  );

  // Step 4: bankToGoPlus is the same as the Go_Plus total top-up
  return {
    goPlus: goPlusTopUp,
    card1: card1TopUp,
    card2: card2TopUp,
    parking: parkingTopUp,
    bankToGoPlus: goPlusTopUp
  };
}

/**
 * Calculates the total bills for a given month.
 * Sums all monthly bill amounts plus bi-yearly bill amounts where
 * targetMonth is in the bill's dueMonths array.
 *
 * @param {Array<{id: string, name: string, amount: number, frequency: string, dueMonths?: number[]}>} bills - Array of bill objects
 * @param {number} targetMonth - Month number 1-12
 * @returns {number} Total bills amount for the target month
 */
export function calculateBillsTotal(bills, targetMonth) {
  let total = 0;

  for (const bill of bills) {
    if (bill.frequency === 'monthly') {
      total += bill.amount;
    } else if (bill.frequency === 'biYearly') {
      if (bill.dueMonths && bill.dueMonths.includes(targetMonth)) {
        total += bill.amount;
      }
    }
  }

  return total;
}
