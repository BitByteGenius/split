const Expense = require('../models/Expense');
const ExpenseParticipant = require('../models/ExpenseParticipant');
const GroupMember = require('../models/GroupMember');
const User = require('../models/User');
const { uploadFile } = require('../services/uploadService');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

// Helper to round numbers to 2 decimal places safely
const round = (num) => Math.round(num * 100) / 100;

exports.addExpense = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { 
      groupId, 
      title, 
      amount, 
      category, 
      date, 
      notes, 
      splitMethod, 
      paidBy, // Single userId string or Array of { user, amount }
      participants // Array of { user, value } (value is amount, percentage, or shares)
    } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid expense amount' });
    }

    // 1. Verify group membership
    const isMember = await GroupMember.findOne({ group: groupId, user: req.user._id });
    if (!isMember) {
      return res.status(403).json({ success: false, message: 'Not authorized to post to this group' });
    }

    // 2. Receipt upload handling (if file uploaded)
    let receiptUrl = '';
    if (req.file) {
      receiptUrl = await uploadFile(req.file);
    }

    // 3. Resolve Paid Amounts
    const paidMap = {}; // userId -> paidAmount
    let totalPaid = 0;

    if (typeof paidBy === 'string') {
      paidMap[paidBy] = parsedAmount;
      totalPaid = parsedAmount;
    } else if (Array.isArray(paidBy)) {
      paidBy.forEach(item => {
        const itemAmt = parseFloat(item.amount);
        paidMap[item.user] = (paidMap[item.user] || 0) + itemAmt;
        totalPaid += itemAmt;
      });
      // Validate that total paid matches total expense amount
      if (Math.abs(totalPaid - parsedAmount) > 0.05) {
        return res.status(400).json({
          success: false,
          message: `Total amount paid (${totalPaid}) must equal the expense amount (${parsedAmount})`
        });
      }
    } else {
      // Default to requester
      paidMap[req.user._id.toString()] = parsedAmount;
      totalPaid = parsedAmount;
    }

    // 4. Calculate Owed Amounts
    const owedMap = {}; // userId -> owedAmount
    const pList = Array.isArray(participants) ? participants : [];
    
    if (pList.length === 0) {
      return res.status(400).json({ success: false, message: 'No expense participants specified' });
    }

    if (splitMethod === 'equal') {
      const share = round(parsedAmount / pList.length);
      let runningSum = 0;
      
      pList.forEach((p, idx) => {
        if (idx === pList.length - 1) {
          // Adjust last participant for division rounding leftovers
          owedMap[p.user] = round(parsedAmount - runningSum);
        } else {
          owedMap[p.user] = share;
          runningSum += share;
        }
      });
    } else if (splitMethod === 'exact') {
      let sumOwed = 0;
      pList.forEach(p => {
        const val = parseFloat(p.value);
        owedMap[p.user] = round(val);
        sumOwed += val;
      });
      
      if (Math.abs(sumOwed - parsedAmount) > 0.05) {
        return res.status(400).json({
          success: false,
          message: `Sum of exact split amounts (${sumOwed}) must equal total expense (${parsedAmount})`
        });
      }
    } else if (splitMethod === 'percentage') {
      let sumPct = 0;
      let runningSum = 0;
      
      pList.forEach((p, idx) => {
        const pct = parseFloat(p.value);
        sumPct += pct;
        
        if (idx === pList.length - 1) {
          owedMap[p.user] = round(parsedAmount - runningSum);
        } else {
          const share = round((pct / 100) * parsedAmount);
          owedMap[p.user] = share;
          runningSum += share;
        }
      });

      if (Math.abs(sumPct - 100) > 0.1) {
        return res.status(400).json({ success: false, message: 'Sum of percentages must equal 100%' });
      }
    } else if (splitMethod === 'shares') {
      let totalShares = 0;
      pList.forEach(p => {
        totalShares += parseFloat(p.value);
      });

      if (totalShares <= 0) {
        return res.status(400).json({ success: false, message: 'Total shares must be greater than zero' });
      }

      let runningSum = 0;
      pList.forEach((p, idx) => {
        const shares = parseFloat(p.value);
        if (idx === pList.length - 1) {
          owedMap[p.user] = round(parsedAmount - runningSum);
        } else {
          const share = round((shares / totalShares) * parsedAmount);
          owedMap[p.user] = share;
          runningSum += share;
        }
      });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid split method' });
    }

    // 5. Gather all unique user IDs involved
    const allUserIds = new Set([
      ...Object.keys(paidMap),
      ...Object.keys(owedMap)
    ]);

    // 6. Create main Expense entry
    const primaryPayerId = typeof paidBy === 'string' ? paidBy : req.user._id;
    const expense = new Expense({
      group: groupId,
      title,
      amount: parsedAmount,
      category: category || 'general',
      date: date || Date.now(),
      notes,
      receiptUrl,
      splitMethod,
      createdBy: req.user._id
    });

    await expense.save({ session });

    // 7. Create ExpenseParticipant entries
    const participantDocs = [];
    for (const userId of allUserIds) {
      const paid = paidMap[userId] || 0;
      const owed = owedMap[userId] || 0;
      
      const part = new ExpenseParticipant({
        expense: expense._id,
        user: userId,
        paidAmount: round(paid),
        owedAmount: round(owed)
      });
      
      participantDocs.push(part);
    }

    await ExpenseParticipant.insertMany(participantDocs, { session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: 'Expense added successfully',
      expense
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

exports.getExpenses = async (req, res, next) => {
  try {
    const groupId = req.params.groupId;
    
    // Validate membership
    const isMember = await GroupMember.findOne({ group: groupId, user: req.user._id });
    if (!isMember) {
      return res.status(403).json({ success: false, message: 'Not authorized to view expenses in this group' });
    }

    const expenses = await Expense.find({ group: groupId })
      .populate('createdBy', 'name email')
      .sort({ date: -1 });

    // For each expense, load the participants
    const detailedExpenses = await Promise.all(expenses.map(async (exp) => {
      const parts = await ExpenseParticipant.find({ expense: exp._id }).populate('user', 'name email profilePicture');
      return {
        ...exp.toObject(),
        participants: parts
      };
    }));

    res.status(200).json({
      success: true,
      count: detailedExpenses.length,
      expenses: detailedExpenses
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteExpense = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const expenseId = req.params.id;
    const expense = await Expense.findById(expenseId);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    // Requester must be group member
    const isMember = await GroupMember.findOne({ group: expense.group, user: req.user._id });
    if (!isMember) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Only creator or group admin can delete
    const isCreator = expense.createdBy.toString() === req.user._id.toString();
    const isAdmin = isMember.role === 'admin';

    if (!isCreator && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Only expense creator or group admin can delete' });
    }

    // Delete participants first, then the expense
    await ExpenseParticipant.deleteMany({ expense: expenseId }, { session });
    await Expense.deleteOne({ _id: expenseId }, { session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};
