const mongoose = require('mongoose');

const expenseParticipantSchema = new mongoose.Schema({
  expense: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense',
    required: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  owedAmount: {
    type: Number,
    default: 0
  },
  netBalance: {
    type: Number,
    default: 0
  }
});

// Compound unique index for user per expense
expenseParticipantSchema.index({ expense: 1, user: 1 }, { unique: true });

// Pre-save hook to calculate net balance
expenseParticipantSchema.pre('save', function(next) {
  this.netBalance = this.paidAmount - this.owedAmount;
  next();
});

module.exports = mongoose.model('ExpenseParticipant', expenseParticipantSchema);
