const Expense = require('../models/Expense');
const ExpenseParticipant = require('../models/ExpenseParticipant');
const GroupMember = require('../models/GroupMember');
const Settlement = require('../models/Settlement');
const balanceService = require('../services/balanceService');
const mongoose = require('mongoose');

exports.getUserDashboardData = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // 1. Get all user's group memberships
    const memberships = await GroupMember.find({ user: userId });
    const groupIds = memberships.map(m => m.group);

    // 2. Compute total owed and you owe across all groups
    let totalOwed = 0; // positive balance: others owe you
    let totalYouOwe = 0; // negative balance: you owe others

    for (const groupId of groupIds) {
      const groupBalances = await balanceService.calculateBalances(groupId);
      const userBalObj = groupBalances[userId.toString()];
      if (userBalObj) {
        if (userBalObj.balance > 0) {
          totalOwed += userBalObj.balance;
        } else if (userBalObj.balance < 0) {
          totalYouOwe += Math.abs(userBalObj.balance);
        }
      }
    }

    // 3. Get total expenses you participated in (your share)
    const expenseShares = await ExpenseParticipant.find({ user: userId });
    const totalExpenses = expenseShares.reduce((acc, curr) => acc + curr.owedAmount, 0);

    // 4. Get recent expenses in user's groups
    const recentExpenses = await Expense.find({ group: { $in: groupIds } })
      .populate('createdBy', 'name email')
      .populate('group', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    // 5. Get recent settlements in user's groups
    const recentSettlements = await Settlement.find({
      group: { $in: groupIds },
      $or: [{ fromUser: userId }, { toUser: userId }]
    })
      .populate('fromUser', 'name')
      .populate('toUser', 'name')
      .populate('group', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        totalOwed: Math.round(totalOwed * 100) / 100,
        totalYouOwe: Math.round(totalYouOwe * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        groupsCount: groupIds.length,
        recentExpenses: recentExpenses.map(e => ({
          id: e._id,
          title: e.title,
          amount: e.amount,
          category: e.category,
          date: e.date,
          groupName: e.group.name,
          createdBy: e.createdBy.name
        })),
        recentSettlements: recentSettlements.map(s => ({
          id: s._id,
          amount: s.amount,
          fromName: s.fromUser.name,
          toName: s.toUser.name,
          groupName: s.group.name,
          date: s.date,
          status: s.status
        }))
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getSpendingAnalytics = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Aggregate user's shares by category
    const categoryStats = await ExpenseParticipant.aggregate([
      { $match: { user: userId } },
      {
        $lookup: {
          from: 'expenses',
          localField: 'expense',
          foreignField: '_id',
          as: 'expenseDetails'
        }
      },
      { $unwind: '$expenseDetails' },
      {
        $group: {
          _id: '$expenseDetails.category',
          totalSpent: { $sum: '$owedAmount' }
        }
      },
      { $project: { category: '$_id', totalSpent: { $round: ['$totalSpent', 2] }, _id: 0 } },
      { $sort: { totalSpent: -1 } }
    ]);

    // Aggregate user's shares by month (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyStats = await ExpenseParticipant.aggregate([
      { $match: { user: userId } },
      {
        $lookup: {
          from: 'expenses',
          localField: 'expense',
          foreignField: '_id',
          as: 'expenseDetails'
        }
      },
      { $unwind: '$expenseDetails' },
      { $match: { 'expenseDetails.date': { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$expenseDetails.date' },
            month: { $month: '$expenseDetails.date' }
          },
          totalSpent: { $sum: '$owedAmount' }
        }
      },
      {
        $project: {
          monthStr: {
            $concat: [
              { $toString: '$_id.year' },
              '-',
              { $cond: [{ $lt: ['$_id.month', 10] }, '0', ''] },
              { $toString: '$_id.month' }
            ]
          },
          totalSpent: { $round: ['$totalSpent', 2] },
          _id: 0
        }
      },
      { $sort: { monthStr: 1 } }
    ]);

    // Aggregate spending by group
    const groupStats = await ExpenseParticipant.aggregate([
      { $match: { user: userId } },
      {
        $lookup: {
          from: 'expenses',
          localField: 'expense',
          foreignField: '_id',
          as: 'expenseDetails'
        }
      },
      { $unwind: '$expenseDetails' },
      {
        $lookup: {
          from: 'groups',
          localField: 'expenseDetails.group',
          foreignField: '_id',
          as: 'groupDetails'
        }
      },
      { $unwind: '$groupDetails' },
      {
        $group: {
          _id: '$groupDetails._id',
          groupName: { $first: '$groupDetails.name' },
          totalSpent: { $sum: '$owedAmount' }
        }
      },
      {
        $project: {
          groupId: '$_id',
          groupName: 1,
          totalSpent: { $round: ['$totalSpent', 2] },
          _id: 0
        }
      },
      { $sort: { totalSpent: -1 } }
    ]);

    res.status(200).json({
      success: true,
      categoryStats,
      monthlyStats,
      groupStats
    });
  } catch (error) {
    next(error);
  }
};
