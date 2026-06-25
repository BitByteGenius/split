const mongoose = require('mongoose');

const usedRefreshTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // Mongoose TTL index to automatically delete expired documents
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('UsedRefreshToken', usedRefreshTokenSchema);
