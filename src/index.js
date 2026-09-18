require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const healthRoute = require('./routes/health');
const feedbackRoute = require('./routes/feedback');
const projectsRoute = require('./routes/projects');
const authRoute = require('./routes/auth');

const app = express();
const prisma = new PrismaClient();

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
app.use(express.json({ limit: '1mb' }));

// Serve the admin dashboard UI at GET /admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/health', healthRoute);
app.use('/api/feedback', feedbackRoute);
app.use('/api/admin', projectsRoute);
app.use('/api/auth', authRoute);

// Validate required env vars on startup
const requiredEnv = ['DATABASE_URL', 'DIRECT_URL', 'GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY'];
const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`GitHub Variety backend running on port ${PORT}`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    prisma.$disconnect().then(() => {
      console.log('Server closed. Database connection terminated.');
      process.exit(0);
    });
  });
  // Force shutdown after 5 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;