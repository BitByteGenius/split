const mongoose = require('mongoose');

const settlementSchema = new mongoose.Schema({
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  fromUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  toUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: [true, 'Settlement amount is required'],
    min: [0.01, 'Amount must be greater than zero']
  },
  currency: {
    type: String,
    default: 'INR',
    trim: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'completed'],
    default: 'completed'
  },
  receiptUrl: {
    type: String,
    default: ''
  },
  transactionRef: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Settlement', settlementSchema);
