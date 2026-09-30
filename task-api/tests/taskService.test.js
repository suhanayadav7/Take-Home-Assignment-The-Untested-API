/**
 * Unit tests for src/services/taskService.js
 * These call the service directly, without HTTP. The store is module-level state,
 * so every test starts from an empty store via _reset().
 */
const taskService = require('../src/services/taskService');

const PAST = '2000-01-01T00:00:00.000Z';
const FUTURE = '2999-01-01T00:00:00.000Z';

beforeEach(() => {
  taskService._reset();
});

describe('create', () => {
  it('creates a task with defaults', () => {
    const task = taskService.create({ title: 'Write tests' });
    expect(task).toMatchObject({
      title: 'Write tests',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      assignee: null,
      completedAt: null,
    });
    expect(task.id).toEqual(expect.any(String));
    expect(Date.parse(task.createdAt)).not.toBeNaN();
  });

  it('respects provided fields', () => {
    const task = taskService.create({
      title: 'Ship',
      description: 'd',
      status: 'in_progress',
      priority: 'high',
      dueDate: FUTURE,
    });
    expect(task).toMatchObject({ status: 'in_progress', priority: 'high', dueDate: FUTURE });
  });

  it('sets completedAt when a task is created already done', () => {
    const task = taskService.create({ title: 'Old', status: 'done' });
    expect(task.completedAt).not.toBeNull();
  });

  it('gives each task a unique id', () => {
    const a = taskService.create({ title: 'a' });
    const b = taskService.create({ title: 'b' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('getAll / findById', () => {
  it('returns all tasks in insertion order', () => {
    taskService.create({ title: 'a' });
    taskService.create({ title: 'b' });
    expect(taskService.getAll().map((t) => t.title)).toEqual(['a', 'b']);
  });

  it('returns a copy of the list, so callers cannot mutate the store', () => {
    taskService.create({ title: 'a' });
    const list = taskService.getAll();
    list.pop();
    expect(taskService.getAll()).toHaveLength(1);
  });

  it('findById returns the task or undefined', () => {
    const t = taskService.create({ title: 'a' });
    expect(taskService.findById(t.id)).toEqual(t);
    expect(taskService.findById('nope')).toBeUndefined();
  });
});

describe('getByStatus', () => {
  beforeEach(() => {
    taskService.create({ title: 't', status: 'todo' });
    taskService.create({ title: 'p', status: 'in_progress' });
    taskService.create({ title: 'd', status: 'done' });
  });

  it('filters by exact status', () => {
    expect(taskService.getByStatus('todo').map((t) => t.title)).toEqual(['t']);
    expect(taskService.getByStatus('done').map((t) => t.title)).toEqual(['d']);
  });

  // Regression test for BUG-2 (substring matching)
  it('does not match partial status strings', () => {
    expect(taskService.getByStatus('do')).toEqual([]);
    expect(taskService.getByStatus('in')).toEqual([]);
  });

  it('returns [] for an unknown status', () => {
    expect(taskService.getByStatus('archived')).toEqual([]);
  });
});

describe('getPaginated', () => {
  beforeEach(() => {
    for (let i = 1; i <= 5; i++) taskService.create({ title: `t${i}` });
  });

  // Regression test for BUG-1 (page 1 skipped the first page)
  it('page 1 returns the first `limit` tasks', () => {
    expect(taskService.getPaginated(1, 2).map((t) => t.title)).toEqual(['t1', 't2']);
  });

  it('page 2 returns the next slice', () => {
    expect(taskService.getPaginated(2, 2).map((t) => t.title)).toEqual(['t3', 't4']);
  });

  it('last page may be partial', () => {
    expect(taskService.getPaginated(3, 2).map((t) => t.title)).toEqual(['t5']);
  });

  it('returns [] past the end', () => {
    expect(taskService.getPaginated(10, 2)).toEqual([]);
  });
});

describe('getStats', () => {
  it('returns zeros for an empty store', () => {
    expect(taskService.getStats()).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  it('counts by status and counts overdue only for tasks that are not done', () => {
    taskService.create({ title: 'a', status: 'todo', dueDate: PAST }); // overdue
    taskService.create({ title: 'b', status: 'in_progress', dueDate: PAST }); // overdue
    taskService.create({ title: 'c', status: 'done', dueDate: PAST }); // done, not overdue
    taskService.create({ title: 'd', status: 'todo', dueDate: FUTURE }); // not yet due
    taskService.create({ title: 'e', status: 'todo' }); // no due date

    expect(taskService.getStats()).toEqual({ todo: 3, in_progress: 1, done: 1, overdue: 2 });
  });
});

describe('update', () => {
  it('merges allowed fields and returns the updated task', () => {
    const t = taskService.create({ title: 'a' });
    const u = taskService.update(t.id, { title: 'b', priority: 'high' });
    expect(u).toMatchObject({ id: t.id, title: 'b', priority: 'high', description: '' });
    expect(taskService.findById(t.id).title).toBe('b');
  });

  it('returns null for an unknown id', () => {
    expect(taskService.update('nope', { title: 'x' })).toBeNull();
  });

  // Regression test for BUG-4 (mass assignment)
  it('ignores server-owned fields (id, createdAt, completedAt, assignee)', () => {
    const t = taskService.create({ title: 'a' });
    const u = taskService.update(t.id, {
      id: 'hacked',
      createdAt: PAST,
      completedAt: PAST,
      assignee: 'Mallory',
      extra: 'junk',
    });
    expect(u.id).toBe(t.id);
    expect(u.createdAt).toBe(t.createdAt);
    expect(u.completedAt).toBeNull();
    expect(u.assignee).toBeNull();
    expect(u).not.toHaveProperty('extra');
  });

  // Regression tests for BUG-5 (completedAt drifting out of sync with status)
  it('sets completedAt when status changes to done', () => {
    const t = taskService.create({ title: 'a' });
    expect(taskService.update(t.id, { status: 'done' }).completedAt).not.toBeNull();
  });

  it('clears completedAt when a done task is reopened', () => {
    const t = taskService.create({ title: 'a' });
    taskService.completeTask(t.id);
    expect(taskService.update(t.id, { status: 'todo' }).completedAt).toBeNull();
  });
});

describe('remove', () => {
  it('removes an existing task', () => {
    const t = taskService.create({ title: 'a' });
    expect(taskService.remove(t.id)).toBe(true);
    expect(taskService.findById(t.id)).toBeUndefined();
  });

  it('returns false for an unknown id', () => {
    expect(taskService.remove('nope')).toBe(false);
  });
});

describe('completeTask', () => {
  it('marks a task done and sets completedAt', () => {
    const t = taskService.create({ title: 'a' });
    const done = taskService.completeTask(t.id);
    expect(done.status).toBe('done');
    expect(Date.parse(done.completedAt)).not.toBeNaN();
  });

  // Regression test for BUG-3
  it('keeps the original priority', () => {
    const t = taskService.create({ title: 'a', priority: 'high' });
    expect(taskService.completeTask(t.id).priority).toBe('high');
  });

  it('is idempotent: completing twice keeps the first completedAt', () => {
    const t = taskService.create({ title: 'a' });
    const first = taskService.completeTask(t.id);
    const second = taskService.completeTask(t.id);
    expect(second.completedAt).toBe(first.completedAt);
  });

  it('returns null for an unknown id', () => {
    expect(taskService.completeTask('nope')).toBeNull();
  });
});

describe('assignTask', () => {
  it('assigns an unassigned task', () => {
    const t = taskService.create({ title: 'a' });
    const { task, error } = taskService.assignTask(t.id, 'Alice');
    expect(error).toBeUndefined();
    expect(task.assignee).toBe('Alice');
    expect(taskService.findById(t.id).assignee).toBe('Alice');
  });

  it('returns not_found for an unknown id', () => {
    expect(taskService.assignTask('nope', 'Alice')).toEqual({ error: 'not_found' });
  });

  it('assigning the same person again succeeds without changes', () => {
    const t = taskService.create({ title: 'a' });
    taskService.assignTask(t.id, 'Alice');
    expect(taskService.assignTask(t.id, 'Alice').task.assignee).toBe('Alice');
  });

  it('refuses to silently reassign to someone else', () => {
    const t = taskService.create({ title: 'a' });
    taskService.assignTask(t.id, 'Alice');
    const result = taskService.assignTask(t.id, 'Bob');
    expect(result.error).toBe('conflict');
    expect(taskService.findById(t.id).assignee).toBe('Alice');
  });

  it('null unassigns, after which a new person can be assigned', () => {
    const t = taskService.create({ title: 'a' });
    taskService.assignTask(t.id, 'Alice');
    expect(taskService.assignTask(t.id, null).task.assignee).toBeNull();
    expect(taskService.assignTask(t.id, 'Bob').task.assignee).toBe('Bob');
  });
});
