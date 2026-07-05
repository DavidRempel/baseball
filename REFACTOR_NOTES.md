# FieldStar Refactor Notes

Checkpoint updated July 5, 2026 after the refactor, smoke-test, and Dave-led testing cycle.

## Current Verdict

No urgent refactor is needed before more real-world use. The app is build-clean, tested, deployed, and the recent feedback loop mostly touched product polish rather than exposing structural problems.

Good later cleanup candidates, if larger feature work resumes:

- Split `src/components/LineupTab.tsx` into smaller pieces: toolbar/actions, roster sync banner, warnings, lineup grid row, history count cells, and bottom actions.
- Consider moving App-level lineup action handlers into a hook once LineupTab is smaller.
- Continue keeping styles split by component as new component boundaries appear.

Do not start a reducer or major state rewrite right now; it would add risk without a clear payoff for the current surface.

## v5 Checkpoint

Implemented in the current working tree:

- Empty default roster instead of placeholder players.
- Roster-lineup sync banner with update/regenerate actions.
- Position preferences wired into lineup scoring.
- Manual past-game entry with quick mode and full position grid.
- CSV template, pasted-history preview, and row-level import errors.
- Per-game delete, broader 10-step undo, toasts, and inline destructive confirmation.
- Touch-friendly drag reorder.
- Staged lineup suggestions with per-cell accept/reject and accept-all/revert-all.
- Roster validation for blank and duplicate player names.
- Single draft lineup generation.
- Assignment "why" tooltips for fairness transparency.
- Gameday scratch-from-inning with forced sits for remaining innings.
- Clearer sync status badge and light drag/drop feedback.

Post-refactor progress:

- Pure domain logic is extracted into `src/types.ts`, `src/engine/*`, and `src/io/*`.
- Vitest is installed with focused tests for lineup fixes, roster sync, pending changes, and CSV import parsing.
- Reorder feedback now includes FLIP-style row movement animation.
- Save/sync state is separated into `src/hooks/useSharedTeamState.ts` with debounced remote writes.
- Toast handling and row animation are separated into hooks.
- Team home, print card, roster, and summary views are separated into `src/components/*`.
- Reorder-specific CSS is separated into `src/styles/reorder.css`; shared CSS variables have been introduced in `src/App.css`.
- Playwright desktop and mobile-emulation smoke coverage is available through `npm run test:e2e`.

Known remaining gaps:

- Real mobile QA still needs to happen on a phone-width interactive pass.
- `App.tsx` is still large, but now mostly orchestration and action handlers rather than embedded views.
- `LineupTab.tsx` is now the largest remaining component and the best future extraction target.
- `App.css` is still large; continue splitting styles as component boundaries move out.

## If Refactoring Resumes

Keep future refactor passes behavior-preserving unless Dave is explicitly asking for product changes too.

1. Extract from `LineupTab.tsx`:
   - `LineupActions`
   - `GameDayActions`
   - `RosterSyncBanner`
   - `LineupWarnings`
   - `LineupGrid`
   - `LineupRow`
   - `HistoryCountCell`

2. Then consider App action hooks:
   - `useLineupActions`
   - `useGameDayActions`
   - `useRosterActions`

3. Only after component/action extraction, consider a reducer:
   - A reducer may make sense for domain state, pending changes, and undo.
   - Do not start with the reducer; the current handler style is understandable and tested.

4. Split remaining CSS alongside extracted components.

## Regression Checklist

Before considering the refactor safe:

- Generate lineup, switch candidates, accept staged suggestions, log game.
- Roster change produces banner; update lineup preserves order where possible.
- Past-game quick add works.
- CSV import catches a bad row and imports a good file.
- Scratch player from inning 2 only changes remaining innings.
- Undo works across several actions.
- View-only link remains read-only.
- Local fallback still works when the Worker is unreachable.
- Print/share/export still work.
