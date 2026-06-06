// app.js — Entry point, view routing, event wiring

import { load, save, KEYS, exportAll, importAll, saveSnapshot } from './store.js';
import { projectCurrentMonth, projectNextMonth, calculateAllTopUps, calculateBillsTotal } from './calc.js';
import { classifyDay, getMonthDays } from './calendar.js';
import {
  renderRateTable,
  renderBillsList,
  renderBalanceEditors,
  renderMiscEditors,
  renderMinBalanceEditors,
  renderHolidayCalendar,
  renderExportImport,
} from './ui.js';

// ─── View Routing ───────────────────────────────────────────────────────────

/**
 * Switch the active view. Hides all .view sections, shows the target,
 * updates nav button active state, and triggers a re-render of the new view.
 * @param {string} viewName - One of "dashboard", "calendar", "settings"
 */
export function switchView(viewName) {
  // Hide all views
  const views = document.querySelectorAll('.view');
  views.forEach(view => {
    view.classList.remove('active');
    view.setAttribute('hidden', '');
  });

  // Show target view
  const target = document.getElementById(`view-${viewName}`);
  if (target) {
    target.classList.add('active');
    target.removeAttribute('hidden');
  }

  // Update nav button active state
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => {
    if (btn.getAttribute('data-view') === viewName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Re-render the newly active view
  if (viewName === 'dashboard') {
    refreshDashboard();
  } else if (viewName === 'calendar') {
    refreshCalendar(calendarYear, calendarMonth);
  } else if (viewName === 'settings') {
    refreshSettings();
  }
}

// ─── Navigation Event Listener ──────────────────────────────────────────────

function initNavigation() {
  const nav = document.querySelector('.app-nav');
  if (!nav) return;

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (!btn) return;
    const viewName = btn.getAttribute('data-view');
    if (viewName) {
      switchView(viewName);
    }
  });
}

// ─── Calendar Month Navigation State ────────────────────────────────────────

let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth() + 1; // 1-indexed

/**
 * Navigate to the previous month and refresh calendar.
 */
export function prevMonth() {
  calendarMonth -= 1;
  if (calendarMonth < 1) {
    calendarMonth = 12;
    calendarYear -= 1;
  }
  refreshCalendar(calendarYear, calendarMonth);
}

/**
 * Navigate to the next month and refresh calendar.
 */
export function nextMonth() {
  calendarMonth += 1;
  if (calendarMonth > 12) {
    calendarMonth = 1;
    calendarYear += 1;
  }
  refreshCalendar(calendarYear, calendarMonth);
}

/**
 * Initialize calendar navigation buttons (prev/next month).
 */
function initCalendarNav() {
  const prevBtn = document.getElementById('prev-month');
  const nextBtn = document.getElementById('next-month');

  if (prevBtn) {
    prevBtn.addEventListener('click', prevMonth);
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', nextMonth);
  }
}

// ─── Calendar Day Click Handler ─────────────────────────────────────────────

/**
 * Initialize day click handling on the calendar grid via event delegation.
 */
let calendarClickInitialized = false;
export function initCalendarDayClick() {
  const grid = document.getElementById('calendar-grid');
  if (!grid || calendarClickInitialized) return;
  calendarClickInitialized = true;

  grid.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-date]');
    if (!cell) return;
    const date = cell.getAttribute('data-date');
    if (date) {
      openDayEditor(date);
    }
  });
}

/**
 * Open the day editor overlay for a given date.
 * Shows Day_Type override picker and At_Office toggle.
 * @param {string} date - Date string in "YYYY-MM-DD" format
 */
export function openDayEditor(date) {
  // Remove any existing overlay
  closeDayEditor();

  const dayOverrides = load(KEYS.dayOverrides);
  const atOfficeFlags = load(KEYS.atOffice);

  const currentOverride = (dayOverrides && dayOverrides[date]) || '';
  const currentAtOffice = !!(atOfficeFlags && atOfficeFlags[date]);

  const overlay = document.createElement('div');
  overlay.className = 'day-editor-overlay';
  overlay.innerHTML = `
    <div class="day-editor">
      <h4>Edit: ${date}</h4>
      <label>Day Type:</label>
      <select data-field="daytype">
        <option value=""${currentOverride === '' ? ' selected' : ''}>Default (by day of week/holiday)</option>
        <option value="justWork"${currentOverride === 'justWork' ? ' selected' : ''}>Just Work</option>
        <option value="justBabysitters"${currentOverride === 'justBabysitters' ? ' selected' : ''}>Just Babysitters</option>
        <option value="onLeave"${currentOverride === 'onLeave' ? ' selected' : ''}>On Leave</option>
      </select>
      <label><input type="checkbox" data-field="atoffice"${currentAtOffice ? ' checked' : ''}> At Office</label>
      <button data-action="save-day">Save</button>
      <button data-action="cancel-day">Cancel</button>
    </div>
  `;

  // Wire save/cancel events
  overlay.querySelector('[data-action="save-day"]').addEventListener('click', () => {
    saveDayEditor(date, overlay);
  });
  overlay.querySelector('[data-action="cancel-day"]').addEventListener('click', () => {
    closeDayEditor();
  });

  // Close on overlay background click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeDayEditor();
    }
  });

  document.body.appendChild(overlay);
}

/**
 * Save day editor changes: update dayOverrides and atOffice in store,
 * re-render calendar, and mark dashboard as needing recalc.
 * @param {string} date - The date being edited
 * @param {HTMLElement} overlay - The overlay element to read inputs from
 */
export function saveDayEditor(date, overlay) {
  const select = overlay.querySelector('[data-field="daytype"]');
  const checkbox = overlay.querySelector('[data-field="atoffice"]');

  const selectedType = select.value;
  const atOffice = checkbox.checked;

  // Update day overrides
  const dayOverrides = load(KEYS.dayOverrides);
  if (selectedType === '') {
    // Clear override (revert to default)
    delete dayOverrides[date];
  } else {
    dayOverrides[date] = selectedType;
  }
  save(KEYS.dayOverrides, dayOverrides);

  // Update atOffice flags
  const atOfficeFlags = load(KEYS.atOffice);
  if (atOffice) {
    atOfficeFlags[date] = true;
  } else {
    delete atOfficeFlags[date];
  }
  save(KEYS.atOffice, atOfficeFlags);

  // Close overlay
  closeDayEditor();

  // Re-render calendar
  refreshCalendar(calendarYear, calendarMonth);
}

/**
 * Close and remove the day editor overlay if present.
 */
export function closeDayEditor() {
  const existing = document.querySelector('.day-editor-overlay');
  if (existing) {
    existing.remove();
  }
}

// ─── Helper: Refresh Dashboard ──────────────────────────────────────────────

/**
 * Recalculate projections and top-ups, then render the dashboard cards
 * and fund flow display.
 */
export function refreshDashboard() {
  const rateTable = load(KEYS.rateTable);
  const balances = load(KEYS.balances);
  const monthlyMisc = load(KEYS.monthlyMisc);
  const minimumBalances = load(KEYS.minimumBalances);
  const bills = load(KEYS.bills);
  const dayOverrides = load(KEYS.dayOverrides);
  const atOfficeFlags = load(KEYS.atOffice);
  const holidays = load(KEYS.holidays);

  const today = new Date();
  const nextMonth = today.getMonth() + 2 > 12 ? 1 : today.getMonth() + 2;
  const nextMonthYear = today.getMonth() + 2 > 12 ? today.getFullYear() + 1 : today.getFullYear();

  const currentProj = projectCurrentMonth(today, rateTable, monthlyMisc, dayOverrides, atOfficeFlags, holidays);
  const nextProj = projectNextMonth(nextMonthYear, nextMonth, rateTable, monthlyMisc, dayOverrides, atOfficeFlags, holidays);
  const billsTotal = calculateBillsTotal(bills, nextMonth);
  const topUps = calculateAllTopUps(balances, currentProj, nextProj, minimumBalances, billsTotal);

  // Render projection cards
  const cardsContainer = document.getElementById('projection-cards');
  if (cardsContainer) {
    renderProjectionCards(cardsContainer, balances, currentProj, nextProj, minimumBalances, topUps);
  }

  // Render fund flow
  const flowContainer = document.getElementById('fund-flow');
  if (flowContainer) {
    renderFundFlow(flowContainer, topUps, billsTotal);
  }
}

// ─── Helper: Refresh Calendar ───────────────────────────────────────────────

/**
 * Classify all days in a month and render the calendar grid.
 * @param {number} year - Full year (e.g. 2025)
 * @param {number} month - 1-indexed month (1=January)
 */
export function refreshCalendar(year, month) {
  const dayOverrides = load(KEYS.dayOverrides);
  const atOfficeFlags = load(KEYS.atOffice);
  const holidays = load(KEYS.holidays);

  const days = getMonthDays(year, month);
  const classified = days.map(day => ({
    ...day,
    dayType: classifyDay(day.date, holidays, dayOverrides, atOfficeFlags),
    atOffice: !!(atOfficeFlags && atOfficeFlags[day.date]),
  }));

  // Update calendar title
  const titleEl = document.getElementById('calendar-title');
  if (titleEl) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    titleEl.textContent = `${monthNames[month - 1]} ${year}`;
  }

  // Render the calendar grid
  const gridContainer = document.getElementById('calendar-grid');
  if (gridContainer) {
    renderCalendarGrid(gridContainer, classified, year, month);
    initCalendarDayClick();
  }
}

// ─── Helper: Refresh Settings ───────────────────────────────────────────────

function refreshSettings() {
  const rateTable = load(KEYS.rateTable);
  const balances = load(KEYS.balances);
  const monthlyMisc = load(KEYS.monthlyMisc);
  const minimumBalances = load(KEYS.minimumBalances);
  const bills = load(KEYS.bills);
  const holidays = load(KEYS.holidays);

  const rateContainer = document.getElementById('settings-rate-table');
  if (rateContainer) renderRateTable(rateContainer, rateTable);

  const balContainer = document.getElementById('settings-balances');
  if (balContainer) renderBalanceEditors(balContainer, balances);

  const miscContainer = document.getElementById('settings-misc');
  if (miscContainer) renderMiscEditors(miscContainer, monthlyMisc);

  const minBalContainer = document.getElementById('settings-min-balances');
  if (minBalContainer) renderMinBalanceEditors(minBalContainer, minimumBalances);

  const billsContainer = document.getElementById('settings-bills');
  if (billsContainer) renderBillsList(billsContainer, bills);

  const holidaysContainer = document.getElementById('settings-holidays');
  if (holidaysContainer) renderHolidayCalendar(holidaysContainer, holidays);

  const exportContainer = document.getElementById('settings-export-import');
  if (exportContainer) renderExportImport(exportContainer);
}

// ─── Dashboard Render Helpers ───────────────────────────────────────────────

function renderProjectionCards(container, balances, currentProj, nextProj, minimumBalances, topUps) {
  const wallets = [
    { key: 'goPlus', label: 'Go Plus' },
    { key: 'card1', label: 'Card 1' },
    { key: 'card2', label: 'Card 2' },
    { key: 'parking', label: 'Parking' },
  ];

  let html = '<div class="projection-cards">';
  for (const w of wallets) {
    const balance = balances[w.key] || 0;
    const currProj = currentProj[w.key] || 0;
    const nxtProj = nextProj[w.key] || 0;
    const minBal = minimumBalances[w.key] || 0;
    const topUp = (topUps && topUps[w.key]) || 0;
    const endOfMonth = balance - currProj;
    const shortfall = (currProj + minBal) - balance;
    const needsInterim = shortfall > 0;

    html += `<div class="card" data-wallet="${w.key}">`;
    html += `<h3>${w.label}</h3>`;
    html += `<p class="balance"><strong>Balance:</strong> RM ${balance.toFixed(2)}</p>`;
    html += `<p class="current-proj"><strong>Remaining this month:</strong> RM ${currProj.toFixed(2)}</p>`;
    html += `<p class="end-balance"><strong>Est. end-of-month:</strong> RM ${endOfMonth.toFixed(2)}</p>`;
    html += `<p class="next-proj"><strong>Next month projection:</strong> RM ${nxtProj.toFixed(2)}</p>`;
    if (topUp > 0) {
      html += `<p class="topup"><strong>Top-up needed:</strong> RM ${topUp.toFixed(2)}</p>`;
    } else {
      html += `<p class="topup ok"><strong>Top-up needed:</strong> None</p>`;
    }
    if (needsInterim) {
      html += `<p class="shortfall warning">⚠ Interim shortfall: RM ${shortfall.toFixed(2)}</p>`;
    }
    html += '</div>';
  }
  html += '</div>';
  container.innerHTML = html;
}

function renderFundFlow(container, topUps, billsTotal) {
  let html = '<div class="fund-flow">';
  html += '<h3>Fund Flow</h3>';

  if (topUps.bankToGoPlus > 0) {
    html += `<p class="flow-item bank-to-goplus">Bank → Go Plus: <strong>RM ${topUps.bankToGoPlus.toFixed(2)}</strong></p>`;
    html += `<p class="flow-item breakdown">(Go Plus own + linked wallets + bills = RM ${topUps.bankToGoPlus.toFixed(2)})</p>`;
  }

  if (topUps.card1 > 0) {
    html += `<p class="flow-item">Go Plus → Card 1: <strong>RM ${topUps.card1.toFixed(2)}</strong></p>`;
  }
  if (topUps.card2 > 0) {
    html += `<p class="flow-item">Go Plus → Card 2: <strong>RM ${topUps.card2.toFixed(2)}</strong></p>`;
  }
  if (topUps.parking > 0) {
    html += `<p class="flow-item">Go Plus → Parking: <strong>RM ${topUps.parking.toFixed(2)}</strong></p>`;
  }

  if (topUps.bankToGoPlus === 0 && topUps.card1 === 0 && topUps.card2 === 0 && topUps.parking === 0) {
    html += '<p class="flow-item none">No top-ups needed this month.</p>';
  }

  html += '</div>';
  container.innerHTML = html;
}

// ─── Calendar Render Helper ─────────────────────────────────────────────────

function renderCalendarGrid(container, classifiedDays, year, month) {
  const dayTypeColors = {
    weekday: 'black',
    saturday: 'blue',
    sundayHoliday: 'green',
    justWork: 'maroon',
    justBabysitters: 'red',
    atOffice: 'teal',
    onLeave: 'ochre',
  };

  let html = '<table class="calendar-grid"><thead><tr>';
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (const label of dayLabels) {
    html += `<th>${label}</th>`;
  }
  html += '</tr></thead><tbody><tr>';

  // Pad the first row
  if (classifiedDays.length > 0) {
    const firstDow = classifiedDays[0].dayOfWeek;
    for (let i = 0; i < firstDow; i++) {
      html += '<td></td>';
    }
  }

  for (const day of classifiedDays) {
    const dayNum = parseInt(day.date.split('-')[2], 10);
    const color = dayTypeColors[day.dayType] || 'black';
    const atOfficeClass = day.atOffice ? ' at-office' : '';

    html += `<td class="calendar-day${atOfficeClass}" data-date="${day.date}" style="color:${color}">`;
    html += `<span class="day-num">${dayNum}</span>`;
    if (day.atOffice) {
      html += '<span class="office-indicator">●</span>';
    }
    html += '</td>';

    // Start new row after Saturday
    if (day.dayOfWeek === 6) {
      html += '</tr><tr>';
    }
  }

  html += '</tr></tbody></table>';
  container.innerHTML = html;
}

// ─── Month Transition ───────────────────────────────────────────────────────

/**
 * Carry forward bill amounts from one month to the next.
 * For DiGi, TnB, Water: if an override existed for the previous month, use that
 * as the new base amount; otherwise keep the existing base amount unchanged.
 *
 * This is a pure function for testability.
 *
 * @param {Array} bills - The current bills array
 * @param {object} billOverrides - The full bill overrides object (keyed by YYYY-MM)
 * @param {string} previousMonth - Previous month in YYYY-MM format
 * @returns {Array} Updated bills array with carried-forward amounts
 */
export function carryForwardBills(bills, billOverrides, previousMonth) {
  const prevOverrides = (billOverrides && billOverrides[previousMonth]) || {};
  const carryForwardIds = ['digi', 'tnb', 'water'];

  return bills.map(bill => {
    if (carryForwardIds.includes(bill.id) && prevOverrides[bill.id] != null) {
      return { ...bill, amount: prevOverrides[bill.id] };
    }
    return { ...bill };
  });
}

/**
 * Perform month transition: save a snapshot of the previous month and
 * carry forward bill amounts.
 *
 * @param {string} previousMonth - The month that just ended (YYYY-MM)
 * @param {string} newMonth - The month that is starting (YYYY-MM)
 */
export function performMonthTransition(previousMonth, newMonth) {
  // 1. Save snapshot of previous month state
  const balances = load(KEYS.balances);
  const rateTable = load(KEYS.rateTable);
  const monthlyMisc = load(KEYS.monthlyMisc);
  const minimumBalances = load(KEYS.minimumBalances);
  const bills = load(KEYS.bills);
  const dayOverrides = load(KEYS.dayOverrides);
  const atOfficeFlags = load(KEYS.atOffice);
  const holidays = load(KEYS.holidays);

  // Calculate projections for the previous month (full month) for the snapshot
  const [prevYear, prevMonthNum] = previousMonth.split('-').map(Number);
  const projections = projectNextMonth(prevYear, prevMonthNum, rateTable, monthlyMisc, dayOverrides, atOfficeFlags, holidays);
  const billsTotal = calculateBillsTotal(bills, prevMonthNum);
  const topUps = calculateAllTopUps(balances, projections, projections, minimumBalances, billsTotal);

  saveSnapshot(previousMonth, {
    balances,
    projections,
    topUps,
    billsTotal,
  });

  // 2. Carry forward bill amounts
  const billOverrides = load(KEYS.billOverrides) || {};
  const updatedBills = carryForwardBills(bills, billOverrides, previousMonth);
  save(KEYS.bills, updatedBills);
}

/**
 * Check if a month transition has occurred (new Calendar_Month vs last active month).
 * If so, perform the transition and update the stored last active month.
 */
export function checkMonthTransition() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = load(KEYS.lastActiveMonth) || currentMonth;

  if (currentMonth !== lastMonth) {
    performMonthTransition(lastMonth, currentMonth);
    save(KEYS.lastActiveMonth, currentMonth);
  } else {
    // Ensure lastActiveMonth is stored even on first use
    save(KEYS.lastActiveMonth, currentMonth);
  }
}

/**
 * Get the effective bill amount for a given bill in a given month.
 * Checks bill overrides for the month first, falls back to the base amount.
 *
 * @param {object} bill - The bill object with id and amount
 * @param {string} month - Month in YYYY-MM format
 * @param {object} billOverrides - The full bill overrides object
 * @returns {number} The effective amount for this bill in this month
 */
export function getEffectiveBillAmount(bill, month, billOverrides) {
  const monthOverrides = (billOverrides && billOverrides[month]) || {};
  if (monthOverrides[bill.id] != null) {
    return monthOverrides[bill.id];
  }
  return bill.amount;
}

// ─── Settings Event Handlers ────────────────────────────────────────────────

function initSettingsHandlers() {
  const settingsView = document.getElementById('view-settings');
  if (!settingsView) return;

  settingsView.addEventListener('click', (e) => {
    const action = e.target.getAttribute('data-action');
    if (!action) return;

    if (action === 'add-public-holiday') {
      showAddPublicHolidayForm();
    } else if (action === 'add-school-holiday') {
      showAddSchoolHolidayForm();
    } else if (action === 'export') {
      doExport();
    } else if (action === 'import') {
      const fileInput = settingsView.querySelector('[data-action="import-file"]');
      if (fileInput) fileInput.click();
    } else if (action === 'add-bill') {
      showAddBillForm();
    }

    // Remove holiday
    if (e.target.classList.contains('btn-remove-holiday')) {
      const date = e.target.getAttribute('data-holiday-date');
      removePublicHoliday(date);
    }
    if (e.target.classList.contains('btn-remove-school-holiday')) {
      const start = e.target.getAttribute('data-holiday-start');
      removeSchoolHoliday(start);
    }
    // Edit holiday
    if (e.target.classList.contains('btn-edit-holiday')) {
      const date = e.target.getAttribute('data-holiday-date');
      showEditPublicHolidayForm(date);
    }
    if (e.target.classList.contains('btn-edit-school-holiday')) {
      const start = e.target.getAttribute('data-holiday-start');
      showEditSchoolHolidayForm(start);
    }
    // Remove/Edit bill
    if (e.target.classList.contains('btn-remove-bill')) {
      const id = e.target.getAttribute('data-bill-id');
      removeBill(id);
    }
    if (e.target.classList.contains('btn-edit-bill')) {
      const id = e.target.getAttribute('data-bill-id');
      showEditBillForm(id);
    }
  });

  // Rate table, balance, misc, min-balance change handlers (event delegation)
  settingsView.addEventListener('change', (e) => {
    const target = e.target;

    // Rate table input
    if (target.dataset.daytype && target.dataset.wallet) {
      const rateTable = load(KEYS.rateTable);
      const val = parseFloat(target.value) || 0;
      if (!rateTable[target.dataset.daytype]) rateTable[target.dataset.daytype] = {};
      rateTable[target.dataset.daytype][target.dataset.wallet] = val;
      save(KEYS.rateTable, rateTable);
    }

    // Balance input
    if (target.id && target.id.startsWith('balance-')) {
      const wallet = target.dataset.wallet;
      const balances = load(KEYS.balances);
      balances[wallet] = parseFloat(target.value) || 0;
      save(KEYS.balances, balances);
    }

    // Monthly misc input
    if (target.id && target.id.startsWith('misc-')) {
      const wallet = target.dataset.wallet;
      const misc = load(KEYS.monthlyMisc);
      misc[wallet] = parseFloat(target.value) || 0;
      save(KEYS.monthlyMisc, misc);
    }

    // Minimum balance input
    if (target.id && target.id.startsWith('minbal-')) {
      const wallet = target.dataset.wallet;
      const minBal = load(KEYS.minimumBalances);
      minBal[wallet] = parseFloat(target.value) || 0;
      save(KEYS.minimumBalances, minBal);
    }
  });

  // File import handler
  settingsView.addEventListener('change', (e) => {
    if (e.target.getAttribute('data-action') === 'import-file') {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = importAll(reader.result);
        if (result.success) {
          alert('Data imported successfully.');
          refreshSettings();
        } else {
          alert(`Import failed: ${result.error}`);
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    }
  });
}

// ─── Holiday CRUD ───────────────────────────────────────────────────────────

function showAddPublicHolidayForm() {
  closeDayEditor(); // reuse overlay cleanup
  const overlay = document.createElement('div');
  overlay.className = 'day-editor-overlay';
  overlay.innerHTML = `
    <div class="day-editor">
      <h4>Add Public Holiday</h4>
      <label>Date:</label>
      <input type="date" data-field="holiday-date">
      <label>Name:</label>
      <input type="text" data-field="holiday-name" placeholder="e.g. Hari Raya" style="width:100%;padding:8px;margin-bottom:16px;border:1px solid #e0e0e0;border-radius:4px;">
      <button data-action="save-holiday">Save</button>
      <button data-action="cancel-holiday">Cancel</button>
    </div>
  `;
  overlay.querySelector('[data-action="save-holiday"]').addEventListener('click', () => {
    const date = overlay.querySelector('[data-field="holiday-date"]').value;
    const name = overlay.querySelector('[data-field="holiday-name"]').value.trim();
    if (!date || !name) { alert('Please fill in both date and name.'); return; }
    const holidays = load(KEYS.holidays);
    holidays.push({ type: 'public', date, name });
    save(KEYS.holidays, holidays);
    overlay.remove();
    refreshSettings();
  });
  overlay.querySelector('[data-action="cancel-holiday"]').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function showEditPublicHolidayForm(dateKey) {
  const holidays = load(KEYS.holidays);
  const holiday = holidays.find(h => h.type === 'public' && h.date === dateKey);
  if (!holiday) return;

  closeDayEditor();
  const overlay = document.createElement('div');
  overlay.className = 'day-editor-overlay';
  overlay.innerHTML = `
    <div class="day-editor">
      <h4>Edit Public Holiday</h4>
      <label>Date:</label>
      <input type="date" data-field="holiday-date" value="${holiday.date}">
      <label>Name:</label>
      <input type="text" data-field="holiday-name" value="${holiday.name}" style="width:100%;padding:8px;margin-bottom:16px;border:1px solid #e0e0e0;border-radius:4px;">
      <button data-action="save-holiday">Save</button>
      <button data-action="cancel-holiday">Cancel</button>
    </div>
  `;
  overlay.querySelector('[data-action="save-holiday"]').addEventListener('click', () => {
    const date = overlay.querySelector('[data-field="holiday-date"]').value;
    const name = overlay.querySelector('[data-field="holiday-name"]').value.trim();
    if (!date || !name) { alert('Please fill in both date and name.'); return; }
    const idx = holidays.findIndex(h => h.type === 'public' && h.date === dateKey);
    if (idx >= 0) { holidays[idx] = { type: 'public', date, name }; }
    save(KEYS.holidays, holidays);
    overlay.remove();
    refreshSettings();
  });
  overlay.querySelector('[data-action="cancel-holiday"]').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function removePublicHoliday(dateKey) {
  if (!confirm(`Remove public holiday on ${dateKey}?`)) return;
  const holidays = load(KEYS.holidays);
  const updated = holidays.filter(h => !(h.type === 'public' && h.date === dateKey));
  save(KEYS.holidays, updated);
  refreshSettings();
}

function showAddSchoolHolidayForm() {
  closeDayEditor();
  const overlay = document.createElement('div');
  overlay.className = 'day-editor-overlay';
  overlay.innerHTML = `
    <div class="day-editor">
      <h4>Add School Holiday</h4>
      <label>Start Date:</label>
      <input type="date" data-field="start-date">
      <label>End Date:</label>
      <input type="date" data-field="end-date">
      <label>Name:</label>
      <input type="text" data-field="holiday-name" placeholder="e.g. Mid-term break" style="width:100%;padding:8px;margin-bottom:16px;border:1px solid #e0e0e0;border-radius:4px;">
      <button data-action="save-school">Save</button>
      <button data-action="cancel-school">Cancel</button>
    </div>
  `;
  overlay.querySelector('[data-action="save-school"]').addEventListener('click', () => {
    const startDate = overlay.querySelector('[data-field="start-date"]').value;
    const endDate = overlay.querySelector('[data-field="end-date"]').value;
    const name = overlay.querySelector('[data-field="holiday-name"]').value.trim();
    if (!startDate || !endDate || !name) { alert('Please fill in all fields.'); return; }
    if (endDate < startDate) { alert('End date must be on or after start date.'); return; }
    const holidays = load(KEYS.holidays);
    holidays.push({ type: 'school', startDate, endDate, name });
    save(KEYS.holidays, holidays);
    overlay.remove();
    refreshSettings();
  });
  overlay.querySelector('[data-action="cancel-school"]').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function showEditSchoolHolidayForm(startKey) {
  const holidays = load(KEYS.holidays);
  const holiday = holidays.find(h => h.type === 'school' && h.startDate === startKey);
  if (!holiday) return;

  closeDayEditor();
  const overlay = document.createElement('div');
  overlay.className = 'day-editor-overlay';
  overlay.innerHTML = `
    <div class="day-editor">
      <h4>Edit School Holiday</h4>
      <label>Start Date:</label>
      <input type="date" data-field="start-date" value="${holiday.startDate}">
      <label>End Date:</label>
      <input type="date" data-field="end-date" value="${holiday.endDate}">
      <label>Name:</label>
      <input type="text" data-field="holiday-name" value="${holiday.name}" style="width:100%;padding:8px;margin-bottom:16px;border:1px solid #e0e0e0;border-radius:4px;">
      <button data-action="save-school">Save</button>
      <button data-action="cancel-school">Cancel</button>
    </div>
  `;
  overlay.querySelector('[data-action="save-school"]').addEventListener('click', () => {
    const startDate = overlay.querySelector('[data-field="start-date"]').value;
    const endDate = overlay.querySelector('[data-field="end-date"]').value;
    const name = overlay.querySelector('[data-field="holiday-name"]').value.trim();
    if (!startDate || !endDate || !name) { alert('Please fill in all fields.'); return; }
    if (endDate < startDate) { alert('End date must be on or after start date.'); return; }
    const idx = holidays.findIndex(h => h.type === 'school' && h.startDate === startKey);
    if (idx >= 0) { holidays[idx] = { type: 'school', startDate, endDate, name }; }
    save(KEYS.holidays, holidays);
    overlay.remove();
    refreshSettings();
  });
  overlay.querySelector('[data-action="cancel-school"]').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function removeSchoolHoliday(startKey) {
  if (!confirm(`Remove school holiday starting ${startKey}?`)) return;
  const holidays = load(KEYS.holidays);
  const updated = holidays.filter(h => !(h.type === 'school' && h.startDate === startKey));
  save(KEYS.holidays, updated);
  refreshSettings();
}

// ─── Bills CRUD ─────────────────────────────────────────────────────────────

function showAddBillForm() {
  closeDayEditor();
  const overlay = document.createElement('div');
  overlay.className = 'day-editor-overlay';
  overlay.innerHTML = `
    <div class="day-editor">
      <h4>Add Bill</h4>
      <label>Name:</label>
      <input type="text" data-field="bill-name" placeholder="e.g. Netflix" style="width:100%;padding:8px;margin-bottom:16px;border:1px solid #e0e0e0;border-radius:4px;">
      <label>Amount (RM):</label>
      <input type="number" data-field="bill-amount" step="0.01" min="0" max="9999.99" value="0" style="width:100%;padding:8px;margin-bottom:16px;border:1px solid #e0e0e0;border-radius:4px;">
      <label>Frequency:</label>
      <select data-field="bill-frequency" style="width:100%;padding:8px;margin-bottom:16px;border:1px solid #e0e0e0;border-radius:4px;">
        <option value="monthly">Monthly</option>
        <option value="biYearly">Bi-yearly</option>
      </select>
      <button data-action="save-bill">Save</button>
      <button data-action="cancel-bill">Cancel</button>
    </div>
  `;
  overlay.querySelector('[data-action="save-bill"]').addEventListener('click', () => {
    const name = overlay.querySelector('[data-field="bill-name"]').value.trim();
    const amount = parseFloat(overlay.querySelector('[data-field="bill-amount"]').value) || 0;
    const frequency = overlay.querySelector('[data-field="bill-frequency"]').value;
    if (!name) { alert('Please enter a bill name.'); return; }
    const id = name.toLowerCase().replace(/\s+/g, '_').slice(0, 20);
    const bills = load(KEYS.bills);
    const bill = { id, name, amount, frequency };
    if (frequency === 'biYearly') { bill.dueMonths = [1, 7]; }
    bills.push(bill);
    save(KEYS.bills, bills);
    overlay.remove();
    refreshSettings();
  });
  overlay.querySelector('[data-action="cancel-bill"]').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function showEditBillForm(billId) {
  const bills = load(KEYS.bills);
  const bill = bills.find(b => b.id === billId);
  if (!bill) return;

  closeDayEditor();
  const overlay = document.createElement('div');
  overlay.className = 'day-editor-overlay';
  overlay.innerHTML = `
    <div class="day-editor">
      <h4>Edit Bill: ${bill.name}</h4>
      <label>Name:</label>
      <input type="text" data-field="bill-name" value="${bill.name}" style="width:100%;padding:8px;margin-bottom:16px;border:1px solid #e0e0e0;border-radius:4px;">
      <label>Amount (RM):</label>
      <input type="number" data-field="bill-amount" step="0.01" min="0" max="9999.99" value="${bill.amount}" style="width:100%;padding:8px;margin-bottom:16px;border:1px solid #e0e0e0;border-radius:4px;">
      <label>Frequency:</label>
      <select data-field="bill-frequency" style="width:100%;padding:8px;margin-bottom:16px;border:1px solid #e0e0e0;border-radius:4px;">
        <option value="monthly"${bill.frequency === 'monthly' ? ' selected' : ''}>Monthly</option>
        <option value="biYearly"${bill.frequency === 'biYearly' ? ' selected' : ''}>Bi-yearly</option>
      </select>
      <button data-action="save-bill">Save</button>
      <button data-action="cancel-bill">Cancel</button>
    </div>
  `;
  overlay.querySelector('[data-action="save-bill"]').addEventListener('click', () => {
    const name = overlay.querySelector('[data-field="bill-name"]').value.trim();
    const amount = parseFloat(overlay.querySelector('[data-field="bill-amount"]').value) || 0;
    const frequency = overlay.querySelector('[data-field="bill-frequency"]').value;
    if (!name) { alert('Please enter a bill name.'); return; }
    const idx = bills.findIndex(b => b.id === billId);
    if (idx >= 0) {
      bills[idx] = { ...bills[idx], name, amount, frequency };
      if (frequency === 'biYearly' && !bills[idx].dueMonths) { bills[idx].dueMonths = [1, 7]; }
    }
    save(KEYS.bills, bills);
    overlay.remove();
    refreshSettings();
  });
  overlay.querySelector('[data-action="cancel-bill"]').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function removeBill(billId) {
  const bills = load(KEYS.bills);
  const bill = bills.find(b => b.id === billId);
  if (!confirm(`Remove bill "${bill ? bill.name : billId}"?`)) return;
  const updated = bills.filter(b => b.id !== billId);
  save(KEYS.bills, updated);
  refreshSettings();
}

// ─── Export Helper ──────────────────────────────────────────────────────────

function doExport() {
  const json = exportAll();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ewallet-monitor-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Service Worker Registration ────────────────────────────────────────────

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').then((registration) => {
      console.log('Service Worker registered with scope:', registration.scope);
    }).catch((error) => {
      console.error('Service Worker registration failed:', error);
    });
  }
}

// ─── DOMContentLoaded Initialization ────────────────────────────────────────

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // Check for month transition before rendering
    checkMonthTransition();

    // Wire up navigation
    initNavigation();

    // Wire up calendar month navigation
    initCalendarNav();

    // Wire up calendar day click handler
    initCalendarDayClick();

    // Wire up settings event handlers
    initSettingsHandlers();

    // Render the default active view (Dashboard)
    refreshDashboard();

    // Register service worker for offline capability
    registerServiceWorker();
  });
}
