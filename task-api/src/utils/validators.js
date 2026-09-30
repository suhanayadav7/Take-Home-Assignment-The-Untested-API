const VALID_STATUSES = ['todo', 'in_progress', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];
const MAX_ASSIGNEE_LENGTH = 100;

// Note (BUG-6): the checks below use `body.status && ...`, so an empty string
// ("") skips validation and gets stored. Left as-is and documented in BUG_REPORT.md.
const validateCreateTask = (body) => {
  if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
    return 'title is required and must be a non-empty string';
  }
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  }
  if (body.priority && !VALID_PRIORITIES.includes(body.priority)) {
    return `priority must be one of: ${VALID_PRIORITIES.join(', ')}`;
  }
  if (body.dueDate && isNaN(Date.parse(body.dueDate))) {
    return 'dueDate must be a valid ISO date string';
  }
  return null;
};

const validateUpdateTask = (body) => {
  if (body.title !== undefined && (typeof body.title !== 'string' || body.title.trim() === '')) {
    return 'title must be a non-empty string';
  }
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  }
  if (body.priority && !VALID_PRIORITIES.includes(body.priority)) {
    return `priority must be one of: ${VALID_PRIORITIES.join(', ')}`;
  }
  if (body.dueDate && isNaN(Date.parse(body.dueDate))) {
    return 'dueDate must be a valid ISO date string';
  }
  return null;
};

/**
 * Validates the body of PATCH /tasks/:id/assign.
 * - assignee is required (a missing key is almost certainly a client bug)
 * - null is allowed and means "unassign"
 * - otherwise it must be a string that is non-empty after trimming. "" and "   " are
 *   rejected instead of being treated as unassign, because that is ambiguous;
 *   clients have to send null explicitly
 * - length is capped so a single request can't store an arbitrarily large string
 */
const validateAssignTask = (body) => {
  if (!body || !Object.prototype.hasOwnProperty.call(body, 'assignee')) {
    return 'assignee is required (use null to unassign)';
  }
  const { assignee } = body;
  if (assignee === null) return null;
  if (typeof assignee !== 'string') {
    return 'assignee must be a string or null';
  }
  if (assignee.trim() === '') {
    return 'assignee must be a non-empty string (use null to unassign)';
  }
  if (assignee.trim().length > MAX_ASSIGNEE_LENGTH) {
    return `assignee must be at most ${MAX_ASSIGNEE_LENGTH} characters`;
  }
  return null;
};

module.exports = {
  validateCreateTask,
  validateUpdateTask,
  validateAssignTask,
  VALID_STATUSES,
  MAX_ASSIGNEE_LENGTH,
};
