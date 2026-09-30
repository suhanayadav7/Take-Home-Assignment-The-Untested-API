const express = require('express');
const taskRoutes = require('./routes/tasks');

const app = express();

app.use(express.json());

// Landing/health route, so the deployed link shows something useful instead of a 404.
app.get('/', (req, res) => {
  res.json({
    name: 'task-api',
    status: 'ok',
    endpoints: [
      'GET /tasks',
      'GET /tasks?status=todo|in_progress|done',
      'GET /tasks?page=1&limit=10',
      'GET /tasks/stats',
      'POST /tasks',
      'PUT /tasks/:id',
      'DELETE /tasks/:id',
      'PATCH /tasks/:id/complete',
      'PATCH /tasks/:id/assign',
    ],
  });
});

app.use('/tasks', taskRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  // Fix for BUG-8: express.json() raises errors with a status (400 for malformed JSON,
  // 413 for a body that's too large). Those used to be turned into 500s.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  if (err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Task API running on port ${PORT}`);
  });
}

module.exports = app;
