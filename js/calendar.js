// calendar.js — Day type classification, holiday matching

/**
 * Returns array of { date, dayOfWeek } for all days in a given month.
 * @param {number} year - Full year (e.g. 2025)
 * @param {number} month - 1-indexed month (1=January, 12=December)
 * @returns {Array<{date: string, dayOfWeek: number}>} Array where date is "YYYY-MM-DD" and dayOfWeek is 0-6 (0=Sunday)
 */
export function getMonthDays(year, month) {
  // new Date(year, month, 0) gives the last day of the given month
  // (month is 1-indexed here, but Date constructor month is 0-indexed,
  //  so passing month with day=0 gives last day of previous month in 0-indexed = our month)
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = [];

  const mm = String(month).padStart(2, '0');
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = String(d).padStart(2, '0');
    const dateStr = `${year}-${mm}-${dd}`;
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    days.push({ date: dateStr, dayOfWeek });
  }

  return days;
}

/**
 * Checks if a date falls on a public holiday or within a school holiday range.
 * @param {string} date - Date string in "YYYY-MM-DD" format
 * @param {Array} holidays - Array of holiday entries:
 *   { type: "public", date: "YYYY-MM-DD", name: string }
 *   { type: "school", startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD", name: string }
 * @returns {boolean} true if date matches a public holiday or falls within a school holiday range (inclusive)
 */
export function isHoliday(date, holidays) {
  for (const holiday of holidays) {
    if (holiday.type === 'public') {
      if (holiday.date === date) return true;
    } else if (holiday.type === 'school') {
      // String comparison works for YYYY-MM-DD format (lexicographic = chronological)
      if (date >= holiday.startDate && date <= holiday.endDate) return true;
    }
  }
  return false;
}

/**
 * Classifies a day into exactly one Day_Type based on precedence rules.
 *
 * Precedence (highest to lowest):
 *   1. At_Office flag enabled → "atOffice"
 *   2. User override exists → override value (e.g., "justWork", "justBabysitters", "onLeave")
 *   3. Holiday match → "sundayHoliday"
 *   4. Day of week → "weekday" (Mon–Fri), "saturday" (Sat), "sundayHoliday" (Sun)
 *
 * @param {string} date - Date string in "YYYY-MM-DD" format
 * @param {Array} holidays - Array of holiday entries (same format as isHoliday)
 * @param {Object} overrides - Map of "YYYY-MM-DD" → Day_Type string
 * @param {Object} atOfficeFlags - Map of "YYYY-MM-DD" → boolean
 * @returns {string} Exactly one Day_Type: "weekday", "saturday", "sundayHoliday", "justWork", "justBabysitters", "atOffice", or "onLeave"
 */
export function classifyDay(date, holidays, overrides, atOfficeFlags) {
  // Precedence 1: At_Office flag
  if (atOfficeFlags && atOfficeFlags[date]) {
    return 'atOffice';
  }

  // Precedence 2: User override
  if (overrides && overrides[date]) {
    return overrides[date];
  }

  // Precedence 3: Holiday match
  if (isHoliday(date, holidays)) {
    return 'sundayHoliday';
  }

  // Precedence 4: Day of week
  // Parse the date string to get day of week
  const [year, month, day] = date.split('-').map(Number);
  const dayOfWeek = new Date(year, month - 1, day).getDay();

  if (dayOfWeek === 0) return 'sundayHoliday';
  if (dayOfWeek === 6) return 'saturday';
  return 'weekday';
}

/**
 * Returns the RM rate for a specific day/wallet combination.
 * If isAtOffice is true, uses the atOffice row regardless of dayType.
 * Otherwise, uses the row matching the classified Day_Type.
 *
 * @param {string} dayType - One of "weekday", "saturday", "sundayHoliday", "justWork", "justBabysitters", "atOffice", "onLeave"
 * @param {boolean} isAtOffice - If true, use the "atOffice" row regardless of dayType
 * @param {object} rateTable - The rate table object with rows per day type
 * @param {string} wallet - One of "goPlus", "card1", "card2", "parking"
 * @returns {number} The RM rate for that day/wallet combination
 */
export function getEffectiveRate(dayType, isAtOffice, rateTable, wallet) {
  if (isAtOffice) {
    return rateTable.atOffice[wallet];
  }
  return rateTable[dayType][wallet];
}
