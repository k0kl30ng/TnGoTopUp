# E-Wallet Monitor 💸

A PWA that tells you how broke you'll be by month-end, then helpfully rounds up the damage to the nearest RM5.

## ⚠️ Buyer Beware

- **There is no buyer.** This is free. You get what you pay for.
- **This app was written by an AI.** The human mostly clicked "looks good" and complained about colours.
- **It will not make you richer.** It just makes you *aware* of your poverty with more decimal places.
- **Your data never leaves your browser.** Not because we respect your privacy, but because we were too lazy to build a server.
- **The "projection" is a guess.** A very *confident* guess based on your spending habits, but still a guess. If you spontaneously buy a RM800 coffee machine, the projection will not have predicted that. You know who you are.
- **Service worker caching** means you might see yesterday's code today. When in doubt, `Ctrl+Shift+R` like your life depends on it.
- **Tested with property-based testing** (205 tests, 10 formal correctness properties). This means the math is probably right. The UI? That's between you and God.
- **Designed for one person** — the author. If it works for you too, that's a happy coincidence.

## What It Actually Does

- Tracks 4 Malaysian e-wallets: Go+, Card 1, Card 2, Parking
- Classifies each day (weekday, Saturday, holiday, leave, etc.) and applies spending rates
- Projects remaining expenses this month and all of next month
- Tells you exactly how much to top up, rounded to RM5 because TNG doesn't do RM23.47
- Tracks recurring bills (DiGi, TnB, Water, IWK)
- Shows a colour-coded calendar so you can see your life in maroon and ochre
- Works offline because Malaysian WiFi is... Malaysian WiFi

## Running Locally

```bash
npm install
npm start
```

Then open `http://localhost:3000`. Or whatever port it tells you.

## Running Tests

```bash
npm test
```

205 tests. 0 failures. Don't touch the math modules.

## Tech Stack

- Vanilla JS (no framework, no build step, no excuses)
- localStorage (the database of champions)
- Service Worker (offline-first, online-never if you prefer)
- fast-check (property-based testing, because regular tests are for people who trust their code)

## License

Do whatever you want with it. If this app somehow causes you financial harm, I refer you to the section titled "Buyer Beware" above.
