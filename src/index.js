require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const healthRoute = require('./routes/health');
const feedbackRoute = require('./routes/feedback');
const projectsRoute = require('./routes/projects');

const app = express();
const prisma = new PrismaClient();

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
app.use(express.json());

// Serve the admin dashboard UI at GET /admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});

app.use(express.static('public'));

app.use('/health', healthRoute);
app.use('/api/feedback', feedbackRoute);
app.use('/api/admin', projectsRoute);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`GitHub Variety backend running on port ${PORT}`);
});

module.exports = app;