const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect, logAudit } = require('../middleware/auth');
const {
  validateRegister,
  validateVerifyOTP,
  validateResendOTP,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateGoogleLogin
} = require('../middleware/validators');

// Public auth endpoints
router.post('/register', validateRegister, logAudit('auth.register'), authController.register);
router.post('/verify-otp', validateVerifyOTP, logAudit('auth.verify_otp'), authController.verifyOTP);
router.post('/resend-otp', validateResendOTP, logAudit('auth.resend_otp'), authController.resendOTP);
router.post('/login', validateLogin, logAudit('auth.login'), authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', validateForgotPassword, logAudit('auth.forgot_password'), authController.forgotPassword);
router.post('/reset-password', validateResetPassword, logAudit('auth.reset_password'), authController.resetPassword);
router.post('/google-login', validateGoogleLogin, logAudit('auth.google_login'), authController.googleLogin);

// Protected session & logout endpoints
router.use(protect);
router.post('/logout', logAudit('auth.logout'), authController.logout);
router.post('/logout-all', logAudit('auth.logout_all'), authController.logoutAll);
router.get('/sessions', authController.getSessions);
router.delete('/sessions/:sessionId', logAudit('auth.revoke_session'), authController.revokeSession);

module.exports = router;
