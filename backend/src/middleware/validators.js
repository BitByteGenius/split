const { body, param, query, validationResult } = require('express-validator');

// Error responder middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

const passwordCheck = body('password')
  .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
  .custom((value) => {
    const hasUppercase = /[A-Z]/.test(value);
    const hasLowercase = /[a-z]/.test(value);
    const hasDigit = /\d/.test(value);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(value);
    if (!hasUppercase || !hasLowercase || !hasDigit || !hasSpecial) {
      throw new Error('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
    }
    return true;
  });

const newPasswordCheck = body('newPassword')
  .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
  .custom((value) => {
    const hasUppercase = /[A-Z]/.test(value);
    const hasLowercase = /[a-z]/.test(value);
    const hasDigit = /\d/.test(value);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(value);
    if (!hasUppercase || !hasLowercase || !hasDigit || !hasSpecial) {
      throw new Error('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
    }
    return true;
  });

// Auth Validators
const validateRegister = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  passwordCheck,
  validate
];

const validateVerifyOTP = [
  body('email').trim().isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  body('otp').trim().isLength({ min: 6, max: 6 }).withMessage('OTP must be a 6-digit number'),
  validate
];

const validateResendOTP = [
  body('email').trim().isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  validate
];

const validateLogin = [
  body('email').trim().isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  validate
];

const validateForgotPassword = [
  body('email').trim().isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  validate
];

const validateResetPassword = [
  body('email').trim().isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  body('otp').trim().isLength({ min: 6, max: 6 }).withMessage('OTP must be a 6-digit number'),
  newPasswordCheck,
  validate
];

const validateGoogleLogin = [
  body('token').notEmpty().withMessage('Google ID token is required'),
  validate
];

// Group Validators
const validateCreateGroup = [
  body('name').trim().notEmpty().withMessage('Group name is required'),
  body('category').optional().isIn(['home', 'trip', 'couple', 'other', 'general']).withMessage('Invalid group category'),
  validate
];

const validateAddMember = [
  body('email').trim().isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  validate
];

// Expense Validators
const validateAddExpense = [
  body('groupId').isMongoId().withMessage('Invalid Group ID'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a number greater than 0'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('splitMethod').isIn(['equal', 'unequal', 'percentage']).withMessage('Split method must be equal, unequal, or percentage'),
  body('participants').isArray({ min: 1 }).withMessage('At least one participant is required'),
  body('participants.*.userId').isMongoId().withMessage('Invalid participant User ID'),
  validate
];

// Settlement Validators
const validateCreateSettlement = [
  body('groupId').isMongoId().withMessage('Invalid Group ID'),
  body('payeeId').isMongoId().withMessage('Invalid Payee ID'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a number greater than 0'),
  validate
];

module.exports = {
  validateRegister,
  validateVerifyOTP,
  validateResendOTP,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateGoogleLogin,
  validateCreateGroup,
  validateAddMember,
  validateAddExpense,
  validateCreateSettlement
};
