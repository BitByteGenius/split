const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: [true, 'Expense title is required'],
    trim: true,
    index: true
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
  date: {
    type: Date,
    default: Date.now,
    index: true
  },
  notes: {
    type: String,
    trim: true
  },
  receiptUrl: {
    type: String,
    default: ''
  },
  splitMethod: {
    type: String,
    enum: ['equal', 'exact', 'percentage', 'shares'],
    default: 'equal'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Expense', expenseSchema);
