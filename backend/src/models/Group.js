const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Group name is required'],
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['home', 'trip', 'couple', 'other', 'general'],
    default: 'general'
  },
  avatar: {
    type: String,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Group', groupSchema);
