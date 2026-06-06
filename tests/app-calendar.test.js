import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// We need to set up a DOM environment before importing app.js
// since app.js accesses document on module load (DOMContentLoaded listener)

describe('app.js — Calendar View Logic', () => {
  let dom;
  let window;

  beforeEach(() => {
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <body>
        <nav class="app-nav">
          <button class="nav-btn active" data-view="dashboard">Dashboard</button>
          <button class="nav-btn" data-view="calendar">Calendar</button>
          <button class="nav-btn" data-view="settings">Settings</button>
        </nav>
        <section id="view-dashboard" class="view active"></section>
        <section id="view-calendar" class="view" hidden>
          <div class="calendar-controls">
            <button id="prev-month">&laquo;</button>
            <span id="calendar-title"></span>
            <button id="next-month">&raquo;</button>
          </div>
          <div id="calendar-grid"></div>
        </section>
        <section id="view-settings" class="view" hidden></section>
        <div id="projection-cards"></div>
        <div id="fund-flow"></div>
      </body>
      </html>
    `, { url: 'http://localhost' });

    window = dom.window;
    globalThis.document = window.document;
    globalThis.window = window;
    globalThis.localStorage = createMockLocalStorage();
    globalThis.HTMLElement = window.HTMLElement;
  });

  afterEach(() => {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.localStorage;
    delete globalThis.HTMLElement;
  });

  /**
   * Create a simple mock localStorage
   */
  function createMockLocalStorage() {
    const store = {};
    return {
      getItem(key) { return store[key] ?? null; },
      setItem(key, value) { store[key] = String(value); },
      removeItem(key) { delete store[key]; },
      clear() { for (const k of Object.keys(store)) delete store[k]; },
    };
  }

  /**
   * Dynamically import app.js fresh (after DOM setup)
   */
  async function importApp() {
    // Clear module cache by using a timestamp query param trick
    // Node.js doesn't cache dynamic imports with different specifiers
    const timestamp = Date.now() + Math.random();
    return await import(`../js/app.js?t=${timestamp}`);
  }

  describe('Month Navigation', () => {
    it('prevMonth navigates backward from the current module state', async () => {
      const app = await importApp();

      // The module-level calendarYear/calendarMonth start at today's date
      // Call refreshCalendar to set the display, then call prevMonth
      // prevMonth operates on the module's internal state
      const now = new Date();
      const titleEl = document.getElementById('calendar-title');

      // After prevMonth, should show one month before today
      app.prevMonth();
      const expectedMonth = now.getMonth(); // 0-indexed (one less than current 1-indexed)
      const expectedYear = expectedMonth === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const expectedMonthIdx = expectedMonth === 0 ? 12 : expectedMonth;
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      assert.strictEqual(titleEl.textContent, `${monthNames[expectedMonthIdx - 1]} ${expectedYear}`);
    });

    it('nextMonth navigates forward from the current module state', async () => {
      const app = await importApp();
      const titleEl = document.getElementById('calendar-title');

      // Call nextMonth — should go one month ahead of module state
      app.nextMonth();
      // The module state was already modified by prevMonth in the previous test,
      // but since we do a fresh import each time, it starts fresh at today
      const now = new Date();
      let expMonth = now.getMonth() + 2; // current is month+1, next is month+2
      let expYear = now.getFullYear();
      if (expMonth > 12) {
        expMonth -= 12;
        expYear += 1;
      }
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      assert.strictEqual(titleEl.textContent, `${monthNames[expMonth - 1]} ${expYear}`);
    });

    it('prevMonth wraps from January to December of previous year', async () => {
      const app = await importApp();
      const titleEl = document.getElementById('calendar-title');

      // Navigate backward until we hit January, then one more should be Dec of prev year
      const now = new Date();
      const currentMonth = now.getMonth() + 1; // 1-indexed
      // Go back currentMonth times to reach the previous December
      for (let i = 0; i < currentMonth; i++) {
        app.prevMonth();
      }
      const expectedYear = now.getFullYear() - 1;
      assert.strictEqual(titleEl.textContent, `December ${expectedYear}`);
    });

    it('nextMonth wraps from December to January of next year', async () => {
      const app = await importApp();
      const titleEl = document.getElementById('calendar-title');

      const now = new Date();
      const currentMonth = now.getMonth() + 1; // 1-indexed
      // Go forward enough months to hit January of next year
      const stepsToJanuary = 12 - currentMonth + 1;
      for (let i = 0; i < stepsToJanuary; i++) {
        app.nextMonth();
      }
      const expectedYear = now.getFullYear() + 1;
      assert.strictEqual(titleEl.textContent, `January ${expectedYear}`);
    });
  });

  describe('Day Editor Overlay', () => {
    it('openDayEditor creates an overlay in the DOM', async () => {
      const app = await importApp();
      app.openDayEditor('2025-02-03');

      const overlay = document.querySelector('.day-editor-overlay');
      assert.ok(overlay, 'Overlay should exist in DOM');
      assert.ok(overlay.querySelector('[data-field="daytype"]'), 'Should have daytype select');
      assert.ok(overlay.querySelector('[data-field="atoffice"]'), 'Should have atoffice checkbox');
    });

    it('openDayEditor shows the correct date in heading', async () => {
      const app = await importApp();
      app.openDayEditor('2025-06-15');

      const overlay = document.querySelector('.day-editor-overlay');
      const heading = overlay.querySelector('h4');
      assert.ok(heading.textContent.includes('2025-06-15'));
    });

    it('openDayEditor reflects existing override in the dropdown', async () => {
      // Pre-populate localStorage with an override
      localStorage.setItem('ewm_dayOverrides', JSON.stringify({ '2025-02-03': 'justWork' }));

      const app = await importApp();
      app.openDayEditor('2025-02-03');

      const select = document.querySelector('[data-field="daytype"]');
      assert.strictEqual(select.value, 'justWork');
    });

    it('openDayEditor reflects existing atOffice flag', async () => {
      localStorage.setItem('ewm_atOffice', JSON.stringify({ '2025-02-03': true }));

      const app = await importApp();
      app.openDayEditor('2025-02-03');

      const checkbox = document.querySelector('[data-field="atoffice"]');
      assert.strictEqual(checkbox.checked, true);
    });

    it('closeDayEditor removes the overlay from DOM', async () => {
      const app = await importApp();
      app.openDayEditor('2025-02-03');
      assert.ok(document.querySelector('.day-editor-overlay'));

      app.closeDayEditor();
      assert.strictEqual(document.querySelector('.day-editor-overlay'), null);
    });

    it('only one overlay exists at a time (opening a new one closes the old)', async () => {
      const app = await importApp();
      app.openDayEditor('2025-02-03');
      app.openDayEditor('2025-02-04');

      const overlays = document.querySelectorAll('.day-editor-overlay');
      assert.strictEqual(overlays.length, 1);
      assert.ok(overlays[0].querySelector('h4').textContent.includes('2025-02-04'));
    });
  });

  describe('Day Editor Save', () => {
    it('saveDayEditor persists override to localStorage', async () => {
      const app = await importApp();
      app.openDayEditor('2025-02-10');

      // Simulate selecting "justWork"
      const select = document.querySelector('[data-field="daytype"]');
      select.value = 'justWork';

      const overlay = document.querySelector('.day-editor-overlay');
      app.saveDayEditor('2025-02-10', overlay);

      const stored = JSON.parse(localStorage.getItem('ewm_dayOverrides'));
      assert.strictEqual(stored['2025-02-10'], 'justWork');
    });

    it('saveDayEditor removes override when "Default" is selected', async () => {
      // Pre-set an override
      localStorage.setItem('ewm_dayOverrides', JSON.stringify({ '2025-02-10': 'onLeave' }));

      const app = await importApp();
      app.openDayEditor('2025-02-10');

      // Select default (empty value)
      const select = document.querySelector('[data-field="daytype"]');
      select.value = '';

      const overlay = document.querySelector('.day-editor-overlay');
      app.saveDayEditor('2025-02-10', overlay);

      const stored = JSON.parse(localStorage.getItem('ewm_dayOverrides'));
      assert.strictEqual(stored['2025-02-10'], undefined);
    });

    it('saveDayEditor persists atOffice flag to localStorage', async () => {
      const app = await importApp();
      app.openDayEditor('2025-02-10');

      // Check the at-office checkbox
      const checkbox = document.querySelector('[data-field="atoffice"]');
      checkbox.checked = true;

      const overlay = document.querySelector('.day-editor-overlay');
      app.saveDayEditor('2025-02-10', overlay);

      const stored = JSON.parse(localStorage.getItem('ewm_atOffice'));
      assert.strictEqual(stored['2025-02-10'], true);
    });

    it('saveDayEditor removes atOffice flag when unchecked', async () => {
      localStorage.setItem('ewm_atOffice', JSON.stringify({ '2025-02-10': true }));

      const app = await importApp();
      app.openDayEditor('2025-02-10');

      const checkbox = document.querySelector('[data-field="atoffice"]');
      checkbox.checked = false;

      const overlay = document.querySelector('.day-editor-overlay');
      app.saveDayEditor('2025-02-10', overlay);

      const stored = JSON.parse(localStorage.getItem('ewm_atOffice'));
      assert.strictEqual(stored['2025-02-10'], undefined);
    });

    it('saveDayEditor closes the overlay after saving', async () => {
      const app = await importApp();
      app.openDayEditor('2025-02-10');

      const overlay = document.querySelector('.day-editor-overlay');
      app.saveDayEditor('2025-02-10', overlay);

      assert.strictEqual(document.querySelector('.day-editor-overlay'), null);
    });
  });

  describe('Calendar Grid Day Click', () => {
    it('clicking a day cell with data-date opens the editor', async () => {
      const app = await importApp();

      // Render calendar for a month
      app.refreshCalendar(2025, 2);

      const grid = document.getElementById('calendar-grid');
      const dayCell = grid.querySelector('[data-date="2025-02-03"]');
      assert.ok(dayCell, 'Day cell for 2025-02-03 should exist');

      // Simulate click event
      const event = new window.MouseEvent('click', { bubbles: true });
      dayCell.dispatchEvent(event);

      const overlay = document.querySelector('.day-editor-overlay');
      assert.ok(overlay, 'Clicking a day cell should open the editor overlay');
    });
  });

  describe('refreshCalendar', () => {
    it('renders all days of the month in the grid', async () => {
      const app = await importApp();
      app.refreshCalendar(2025, 2); // February 2025 has 28 days

      const grid = document.getElementById('calendar-grid');
      const dayCells = grid.querySelectorAll('[data-date]');
      assert.strictEqual(dayCells.length, 28);
    });

    it('sets the calendar title correctly', async () => {
      const app = await importApp();
      app.refreshCalendar(2025, 7);

      const titleEl = document.getElementById('calendar-title');
      assert.strictEqual(titleEl.textContent, 'July 2025');
    });
  });
});
