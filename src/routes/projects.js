const express = require('express');
const router = express.Router();

const adminAuth = require('../middleware/adminAuth');
const projectController = require('../controllers/projectController');

// All /api/admin routes require a valid session (tenant-scoped by adminAuth).
router.use(adminAuth);

router.get('/projects', projectController.listProjects);
router.post('/projects', projectController.createProject);
router.put('/projects/:id', projectController.updateProject);
router.delete('/projects/:id', projectController.deleteProject);
router.get('/feedbacks/:projectId', projectController.listFeedbacks);

module.exports = router;
