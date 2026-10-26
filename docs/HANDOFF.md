# Handoff: LeadOS SaaS build (as of 2026-10-26)

Where the "dev build → real SaaS" work stands, and how to pick it up.

## Workflow rules (keep following these)

- Every code change goes through the `tdd-build-break-fix` skill and its gates:
  1. Scope lock.
  2. Test plan.
  3. Red/green TDD.
  4. Adversarial review in a separate agent.
  5. Fix the approved findings one at a time.
  6. Close-out and commit.
- Use `ponytail` before writing code: make the smallest complete change.
- The user runs migrations in the Supabase SQL editor (copy the whole file, then Run). Send the file; don't run it yourself.
- Never push. The user pushes `main` to github.com/adishshah29-eng/LeadOS by hand.
- Test data only:
  - Use `@example.test` users and send `x-forwarded-for` from 203.0.113.0/24 or 198.51.100.0/24.
  - Clean up the users, workspaces and counters you create.
  - Never touch the real "parmar properties" workspace or the real login.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Feature status

| # | Feature | Status |
|---|---------|--------|
| B1 | Production readiness (CI, health check, env guard, SEO, security headers) | Done: `c0c4ebc` |
| B2 | Self-serve workspace and account deletion | Done: `ba2b372` |
| B3 | Plan limits enforced in the database | Done: `4c1e49a` |
| B4 | Rate limiting | Done: `deb3d89` |
| B6 | Platform admin tools (usage, health, read-only support view) | Done (see git log) |
| B5 | Error monitoring (Sentry) | Deferred until the user has a Sentry account |

## B6: exactly where it stopped

**Done:**
- Built B6 and passed its tests. Migration `0013_admin_tools.sql` has been run.
- The adversarial review found 11 issues, and the user approved all 11.
- All 11 fixes are written:
  - Database side: `supabase/migrations/0014_admin_tools_hardening.sql`.
  - App side:
    - `src/app/admin/actions.ts`: the org id is looked up from the slug on the server.
    - `src/app/admin/view/[slug]/*`: the page uses the expiry the database returns, and `supportSessionExpiry` was removed.
    - `src/app/admin/health/page.tsx`: shows dead webhooks and blocked counters by type, and masks error text.
    - `src/app/o/[slug]/settings/page.tsx`: new "Support visits" list labelled "LeadOS support".
    - `src/server/jobs/meta.ts`: the hourly job also prunes expired support sessions.
    - `src/lib/admin.ts`: reason cleaning and `maskError`.
- Typecheck and lint are clean, and `npm test` passes 92/92.

**B6 is finished and committed.** The full suite passed (typecheck, lint, 92 unit, 68 integration). The browser check covered the admin console, health page, support view and the customer's "Support visits" list, and its test data was removed. `npm run test:int` now runs one file at a time, so Supabase's sign-in limit doesn't cause false failures. **Next up:** B5 (Sentry) once the user has an account. Everything else left is on `docs/LAUNCH-CHECKLIST.md`. The history below is kept for reference.

**Update: 0014 is now applied. The first attempt had pasted 0013 into the "014" tab. `tests/integration/admin.test.ts` passes 13/13, so steps 1–2 below are done.**

**Earlier blocker (resolved): migration 0014 was not in the dev database.**
- The user reported running it, but the database doesn't have it:
  - `admin_prune_support_sessions`, `mask_error` and `clean_reason` all return "function not found".
  - `write_audit` still accepts `support.viewed`.
  - `admin_support_session_active` still returns a boolean.
- So the run probably stopped on an error partway through, or went to a different Supabase project.
- `tests/integration/admin.test.ts` result: 5 pass, 8 fail (A9, F1, F2, F3, F5, F6, F7, F8). Those are exactly the tests that wait on 0014.

**Next steps:**
1. Get 0014 applied. Ask the user to rerun it in the correct project and to share any error message the SQL editor shows. The file is safe to rerun: it only uses `create or replace`, `if not exists`, and drop-then-create.
2. `node --env-file-if-exists=.env.local --experimental-strip-types --test tests/integration/admin.test.ts`: expect 13/13.
3. Run the full suite: `npm run typecheck`, `npx eslint src`, `npm test`, then `npm run test:int` (needs the dev server on :3000).
4. Browser check:
   - `/admin`, `/admin/health`, and `/admin/view/<slug>` (the start form, then the read-only view).
   - The Settings page shows "Support visits".
5. Clean up test data, write the B6 close-out (acceptance criteria and findings table), then commit everything listed under "Uncommitted files".
6. Update `docs/LAUNCH-CHECKLIST.md`: migrations now go through 0014, plus any items deferred in B6. Then send it to the user. That file is the end-of-session deliverable.

## Uncommitted files (all B6)

```
M  src/app/admin/actions.ts
M  src/app/admin/page.tsx
M  src/app/o/[slug]/settings/page.tsx
M  src/lib/auth.ts
M  src/server/jobs/meta.ts
?? src/app/admin/health/
?? src/app/admin/view/
?? src/lib/admin.ts
?? src/lib/admin.test.ts
?? src/server/admin.ts
?? supabase/migrations/0013_admin_tools.sql
?? supabase/migrations/0014_admin_tools_hardening.sql
?? tests/integration/admin.test.ts
```

## Useful commands

```bash
npm test                 # unit tests
npm run typecheck        # next typegen && tsc --noEmit
npm run test:int         # integration tests (dev server on :3000, real dev database)
```

## Known gotchas

- After `next build`, delete `.next` before running `next dev` again.
- If Supabase calls fail with `CERT_NOT_YET_VALID`, the PC clock is wrong.
- `next typegen` loads the config in the production-build phase. `checkBuild` skips the check when it sees "typegen".
- The D3 deletion test failed once in 7 runs. It's logged in the launch checklist.
