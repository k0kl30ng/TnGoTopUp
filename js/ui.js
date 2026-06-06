// ui.js — DOM rendering helpers

/**
 * Render the rate table as an editable HTML table.
 * Each cell is an input with data-daytype and data-wallet attributes.
 */
export function renderRateTable(container, rateTable) {
  const dayTypes = [
    { key: 'weekday', label: 'Weekday' },
    { key: 'saturday', label: 'Saturday' },
    { key: 'sundayHoliday', label: 'Sunday/Holiday' },
    { key: 'justWork', label: 'Just Work' },
    { key: 'justBabysitters', label: 'Just Babysitters' },
    { key: 'atOffice', label: 'At Office' },
    { key: 'onLeave', label: 'On Leave' }
  ];
  const wallets = [
    { key: 'goPlus', label: 'Go Plus' },
    { key: 'card1', label: 'Card 1' },
    { key: 'card2', label: 'Card 2' },
    { key: 'parking', label: 'Parking' }
  ];

  let html = '<h3>Rate Table</h3>';
  html += '<table class="rate-table"><thead><tr><th>Day Type</th>';
  for (const w of wallets) {
    html += `<th>${w.label}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const dt of dayTypes) {
    html += `<tr><td>${dt.label}</td>`;
    for (const w of wallets) {
      const value = (rateTable[dt.key] && rateTable[dt.key][w.key] != null)
        ? rateTable[dt.key][w.key]
        : 0;
      html += `<td><input type="number" step="0.01" min="0" max="999.99" `
        + `data-daytype="${dt.key}" data-wallet="${w.key}" `
        + `value="${value}"></td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

/**
 * Render the bills list with add/edit/remove controls.
 */
export function renderBillsList(container, bills) {
  let html = '<h3>Bills</h3>';
  html += '<div class="bills-list">';

  for (const bill of bills) {
    const freqLabel = bill.frequency === 'biYearly' ? 'Bi-yearly' : 'Monthly';
    html += `<div class="bill-row" data-bill-id="${bill.id}">`;
    html += `<span class="bill-name">${bill.name}</span>`;
    html += `<span class="bill-amount">RM ${bill.amount.toFixed(2)}</span>`;
    html += `<span class="bill-frequency">${freqLabel}</span>`;
    html += `<button class="btn-edit-bill" data-bill-id="${bill.id}">Edit</button>`;
    html += `<button class="btn-remove-bill" data-bill-id="${bill.id}">Remove</button>`;
    html += '</div>';
  }

  html += '</div>';
  html += '<button class="btn-add-bill" data-action="add-bill">Add Bill</button>';
  container.innerHTML = html;
}

/**
 * Render balance editors — one input per wallet.
 */
export function renderBalanceEditors(container, balances) {
  const wallets = [
    { key: 'goPlus', label: 'Go Plus' },
    { key: 'card1', label: 'Card 1' },
    { key: 'card2', label: 'Card 2' },
    { key: 'parking', label: 'Parking' }
  ];

  let html = '<h3>Current Balances</h3>';
  html += '<div class="balance-editors">';

  for (const w of wallets) {
    const value = (balances && balances[w.key] != null) ? balances[w.key] : 0;
    html += `<div class="editor-row">`;
    html += `<label for="balance-${w.key}">${w.label}</label>`;
    html += `<input type="number" step="0.01" min="0" max="99999.99" `
      + `id="balance-${w.key}" data-wallet="${w.key}" value="${value}">`;
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

/**
 * Render monthly misc editors — one input per wallet.
 */
export function renderMiscEditors(container, monthlyMisc) {
  const wallets = [
    { key: 'goPlus', label: 'Go Plus' },
    { key: 'card1', label: 'Card 1' },
    { key: 'card2', label: 'Card 2' },
    { key: 'parking', label: 'Parking' }
  ];

  let html = '<h3>Monthly Misc</h3>';
  html += '<div class="misc-editors">';

  for (const w of wallets) {
    const value = (monthlyMisc && monthlyMisc[w.key] != null) ? monthlyMisc[w.key] : 0;
    html += `<div class="editor-row">`;
    html += `<label for="misc-${w.key}">${w.label}</label>`;
    html += `<input type="number" step="0.01" min="0" max="9999.99" `
      + `id="misc-${w.key}" data-wallet="${w.key}" value="${value}">`;
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

/**
 * Render minimum balance editors — one input per wallet.
 */
export function renderMinBalanceEditors(container, minimumBalances) {
  const wallets = [
    { key: 'goPlus', label: 'Go Plus' },
    { key: 'card1', label: 'Card 1' },
    { key: 'card2', label: 'Card 2' },
    { key: 'parking', label: 'Parking' }
  ];

  let html = '<h3>Minimum Balances</h3>';
  html += '<div class="min-balance-editors">';

  for (const w of wallets) {
    const value = (minimumBalances && minimumBalances[w.key] != null) ? minimumBalances[w.key] : 0;
    html += `<div class="editor-row">`;
    html += `<label for="minbal-${w.key}">${w.label}</label>`;
    html += `<input type="number" step="0.01" min="0" max="999.99" `
      + `id="minbal-${w.key}" data-wallet="${w.key}" value="${value}">`;
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

/**
 * Render holiday calendar with add/edit/remove controls.
 */
export function renderHolidayCalendar(container, holidays) {
  let html = '<h3>Holiday Calendar</h3>';

  const publicHolidays = holidays.filter(h => h.type === 'public').sort((a, b) => a.date.localeCompare(b.date));
  const schoolHolidays = holidays.filter(h => h.type === 'school').sort((a, b) => a.startDate.localeCompare(b.startDate));

  // Public holidays section
  html += '<h4>Public Holidays</h4>';
  html += '<div class="holidays-list">';
  for (const h of publicHolidays) {
    html += `<div class="holiday-row" data-holiday-date="${h.date}">`;
    html += `<span class="holiday-date">${h.date}</span>`;
    html += `<span class="holiday-name">${h.name}</span>`;
    html += `<button class="btn-edit-holiday" data-holiday-date="${h.date}">Edit</button>`;
    html += `<button class="btn-remove-holiday" data-holiday-date="${h.date}">Remove</button>`;
    html += '</div>';
  }
  html += '</div>';
  html += '<button class="btn-add-holiday" data-action="add-public-holiday">Add Public Holiday</button>';

  // School holidays section
  html += '<h4>School Holidays</h4>';
  html += '<div class="school-holidays-list">';
  for (const h of schoolHolidays) {
    html += `<div class="holiday-row" data-holiday-start="${h.startDate}">`;
    html += `<span class="holiday-dates">${h.startDate} – ${h.endDate}</span>`;
    html += `<span class="holiday-name">${h.name}</span>`;
    html += `<button class="btn-edit-school-holiday" data-holiday-start="${h.startDate}">Edit</button>`;
    html += `<button class="btn-remove-school-holiday" data-holiday-start="${h.startDate}">Remove</button>`;
    html += '</div>';
  }
  html += '</div>';
  html += '<button class="btn-add-school-holiday" data-action="add-school-holiday">Add School Holiday</button>';

  container.innerHTML = html;
}

/**
 * Render export/import buttons.
 */
export function renderExportImport(container) {
  let html = '<h3>Export / Import</h3>';
  html += '<div class="export-import-controls">';
  html += '<button data-action="export">Export Data</button>';
  html += '<button data-action="import">Import Data</button>';
  html += '<input type="file" accept=".json" data-action="import-file" hidden>';
  html += '</div>';
  container.innerHTML = html;
}
