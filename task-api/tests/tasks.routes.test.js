/**
 * Integration tests for the HTTP API (Express app + Supertest).
 * These check behaviour through the public interface: status codes and JSON bodies.
 */
const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

const PAST = '2000-01-01T00:00:00.000Z';

const createTask = (body = {}) =>
  request(app).post('/tasks').send({ title: 'Task', ...body }).then((r) => r.body);

beforeEach(() => {
  taskService._reset();
});

describe('GET /', () => {
  it('returns a health/landing payload', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});

describe('error handler', () => {
  afterEach(() => jest.restoreAllMocks());

  it('passes through 4xx errors from body parsing (413 for an oversized body)', async () => {
    const res = await request(app).post('/tasks').send({ title: 'x', description: 'a'.repeat(200 * 1024) });
    expect(res.status).toBe(413);
  });

  it('returns a generic 500 for unexpected errors without leaking details', async () => {
    jest.spyOn(taskService, 'getAll').mockImplementation(() => {
      throw new Error('boom');
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});

describe('POST /tasks', () => {
  it('creates a task and returns 201', async () => {
    const res = await request(app).post('/tasks').send({ title: 'Write tests', priority: 'high' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Write tests', priority: 'high', status: 'todo', assignee: null });
  });

  it('returns 400 when the title is missing', async () => {
    const res = await request(app).post('/tasks').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/);
  });

  it('returns 400 for an invalid status', async () => {
    const res = await request(app).post('/tasks').send({ title: 'x', status: 'pending' });
    expect(res.status).toBe(400);
  });

  // Regression test for BUG-8
  it('returns 400 (not 500) for malformed JSON', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title": "oops"');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Malformed JSON/);
  });
});

describe('GET /tasks', () => {
  it('returns [] when there are no tasks', async () => {
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns all tasks', async () => {
    await createTask({ title: 'a' });
    await createTask({ title: 'b' });
    const res = await request(app).get('/tasks');
    expect(res.body.map((t) => t.title)).toEqual(['a', 'b']);
  });

  it('filters by exact status', async () => {
    await createTask({ title: 'a', status: 'todo' });
    await createTask({ title: 'b', status: 'done' });
    const res = await request(app).get('/tasks?status=done');
    expect(res.body.map((t) => t.title)).toEqual(['b']);
  });

  // Regression test for BUG-2
  it('does not treat status as a substring', async () => {
    await createTask({ status: 'todo' });
    await createTask({ status: 'done' });
    const res = await request(app).get('/tasks?status=do');
    expect(res.body).toEqual([]);
  });

  describe('pagination', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 15; i++) await createTask({ title: `t${i}` });
    });

    // Regression test for BUG-1
    it('page=1 returns the first page', async () => {
      const res = await request(app).get('/tasks?page=1&limit=5');
      expect(res.body.map((t) => t.title)).toEqual(['t1', 't2', 't3', 't4', 't5']);
    });

    it('page=3 returns the last page', async () => {
      const res = await request(app).get('/tasks?page=3&limit=5');
      expect(res.body.map((t) => t.title)).toEqual(['t11', 't12', 't13', 't14', 't15']);
    });

    it('defaults to limit=10 when only page is given', async () => {
      const res = await request(app).get('/tasks?page=1');
      expect(res.body).toHaveLength(10);
    });

    it('falls back to defaults for non-numeric values', async () => {
      const res = await request(app).get('/tasks?page=abc&limit=xyz');
      expect(res.body).toHaveLength(10);
      expect(res.body[0].title).toBe('t1');
    });
  });
});

describe('GET /tasks/stats', () => {
  it('returns counts and overdue', async () => {
    await createTask({ status: 'todo', dueDate: PAST });
    await createTask({ status: 'in_progress' });
    await createTask({ status: 'done', dueDate: PAST });
    const res = await request(app).get('/tasks/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 1, in_progress: 1, done: 1, overdue: 1 });
  });

  it('is not treated as an :id route', async () => {
    const res = await request(app).get('/tasks/stats');
    expect(res.body).not.toHaveProperty('error');
  });
});

describe('PUT /tasks/:id', () => {
  it('updates a task', async () => {
    const t = await createTask();
    const res = await request(app).put(`/tasks/${t.id}`).send({ title: 'Renamed', status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: t.id, title: 'Renamed', status: 'in_progress' });
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).put('/tasks/does-not-exist').send({ title: 'x' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid fields', async () => {
    const t = await createTask();
    const res = await request(app).put(`/tasks/${t.id}`).send({ priority: 'urgent' });
    expect(res.status).toBe(400);
  });

  // Regression test for BUG-4
  it('cannot overwrite the id or createdAt', async () => {
    const t = await createTask();
    const res = await request(app).put(`/tasks/${t.id}`).send({ id: 'hijacked', createdAt: PAST });
    expect(res.body.id).toBe(t.id);
    expect(res.body.createdAt).toBe(t.createdAt);
    expect((await request(app).get('/tasks')).body[0].id).toBe(t.id);
  });
});

describe('DELETE /tasks/:id', () => {
  it('deletes a task and returns 204', async () => {
    const t = await createTask();
    const res = await request(app).delete(`/tasks/${t.id}`);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect((await request(app).get('/tasks')).body).toEqual([]);
  });

  it('returns 404 for an unknown id', async () => {
    expect((await request(app).delete('/tasks/nope')).status).toBe(404);
  });

  it('returns 404 when deleting the same task twice', async () => {
    const t = await createTask();
    await request(app).delete(`/tasks/${t.id}`);
    expect((await request(app).delete(`/tasks/${t.id}`)).status).toBe(404);
  });
});

describe('PATCH /tasks/:id/complete', () => {
  it('marks the task done', async () => {
    const t = await createTask({ priority: 'high' });
    const res = await request(app).patch(`/tasks/${t.id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.completedAt).not.toBeNull();
    // Regression test for BUG-3
    expect(res.body.priority).toBe('high');
  });

  it('returns 404 for an unknown id', async () => {
    expect((await request(app).patch('/tasks/nope/complete')).status).toBe(404);
  });

  it('removes the task from the overdue count', async () => {
    const t = await createTask({ dueDate: PAST });
    expect((await request(app).get('/tasks/stats')).body.overdue).toBe(1);
    await request(app).patch(`/tasks/${t.id}/complete`);
    expect((await request(app).get('/tasks/stats')).body.overdue).toBe(0);
  });
});

describe('PATCH /tasks/:id/assign', () => {
  it('assigns a task and returns the updated task', async () => {
    const t = await createTask();
    const res = await request(app).patch(`/tasks/${t.id}/assign`).send({ assignee: 'Alice' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: t.id, assignee: 'Alice' });
    // persisted
    expect((await request(app).get('/tasks')).body[0].assignee).toBe('Alice');
  });

  it('trims whitespace around the name', async () => {
    const t = await createTask();
    const res = await request(app).patch(`/tasks/${t.id}/assign`).send({ assignee: '  Alice  ' });
    expect(res.body.assignee).toBe('Alice');
  });

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app).patch('/tasks/nope/assign').send({ assignee: 'Alice' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Task not found');
  });

  it.each([
    ['empty string', { assignee: '' }],
    ['whitespace only', { assignee: '   ' }],
    ['missing field', {}],
    ['number', { assignee: 123 }],
    ['array', { assignee: ['Alice'] }],
    ['too long', { assignee: 'x'.repeat(101) }],
  ])('returns 400 for %s', async (_label, body) => {
    const t = await createTask();
    const res = await request(app).patch(`/tasks/${t.id}/assign`).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/assignee/);
    // task is not modified
    expect((await request(app).get('/tasks')).body[0].assignee).toBeNull();
  });

  it('validates the body before checking whether the task exists', async () => {
    const res = await request(app).patch('/tasks/nope/assign').send({ assignee: '' });
    expect(res.status).toBe(400);
  });

  it('re-assigning the same person returns 200 (safe retry)', async () => {
    const t = await createTask();
    await request(app).patch(`/tasks/${t.id}/assign`).send({ assignee: 'Alice' });
    const res = await request(app).patch(`/tasks/${t.id}/assign`).send({ assignee: 'Alice' });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Alice');
  });

  it('returns 409 when the task is already assigned to someone else', async () => {
    const t = await createTask();
    await request(app).patch(`/tasks/${t.id}/assign`).send({ assignee: 'Alice' });
    const res = await request(app).patch(`/tasks/${t.id}/assign`).send({ assignee: 'Bob' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already assigned to "Alice"/);
    expect(res.body.task.assignee).toBe('Alice');
  });

  it('unassigns with null, then allows a new assignee', async () => {
    const t = await createTask();
    await request(app).patch(`/tasks/${t.id}/assign`).send({ assignee: 'Alice' });
    const un = await request(app).patch(`/tasks/${t.id}/assign`).send({ assignee: null });
    expect(un.status).toBe(200);
    expect(un.body.assignee).toBeNull();
    const re = await request(app).patch(`/tasks/${t.id}/assign`).send({ assignee: 'Bob' });
    expect(re.status).toBe(200);
    expect(re.body.assignee).toBe('Bob');
  });

  it('PUT cannot change the assignee (it goes through /assign only)', async () => {
    const t = await createTask();
    const res = await request(app).put(`/tasks/${t.id}`).send({ assignee: 'Mallory' });
    expect(res.body.assignee).toBeNull();
  });

  it('keeps the other fields unchanged', async () => {
    const t = await createTask({ title: 'Keep me', priority: 'low', status: 'in_progress' });
    const res = await request(app).patch(`/tasks/${t.id}/assign`).send({ assignee: 'Alice' });
    expect(res.body).toMatchObject({ title: 'Keep me', priority: 'low', status: 'in_progress' });
  });
});

describe('Known bugs left unfixed (see BUG_REPORT.md)', () => {
  it.todo('BUG-6: POST /tasks with status "" should return 400 (currently stores an empty status)');
  it.todo('BUG-7: GET /tasks?page=-1 or limit=-5 should return 400 (currently gives odd slices)');
});
