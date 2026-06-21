const User = require('../models/User');
const { generateAccessToken, generateRefreshToken } = require('../utils/token');
const { sendEmail } = require('../config/mailer');
const logger = require('../utils/logger');
const crypto = require('crypto');

// Helpers to generate random OTP code
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit OTP
};

exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const otp = generateOTP();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    user = new User({
      name,
      email,
      passwordHash: password,
      otp,
      otpExpires
    });

    await user.save();
    logger.info(`[Auth] Registration OTP generated for ${email}: ${otp}`);

    // Send verification email
    try {
      await sendEmail({
        to: user.email,
        subject: 'Verify your Account - SplitWise Pro',
        text: `Your OTP is: ${otp}. It is valid for 10 minutes.`,
        html: `<h3>Welcome to SplitWise Pro!</h3><p>Your verification OTP is: <strong>${otp}</strong></p><p>It is valid for 10 minutes.</p>`
      });
    } catch (mailErr) {
      logger.error('Failed to send registration email: ', mailErr);
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful. OTP sent to email.',
      email: user.email
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, message: 'User is already verified' });
    }

    if (!user.otp || user.otp !== otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    user.refreshToken = refreshToken;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Account verified successfully',
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.resendOTP = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, message: 'Account is already verified' });
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();
    logger.info(`[Auth] Resend OTP for ${email}: ${otp}`);

    try {
      await sendEmail({
        to: user.email,
        subject: 'New Verification OTP - SplitWise Pro',
        text: `Your new OTP is: ${otp}. It is valid for 10 minutes.`,
        html: `<h3>SplitWise Pro - Verification Code</h3><p>Your new verification OTP is: <strong>${otp}</strong></p><p>It is valid for 10 minutes.</p>`
      });
    } catch (mailErr) {
      logger.error('Failed to resend OTP email: ', mailErr);
    }

    res.status(200).json({
      success: true,
      message: 'A new OTP has been sent to your email.',
      email: user.email
    });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (!user.isVerified) {
      // Re-send OTP if they are not verified
      const otp = generateOTP();
      user.otp = otp;
      user.otpExpires = Date.now() + 10 * 60 * 1000;
      await user.save();
      logger.info(`[Auth] Resending verification OTP for ${email}: ${otp}`);

      try {
        await sendEmail({
          to: user.email,
          subject: 'Verify your Account - SplitWise Pro',
          text: `Your OTP is: ${otp}`,
          html: `<p>Your verification OTP is: <strong>${otp}</strong></p>`
        });
      } catch (mailErr) {
        logger.error('Failed to send verification email: ', mailErr);
      }

      return res.status(403).json({
        success: false,
        message: 'Account not verified. A new OTP has been sent to your email.',
        requiresVerification: true,
        email: user.email
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    res.status(200).json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token is required' });
    }

    const user = await User.findOne({ refreshToken });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    const jwt = require('jsonwebtoken');
    try {
      jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'fallback_jwt_refresh_secret');
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Expired refresh token' });
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    user.refreshToken = newRefreshToken;
    await user.save();

    res.status(200).json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    next(error);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();
    logger.info(`[Auth] Forgot password OTP generated for ${email}: ${otp}`);

    try {
      await sendEmail({
        to: user.email,
        subject: 'Password Reset - SplitWise Pro',
        text: `Your password reset OTP is: ${otp}`,
        html: `<p>Your password reset OTP is: <strong>${otp}</strong></p>`
      });
    } catch (mailErr) {
      logger.error('Failed to send reset email: ', mailErr);
    }

    res.status(200).json({ success: true, message: 'Reset OTP sent to email' });
  } catch (error) {
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.otp || user.otp !== otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    user.passwordHash = newPassword;
    user.otp = null;
    user.otpExpires = null;
    user.refreshToken = null; // Invalidate current sessions
    await user.save();

    res.status(200).json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    next(error);
  }
};

exports.googleLogin = async (req, res, next) => {
  try {
    const { token, email, name, profilePicture } = req.body;
    
    // In a real application, we would verify the Google token via google-auth-library.
    // For demo/production-grade integration mockup:
    if (!email || !name) {
      return res.status(400).json({ success: false, message: 'Google authentication details missing' });
    }

    let user = await User.findOne({ email });
    if (!user) {
      // Auto-register google user
      const randomPassword = crypto.randomBytes(16).toString('hex');
      user = new User({
        name,
        email,
        passwordHash: randomPassword,
        profilePicture: profilePicture || '',
        isVerified: true
      });
      await user.save();
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    res.status(200).json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture
      }
    });
  } catch (error) {
    next(error);
  }
};
