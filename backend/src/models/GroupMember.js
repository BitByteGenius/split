const mongoose = require('mongoose');

const groupMemberSchema = new mongoose.Schema({
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  role: {
    type: String,
    enum: ['admin', 'member'],
    default: 'member'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure a user can only be in a group once
groupMemberSchema.index({ group: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('GroupMember', groupMemberSchema);
