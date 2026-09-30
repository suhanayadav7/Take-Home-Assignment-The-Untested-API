const { v4: uuidv4 } = require('uuid');

let tasks = [];

// Fields a client is allowed to change through PUT /tasks/:id.
// id, createdAt and completedAt are server-owned; assignee has its own
// endpoint (PATCH /tasks/:id/assign) so its rules live in one place.
// (Fix for BUG-4 in BUG_REPORT.md: previously the whole body was spread onto the task.)
const UPDATABLE_FIELDS = ['title', 'description', 'status', 'priority', 'dueDate'];

const getAll = () => [...tasks];

const findById = (id) => tasks.find((t) => t.id === id);

// Fix for BUG-2: was `t.status.includes(status)`, a substring match, so
// ?status=do returned both "todo" and "done" tasks. Status is an enum, so compare exactly.
const getByStatus = (status) => tasks.filter((t) => t.status === status);

// Fix for BUG-1: pages are 1-based (the route defaults page to 1), but the
// offset was `page * limit`, so page 1 skipped the first `limit` tasks.
const getPaginated = (page, limit) => {
  const offset = (page - 1) * limit;
  return tasks.slice(offset, offset + limit);
};

const getStats = () => {
  const now = new Date();
  const counts = { todo: 0, in_progress: 0, done: 0 };
  let overdue = 0;

  tasks.forEach((t) => {
    if (counts[t.status] !== undefined) counts[t.status]++;
    if (t.dueDate && t.status !== 'done' && new Date(t.dueDate) < now) {
      overdue++;
    }
  });

  return { ...counts, overdue };
};

const create = ({ title, description = '', status = 'todo', priority = 'medium', dueDate = null }) => {
  const task = {
    id: uuidv4(),
    title,
    description,
    status,
    priority,
    dueDate,
    // Every task carries assignee (null = unassigned) so the shape is predictable for clients.
    assignee: null,
    completedAt: status === 'done' ? new Date().toISOString() : null,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  return task;
};

const update = (id, fields) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const current = tasks[index];
  const allowed = {};
  UPDATABLE_FIELDS.forEach((key) => {
    if (fields[key] !== undefined) allowed[key] = fields[key];
  });

  const updated = { ...current, ...allowed };

  // Fix for BUG-5: keep completedAt consistent with status when it changes via PUT.
  if (allowed.status && allowed.status !== current.status) {
    updated.completedAt = allowed.status === 'done' ? new Date().toISOString() : null;
  }

  tasks[index] = updated;
  return updated;
};

const remove = (id) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return false;

  tasks.splice(index, 1);
  return true;
};

const completeTask = (id) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const task = tasks[index];
  // Already done: return it unchanged so the original completedAt is kept (idempotent).
  if (task.status === 'done') return task;

  // Fix for BUG-3: this used to also set `priority: 'medium'`, silently
  // overwriting the user's priority on every completion.
  const updated = {
    ...task,
    status: 'done',
    completedAt: new Date().toISOString(),
  };

  tasks[index] = updated;
  return updated;
};

/**
 * Assign (or unassign) a task.
 *
 * Returns one of:
 *   { error: 'not_found' }
 *   { error: 'conflict', task }  - already assigned to someone else
 *   { task }                     - success (including the no-op case of the same assignee)
 *
 * `assignee` must already be validated: a trimmed non-empty string, or null to unassign.
 */
const assignTask = (id, assignee) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return { error: 'not_found' };

  const task = tasks[index];

  // Assigning the same person again is a harmless retry, so it succeeds without changes.
  if (task.assignee === assignee) return { task };

  // Reassigning silently could clobber someone else's claim, so the client
  // has to unassign (assignee: null) first.
  if (assignee !== null && task.assignee) {
    return { error: 'conflict', task };
  }

  const updated = { ...task, assignee };
  tasks[index] = updated;
  return { task: updated };
};

const _reset = () => {
  tasks = [];
};

module.exports = {
  getAll,
  findById,
  getByStatus,
  getPaginated,
  getStats,
  create,
  update,
  remove,
  completeTask,
  assignTask,
  _reset,
};
