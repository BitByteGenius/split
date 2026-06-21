const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { logAudit } = require('../middleware/auth');

router.post('/register', logAudit('auth.register'), authController.register);
router.post('/verify-otp', logAudit('auth.verify_otp'), authController.verifyOTP);
router.post('/resend-otp', logAudit('auth.resend_otp'), authController.resendOTP);
router.post('/login', logAudit('auth.login'), authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', logAudit('auth.forgot_password'), authController.forgotPassword);
router.post('/reset-password', logAudit('auth.reset_password'), authController.resetPassword);
router.post('/google-login', logAudit('auth.google_login'), authController.googleLogin);

module.exports = router;
