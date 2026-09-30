/**
 * Unit tests for src/utils/validators.js
 */
const {
  validateCreateTask,
  validateUpdateTask,
  validateAssignTask,
  MAX_ASSIGNEE_LENGTH,
} = require('../src/utils/validators');

describe('validateCreateTask', () => {
  it('accepts a minimal valid body', () => {
    expect(validateCreateTask({ title: 'x' })).toBeNull();
  });

  it.each([{}, { title: '' }, { title: '   ' }, { title: 42 }])('rejects bad title %p', (body) => {
    expect(validateCreateTask(body)).toMatch(/title/);
  });

  it('rejects an invalid status, priority or dueDate', () => {
    expect(validateCreateTask({ title: 'x', status: 'nope' })).toMatch(/status/);
    expect(validateCreateTask({ title: 'x', priority: 'urgent' })).toMatch(/priority/);
    expect(validateCreateTask({ title: 'x', dueDate: 'not-a-date' })).toMatch(/dueDate/);
  });
});

describe('validateUpdateTask', () => {
  it('accepts an empty body (nothing to change)', () => {
    expect(validateUpdateTask({})).toBeNull();
  });

  it('rejects an empty or non-string title when one is provided', () => {
    expect(validateUpdateTask({ title: '' })).toMatch(/title/);
    expect(validateUpdateTask({ title: null })).toMatch(/title/);
  });

  it('rejects an invalid status, priority or dueDate', () => {
    expect(validateUpdateTask({ status: 'nope' })).toMatch(/status/);
    expect(validateUpdateTask({ priority: 'urgent' })).toMatch(/priority/);
    expect(validateUpdateTask({ dueDate: 'garbage' })).toMatch(/dueDate/);
  });
});

describe('validateAssignTask', () => {
  it('accepts a name', () => {
    expect(validateAssignTask({ assignee: 'Alice' })).toBeNull();
  });

  it('accepts null (unassign)', () => {
    expect(validateAssignTask({ assignee: null })).toBeNull();
  });

  it('requires the assignee key', () => {
    expect(validateAssignTask({})).toMatch(/required/);
    expect(validateAssignTask(undefined)).toMatch(/required/);
  });

  it.each(['', '   ', '\t\n'])('rejects blank string %p', (assignee) => {
    expect(validateAssignTask({ assignee })).toMatch(/non-empty/);
  });

  it.each([42, true, {}, ['Alice']])('rejects non-string %p', (assignee) => {
    expect(validateAssignTask({ assignee })).toMatch(/string or null/);
  });

  it('rejects names over the length limit', () => {
    expect(validateAssignTask({ assignee: 'a'.repeat(MAX_ASSIGNEE_LENGTH) })).toBeNull();
    expect(validateAssignTask({ assignee: 'a'.repeat(MAX_ASSIGNEE_LENGTH + 1) })).toMatch(/at most/);
  });
});
