# Baseball Lineup Planner

A small React/Vite app for youth baseball lineups, fielding rotations, sit tracking, and game history.

## Run locally

```bash
npm install
npm run dev
```

## Check before pushing

```bash
npm run build
npm run lint
```

## Cloudflare deployment

Production URL:

- https://baseball.david-rempel.workers.dev

Cloudflare is configured as a Workers static-assets deployment using `wrangler.jsonc`.

```bash
npm run deploy
```

## Shared history and teams

The app uses Cloudflare D1 for shared roster, lineup, and history state. Until the D1 binding is added, it falls back to browser-only `localStorage`.

One-time D1 setup:

```bash
npx wrangler d1 create baseball-db --location enam
```

Then add the returned `database_id` to `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "baseball-db",
    "database_id": "returned-database-id"
  }
]
```

The Worker creates the required state/team tables automatically on first use.

Cloudflare build settings:

- Repository: `DavidRempel/baseball`
- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Build output directory: `dist`

## Current behavior

- Roster and game history sync through `/api/state` when D1 is configured.
- The root URL uses the default team and preserves the original single-team data.
- Additional teams use URLs like `/t/<team-id>`.
- Private edit links include an edit token once, then store it in that browser for future saves.
- Browser `localStorage` remains as a fallback and backup cache.
- JSON backup import/export is available from the header.
- CSV history import/export is available from the History tab.
- The Lineup tab includes position/sit history beside the editable lineup.
- `Save to Gameday` keeps an adjusted lineup separate from generated options.

## Lineup rules

- Balance sits across players.
- Avoid a player sitting more than once in a game when possible.
- Rotate players through infield and outfield when possible.
- Avoid assigning the same fielding position to a player more than once in a game when possible.
- Keep one player per fielding position in each inning.
- Use historical sit, first/last batter, and position counts to guide choices.
