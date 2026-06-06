// store.js — localStorage read/write, export/import

// ─── Storage Key Constants ──────────────────────────────────────────────────

export const KEYS = {
  rateTable: 'ewm_rateTable',
  balances: 'ewm_balances',
  monthlyMisc: 'ewm_monthlyMisc',
  minimumBalances: 'ewm_minimumBalances',
  bills: 'ewm_bills',
  dayOverrides: 'ewm_dayOverrides',
  atOffice: 'ewm_atOffice',
  holidays: 'ewm_holidays',
  billOverrides: 'ewm_billOverrides',
  snapshots: 'ewm_snapshots',
  lastActiveMonth: 'ewm_lastActiveMonth',
};

// ─── Default Values ─────────────────────────────────────────────────────────

export const DEFAULTS = {
  [KEYS.rateTable]: {
    weekday:        { goPlus: 2.10, card1: 1.39, card2: 0, parking: 0 },
    saturday:       { goPlus: 8.80, card1: 0, card2: 2.50, parking: 0 },
    sundayHoliday:  { goPlus: 0, card1: 0, card2: 0, parking: 0 },
    justWork:       { goPlus: 2.10, card1: 1.65, card2: 0, parking: 0 },
    justBabysitters:{ goPlus: 4.20, card1: 0, card2: 0, parking: 0 },
    atOffice:       { goPlus: 2.10, card1: 0, card2: 0, parking: 0 },
    onLeave:        { goPlus: 4.20, card1: 2.78, card2: 0, parking: 0 },
  },

  [KEYS.balances]: { goPlus: 0, card1: 0, card2: 0, parking: 0 },

  [KEYS.monthlyMisc]: { goPlus: 0, card1: 0, card2: 0, parking: 0 },

  [KEYS.minimumBalances]: { goPlus: 20, card1: 20, card2: 20, parking: 15 },

  [KEYS.bills]: [
    { id: 'digi', name: 'DiGi', amount: 0, frequency: 'monthly' },
    { id: 'tnb', name: 'TnB', amount: 0, frequency: 'monthly' },
    { id: 'water', name: 'Water', amount: 0, frequency: 'monthly' },
    { id: 'iwk', name: 'IWK', amount: 90.00, frequency: 'biYearly', dueMonths: [1, 7] },
  ],

  [KEYS.dayOverrides]: {},

  [KEYS.atOffice]: {},

  [KEYS.holidays]: [],

  [KEYS.billOverrides]: {},

  [KEYS.snapshots]: [],

  [KEYS.lastActiveMonth]: null,
};

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Load a value from localStorage by key.
 * Returns parsed JSON if the key exists, otherwise returns the default value
 * (from DEFAULTS if no explicit default is provided).
 *
 * @param {string} key - The localStorage key to read
 * @param {*} [defaultValue] - Optional default value; falls back to DEFAULTS[key]
 * @returns {*} The parsed value or the default
 */
export function load(key, defaultValue) {
  const raw = localStorage.getItem(key);
  if (raw === null) {
    return defaultValue !== undefined ? defaultValue : DEFAULTS[key];
  }
  try {
    return JSON.parse(raw);
  } catch {
    // If stored value is corrupted JSON, return default
    return defaultValue !== undefined ? defaultValue : DEFAULTS[key];
  }
}

/**
 * Save a value to localStorage under the given key.
 * The value is JSON-stringified before persisting.
 *
 * @param {string} key - The localStorage key to write
 * @param {*} value - The value to persist (must be JSON-serialisable)
 */
export function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ─── Export / Import ────────────────────────────────────────────────────────

/**
 * Export all storage data as a single JSON string.
 * Collects all known keys from localStorage (falling back to defaults if missing).
 *
 * @returns {string} JSON string containing all persisted data
 */
export function exportAll() {
  const data = {};
  for (const [logicalKey, storageKey] of Object.entries(KEYS)) {
    data[storageKey] = load(storageKey);
  }
  return JSON.stringify(data);
}

/**
 * Import data from a JSON string, replacing all localStorage data on success.
 * Validates: valid JSON, all required keys present, correct value types per key.
 * On failure: returns error object, leaves localStorage unchanged.
 *
 * @param {string} json - The JSON string to import
 * @returns {{ success: true } | { success: false, error: string }}
 */
export function importAll(json) {
  // 1. Parse JSON
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return { success: false, error: 'Invalid JSON format' };
  }

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { success: false, error: 'Import data must be a JSON object' };
  }

  // 2. Check all required keys are present
  const requiredKeys = Object.values(KEYS);
  for (const key of requiredKeys) {
    if (!(key in data)) {
      return { success: false, error: `Missing required key: ${key}` };
    }
  }

  // 3. Validate value types for each key
  const validationError = validateImportData(data);
  if (validationError) {
    return { success: false, error: validationError };
  }

  // 4. All checks passed — replace all data
  for (const key of requiredKeys) {
    localStorage.setItem(key, JSON.stringify(data[key]));
  }

  return { success: true };
}

// ─── Validation Helpers ─────────────────────────────────────────────────────

const DAY_TYPE_KEYS = ['weekday', 'saturday', 'sundayHoliday', 'justWork', 'justBabysitters', 'atOffice', 'onLeave'];
const WALLET_KEYS = ['goPlus', 'card1', 'card2', 'parking'];

/**
 * Validate the structure and types of imported data.
 * @param {object} data - The parsed import object
 * @returns {string|null} Error message or null if valid
 */
function validateImportData(data) {
  // rateTable: object with 7 day-type keys, each containing 4 wallet amounts
  const rateTable = data[KEYS.rateTable];
  if (!isPlainObject(rateTable)) {
    return 'rateTable must be an object';
  }
  for (const dayType of DAY_TYPE_KEYS) {
    if (!(dayType in rateTable)) {
      return `rateTable missing day type: ${dayType}`;
    }
    if (!isPlainObject(rateTable[dayType])) {
      return `rateTable.${dayType} must be an object`;
    }
    for (const wallet of WALLET_KEYS) {
      if (!(wallet in rateTable[dayType])) {
        return `rateTable.${dayType} missing wallet: ${wallet}`;
      }
      if (typeof rateTable[dayType][wallet] !== 'number') {
        return `rateTable.${dayType}.${wallet} must be a number`;
      }
    }
  }

  // balances: object with 4 wallet keys, each a number
  const balances = data[KEYS.balances];
  const balancesErr = validateWalletObject(balances, 'balances');
  if (balancesErr) return balancesErr;

  // monthlyMisc: object with 4 wallet keys, each a number
  const monthlyMisc = data[KEYS.monthlyMisc];
  const miscErr = validateWalletObject(monthlyMisc, 'monthlyMisc');
  if (miscErr) return miscErr;

  // minimumBalances: object with 4 wallet keys, each a number
  const minimumBalances = data[KEYS.minimumBalances];
  const minBalErr = validateWalletObject(minimumBalances, 'minimumBalances');
  if (minBalErr) return minBalErr;

  // bills: array of objects with id, name, amount, frequency
  const bills = data[KEYS.bills];
  if (!Array.isArray(bills)) {
    return 'bills must be an array';
  }
  for (let i = 0; i < bills.length; i++) {
    const bill = bills[i];
    if (!isPlainObject(bill)) {
      return `bills[${i}] must be an object`;
    }
    if (typeof bill.id !== 'string') {
      return `bills[${i}].id must be a string`;
    }
    if (typeof bill.name !== 'string') {
      return `bills[${i}].name must be a string`;
    }
    if (typeof bill.amount !== 'number') {
      return `bills[${i}].amount must be a number`;
    }
    if (typeof bill.frequency !== 'string') {
      return `bills[${i}].frequency must be a string`;
    }
  }

  // dayOverrides: object (string keys → string values)
  const dayOverrides = data[KEYS.dayOverrides];
  if (!isPlainObject(dayOverrides)) {
    return 'dayOverrides must be an object';
  }
  for (const [key, value] of Object.entries(dayOverrides)) {
    if (typeof value !== 'string') {
      return `dayOverrides["${key}"] must be a string`;
    }
  }

  // atOffice: object (string keys → boolean values)
  const atOffice = data[KEYS.atOffice];
  if (!isPlainObject(atOffice)) {
    return 'atOffice must be an object';
  }
  for (const [key, value] of Object.entries(atOffice)) {
    if (typeof value !== 'boolean') {
      return `atOffice["${key}"] must be a boolean`;
    }
  }

  // holidays: array
  const holidays = data[KEYS.holidays];
  if (!Array.isArray(holidays)) {
    return 'holidays must be an array';
  }

  // billOverrides: object
  const billOverrides = data[KEYS.billOverrides];
  if (!isPlainObject(billOverrides)) {
    return 'billOverrides must be an object';
  }

  // snapshots: array
  const snapshots = data[KEYS.snapshots];
  if (!Array.isArray(snapshots)) {
    return 'snapshots must be an array';
  }

  // lastActiveMonth: null or string
  const lastActiveMonth = data[KEYS.lastActiveMonth];
  if (lastActiveMonth !== null && typeof lastActiveMonth !== 'string') {
    return 'lastActiveMonth must be null or a string';
  }

  return null;
}

/**
 * Validate that a value is a plain object with the 4 wallet keys, each a number.
 * @param {*} obj - Value to check
 * @param {string} name - Field name for error messages
 * @returns {string|null} Error message or null if valid
 */
function validateWalletObject(obj, name) {
  if (!isPlainObject(obj)) {
    return `${name} must be an object`;
  }
  for (const wallet of WALLET_KEYS) {
    if (!(wallet in obj)) {
      return `${name} missing wallet: ${wallet}`;
    }
    if (typeof obj[wallet] !== 'number') {
      return `${name}.${wallet} must be a number`;
    }
  }
  return null;
}

/**
 * Check if a value is a plain object (not null, not array).
 * @param {*} val
 * @returns {boolean}
 */
function isPlainObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

// ─── Snapshot Management ────────────────────────────────────────────────────

/**
 * Save a monthly snapshot, archiving month-end state.
 * If a snapshot for the given month already exists, it is updated.
 * Otherwise, a new snapshot entry is added.
 *
 * @param {string} month - Month string in YYYY-MM format (e.g., "2025-01")
 * @param {{ balances: object, projections: object, topUps: object, billsTotal: number }} data - Snapshot data
 */
export function saveSnapshot(month, data) {
  const snapshots = [...load(KEYS.snapshots)];
  const existingIndex = snapshots.findIndex(s => s.month === month);

  const snapshot = {
    month,
    balances: data.balances,
    projections: data.projections,
    topUps: data.topUps,
    billsTotal: data.billsTotal,
  };

  if (existingIndex >= 0) {
    snapshots[existingIndex] = snapshot;
  } else {
    snapshots.push(snapshot);
  }

  save(KEYS.snapshots, snapshots);
}

/**
 * Get all historical snapshots, sorted by month string (ascending).
 *
 * @returns {Array<{ month: string, balances: object, projections: object, topUps: object, billsTotal: number }>}
 */
export function getSnapshots() {
  const snapshots = load(KEYS.snapshots);
  return snapshots.slice().sort((a, b) => a.month.localeCompare(b.month));
}
