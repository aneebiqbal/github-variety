const express = require('express');
const router = express.Router();

const feedbackController = require('../controllers/feedbackController');
const { createRateLimiter } = require('../utils/rateLimit');

// Rate limiter for feedback submissions: 10 per minute per IP
const feedbackRateLimit = createRateLimiter('feedback', 10, 60_000);

router.post('/', feedbackRateLimit, feedbackController.submitFeedback);

module.exports = router;
