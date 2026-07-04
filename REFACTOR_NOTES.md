# FieldStar v5 Refactor Notes

Checkpoint from the July 3, 2026 improvement session. The app is feature-expanded and build-clean, but `src/App.tsx` is now too large for comfortable future changes.

## v5 Checkpoint

Implemented in the current working tree:

- Empty default roster instead of placeholder players.
- Roster-lineup sync banner with update/regenerate actions.
- Position preferences wired into lineup scoring.
- Manual past-game entry with quick mode and full position grid.
- CSV template, pasted-history preview, and row-level import errors.
- Per-game delete, broader 10-step undo, toasts, and inline destructive confirmation.
- Touch-friendly up/down reorder fallback.
- Staged lineup suggestions with per-cell accept/reject and accept-all/revert-all.
- Roster validation for blank and duplicate player names.
- Three generated lineup candidates.
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
- Playwright desktop smoke coverage is available through `npm run test:e2e`.

Known remaining gaps:

- Real mobile QA still needs to happen on a phone-width interactive pass.
- `App.tsx` is still large because the lineup and full-history views remain in place; continue extracting those before larger feature work.
- `App.css` is still large; continue splitting styles as component boundaries move out.

## Recommended Refactor Sequence

Keep the first refactor pass behavior-preserving. Do not add new features during it.

1. Extract shared types:
   - `src/types.ts`
   - `Player`, `LineupRow`, `GameLog`, `AppState`, `PendingChange`, `LineupMode`, `LineupCandidate`.

2. Extract pure engine and IO modules:
   - `src/engine/lineup.ts`: generation, batting order, sit selection, position scoring, inning fixers, forced sits, rotation helpers.
   - `src/engine/totals.ts`: totals, summaries, assignment explanations.
   - `src/engine/sync.ts`: roster-lineup diff, lineup sync, rebalancing.
   - `src/engine/changes.ts`: pending-change keys, pending-change diffing, applying staged changes.
   - `src/io/csv.ts`: CSV parse/export/import, row-level error reporting, sit-inning parsing.
   - `src/io/storage.ts`: localStorage keys, state load/normalize helpers, team URL helpers.

3. Add Vitest after pure extraction:
   - `fixLineupInning` and forced-sit behavior.
   - `syncLineupToRoster` add/remove/rename cases.
   - `getPendingLineupChanges` and applying staged changes.
   - CSV import success/failure cases.
   - `parseSitInnings` edge cases.

4. Then consider React structure:
   - Move sync/save behavior out of `App.tsx` into a hook.
   - Move undo/toast into small hooks.
   - Extract `RosterTab`, `LineupGrid`, `HistoryTab`, `PastGameForm`, `CandidatePicker`, `RosterSyncBanner`, and `PendingChangesBar`.

5. Only after that, consider state consolidation:
   - A reducer may make sense for domain state, pending changes, and undo.
   - Do not start with the reducer. It is safer after the pure logic has tests.

6. Split CSS after component boundaries exist:
   - First add `:root` custom properties for the current palette and spacing.
   - Then split by component or use CSS modules.

## Sync Layer Warning

`commit()` currently mixes permission checks, undo push, ref mutation, React state update, localStorage write, and remote save. It also saves on keystroke-level changes. A later sync hook should debounce remote writes and make offline/local-only state more explicit.

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
