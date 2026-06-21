const mongoose = require('mongoose');

const recurringExpenseSchema = new mongoose.Schema({
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be greater than zero']
  },
  currency: {
    type: String,
    default: 'INR',
    trim: true
  },
  category: {
    type: String,
    default: 'general',
    trim: true
  },
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    required: true
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  nextDueDate: {
    type: Date,
    required: true,
    index: true
  },
  lastExecutedDate: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'completed'],
    default: 'active'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  splitMethod: {
    type: String,
    enum: ['equal', 'exact', 'percentage', 'shares'],
    default: 'equal'
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    shareValue: {
      type: Number,
      required: true,
      default: 0
    }
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('RecurringExpense', recurringExpenseSchema);
