# typeduel.io

1v1 real-time typing duel game. Two players are matched together and race to type the same sentence. Best of 3 rounds wins the match.

## Quick Start

```bash
npm install
npm start
```

Open http://localhost:3000 in two browser tabs to play.

## Game Modes

- **Quick Play** — Enter a display name and jump in. No account needed.
- **Ranked** — Requires an account. Win/lose affects your rating (starting at 1000 SR).

## Scoring

| Component | Value |
|---|---|
| Base score | WPM × 10 |
| Uncorrected error | −50 per error |
| Corrected error (backspaced) | −15 per error |

Highest score wins the round. Best of 3 rounds wins the match.

## Tech Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: Vanilla HTML/CSS/JS
- **Database**: SQLite (accounts + ranked stats)
- **Auth**: bcrypt + express-session

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `SESSION_SECRET` | `typeduel-secret-key-change-in-prod` | Session encryption secret |
