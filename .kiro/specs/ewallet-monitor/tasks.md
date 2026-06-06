# Implementation Plan: E-Wallet Monitor

## Overview

Build a vanilla JS PWA for projecting monthly e-wallet expenses and calculating top-up amounts. Implementation follows a bottom-up approach: data layer → calculation engine → UI → PWA shell. All calculation modules use pure functions testable with fast-check.

## Tasks

- [x] 1. Set up project structure and module scaffolding
  - [x] 1.1 Create directory structure and HTML skeleton
    - Create `index.html` with module script tags, semantic structure for Dashboard/Calendar/Settings views
    - Create `style.css` with CSS custom properties for day-type colours (black, blue, green, maroon, red, ochre)
    - Create empty module files: `js/app.js`, `js/store.js`, `js/calendar.js`, `js/calc.js`, `js/ui.js`
    - Create `icons/` directory with placeholder PWA icons (192px, 512px)
    - _Requirements: 13.4, 3.2_

  - [x] 1.2 Set up test infrastructure
    - Create `tests/` directory with fast-check and a minimal test runner (e.g., bare Node.js test runner or vitest)
    - Create test entry files: `tests/calendar.test.js`, `tests/calc.test.js`, `tests/store.test.js`
    - Verify fast-check import works with a trivial property test
    - _Requirements: Design Testing Strategy_

- [x] 2. Implement data persistence layer (store.js)
  - [x] 2.1 Implement core load/save and default initialisation
    - Implement `load(key)` — returns parsed JSON from localStorage or default value
    - Implement `save(key, value)` — JSON.stringify and persist to localStorage
    - Define all storage key constants (`ewm_rateTable`, `ewm_balances`, etc.)
    - Implement default value initialisation for first-use scenario (rate table defaults per Req 1.3, bill defaults per Req 10.4, minimum balance defaults per Req 14.1)
    - _Requirements: 1.3, 10.4, 12.1, 12.2, 14.1_

  - [x] 2.2 Implement export/import with validation
    - Implement `exportAll()` — collects all storage keys into a single JSON object, returns as string
    - Implement `importAll(json)` — parse JSON, validate required keys and value types, replace all data on success, return error on failure
    - Validation checks: valid JSON, required keys present, correct value types for each key
    - On validation failure: return error object, leave localStorage unchanged
    - _Requirements: 12.3, 12.4, 12.5_

  - [x] 2.3 Write property tests for export/import (Properties 7 & 8)
    - **Property 7: Data export/import round-trip**
    - Generate arbitrary valid app states (rate table, balances, misc, bills, overrides, holidays, snapshots)
    - Assert: `importAll(exportAll())` produces identical state
    - **Property 8: Invalid import preserves existing data**
    - Generate arbitrary current state + arbitrary invalid JSON strings (malformed, missing keys, wrong types)
    - Assert: `importAll(invalidJson)` returns error AND state unchanged
    - **Validates: Requirements 12.2, 12.3, 12.4, 12.5**

  - [x] 2.4 Implement snapshot management
    - Implement `saveSnapshot(month)` — archive month-end state (balances, projections, top-ups, bills total)
    - Implement `getSnapshots()` — return all historical snapshots sorted by month
    - _Requirements: 12.6, 12.7_

- [x] 3. Checkpoint - Data layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement day classification engine (calendar.js)
  - [x] 4.1 Implement date utilities and holiday matching
    - Implement `getMonthDays(year, month)` — returns array of `{ date, dayOfWeek }` for all days in month
    - Implement `isHoliday(date, holidays)` — checks against public holiday dates and school holiday date ranges
    - Handle edge cases: leap year February, month boundaries
    - _Requirements: 4.1, 4.2, 4.5_

  - [x] 4.2 Implement classifyDay with precedence rules
    - Implement `classifyDay(date, holidays, overrides, atOfficeFlags)` — returns exactly one Day_Type
    - Precedence: (1) At_Office flag → "atOffice", (2) user override → override value, (3) holiday match → "sundayHoliday", (4) day of week → weekday/saturday/sundayHoliday
    - Ensure mutually exclusive output — exactly one Day_Type returned
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 4.3 Implement getEffectiveRate
    - Implement `getEffectiveRate(dayType, isAtOffice, rateTable, wallet)` — returns the RM rate for a specific day/wallet
    - If At_Office is true, use the atOffice row regardless of dayType
    - Otherwise, use the row matching the classified Day_Type
    - _Requirements: 2.7, 6.3_

  - [x] 4.4 Write property test for day classification (Property 1)
    - **Property 1: Day classification is deterministic and mutually exclusive**
    - Generate arbitrary dates, holiday calendars, override maps, At_Office flag maps
    - Assert: classifyDay always returns exactly one valid Day_Type
    - Assert: precedence rules are respected (At_Office > override > holiday > day-of-week)
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 4.5**

- [x] 5. Implement projection and top-up engine (calc.js)
  - [x] 5.1 Implement projectWallet and month projections
    - Implement `projectWallet(wallet, days, rateTable, monthlyMisc, overrides, atOfficeFlags, holidays)` — sum effective rates for each day + monthly misc once
    - Implement `projectCurrentMonth(today, ...)` — project remaining days from today to month-end for all 4 wallets
    - Implement `projectNextMonth(year, month, ...)` — project full month for all 4 wallets
    - _Requirements: 7.1, 7.2, 8.1, 8.2_

  - [x] 5.2 Write property test for projection (Property 2)
    - **Property 2: Projection equals sum of effective daily rates plus monthly misc**
    - Generate arbitrary wallets, rate tables, day sets, overrides, holidays, misc values
    - Assert: projection === sum of getEffectiveRate(day) for each day + monthlyMisc
    - **Validates: Requirements 6.3, 7.1, 7.2, 8.1, 8.2**

  - [x] 5.3 Implement roundUpRM5
    - Implement `roundUpRM5(amount)` — round up to nearest RM5, return 0 if amount ≤ 0
    - Handle exact multiples of 5 (no rounding needed)
    - _Requirements: 9.3, 9.5_

  - [x] 5.4 Write property test for RM5 rounding (Property 5)
    - **Property 5: RM5 rounding correctness**
    - Generate arbitrary positive numbers
    - Assert: result >= input, result % 5 === 0, result - input < 5
    - Generate numbers ≤ 0: assert result === 0
    - Generate exact multiples of 5: assert result === input
    - **Validates: Requirements 9.3, 9.5**

  - [x] 5.5 Implement calculateTopUp for linked wallets
    - Implement `calculateTopUp(wallet, currentBalance, currentMonthProjection, nextMonthProjection, minimumBalance)` — returns raw top-up amount
    - Formula: `max(0, minimumBalance + nextMonthProjection - (currentBalance - currentMonthProjection))`
    - Apply roundUpRM5 to positive results
    - _Requirements: 9.1, 9.2_

  - [x] 5.6 Write property test for linked wallet top-up (Property 3)
    - **Property 3: Top-up formula for linked wallets**
    - Generate arbitrary balances, projections, minimum balances
    - Assert: raw amount = max(0, min + nextProj - (bal - currProj)), final = roundUpRM5(raw)
    - **Validates: Requirements 9.1, 9.2**

  - [x] 5.7 Implement calculateBillsTotal
    - Implement `calculateBillsTotal(bills, targetMonth)` — sum monthly bills + applicable bi-yearly bills
    - Bi-yearly bill included only if targetMonth is in its `dueMonths` array
    - _Requirements: 10.3_

  - [x] 5.8 Write property test for bills total (Property 6)
    - **Property 6: Bills total for a given month**
    - Generate arbitrary bill lists (monthly + bi-yearly with random dueMonths) and target months
    - Assert: result = sum of all monthly amounts + sum of bi-yearly amounts where dueMonths includes target
    - **Validates: Requirements 10.3**

  - [x] 5.9 Implement calculateAllTopUps with Go_Plus downstream
    - Implement `calculateAllTopUps(balances, currentProj, nextProj, minimumBalances, billsTotal)` — computes all 4 wallet top-ups plus bankToGoPlus
    - Go_Plus top-up includes: own need + card1TopUp + card2TopUp + parkingTopUp + billsTotal
    - All positive results rounded to RM5
    - _Requirements: 9.4, 9.6, 11.1_

  - [x] 5.10 Write property test for Go_Plus top-up (Property 4)
    - **Property 4: Go_Plus top-up includes downstream obligations**
    - Generate arbitrary balances, projections, minimum balances, bills totals
    - Assert: Go_Plus top-up = roundUpRM5(max(0, goPlus_own_need + card1TopUp + card2TopUp + parkingTopUp + billsTotal))
    - **Validates: Requirements 9.4, 11.1**

- [x] 6. Checkpoint - Calculation engine complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement UI rendering layer (ui.js)
  - [x] 7.1 Implement calendar grid renderer
    - Implement `renderCalendar(container, year, month, dayData)` — generates monthly grid with day-type colour coding
    - Each day cell shows date number, background colour by Day_Type, visual indicator for At_Office flag
    - Day cells are clickable (delegate event handling to app.js)
    - _Requirements: 3.1, 3.2, 3.5_

  - [x] 7.2 Implement projection and fund flow renderers
    - Implement `renderProjectionCard(container, wallet, balance, projection, topUp)` — shows wallet name, current balance, projection, top-up amount
    - Implement `renderFundFlow(container, topUps)` — shows Bank → Go_Plus total, individual Go_Plus → linked wallet transfers
    - Omit transfers where top-up is zero
    - _Requirements: 7.3, 7.4, 8.4, 9.6, 11.1, 11.2, 11.3_

  - [x] 7.3 Implement settings renderers
    - Implement `renderRateTable(container, rateTable)` — editable table of rates per Day_Type per wallet
    - Implement `renderBillsList(container, bills)` — list with add/edit/remove controls
    - Render minimum balance editors, monthly misc editors, holiday calendar editor
    - _Requirements: 1.1, 1.2, 5.1, 5.2, 6.1, 6.2, 10.1, 10.2, 14.2_

- [x] 8. Implement app orchestration (app.js)
  - [x] 8.1 Implement view routing and initialisation
    - Set up view switching between Dashboard, Calendar, and Settings
    - On load: read all data from store.js, compute projections, render active view
    - Wire navigation event listeners (tab clicks or nav buttons)
    - _Requirements: 12.2_

  - [x] 8.2 Implement Dashboard view logic
    - On Dashboard show: call projectCurrentMonth, projectNextMonth, calculateAllTopUps, calculateBillsTotal
    - Pass results to ui.js renderers (projection cards, fund flow)
    - Re-render on balance update or any data change
    - _Requirements: 7.1, 7.3, 8.4, 9.6, 11.1_

  - [x] 8.3 Implement Calendar view logic
    - On Calendar show: call getMonthDays, classifyDay for each day, render calendar grid
    - Handle day click: show Day_Type override picker + At_Office toggle
    - On override save: update store, recalculate projections if Dashboard is visible
    - Support month navigation (prev/next month)
    - _Requirements: 3.1, 3.3, 3.4, 3.5_

  - [x] 8.4 Implement Settings view logic
    - Wire rate table editing with immediate persist on change (Req 1.4)
    - Wire balance editing with validation (0.00–99,999.99) and immediate persist (Req 5.2, 5.3, 5.4)
    - Wire monthly misc editing (0.00–9,999.99) (Req 6.2)
    - Wire minimum balance editing (0.00–999.99) with top-up recalculation (Req 14.2, 14.3)
    - Wire bills management: add/edit/remove, frequency, bi-yearly due months (Req 10.1, 10.2, 10.5)
    - Wire holiday calendar: add/edit/remove public holidays and school holiday ranges (Req 4.3, 4.4, 4.6)
    - Wire export/import: download JSON, file picker for import with error handling (Req 12.3, 12.4, 12.5)
    - _Requirements: 1.2, 1.4, 4.3, 4.4, 4.6, 5.2, 5.3, 5.4, 6.2, 10.1, 10.2, 10.5, 12.3, 12.4, 12.5, 14.2, 14.3_

  - [x] 8.5 Implement month transition and bill carry-forward
    - Detect when a new Calendar_Month begins (compare stored "last active month" with today)
    - On new month: save snapshot of previous month, carry forward DiGi/TnB/Water bill amounts
    - Bill overrides are per-month and do not affect base amounts or other months
    - _Requirements: 10.6, 10.7, 12.6_

  - [x] 8.6 Write property tests for bill carry-forward and override isolation (Properties 9 & 10)
    - **Property 9: Bill carry-forward correctness**
    - Generate arbitrary previous month bill amounts; assert new month defaults equal previous amounts
    - **Property 10: Bill override isolation**
    - Generate arbitrary bill, month, override amount; assert base amount and other months unchanged
    - **Validates: Requirements 10.6, 10.7**

- [x] 9. Checkpoint - Core app functional
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement PWA shell
  - [x] 10.1 Create manifest.json and configure PWA metadata
    - Set name, short_name, icons (192px, 512px), start_url, display: standalone, theme_color, background_color
    - Link manifest in index.html `<head>`
    - _Requirements: 13.1, 13.2_

  - [x] 10.2 Implement service-worker.js with cache-first strategy
    - Cache all static assets on install (index.html, style.css, all JS modules, icons, manifest)
    - Serve from cache first, fall back to network
    - Handle cache versioning for app updates (bump cache name on changes)
    - Register service worker from app.js
    - _Requirements: 13.3_

  - [x] 10.3 Responsive layout and final styling
    - Ensure layout works at 320px, 768px, and 1920px widths without horizontal scrolling
    - Style all views: Dashboard cards, Calendar grid, Settings forms
    - Apply day-type colour scheme consistently
    - _Requirements: 13.4, 3.2_

- [x] 11. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - Verify PWA install works (manifest valid, service worker registers)
  - Verify offline functionality after first load

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (10 properties total)
- Unit tests validate specific examples and edge cases
- All calculation logic is in pure functions (calc.js, calendar.js) — no DOM dependency, easy to test in Node.js
- fast-check is the property-based testing library
- No build tools needed — tests run via Node.js with ES module support

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.4"] },
    { "id": 3, "tasks": ["2.3"] },
    { "id": 4, "tasks": ["4.1"] },
    { "id": 5, "tasks": ["4.2", "4.3"] },
    { "id": 6, "tasks": ["4.4", "5.1", "5.3"] },
    { "id": 7, "tasks": ["5.2", "5.4", "5.5", "5.7"] },
    { "id": 8, "tasks": ["5.6", "5.8", "5.9"] },
    { "id": 9, "tasks": ["5.10"] },
    { "id": 10, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 11, "tasks": ["8.1"] },
    { "id": 12, "tasks": ["8.2", "8.3", "8.4", "8.5"] },
    { "id": 13, "tasks": ["8.6"] },
    { "id": 14, "tasks": ["10.1", "10.2", "10.3"] }
  ]
}
```
