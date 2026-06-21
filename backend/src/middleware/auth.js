const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const AuditLog = require('../models/AuditLog');

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

      if (!req.user.isVerified) {
        return res.status(403).json({ success: false, message: 'Account not verified. Please verify your email.' });
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

const logAudit = (action) => {
  return async (req, res, next) => {
    const originalSend = res.send;
    res.send = function(data) {
      res.send = originalSend;
      res.send(data);

      // Async audit log creation so it doesn't block the response
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

        AuditLog.create({
          user: userId,
          action,
          details,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent']
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
  logAudit
};
