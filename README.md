# Task API: Tested, Fixed & Extended

![tests](https://img.shields.io/badge/tests-95%20passing-brightgreen)
![coverage](https://img.shields.io/badge/coverage-98.9%25-brightgreen)
![node](https://img.shields.io/badge/node-18%2B-blue)
![stack](https://img.shields.io/badge/stack-Express%20%7C%20Jest%20%7C%20Supertest-lightgrey)

A small Express Task Manager API that started with **no tests**. I added a full test suite, found and documented
**8 bugs** (6 fixed with regression tests), and built a new **`PATCH /tasks/:id/assign`** endpoint.

**🔗 Live API:** https://untested-task-api-ten.vercel.app
**📄 Bug report:** [BUG_REPORT.md](./BUG_REPORT.md)
**📝 Notes & design decisions:** [NOTES.md](./NOTES.md)
**📋 Original brief:** [ASSIGNMENT.md](./ASSIGNMENT.md)

---

## At a glance

| Deliverable | Result |
|---|---|
| Tests | **95 passing** across unit (service + validators) and integration (Supertest) suites |
| Coverage | **98.9% statements / 98.4% branches**. The only uncovered lines are `app.listen` |
| Bugs found | **8**, each traced to the exact line, with the cause and a fix |
| Bugs fixed | **6**, each covered by a `Regression test for BUG-N` |
| New feature | `PATCH /tasks/:id/assign` with validation, 404, 409 conflict handling and unassign |
| Deployed | Vercel, see the live link above |

---

## Quick start

**Requirements:** Node.js 18+

```bash
cd task-api
npm install
npm start          # http://localhost:3000
npm test           # run all tests
npm run coverage   # tests + coverage report
```

The data store is in memory and resets whenever the server restarts.

---

## Try it on the live API

```bash
BASE=https://untested-task-api-ten.vercel.app

# Create a task
curl -X POST $BASE/tasks -H "Content-Type: application/json" \
  -d '{"title": "Write tests", "priority": "high"}'

# Assign it (use the id from the response above)
curl -X PATCH $BASE/tasks/<id>/assign -H "Content-Type: application/json" \
  -d '{"assignee": "Alice"}'

# Try to reassign it to someone else: 409 Conflict
curl -X PATCH $BASE/tasks/<id>/assign -H "Content-Type: application/json" \
  -d '{"assignee": "Bob"}'

# Unassign
curl -X PATCH $BASE/tasks/<id>/assign -H "Content-Type: application/json" \
  -d '{"assignee": null}'

# List, filter, paginate, stats
curl "$BASE/tasks"
curl "$BASE/tasks?status=todo"
curl "$BASE/tasks?page=1&limit=10"
curl "$BASE/tasks/stats"
```

> The live instance runs on serverless infrastructure with an in-memory store, so tasks may disappear between requests
> when an instance restarts. This is expected with the current design (see *Production questions* in NOTES.md).

---

## API reference

| Method | Path | Description | Responses |
|---|---|---|---|
| `GET` | `/` | Health check + endpoint list | `200` |
| `GET` | `/tasks` | List all tasks | `200` |
| `GET` | `/tasks?status=` | Filter by exact status (`todo`, `in_progress`, `done`) | `200` |
| `GET` | `/tasks?page=&limit=` | Paginated list (1-based pages, default limit 10) | `200` |
| `GET` | `/tasks/stats` | Counts by status + overdue count | `200` |
| `POST` | `/tasks` | Create a task | `201` · `400` |
| `PUT` | `/tasks/:id` | Update a task's editable fields | `200` · `400` · `404` |
| `DELETE` | `/tasks/:id` | Delete a task | `204` · `404` |
| `PATCH` | `/tasks/:id/complete` | Mark as done (keeps priority; idempotent) | `200` · `404` |
| `PATCH` | `/tasks/:id/assign` | **New:** assign or unassign a task | `200` · `400` · `404` · `409` |

Malformed JSON returns `400` and oversized bodies return `413`. Unknown routes return a JSON `404`.

### Task shape

```json
{
  "id": "uuid",
  "title": "string",
  "description": "string",
  "status": "todo | in_progress | done",
  "priority": "low | medium | high",
  "dueDate": "ISO 8601 | null",
  "assignee": "string | null",
  "completedAt": "ISO 8601 | null",
  "createdAt": "ISO 8601"
}
```

`id`, `createdAt` and `completedAt` are set by the server and can't be changed through `PUT`. `assignee` can only be
changed through `/assign`.

---

## New feature: `PATCH /tasks/:id/assign`

```http
PATCH /tasks/:id/assign
Content-Type: application/json

{ "assignee": "Alice" }     // assign
{ "assignee": null }        // unassign
```

| Request | Response | Why |
|---|---|---|
| Valid name | `200` + updated task | The name is trimmed before it is stored |
| Task doesn't exist | `404` | As specified |
| `""` or `"   "` | `400` | A blank name is a client bug, and treating it as "unassign" would be ambiguous |
| `assignee` missing | `400` | A missing field is an error, not an instruction |
| Non-string (number, array, object) | `400` | Type safety |
| Longer than 100 characters | `400` | Stops a single request from storing an arbitrarily large string |
| `null` | `200`, unassigned | An explicit, unambiguous way to unassign |
| Same person again | `200`, unchanged | Makes retries safe (idempotent) |
| Already assigned to **someone else** | `409 Conflict` | Stops someone's assignment from being silently overwritten; unassign first |

**Key design choices**
- **Validation runs before the lookup**, so a bad body returns 400 before 404, matching the existing `PUT` behaviour.
- **One place for assignment rules.** `PUT` can't set `assignee`, so it can't get around the 409 check.
- **Consistent shape.** Every task is created with `assignee: null`.
- **Tradeoff:** blocking reassignment is a product decision. If free reassignment is preferred, it's a one-line change
  in `assignTask`.

Full reasoning is in [NOTES.md](./NOTES.md#patch-tasksidassign-design-decisions).

---

## Bugs found

| # | Bug | Root cause | Status |
|---|---|---|---|
| 1 | `?page=1` skipped the first page | Offset was `page * limit` but pages are 1-based | ✅ Fixed |
| 2 | `?status=do` returned `todo` **and** `done` | `String.includes()` (substring) used to compare an enum | ✅ Fixed |
| 3 | Completing a task reset its priority to `medium` | Stray `priority: 'medium'` in `completeTask` | ✅ Fixed |
| 4 | `PUT` could overwrite `id` / `createdAt` | Raw `req.body` spread onto the stored task | ✅ Fixed |
| 5 | `completedAt` went out of sync with `status` | `update` / `create` never updated `completedAt` | ✅ Fixed |
| 6 | `status: ""` passed validation and was stored | Validators check truthiness (`body.status && …`) | 📋 Documented |
| 7 | Negative `page` / `limit` accepted | `parseInt(x) \|\| default` lets negatives through | 📋 Documented |
| 8 | Malformed JSON returned `500` | Error handler ignored `err.status` from the body parser | ✅ Fixed |

I confirmed each bug by running the **original** code, and each fix has a regression test. The full write-up
(expected vs. actual behaviour, how I found it, and the fix) is in **[BUG_REPORT.md](./BUG_REPORT.md)**.

---

## Testing

```
tests/
  taskService.test.js     # unit: every service function, incl. pagination bounds, overdue logic, assignment rules
  validators.test.js      # unit: every validator, table-driven invalid inputs
  tasks.routes.test.js    # integration: every endpoint via Supertest, status codes + response bodies
```

**Approach**
- **Test behaviour, not implementation.** Integration tests go through HTTP only and check status codes and JSON.
- **Isolated tests.** The store is reset before every test, so tests don't depend on each other.
- **Regression tests** are labelled with their bug number, so every fix can be traced back to the report.
- **Known unfixed bugs** are recorded as `it.todo`, so they appear in the test output and aren't forgotten.

**Coverage**
```
-----------------|---------|----------|---------|---------|-------------------
File             | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-----------------|---------|----------|---------|---------|-------------------
All files        |   98.94 |    98.36 |   96.96 |   98.83 |
 app.js          |   90.47 |     90.9 |      75 |   90.47 | 49-50 (app.listen)
 routes/tasks.js |     100 |      100 |     100 |     100 |
 taskService.js  |     100 |    97.29 |     100 |     100 |
 validators.js   |     100 |      100 |     100 |     100 |
-----------------|---------|----------|---------|---------|-------------------
Tests: 95 passed, 2 todo
```

---

## Project structure

```
task-api/
  src/
    app.js                   # Express setup, health route, JSON 404, error handler
    routes/tasks.js          # Route handlers (incl. new /assign)
    services/taskService.js  # Business logic + in-memory store
    utils/validators.js      # Input validation (incl. validateAssignTask)
  tests/                     # Unit + integration tests
  vercel.json                # Deployment config
BUG_REPORT.md                # 8 bugs: where, why, how found, fix
NOTES.md                     # Design decisions, what's next, production questions
ASSIGNMENT.md                # Original brief
```

---

## What's next

- Fix BUG-6 and BUG-7 once the expected behaviour is agreed on (reject or clamp).
- Support combining `?status=` with pagination, and return a `{ data, page, limit, total }` envelope.
- Add persistence (a database) and authentication, so `assignee` can reference real user ids.
- Test timezone edge cases for `overdue`, and add contract tests for the response schema.

More detail, including what surprised me in the codebase and the questions I'd ask before shipping, is in
**[NOTES.md](./NOTES.md)**.

---

**Author:** Suhana · [GitHub](https://github.com/suhanayadav7)
