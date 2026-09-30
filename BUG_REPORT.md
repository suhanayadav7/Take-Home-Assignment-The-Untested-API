# Bug Report — Task API

**How I found them:** I read each function in `src/` and asked what it should do. I wrote a test for that expected
behaviour, ran the tests, and then checked each failure directly against the original code with a small `node -e`
script (the output is shown under each bug). Every fixed bug has a regression test, labelled `Regression test for BUG-N`
in `tests/`.

| # | Severity | Area | Status |
|---|----------|------|--------|
| 1 | High | Pagination skips the first page | ✅ Fixed |
| 2 | High | Status filter uses substring match | ✅ Fixed |
| 3 | High | Completing a task resets its priority | ✅ Fixed |
| 4 | High | PUT allows overwriting `id` / `createdAt` / `completedAt` | ✅ Fixed |
| 5 | Medium | `completedAt` goes out of sync with `status` on PUT | ✅ Fixed |
| 6 | Low | Empty-string `status` / `priority` / `dueDate` pass validation | ❌ Documented |
| 7 | Low | Negative `page` / `limit` are not rejected | ❌ Documented |
| 8 | Medium | Malformed JSON body returns 500 instead of 400 | ✅ Fixed |

---

## BUG-1: Pagination is off by one page
**Where:** `src/services/taskService.js` → `getPaginated`: `const offset = page * limit;`

- **Expected:** `GET /tasks?page=1&limit=2` returns tasks 1–2.
- **Actual:** it returns tasks 3–4. Page 1 skips the first page, and the first `limit` tasks can never be reached.
- **Why:** the route treats pages as 1-based (`parseInt(page) || 1`), but the offset is calculated as if they were
  0-based.
- **Discovered:** the test `page 1 returns the first limit tasks` failed. Against the original code, 3 tasks with
  `getPaginated(1, 2)` → `['t3']`.
- **Fix:** `const offset = (page - 1) * limit;`

## BUG-2: `?status=` filter matches substrings
**Where:** `taskService.js` → `getByStatus`: `t.status.includes(status)`

- **Expected:** exact match on the status enum.
- **Actual:** `String.prototype.includes` does a substring match, so `?status=do` returns both `todo` and `done` tasks,
  and `?status=o` returns nearly everything.
- **Discovered:** the edge-case test `does not match partial status strings`. Original code: `getByStatus('do')` →
  `['todo','todo','todo','done']`.
- **Fix:** `t.status === status`. (An unknown status still returns `[]`. It could arguably be a 400; see NOTES.md.)

## BUG-3: `PATCH /tasks/:id/complete` resets priority to `medium`
**Where:** `taskService.js` → `completeTask`: the spread includes `priority: 'medium'`.

- **Expected:** completing a task changes only `status` and `completedAt`.
- **Actual:** a `high` priority task comes back as `medium`, which silently loses data.
- **Discovered:** the test asserting that the other fields are unchanged after completion. Original code:
  `priority after complete -> medium`.
- **Fix:** remove the line. I also made `completeTask` idempotent: completing an already-done task returns it unchanged,
  so the original `completedAt` isn't overwritten.

## BUG-4: PUT allows mass-assignment of server-owned fields
**Where:** `taskService.js` → `update`: `{ ...tasks[index], ...fields }` where `fields` is the raw `req.body`.

- **Expected:** clients can change `title`, `description`, `status`, `priority`, `dueDate`. `id`, `createdAt` and
  `completedAt` belong to the server.
- **Actual:** `PUT /tasks/:id {"id":"hijacked"}` changes the task's id, so the task can no longer be found by its old
  URL. Arbitrary extra keys are stored as well. The validator only checks known fields; it doesn't reject unknown ones.
- **Discovered:** reading `update` and seeing that the raw body is spread onto the task. Confirmed with
  `update(id, {id:'hijacked'})` → `id -> hijacked`.
- **Fix:** copy only a whitelist (`UPDATABLE_FIELDS`) from the body. `assignee` is left out on purpose so that it can
  only change through `/assign`.

## BUG-5: `completedAt` gets out of sync with `status` via PUT
**Where:** `taskService.js` → `update` (and `create`).

- **Expected:** `completedAt` is set when a task is done and `null` otherwise.
- **Actual:** `PUT {status:"done"}` leaves `completedAt: null`. Reopening a completed task (`PUT {status:"todo"}`)
  keeps the old `completedAt`. `POST` with `status:"done"` also leaves it `null`.
- **Discovered:** a test that reopens a completed task. Original: `completedAt after reopen -> 2026-…` (not null).
- **Fix:** in `update`, when `status` changes, set `completedAt` to now (if done) or `null`. In `create`, set it when the
  initial status is `done`.

## BUG-6: Empty strings pass validation (not fixed)
**Where:** `src/utils/validators.js`. Every check uses `if (body.status && …)`, and the same pattern is used for
`priority` and `dueDate`.

- **Expected:** `{"title":"x","status":""}` → 400.
- **Actual:** `""` is falsy, so the check is skipped. The default parameter in `create` only applies for `undefined`, so
  `status: ""` is stored. The task then doesn't show up under any status filter or in the stats counts. With PUT, you
  can blank out the status of an existing task.
- **Discovered:** the original code stored `status: ""` (`empty status stored -> ""`).
- **Fix:** check `body.status !== undefined` instead of truthiness, and decide explicitly whether `dueDate: null` is
  allowed (it probably should be, to clear a due date). I left this unfixed to keep the scope tight. It's marked as
  `it.todo` in the tests.

## BUG-7: Negative / zero pagination parameters (not fixed)
**Where:** `src/routes/tasks.js`: `parseInt(page) || 1`, `parseInt(limit) || 10`

- **Expected:** `page=-1` or `limit=-5` → 400 (or clamped).
- **Actual:** negative numbers are truthy, so they pass through. `slice` with negative offsets returns items from the end
  of the list. `limit=0` becomes 10 because `0 || 10`. There is also no maximum limit, so `limit=1000000` returns
  everything.
- **Fix:** parse the values, reject anything that isn't a positive integer, and cap `limit` (for example at 100).

## BUG-8: Malformed JSON returns 500
**Where:** `src/app.js`, the error handler.

- **Expected:** `POST /tasks` with body `{bad` → `400 Bad Request`.
- **Actual:** `express.json()` raises a `SyntaxError` with `status: 400`, but the catch-all handler ignores `err.status`
  and always sends a 500. That hides client errors as server errors and would trigger 5xx alerting in production.
- **Discovered:** sending a truncated body in a test. Original code → `500`.
- **Fix:** return 400 for `entity.parse.failed`, and pass through any other 4xx status the parser sets (for example 413
  for an oversized body).

---

### Also noticed (not bugs in code, but worth raising)
- **Doc mismatch:** `README.md` lists statuses as `pending | in-progress | completed`, and its sample request uses
  `?status=pending`. The code and `ASSIGNMENT.md` use `todo | in_progress | done`. With the README's values, POST returns
  400 and the filter returns nothing.
- `?status=` and `?page=` can't be combined. When `status` is present, pagination is silently ignored.
- `dueDate` validation uses `Date.parse`, which accepts non-ISO strings like `"March 5"`.
