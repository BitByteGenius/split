const GroupMember = require('../models/GroupMember');
const Expense = require('../models/Expense');
const ExpenseParticipant = require('../models/ExpenseParticipant');
const Settlement = require('../models/Settlement');
const User = require('../models/User');

/**
 * Calculates net balances for all group members.
 * Returns: { [userId]: { user: User, balance: Number } }
 */
const calculateBalances = async (groupId) => {
  // 1. Fetch group members
  const members = await GroupMember.find({ group: groupId }).populate('user', 'name email profilePicture');
  const balances = {};
  
  members.forEach(member => {
    balances[member.user._id.toString()] = {
      user: member.user,
      balance: 0
    };
  });

  // 2. Fetch all expenses in the group
  const expenses = await Expense.find({ group: groupId });
  const expenseIds = expenses.map(e => e._id);

  // 3. Aggregate all participant paid/owed amounts
  const participants = await ExpenseParticipant.find({ expense: { $in: expenseIds } });
  
  participants.forEach(p => {
    const userId = p.user.toString();
    if (balances[userId]) {
      balances[userId].balance += (p.paidAmount - p.owedAmount);
    }
  });

  // 4. Adjust with existing settlements
  const settlements = await Settlement.find({ group: groupId, status: 'completed' });
  
  settlements.forEach(s => {
    const fromId = s.fromUser.toString();
    const toId = s.toUser.toString();
    
    if (balances[fromId]) {
      balances[fromId].balance += s.amount;
    }
    if (balances[toId]) {
      balances[toId].balance -= s.amount;
    }
  });

  return balances;
};

/**
 * Executes the balance optimization (debt simplification) algorithm.
 * Returns: [ { fromUser: User, toUser: User, amount: Number } ]
 */
const getSuggestedSettlements = async (groupId) => {
  const balancesMap = await calculateBalances(groupId);
  
  // Separate into debtors and creditors
  const debtors = [];
  const creditors = [];

  Object.keys(balancesMap).forEach(userId => {
    const item = balancesMap[userId];
    // Round to 2 decimal places to avoid floating point precision issues
    const roundedBal = Math.round(item.balance * 100) / 100;
    
    if (roundedBal < -0.01) {
      debtors.push({
        user: item.user,
        balance: roundedBal
      });
    } else if (roundedBal > 0.01) {
      creditors.push({
        user: item.user,
        balance: roundedBal
      });
    }
  });

  // Sort: Debtors ascending (most negative first), Creditors descending (most positive first)
  debtors.sort((a, b) => a.balance - b.balance);
  creditors.sort((a, b) => b.balance - a.balance);

  const suggestions = [];

  let i = 0; // Debtor pointer
  let j = 0; // Creditor pointer

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const debtAmount = -debtor.balance;
    const creditAmount = creditor.balance;
    
    const settleAmount = Math.min(debtAmount, creditAmount);
    
    // Round settlement amount to 2 decimals
    const roundedSettle = Math.round(settleAmount * 100) / 100;

    if (roundedSettle > 0) {
      suggestions.push({
        fromUser: debtor.user,
        toUser: creditor.user,
        amount: roundedSettle
      });
    }

    debtor.balance += roundedSettle;
    creditor.balance -= roundedSettle;

    // Check if debtor is fully settled (close to 0)
    if (Math.abs(debtor.balance) < 0.01) {
      i++;
    }
    // Check if creditor is fully settled (close to 0)
    if (Math.abs(creditor.balance) < 0.01) {
      j++;
    }
  }

  return suggestions;
};

module.exports = {
  calculateBalances,
  getSuggestedSettlements
};
