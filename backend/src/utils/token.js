const jwt = require('jsonwebtoken');

const generateAccessToken = (user, sessionId) => {
  return jwt.sign(
    { 
      id: user._id, 
      role: user.role,
      sessionId: sessionId ? sessionId.toString() : undefined
    },
    process.env.JWT_SECRET || 'fallback_jwt_secret',
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );
};

const generateRefreshToken = (user, sessionId) => {
  return jwt.sign(
    { 
      id: user._id,
      sessionId: sessionId ? sessionId.toString() : undefined
    },
    process.env.JWT_REFRESH_SECRET || 'fallback_jwt_refresh_secret',
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' } // Expired refresh tokens will be automatically rotated
  );
};

module.exports = {
  generateAccessToken,
  generateRefreshToken
};
