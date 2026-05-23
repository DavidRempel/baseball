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

Cloudflare build settings:

- Repository: `DavidRempel/baseball`
- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Build output directory: `dist`

## Current behavior

- Roster and game history are stored in browser `localStorage`.
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
