const User = require('../models/User');
const UsedRefreshToken = require('../models/UsedRefreshToken');
const AuditLog = require('../models/AuditLog');
const { generateAccessToken, generateRefreshToken } = require('../utils/token');
const { sendEmail } = require('../config/mailer');
const logger = require('../utils/logger');
const { parseDevice } = require('../middleware/auth');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit OTP
};

const parsePlatform = (userAgent) => {
  if (!userAgent) return 'Web';
  if (/android/i.test(userAgent)) return 'Android';
  if (/ipad|iphone|ipod/i.test(userAgent)) return 'iOS';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/macintosh/i.test(userAgent)) return 'MacOS';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'Web';
};

// Check and update OTP request count/window (max 3 per hour)
const checkOTPLimit = (user) => {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  if (user.otpRequestWindowStart && user.otpRequestWindowStart > hourAgo) {
    if (user.otpRequestCount >= 3) {
      return false; // Limit exceeded
    }
    user.otpRequestCount += 1;
  } else {
    user.otpRequestWindowStart = now;
    user.otpRequestCount = 1;
  }
  return true;
};

exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    let user = await User.findOne({ email });
    if (user) {
      if (user.isVerified) {
        return res.status(409).json({ success: false, message: 'User already exists' });
      }
      
      // Allow unverified user to resend verification OTP, checking rate limit
      if (!checkOTPLimit(user)) {
        return res.status(429).json({ success: false, message: 'Too many OTP requests. Please try again after an hour.' });
      }

      const otp = generateOTP();
      user.otp = otp;
      user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
      await user.save();
      logger.info(`[Auth] Registration OTP generated for existing unverified user ${email}: ${otp}`);

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

      return res.status(200).json({
        success: true,
        message: 'OTP sent to email for verification.',
        email: user.email
      });
    }

    // Brand new registration
    const otp = generateOTP();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    user = new User({
      name,
      email,
      passwordHash: password,
      otp,
      otpExpires,
      otpRequestCount: 1,
      otpRequestWindowStart: new Date()
    });

    await user.save();
    logger.info(`[Auth] Registration OTP generated for ${email}: ${otp}`);

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
    const { email, otp, deviceName, platform } = req.body;

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
    user.failedLoginAttempts = 0; // Reset fails on verification
    user.lockUntil = null;

    const newSessionId = new mongoose.Types.ObjectId();
    const accessToken = generateAccessToken(user, newSessionId);
    const refreshToken = generateRefreshToken(user, newSessionId);

    const userAgent = req.headers['user-agent'] || '';
    const session = {
      _id: newSessionId,
      refreshToken,
      deviceName: deviceName || parseDevice(userAgent),
      platform: platform || parsePlatform(userAgent),
      ipAddress: req.ip || req.connection.remoteAddress || '',
      createdAt: new Date(),
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    };

    user.sessions.push(session);
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

    // OTP Rate limiting
    if (!checkOTPLimit(user)) {
      return res.status(429).json({ success: false, message: 'Too many OTP requests. Please try again after an hour.' });
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
    const { email, password, deviceName, platform } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (user.isDisabled) {
      return res.status(403).json({ success: false, message: 'Your account has been disabled. Please contact support.' });
    }

    // Check account lockout status
    if (user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(423).json({
        success: false,
        message: `Account is temporarily locked. Try again after ${Math.ceil((user.lockUntil - Date.now()) / 60000)} minutes.`
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.failedLoginAttempts += 1;
      
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = Date.now() + 15 * 60 * 1000; // Lock for 15 mins
        await user.save();
        
        // Log account lockout audit event
        await AuditLog.create({
          user: user._id,
          action: 'ACCOUNT_LOCKOUT',
          ipAddress: req.ip || req.connection.remoteAddress || '',
          userAgent: req.headers['user-agent'] || '',
          device: parseDevice(req.headers['user-agent']),
          metadata: { message: 'Account locked due to 5 consecutive failed login attempts.' }
        }).catch(err => logger.error('Failed to save audit lockout log: ', err));

        return res.status(423).json({
          success: false,
          message: 'Account temporarily locked. Please try again in 15 minutes.'
        });
      }
      
      await user.save();
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (!user.isVerified) {
      // Re-send OTP if they are not verified, applying rate limit
      if (!checkOTPLimit(user)) {
        return res.status(429).json({ success: false, message: 'Too many OTP requests. Please try again after an hour.' });
      }

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

    // Reset login failures on success
    user.failedLoginAttempts = 0;
    user.lockUntil = null;

    const newSessionId = new mongoose.Types.ObjectId();
    const accessToken = generateAccessToken(user, newSessionId);
    const refreshToken = generateRefreshToken(user, newSessionId);

    const userAgent = req.headers['user-agent'] || '';
    const session = {
      _id: newSessionId,
      refreshToken,
      deviceName: deviceName || parseDevice(userAgent),
      platform: platform || parsePlatform(userAgent),
      ipAddress: req.ip || req.connection.remoteAddress || '',
      createdAt: new Date(),
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    };

    user.sessions.push(session);
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

    // 1. Refresh Token Reuse Detection (RTR)
    const usedToken = await UsedRefreshToken.findOne({ token: refreshToken });
    if (usedToken) {
      const user = await User.findById(usedToken.userId);
      if (user) {
        user.sessions = []; // Revoke ALL active sessions
        await user.save();

        await AuditLog.create({
          user: user._id,
          action: 'SECURITY_EVENT_TOKEN_REUSE',
          ipAddress: req.ip || req.connection.remoteAddress || '',
          userAgent: req.headers['user-agent'] || '',
          device: parseDevice(req.headers['user-agent']),
          metadata: { message: 'Refresh token reuse detected. Revoking all user sessions.' }
        }).catch(err => logger.error('Failed to save reuse audit log: ', err));
      }

      return res.status(401).json({
        success: false,
        message: 'Security Alert: Reuse of refresh token detected. All sessions invalidated.'
      });
    }

    // 2. Find user owning this active token
    const user = await User.findOne({ 'sessions.refreshToken': refreshToken });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    if (user.isDisabled) {
      return res.status(403).json({ success: false, message: 'Your account has been disabled.' });
    }

    // 3. Verify JWT
    const jwt = require('jsonwebtoken');
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'fallback_jwt_refresh_secret');
    } catch (err) {
      // Remove expired session from db
      user.sessions = user.sessions.filter(s => s.refreshToken !== refreshToken);
      await user.save();
      return res.status(401).json({ success: false, message: 'Expired refresh token' });
    }

    // 4. Rotate tokens
    const activeSessionIndex = user.sessions.findIndex(s => s.refreshToken === refreshToken);
    const activeSession = user.sessions[activeSessionIndex];

    const newSessionId = new mongoose.Types.ObjectId();
    const newAccessToken = generateAccessToken(user, newSessionId);
    const newRefreshToken = generateRefreshToken(user, newSessionId);

    // Save old token to reuse protection list (with expiry matching its lifetime)
    const expiresAt = decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await UsedRefreshToken.create({
      token: refreshToken,
      userId: user._id,
      expiresAt
    });

    // Update active session details
    activeSession._id = newSessionId;
    activeSession.refreshToken = newRefreshToken;
    activeSession.lastUsedAt = new Date();

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

    // OTP Rate limiting
    if (!checkOTPLimit(user)) {
      return res.status(429).json({ success: false, message: 'Too many OTP requests. Please try again after an hour.' });
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
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.sessions = []; // Invalidate all active sessions for security on password reset
    await user.save();

    res.status(200).json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const sessionId = req.user.currentSessionId;
    if (sessionId) {
      req.user.sessions = req.user.sessions.filter(s => s._id.toString() !== sessionId.toString());
      await req.user.save();
    }
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

exports.logoutAll = async (req, res, next) => {
  try {
    req.user.sessions = [];
    await req.user.save();
    res.status(200).json({ success: true, message: 'Logged out from all devices successfully' });
  } catch (error) {
    next(error);
  }
};

exports.getSessions = async (req, res, next) => {
  try {
    const mappedSessions = req.user.sessions.map(s => ({
      id: s._id,
      deviceName: s.deviceName,
      platform: s.platform,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      isCurrent: req.user.currentSessionId && s._id.toString() === req.user.currentSessionId.toString()
    }));
    res.status(200).json({ success: true, sessions: mappedSessions });
  } catch (error) {
    next(error);
  }
};

exports.revokeSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    req.user.sessions = req.user.sessions.filter(s => s._id.toString() !== sessionId.toString());
    await req.user.save();
    res.status(200).json({ success: true, message: 'Device session revoked successfully' });
  } catch (error) {
    next(error);
  }
};

exports.googleLogin = async (req, res, next) => {
  try {
    const { token, deviceName, platform } = req.body;
    
    let ticket;
    try {
      const clientIds = [
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_ID_WEB,
        process.env.GOOGLE_CLIENT_ID_ANDROID,
        process.env.GOOGLE_CLIENT_ID_IOS
      ].filter(Boolean);

      ticket = await client.verifyIdToken({
        idToken: token,
        audience: clientIds.length > 0 ? clientIds : undefined,
      });
    } catch (verifyErr) {
      logger.error('Google ID token verification failed: ', verifyErr);
      return res.status(401).json({ success: false, message: 'Invalid Google sign-in token' });
    }

    const payload = ticket.getPayload();
    const { sub, email, email_verified, name, picture } = payload;

    if (!email_verified) {
      return res.status(400).json({ success: false, message: 'Google email is not verified' });
    }

    let user = await User.findOne({ email });
    if (!user) {
      // Auto-register Google user
      const randomPassword = crypto.randomBytes(16).toString('hex');
      user = new User({
        name: name || 'Google User',
        email,
        passwordHash: randomPassword,
        profilePicture: picture || '',
        isVerified: true
      });
      await user.save();
    } else {
      if (user.isDisabled) {
        return res.status(403).json({ success: false, message: 'Your account has been disabled. Please contact support.' });
      }
      if (!user.isVerified) {
        user.isVerified = true;
        await user.save();
      }
    }

    const newSessionId = new mongoose.Types.ObjectId();
    const accessToken = generateAccessToken(user, newSessionId);
    const refreshToken = generateRefreshToken(user, newSessionId);

    const userAgent = req.headers['user-agent'] || '';
    const session = {
      _id: newSessionId,
      refreshToken,
      deviceName: deviceName || parseDevice(userAgent),
      platform: platform || parsePlatform(userAgent),
      ipAddress: req.ip || req.connection.remoteAddress || '',
      createdAt: new Date(),
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    };

    user.sessions.push(session);
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
