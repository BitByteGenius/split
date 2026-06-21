const Settlement = require('../models/Settlement');
const GroupMember = require('../models/GroupMember');
const User = require('../models/User');
const { uploadFile } = require('../services/uploadService');
const logger = require('../utils/logger');

exports.createSettlement = async (req, res, next) => {
  try {
    const { groupId, toUserId, amount, transactionRef } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid settlement amount' });
    }

    // Verify both from (requester) and to users are members of the group
    const fromMember = await GroupMember.findOne({ group: groupId, user: req.user._id });
    const toMember = await GroupMember.findOne({ group: groupId, user: toUserId });

    if (!fromMember || !toMember) {
      return res.status(403).json({ success: false, message: 'Both users must be members of the group' });
    }

    let receiptUrl = '';
    if (req.file) {
      receiptUrl = await uploadFile(req.file);
    }

    const settlement = new Settlement({
      group: groupId,
      fromUser: req.user._id,
      toUser: toUserId,
      amount: parsedAmount,
      transactionRef,
      receiptUrl,
      status: 'completed' // Direct completed settlement by default
    });

    await settlement.save();

    res.status(201).json({
      success: true,
      message: 'Settlement recorded successfully',
      settlement
    });
  } catch (error) {
    next(error);
  }
};

exports.getSettlements = async (req, res, next) => {
  try {
    const groupId = req.params.groupId;

    // Verify membership
    const isMember = await GroupMember.findOne({ group: groupId, user: req.user._id });
    if (!isMember) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const settlements = await Settlement.find({ group: groupId })
      .populate('fromUser', 'name email profilePicture')
      .populate('toUser', 'name email profilePicture')
      .sort({ date: -1 });

    res.status(200).json({
      success: true,
      count: settlements.length,
      settlements
    });
  } catch (error) {
    next(error);
  }
};

exports.approveSettlement = async (req, res, next) => {
  try {
    const settlementId = req.params.id;
    const settlement = await Settlement.findById(settlementId);
    
    if (!settlement) {
      return res.status(404).json({ success: false, message: 'Settlement not found' });
    }

    // Only the receiving user or a group admin can mark it as approved/settled (if it was pending)
    const toUser = settlement.toUser.toString();
    const isReceiver = req.user._id.toString() === toUser;
    
    const member = await GroupMember.findOne({ group: settlement.group, user: req.user._id });
    const isAdmin = member && member.role === 'admin';

    if (!isReceiver && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to approve this settlement' });
    }

    settlement.status = 'completed';
    await settlement.save();

    res.status(200).json({
      success: true,
      message: 'Settlement marked as completed',
      settlement
    });
  } catch (error) {
    next(error);
  }
};
