const Expense = require('../models/Expense');
const ExpenseParticipant = require('../models/ExpenseParticipant');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const balanceService = require('../services/balanceService');
const logger = require('../utils/logger');

exports.exportGroupExpensesCSV = async (req, res, next) => {
  try {
    const groupId = req.params.groupId;
    
    // Verify membership
    const isMember = await GroupMember.findOne({ group: groupId, user: req.user._id });
    if (!isMember) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const group = await Group.findById(groupId);
    const expenses = await Expense.find({ group: groupId })
      .populate('createdBy', 'name email')
      .sort({ date: -1 });

    let csvContent = 'Date,Title,Category,Amount,Split Method,Created By\n';

    for (const exp of expenses) {
      const dateStr = exp.date.toISOString().split('T')[0];
      // Escape commas in title
      const titleEscaped = exp.title.replace(/"/g, '""');
      const categoryEscaped = exp.category.replace(/"/g, '""');
      
      csvContent += `"${dateStr}","${titleEscaped}","${categoryEscaped}",${exp.amount},"${exp.splitMethod}","${exp.createdBy.name}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=group_${group.name.replace(/\s+/g, '_')}_expenses.csv`);
    res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
};

exports.exportGroupExpensesHTML = async (req, res, next) => {
  try {
    const groupId = req.params.groupId;
    
    // Verify membership
    const isMember = await GroupMember.findOne({ group: groupId, user: req.user._id });
    if (!isMember) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const group = await Group.findById(groupId);
    const expenses = await Expense.find({ group: groupId }).populate('createdBy', 'name email').sort({ date: -1 });
    const balances = await balanceService.calculateBalances(groupId);
    const suggested = await balanceService.getSuggestedSettlements(groupId);

    // Generate a beautiful, print-ready HTML page
    let htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Expense Split Ledger - ${group.name}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; color: #1E293B; background-color: #FFFFFF; }
        h1 { color: #1E40AF; margin-bottom: 5px; }
        h2 { color: #0F172A; border-bottom: 2px solid #E2E8F0; padding-bottom: 8px; margin-top: 30px; }
        p.subtitle { color: #64748B; margin-top: 0; margin-bottom: 30px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #E2E8F0; }
        th { background-color: #F8FAFC; color: #475569; font-weight: 600; }
        tr:hover { background-color: #F1F5F9; }
        .amount { text-align: right; font-weight: 600; }
        .positive { color: #10B981; }
        .negative { color: #EF4444; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.85em; font-weight: 600; text-transform: uppercase; }
        .badge-equal { background-color: #DBEAFE; color: #1E40AF; }
        .badge-percentage { background-color: #FEE2E2; color: #991B1B; }
        .badge-shares { background-color: #FEF3C7; color: #92400E; }
        .badge-exact { background-color: #D1FAE5; color: #065F46; }
        .footer { margin-top: 50px; font-size: 0.85em; color: #94A3B8; text-align: center; }
        @media print {
            body { margin: 20px; }
            button { display: none; }
        }
    </style>
</head>
<body>
    <div style="display: flex; justify-content: space-between; align-items: center;">
        <h1>${group.name}</h1>
        <button onclick="window.print()" style="background-color: #2563EB; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600;">Print Report / Save PDF</button>
    </div>
    <p class="subtitle">Generated on ${new Date().toLocaleDateString()} | SplitWise Pro Ledger</p>

    <h2>Balances Summary</h2>
    <table>
        <thead>
            <tr>
                <th>Member</th>
                <th>Email</th>
                <th class="amount">Net Balance</th>
            </tr>
        </thead>
        <tbody>
    `;

    Object.values(balances).forEach(b => {
      const net = Math.round(b.balance * 100) / 100;
      const classStr = net >= 0 ? 'positive' : 'negative';
      const prefix = net >= 0 ? '+' : '';
      htmlContent += `
            <tr>
                <td><strong>${b.user.name}</strong></td>
                <td>${b.user.email}</td>
                <td class="amount ${classStr}">${prefix}₹${net.toFixed(2)}</td>
            </tr>
      `;
    });

    htmlContent += `
        </tbody>
    </table>

    <h2>Optimized suggested settlements</h2>
    `;

    if (suggested.length === 0) {
      htmlContent += `<p style="color: #10B981; font-weight: 600;">All debts are fully settled! No transactions required.</p>`;
    } else {
      htmlContent += `
    <table>
        <thead>
            <tr>
                <th>From (Who Pays)</th>
                <th></th>
                <th>To (Who Receives)</th>
                <th class="amount">Amount</th>
            </tr>
        </thead>
        <tbody>
      `;
      suggested.forEach(s => {
        htmlContent += `
            <tr>
                <td><strong>${s.fromUser.name}</strong></td>
                <td style="color: #64748B;">pays &rarr;</td>
                <td><strong>${s.toUser.name}</strong></td>
                <td class="amount" style="color: #1E40AF;">₹${s.amount.toFixed(2)}</td>
            </tr>
        `;
      });
      htmlContent += `
        </tbody>
    </table>
      `;
    }

    htmlContent += `
    <h2>Expense Log</h2>
    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Title</th>
                <th>Category</th>
                <th>Split Method</th>
                <th>Paid By</th>
                <th class="amount">Total Amount</th>
            </tr>
        </thead>
        <tbody>
    `;

    expenses.forEach(exp => {
      const dateStr = exp.date.toLocaleDateString();
      htmlContent += `
            <tr>
                <td>${dateStr}</td>
                <td><strong>${exp.title}</strong></td>
                <td>${exp.category}</td>
                <td><span class="badge badge-${exp.splitMethod}">${exp.splitMethod}</span></td>
                <td>${exp.createdBy.name}</td>
                <td class="amount">₹${exp.amount.toFixed(2)}</td>
            </tr>
      `;
    });

    htmlContent += `
        </tbody>
    </table>

    <div class="footer">
        Expense Split Ledger Report &copy; ${new Date().getFullYear()} SplitWise Pro. All rights reserved.
    </div>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(htmlContent);
  } catch (error) {
    next(error);
  }
};
