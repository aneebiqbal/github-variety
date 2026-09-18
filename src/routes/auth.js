const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { createRateLimiter } = require('../utils/rateLimit');

// Signup: 3 attempts per 10 minutes per IP.
const signupRateLimit = createRateLimiter('signup', 3, 600_000);

// Login: 5 attempts per 5 minutes per IP (same profile as the old login limiter).
const loginRateLimit = createRateLimiter('login', 5, 300_000);

router.post('/signup', signupRateLimit, authController.signup);
router.post('/login', loginRateLimit, authController.login);
router.post('/logout', authController.logout);

module.exports = router;
