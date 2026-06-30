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

exports.searchExpenses = async (req, res, next) => {
  try {
    const memberships = await GroupMember.find({ user: req.user._id }).select('group');
    const allowedGroupIds = memberships.map((membership) => membership.group);

    const {
      title,
      category,
      groupId,
      startDate,
      endDate,
      amount,
      limit
    } = req.query;

    const query = {
      group: groupId ? groupId : { $in: allowedGroupIds }
    };

    if (groupId && !allowedGroupIds.some((id) => id.toString() === groupId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view expenses in this group' });
    }

    if (title) {
      query.title = { $regex: title, $options: 'i' };
    }

    if (category) {
      query.category = { $regex: `^${category}$`, $options: 'i' };
    }

    if (amount) {
      const parsedAmount = parseFloat(amount);
      query.amount = {
        $gte: Math.max(0, parsedAmount - 1),
        $lte: parsedAmount + 1
      };
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        query.date.$lte = new Date(endDate);
      }
    }

    const maxResults = Math.min(parseInt(limit, 10) || 20, 50);
    const expenses = await Expense.find(query)
      .populate('createdBy', 'name email')
      .populate('group', 'name')
      .sort({ date: -1, createdAt: -1 })
      .limit(maxResults);

    const detailedExpenses = await Promise.all(expenses.map(async (exp) => {
      const participants = await ExpenseParticipant.find({ expense: exp._id })
        .populate('user', 'name email profilePicture');

      return {
        id: exp._id,
        title: exp.title,
        amount: exp.amount,
        category: exp.category,
        date: exp.date,
        notes: exp.notes,
        splitMethod: exp.splitMethod,
        group: exp.group ? { id: exp.group._id, name: exp.group.name } : null,
        createdBy: exp.createdBy ? {
          id: exp.createdBy._id,
          name: exp.createdBy.name,
          email: exp.createdBy.email
        } : null,
        participants: participants.map((participant) => ({
          id: participant._id,
          user: participant.user ? {
            id: participant.user._id,
            name: participant.user.name,
            email: participant.user.email
          } : null,
          paidAmount: participant.paidAmount,
          owedAmount: participant.owedAmount
        }))
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

exports.getExpenseDetails = async (req, res, next) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('group', 'name');

    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    const isMember = await GroupMember.findOne({ group: expense.group._id, user: req.user._id });
    if (!isMember) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const participants = await ExpenseParticipant.find({ expense: expense._id })
      .populate('user', 'name email profilePicture');

    res.status(200).json({
      success: true,
      expense: {
        id: expense._id,
        title: expense.title,
        amount: expense.amount,
        category: expense.category,
        date: expense.date,
        notes: expense.notes,
        splitMethod: expense.splitMethod,
        group: expense.group ? { id: expense.group._id, name: expense.group.name } : null,
        createdBy: expense.createdBy ? {
          id: expense.createdBy._id,
          name: expense.createdBy.name,
          email: expense.createdBy.email
        } : null,
        participants: participants.map((participant) => ({
          id: participant._id,
          user: participant.user ? {
            id: participant.user._id,
            name: participant.user.name,
            email: participant.user.email
          } : null,
          paidAmount: participant.paidAmount,
          owedAmount: participant.owedAmount
        }))
      }
    });
  } catch (error) {
    next(error);
  }
};

const redistributeByRatio = (entries, currentTotal, newTotal, key) => {
  if (!entries.length) {
    return [];
  }

  if (entries.length === 1) {
    return [round(newTotal)];
  }

  const safeCurrentTotal = currentTotal > 0 ? currentTotal : entries.reduce((sum, entry) => sum + Number(entry[key] || 0), 0);
  let runningSum = 0;

  return entries.map((entry, index) => {
    if (index === entries.length - 1) {
      return round(newTotal - runningSum);
    }

    const baseValue = Number(entry[key] || 0);
    const ratio = safeCurrentTotal > 0 ? (baseValue / safeCurrentTotal) : (1 / entries.length);
    const nextValue = round(ratio * newTotal);
    runningSum += nextValue;
    return nextValue;
  });
};

exports.updateExpense = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const expenseId = req.params.id;
    const expense = await Expense.findById(expenseId).session(session);

    if (!expense) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    const isMember = await GroupMember.findOne({ group: expense.group, user: req.user._id }).session(session);
    if (!isMember) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const isCreator = expense.createdBy.toString() === req.user._id.toString();
    const isAdmin = isMember.role === 'admin';
    if (!isCreator && !isAdmin) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ success: false, message: 'Only expense creator or group admin can update' });
    }

    const participants = await ExpenseParticipant.find({ expense: expense._id }).session(session);
    const previousAmount = Number(expense.amount);
    const nextAmount = req.body.amount != null ? parseFloat(req.body.amount) : previousAmount;

    if (req.body.title != null) {
      expense.title = req.body.title;
    }
    if (req.body.category != null) {
      expense.category = req.body.category;
    }
    if (req.body.notes != null) {
      expense.notes = req.body.notes;
    }
    if (req.body.date != null) {
      expense.date = new Date(req.body.date);
    }
    expense.amount = nextAmount;

    if (participants.length > 0 && Math.abs(nextAmount - previousAmount) > 0.001) {
      const paidAmounts = redistributeByRatio(participants, previousAmount, nextAmount, 'paidAmount');
      const owedAmounts = redistributeByRatio(participants, previousAmount, nextAmount, 'owedAmount');

      for (let index = 0; index < participants.length; index += 1) {
        participants[index].paidAmount = paidAmounts[index];
        participants[index].owedAmount = owedAmounts[index];
        participants[index].netBalance = round(participants[index].paidAmount - participants[index].owedAmount);
        await participants[index].save({ session });
      }
    }

    await expense.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: 'Expense updated successfully',
      expense
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
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
