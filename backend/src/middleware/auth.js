const jwt = require('jsonwebtoken');
const User = require('../models/User');
const GroupMember = require('../models/GroupMember');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');
const { ROLE_PERMISSIONS, isGroupAdminPermission } = require('../config/permissions');

const parseDevice = (userAgent) => {
  if (!userAgent) return 'Unknown Device';
  if (/android/i.test(userAgent)) return 'Android';
  if (/ipad|iphone|ipod/i.test(userAgent)) return 'iOS';
  if (/windows/i.test(userAgent)) return 'Windows PC';
  if (/macintosh/i.test(userAgent)) return 'Mac';
  if (/linux/i.test(userAgent)) return 'Linux PC';
  return 'Web browser';
};

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_jwt_secret');

      req.user = await User.findById(decoded.id).select('-passwordHash');
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'User not found' });
      }

      if (req.user.isDisabled) {
        return res.status(403).json({ success: false, message: 'Your account has been disabled. Please contact support.' });
      }

      if (!req.user.isVerified) {
        return res.status(403).json({ success: false, message: 'Account not verified. Please verify your email.' });
      }

      // Instant session termination check
      if (decoded.sessionId) {
        const activeSession = req.user.sessions.find(
          s => s._id.toString() === decoded.sessionId.toString()
        );
        if (!activeSession) {
          return res.status(401).json({ success: false, message: 'Session has expired or been terminated' });
        }
        
        req.user.currentSessionId = decoded.sessionId;
        
        // Update session's last active timestamp periodically (non-blocking save)
        activeSession.lastUsedAt = new Date();
        req.user.save().catch(err => logger.error('Failed to update session activity: ', err));
      }

      next();
    } catch (error) {
      logger.error('Token verification error: ', error);
      res.status(401).json({ success: false, message: 'Not authorized, token failed' });
    }
  } else {
    res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
  }
};

const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Access denied: Admin role required' });
  }
};

const authorize = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authorized' });
      }

      const userRole = req.user.role || 'user';
      const allowedPermissions = ROLE_PERMISSIONS[userRole] || [];

      // 1. Check if user's system role has this permission directly
      if (allowedPermissions.includes(permission)) {
        // If it is a group admin permission, verify if this user is indeed an admin of this group
        if (isGroupAdminPermission(permission) && userRole !== 'admin') {
          const groupId = req.params.groupId || req.params.id;
          if (!groupId) {
            return res.status(400).json({ success: false, message: 'Group ID is required for verification' });
          }

          const member = await GroupMember.findOne({ group: groupId, user: req.user._id });
          if (!member || member.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied: Group admin role required' });
          }
        }
        return next();
      }

      // 2. If system role does not have it, but they might be group admin checking a group-level permission
      if (isGroupAdminPermission(permission)) {
        const groupId = req.params.groupId || req.params.id;
        if (groupId) {
          const member = await GroupMember.findOne({ group: groupId, user: req.user._id });
          if (member && member.role === 'admin') {
            return next();
          }
        }
      }

      return res.status(403).json({ success: false, message: `Access denied: Permission ${permission} required` });
    } catch (error) {
      logger.error('Authorization middleware error: ', error);
      res.status(500).json({ success: false, message: 'Internal server authorization error' });
    }
  };
};

const logAudit = (action) => {
  return async (req, res, next) => {
    const originalSend = res.send;
    res.send = function(data) {
      res.send = originalSend;
      res.send(data);

      try {
        const userId = req.user ? req.user._id : null;
        const details = {
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          body: req.body ? { ...req.body } : {},
          params: req.params,
          query: req.query
        };

        // Redact passwords and tokens
        if (details.body.password) details.body.password = '[REDACTED]';
        if (details.body.passwordConfirm) details.body.passwordConfirm = '[REDACTED]';
        if (details.body.token) details.body.token = '[REDACTED]';
        if (details.body.newPassword) details.body.newPassword = '[REDACTED]';

        const userAgent = req.headers['user-agent'] || '';
        const deviceName = parseDevice(userAgent);

        AuditLog.create({
          user: userId,
          action,
          ipAddress: req.ip || req.connection.remoteAddress || '',
          userAgent,
          device: deviceName,
          metadata: details
        }).catch(err => logger.error('Failed to save audit log: ', err));

      } catch (err) {
        logger.error('Error generating audit log: ', err);
      }
    };
    next();
  };
};

module.exports = {
  protect,
  admin,
  authorize,
  logAudit,
  parseDevice
};
