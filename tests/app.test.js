import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for app.js view routing and initialization logic.
 * Since we use Node.js test runner without jsdom, we test the switchView
 * function by importing it after setting up a minimal DOM mock.
 */

// ─── Minimal DOM Mock ───────────────────────────────────────────────────────

class MockElement {
  constructor(tag, attrs = {}) {
    this.tagName = tag;
    this.id = attrs.id || '';
    this.classList = new MockClassList();
    this.attributes = { ...attrs };
    this.children = [];
    this.textContent = '';
    this.innerHTML = '';
    this._hidden = attrs.hidden || false;
  }

  getAttribute(name) {
    if (name === 'hidden') return this._hidden ? '' : null;
    return this.attributes[name] || null;
  }

  setAttribute(name, value) {
    if (name === 'hidden') { this._hidden = true; return; }
    this.attributes[name] = value;
  }

  removeAttribute(name) {
    if (name === 'hidden') { this._hidden = false; return; }
    delete this.attributes[name];
  }

  hasAttribute(name) {
    if (name === 'hidden') return this._hidden;
    return name in this.attributes;
  }

  closest(selector) {
    // Simple: if this element matches, return this
    if (selector === '.nav-btn' && this.classList.contains('nav-btn')) return this;
    return null;
  }

  addEventListener() {}

  querySelector() { return null; }

  querySelectorAll() { return []; }
}

class MockClassList {
  constructor() { this._classes = new Set(); }
  add(c) { this._classes.add(c); }
  remove(c) { this._classes.delete(c); }
  contains(c) { return this._classes.has(c); }
  toggle(c) { if (this._classes.has(c)) this._classes.delete(c); else this._classes.add(c); }
}

function setupMockDOM() {
  // Create mock views
  const viewDashboard = new MockElement('section', { id: 'view-dashboard' });
  viewDashboard.classList.add('view');
  viewDashboard.classList.add('active');

  const viewCalendar = new MockElement('section', { id: 'view-calendar', hidden: true });
  viewCalendar.classList.add('view');

  const viewSettings = new MockElement('section', { id: 'view-settings', hidden: true });
  viewSettings.classList.add('view');

  // Create nav buttons
  const btnDashboard = new MockElement('button', { 'data-view': 'dashboard' });
  btnDashboard.classList.add('nav-btn');
  btnDashboard.classList.add('active');

  const btnCalendar = new MockElement('button', { 'data-view': 'calendar' });
  btnCalendar.classList.add('nav-btn');

  const btnSettings = new MockElement('button', { 'data-view': 'settings' });
  btnSettings.classList.add('nav-btn');

  // Containers for dashboard rendering
  const projCards = new MockElement('div', { id: 'projection-cards' });
  const fundFlow = new MockElement('div', { id: 'fund-flow' });
  const calTitle = new MockElement('span', { id: 'calendar-title' });
  const calGrid = new MockElement('div', { id: 'calendar-grid' });

  const views = [viewDashboard, viewCalendar, viewSettings];
  const navBtns = [btnDashboard, btnCalendar, btnSettings];
  const allElements = [...views, ...navBtns, projCards, fundFlow, calTitle, calGrid];

  // Mock document
  const mockDocument = {
    querySelectorAll(selector) {
      if (selector === '.view') return views;
      if (selector === '.nav-btn') return navBtns;
      return [];
    },
    querySelector(selector) {
      if (selector === '.app-nav') return { addEventListener() {} };
      return null;
    },
    getElementById(id) {
      return allElements.find(el => el.id === id) || null;
    },
    addEventListener() {},
  };

  return { mockDocument, views, navBtns, viewDashboard, viewCalendar, viewSettings, btnDashboard, btnCalendar, btnSettings };
}

// ─── Minimal localStorage Mock ──────────────────────────────────────────────

function setupMockStorage() {
  const store = {};
  return {
    getItem(key) { return key in store ? store[key] : null; },
    setItem(key, value) { store[key] = value; },
    removeItem(key) { delete store[key]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('app.js - view routing', () => {
  let dom;

  beforeEach(() => {
    dom = setupMockDOM();
    // Inject mocks into globalThis so the module can use them
    globalThis.document = dom.mockDocument;
    globalThis.localStorage = setupMockStorage();
  });

  it('switchView hides all views and shows only the target', async () => {
    // Dynamically import after setting up mocks
    const { switchView } = await import('../js/app.js');

    // Switch to calendar
    switchView('calendar');

    // Dashboard should be hidden
    assert.equal(dom.viewDashboard.classList.contains('active'), false);
    assert.equal(dom.viewDashboard.hasAttribute('hidden'), true);

    // Calendar should be active
    assert.equal(dom.viewCalendar.classList.contains('active'), true);
    assert.equal(dom.viewCalendar.hasAttribute('hidden'), false);

    // Settings should be hidden
    assert.equal(dom.viewSettings.classList.contains('active'), false);
    assert.equal(dom.viewSettings.hasAttribute('hidden'), true);
  });

  it('switchView updates nav button active state', async () => {
    const { switchView } = await import('../js/app.js');

    switchView('settings');

    assert.equal(dom.btnDashboard.classList.contains('active'), false);
    assert.equal(dom.btnCalendar.classList.contains('active'), false);
    assert.equal(dom.btnSettings.classList.contains('active'), true);
  });

  it('switchView to dashboard activates dashboard nav button', async () => {
    const { switchView } = await import('../js/app.js');

    // First switch away
    switchView('calendar');
    // Then switch back
    switchView('dashboard');

    assert.equal(dom.btnDashboard.classList.contains('active'), true);
    assert.equal(dom.btnCalendar.classList.contains('active'), false);
    assert.equal(dom.viewDashboard.classList.contains('active'), true);
    assert.equal(dom.viewDashboard.hasAttribute('hidden'), false);
  });
});
