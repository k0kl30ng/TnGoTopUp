# Requirements Document

## Introduction

A personal Progressive Web App (PWA) for monitoring 4 fixed e-wallets on a monthly basis. The app projects daily expenses based on day-type classifications, calculates end-of-month top-up amounts, and tracks recurring bills. Designed for simplicity and smallness, running on Android and Windows 11. All data is local — no server component.

## Glossary

- **App**: The e-wallet monitoring PWA system
- **Go_Plus**: The main wallet and spending wallet. Fund flow: Bank → Go_Plus → linked wallets
- **Card_1**: A linked wallet funded from Go_Plus
- **Card_2**: A linked wallet funded from Go_Plus
- **Parking**: A linked wallet funded from Go_Plus, maintained for future use
- **Day_Type**: The classification of a calendar day, determining which rates apply. Exactly one of: Weekday, Saturday, Sunday_Holiday, Just_Work, Just_Babysitters, On_Leave
- **At_Office**: A per-day boolean toggle that overrides the day's rate calculation with the at-office rate row
- **Rate_Table**: A configurable table of RM amounts per Day_Type per wallet, defining daily expense rates
- **Monthly_Misc**: A per-wallet one-time amount added once per month to projections, for irregular expenses
- **Projection**: The calculated total expected expenses for a wallet over a set of days
- **Top_Up_Amount**: The amount to transfer into a wallet, rounded up to nearest RM5
- **Minimum_Balance**: The floor value each wallet should retain (Go_Plus: RM20, Card_1: RM20, Card_2: RM20, Parking: RM15)
- **Bill**: A recurring fixed payment deducted from Go_Plus (e.g., phone, electricity, water, sewerage)
- **Calendar_Month**: The period from the 1st to the last day of a given month
- **Holiday_Calendar**: The set of Selangor public holidays and Malaysian school holidays that cause days to be classified as Sunday_Holiday

## Requirements

### Requirement 1: Rate Table Management

**User Story:** As a user, I want to configure daily expense rates per day type per wallet, so that projections reflect my actual spending patterns.

#### Acceptance Criteria

1. THE App SHALL maintain a Rate_Table with one row per Day_Type (Weekday, Saturday, Sunday_Holiday, Just_Work, Just_Babysitters, At_Office, On_Leave) and one column per wallet (Go_Plus, Card_1, Card_2, Parking)
2. THE App SHALL allow the user to edit any rate value in the Rate_Table to an amount from 0.00 to 999.99
3. WHEN the App is first used, THE App SHALL initialise the Rate_Table with default values: Weekday (2.10, 1.39, 0, 0), Saturday (8.80, 0, 2.50, 0), Sunday_Holiday (0, 0, 0, 0), Just_Work (2.10, 1.65, 0, 0), Just_Babysitters (4.20, 0, 0, 0), At_Office (2.10, 0, 0, 0), On_Leave (4.20, 2.78, 0, 0)
4. WHEN the user saves a Rate_Table change, THE App SHALL persist the updated value immediately and use it in all subsequent Projection calculations

### Requirement 2: Day Type Classification

**User Story:** As a user, I want each day in the month classified by type, so that the correct rates are applied to projections.

#### Acceptance Criteria

1. THE App SHALL classify each day in a Calendar_Month as exactly one Day_Type, which is mutually exclusive
2. THE App SHALL apply default Day_Type classification as follows: Monday through Friday as Weekday, Saturday as Saturday, Sunday as Sunday_Holiday
3. WHEN a day falls on a date in the Holiday_Calendar, THE App SHALL classify that day as Sunday_Holiday regardless of the day of the week
4. THE App SHALL allow the user to override any day's Day_Type to one of: Just_Work, Just_Babysitters, or On_Leave
5. WHEN the user overrides a day's Day_Type, THE App SHALL use the overridden type for all Projection calculations involving that day
6. THE App SHALL provide an At_Office toggle per day that is independent of the Day_Type classification
7. WHEN a day has the At_Office toggle enabled, THE App SHALL use the At_Office rate row for that day instead of the day's Day_Type rate row

### Requirement 3: Calendar View

**User Story:** As a user, I want a monthly calendar view showing day classifications at a glance, so that I can verify and adjust the month's schedule.

#### Acceptance Criteria

1. THE App SHALL display a monthly calendar grid showing all days in the selected Calendar_Month
2. THE App SHALL colour-code each day by its Day_Type: black for Weekday, blue for Saturday, green for Sunday_Holiday, maroon for Just_Work, red for Just_Babysitters, ochre for On_Leave
3. WHEN the user taps or clicks a day, THE App SHALL allow the user to change that day's Day_Type override
4. WHEN the user taps or clicks a day, THE App SHALL allow the user to toggle the At_Office flag for that day
5. THE App SHALL visually indicate days that have the At_Office flag enabled

### Requirement 4: Holiday Calendar Management

**User Story:** As a user, I want to maintain a calendar of Selangor public holidays and Malaysian school holidays, so that those days are automatically classified as Sunday_Holiday.

#### Acceptance Criteria

1. THE App SHALL maintain a Holiday_Calendar containing Selangor public holidays stored as individual dates with a name
2. THE App SHALL maintain a Holiday_Calendar containing Malaysian school holiday periods stored as date ranges (start date and end date) with a name
3. THE App SHALL allow the user to add, edit, or remove individual public holiday dates
4. THE App SHALL allow the user to add, edit, or remove school holiday date ranges
5. WHEN a date falls within any holiday entry in the Holiday_Calendar, THE App SHALL classify that day as Sunday_Holiday in the default classification
6. IF the user adds a school holiday entry where the end date is before the start date, THEN THE App SHALL reject the entry and display an error message

### Requirement 5: Balance Management

**User Story:** As a user, I want to manually update wallet balances at any time, so that projections are based on current actual balances.

#### Acceptance Criteria

1. THE App SHALL display the current balance for each wallet (Go_Plus, Card_1, Card_2, Parking)
2. THE App SHALL allow the user to update the current balance of any wallet at any time by entering a value from 0.00 to 99,999.99
3. IF the user enters a non-numeric value or a value outside 0.00 to 99,999.99, THEN THE App SHALL reject the input and indicate the valid range
4. WHEN the user updates a balance, THE App SHALL persist the new value immediately and recalculate any displayed Projection

### Requirement 6: Monthly Misc Configuration

**User Story:** As a user, I want to set a one-time monthly miscellaneous amount per wallet, so that irregular expenses like road trips are included in projections.

#### Acceptance Criteria

1. THE App SHALL maintain a Monthly_Misc value for each wallet (Go_Plus, Card_1, Card_2, Parking), defaulting to 0.00
2. THE App SHALL allow the user to edit the Monthly_Misc value for any wallet to an amount from 0.00 to 9,999.99
3. WHEN calculating a Projection for any wallet, THE App SHALL add the Monthly_Misc value exactly once to the total projected expenses for that Calendar_Month

### Requirement 7: Current Month Projection

**User Story:** As a user, I want to see projected expenses for the remainder of the current month, so that I know if an interim top-up is needed.

#### Acceptance Criteria

1. WHEN the user views the current month projection, THE App SHALL calculate remaining expenses from today to month-end (inclusive) for each wallet
2. WHEN calculating the current month Projection for a wallet, THE App SHALL sum the applicable rate for each remaining day based on that day's effective Day_Type (or At_Office rate if toggled) plus the Monthly_Misc for that wallet
3. THE App SHALL display the current month Projection for each wallet alongside its current balance
4. WHEN the current balance of a wallet is less than the current month Projection plus that wallet's Minimum_Balance, THE App SHALL indicate that an interim top-up is needed and display the shortfall amount

### Requirement 8: Next Month Projection

**User Story:** As a user, I want to see projected expenses for the entire next month, so that I can calculate end-of-month top-ups.

#### Acceptance Criteria

1. WHEN the user views the next month projection, THE App SHALL calculate total expenses for all days in the next Calendar_Month for each wallet
2. WHEN calculating the next month Projection for a wallet, THE App SHALL sum the applicable rate for each day in the next month based on that day's effective Day_Type (or At_Office rate if toggled) plus the Monthly_Misc for that wallet
3. WHEN the next month has days that have not yet been overridden by the user, THE App SHALL use the default Day_Type classification (weekday/Saturday/Sunday_Holiday based on day of week and Holiday_Calendar)
4. THE App SHALL display the next month Projection for each wallet

### Requirement 9: Top-Up Calculation

**User Story:** As a user, I want to know how much to top up each wallet at end of month, so that I can transfer the right amounts from my bank.

#### Acceptance Criteria

1. WHEN calculating the Top_Up_Amount for Card_1, Card_2, or Parking, THE App SHALL compute: Minimum_Balance + next month Projection - estimated end balance, where estimated end balance is the current balance minus the current month remaining Projection
2. IF the computed raw Top_Up_Amount is zero or negative, THEN THE App SHALL set the Top_Up_Amount to zero for that wallet
3. WHEN the raw Top_Up_Amount is positive, THE App SHALL round up to the nearest RM5 (e.g., RM23.50 becomes RM25, RM20.00 remains RM20)
4. WHEN calculating the Top_Up_Amount for Go_Plus, THE App SHALL compute: Minimum_Balance + next month Projection - estimated end balance + sum of Card_1 Top_Up_Amount + Card_2 Top_Up_Amount + Parking Top_Up_Amount + total Bills amount
5. WHEN the Go_Plus raw Top_Up_Amount is positive, THE App SHALL round up to the nearest RM5
6. THE App SHALL display the Top_Up_Amount for each wallet and the total amount to transfer from Bank to Go_Plus

### Requirement 10: Bills Management

**User Story:** As a user, I want to track recurring bills paid from Go+, so that they are included in the Go+ top-up calculation.

#### Acceptance Criteria

1. THE App SHALL maintain a list of Bills, each with a name (1 to 50 characters), amount (0.00 to 9,999.99), and frequency (monthly or bi-yearly)
2. THE App SHALL allow the user to add, edit, or remove Bills
3. WHEN calculating the Go_Plus Top_Up_Amount, THE App SHALL include the total of all monthly Bills plus any bi-yearly Bills that fall within the next Calendar_Month
4. WHEN the App is first used, THE App SHALL initialise with default Bills: DiGi (monthly, amount 0.00), TnB (monthly, amount 0.00), Water (monthly, amount 0.00), IWK (bi-yearly, amount 90.00, due January and July)
5. THE App SHALL allow the user to specify in which months a bi-yearly Bill is due
6. WHEN a new Calendar_Month begins, THE App SHALL carry forward the previous month's bill amounts for DiGi, TnB, and Water as the default amounts for the new month
7. THE App SHALL allow the user to override a carried-forward bill amount for any month without affecting the stored value for future months

### Requirement 11: Fund Flow Display

**User Story:** As a user, I want to see the fund flow summary, so that I know the total amount to transfer from Bank into Go+ and then from Go+ into each linked wallet.

#### Acceptance Criteria

1. THE App SHALL display the top-up summary showing: Bank → Go_Plus total (Go_Plus own top-up + Card_1 top-up + Card_2 top-up + Parking top-up + Bills total)
2. THE App SHALL display individual transfers: Go_Plus → Card_1, Go_Plus → Card_2, Go_Plus → Parking with each wallet's Top_Up_Amount
3. WHEN any Top_Up_Amount is zero, THE App SHALL omit that transfer from the fund flow display

### Requirement 12: Data Persistence and Backup

**User Story:** As a user, I want my data persisted locally with export/import capability, so that I do not lose information and can back up my data.

#### Acceptance Criteria

1. THE App SHALL persist all data (balances, rate table, monthly misc, bills, day overrides, holiday calendar, and monthly snapshots) to local storage (localStorage or IndexedDB) after each user-initiated change
2. WHEN the user reopens the App, THE App SHALL restore all previously saved data
3. WHEN the user requests a data export, THE App SHALL generate a downloadable JSON file containing all persisted data
4. WHEN the user imports a previously exported JSON file, THE App SHALL replace all existing data with the imported data
5. IF the imported file is not a valid App export, THEN THE App SHALL display an error message and preserve existing data unchanged
6. WHEN a new Calendar_Month begins, THE App SHALL save a snapshot of the previous month's balances, projections, and top-up amounts for historical reference
7. THE App SHALL retain all historical monthly snapshots indefinitely unless manually deleted by the user

### Requirement 13: PWA Capabilities

**User Story:** As a user, I want the app to work as an installable PWA on Android and Windows 11, functioning fully offline.

#### Acceptance Criteria

1. THE App SHALL be installable as a PWA on Android via Chrome
2. THE App SHALL be installable as a PWA on Windows 11 via Edge or Chrome
3. WHEN the App has been loaded at least once with network connectivity, THE App SHALL function fully offline for all features
4. THE App SHALL use a responsive layout that works on both mobile (minimum 320px width) and desktop viewports without horizontal scrolling

### Requirement 14: Minimum Balance Configuration

**User Story:** As a user, I want to configure the minimum balance for each wallet, so that top-up calculations ensure I always retain a safety buffer.

#### Acceptance Criteria

1. THE App SHALL maintain a Minimum_Balance for each wallet, with defaults: Go_Plus RM20, Card_1 RM20, Card_2 RM20, Parking RM15
2. THE App SHALL allow the user to edit the Minimum_Balance for any wallet to a value from 0.00 to 999.99
3. WHEN a Minimum_Balance is changed, THE App SHALL recalculate and update all displayed Top_Up_Amounts
