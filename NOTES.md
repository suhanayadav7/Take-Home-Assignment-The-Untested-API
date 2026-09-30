# Submission Notes

**Live API:** https://untested-task-api-ten.vercel.app (try `/tasks`, `/tasks/stats`)

## What I did
1. **Tests** (`task-api/tests/`), 95 passing + 2 `todo`:
   - `taskService.test.js`: unit tests for every service function.
   - `validators.test.js`: unit tests for the validation helpers.
   - `tasks.routes.test.js`: Supertest integration tests for every endpoint, including edge cases (unknown ids,
     invalid bodies, malformed JSON, pagination boundaries, overdue logic, route ordering of `/stats` vs `/:id`).
2. **Bug report:** [`BUG_REPORT.md`](./BUG_REPORT.md) covers 8 bugs, with where each one is and why it happens.
3. **Fixes:** 6 of the 8 are fixed, each with a regression test. The main one is BUG-1 (pagination). BUG-6 and BUG-7
   are documented and left as `it.todo`.
4. **Feature:** `PATCH /tasks/:id/assign`.

### Coverage (`npm run coverage`)
```
-----------------|---------|----------|---------|---------|-------------------
File             | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-----------------|---------|----------|---------|---------|-------------------
All files        |   98.94 |    98.36 |   96.96 |   98.83 |
 app.js          |   90.47 |     90.9 |      75 |   90.47 | 49-50  (app.listen, only runs when started directly)
 routes/tasks.js |     100 |      100 |     100 |     100 |
 taskService.js  |     100 |    97.29 |     100 |     100 |
 validators.js   |     100 |      100 |     100 |     100 |
-----------------|---------|----------|---------|---------|-------------------
Tests: 95 passed, 2 todo
```

## `PATCH /tasks/:id/assign`: design decisions

```
PATCH /tasks/:id/assign
Body: { "assignee": "Alice" }    -> 200, updated task
      { "assignee": null }       -> 200, task unassigned
```

| Case | Response | Reasoning |
|------|----------|-----------|
| Valid name | `200` + updated task | As specified. The name is **trimmed** before it is stored. |
| Task doesn't exist | `404` | As specified. |
| `""` or whitespace only | `400` | An empty name is almost certainly a client bug. I didn't treat it as "unassign" because that's ambiguous and makes accidental unassignment easy. |
| `assignee` key missing | `400` | Same reason: a missing field is a client error, not an instruction. |
| Non-string (number, array, object) | `400` | Type safety. |
| Longer than 100 characters | `400` | Stops a single request from storing an arbitrarily large string. |
| `null` | `200`, unassigned | An explicit, unambiguous way to unassign. |
| Already assigned to the **same** person | `200`, unchanged | Makes retries safe (idempotent). |
| Already assigned to **someone else** | `409 Conflict` + current task | Silently overwriting someone's assignment is the dangerous default. The client has to unassign first (`null`), which makes reassignment a deliberate action. |

Other decisions:
- **Every task now has `assignee: null`** from creation, so clients get a consistent shape.
- **The body is validated before the id is checked** (400 before 404), which matches how `PUT` already works.
- **`PUT` can't change `assignee`.** All assignment rules live in one endpoint. Otherwise `PUT` would get around the
  409 check.
- The service returns `{ task }` or `{ error }` instead of throwing, so the route maps each outcome to a status code.
- **Tradeoff:** the 409 rule is a product decision. If the team wants free reassignment, it's a one-line change in
  `assignTask`. I'd confirm this before shipping. Names are compared case-sensitively (`alice` ≠ `Alice`). With real
  users, this would be a user id instead of a free-text name.

## What I'd test next
- The unfixed BUG-6 and BUG-7 once the expected behaviour is agreed on (400 or clamp for pagination).
- Combining `?status=` with `?page=` (currently pagination is ignored when a status is given).
- Behaviour when requests run at the same time. The in-memory store is fine in one process, but it would break across
  multiple instances.
- Timezone edge cases for `overdue` (a due date of "today" and date-only strings like `2026-09-30`).
- Contract tests that check the response shape against the documented Task schema.

## What surprised me
- The README and ASSIGNMENT.md document different status values (`pending/in-progress/completed` vs
  `todo/in_progress/done`), so the README's own sample request returns nothing.
- `completeTask` changed the priority, which looks like a copy-paste slip and silently loses data.
- `includes()` used for an enum comparison. It works for exact values, which is why it's easy to miss.
- `PUT` is documented as a "full update" but behaves like a partial merge (PATCH semantics).

## Questions before shipping to production
- **Persistence:** the store is in memory, so every restart or deploy wipes all data. What database is planned?
- **Auth:** who is allowed to create, delete, or assign tasks? Is `assignee` meant to be a real user id?
- Should `PUT` be a true replace (missing fields reset to defaults) or stay a partial update? And should unknown fields
  be rejected with 400 instead of being ignored?
- Should reassignment be allowed freely, or is the 409 "unassign first" rule the right product behaviour?
- Should the list endpoint return a pagination envelope (`{ data, page, limit, total }`) instead of a bare array?
- Rate limiting, request logging, and a maximum page size.

## Live demo note
The deployed instance uses the same in-memory store. Serverless instances can restart or run in parallel, so data can
disappear between requests. That's expected with the current design, and it's the persistence question above.
