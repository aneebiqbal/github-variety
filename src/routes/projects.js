const express = require('express');
const router = express.Router();

const adminAuth = require('../middleware/adminAuth');
const projectController = require('../controllers/projectController');
const { createRateLimiter } = require('../utils/rateLimit');

// Rate limiter for login attempts: 5 per 5 minutes per IP
const loginRateLimit = createRateLimiter('login', 5, 300_000);

router.post('/verify', loginRateLimit, projectController.verify);

router.use(adminAuth);

router.get('/projects', projectController.listProjects);
router.post('/projects', projectController.createProject);
router.put('/projects/:id', projectController.updateProject);
router.delete('/projects/:id', projectController.deleteProject);
router.get('/feedbacks/:projectId', projectController.listFeedbacks);

module.exports = router;
