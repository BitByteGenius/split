const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const User = require('../models/User');
const balanceService = require('../services/balanceService');
const { sendEmail } = require('../config/mailer');
const logger = require('../utils/logger');

exports.createGroup = async (req, res, next) => {
  try {
    const { name, description, category, avatar } = req.body;

    const group = new Group({
      name,
      description,
      category,
      avatar,
      createdBy: req.user._id
    });

    await group.save();

    // Creator is automatically added as admin
    const member = new GroupMember({
      group: group._id,
      user: req.user._id,
      role: 'admin'
    });

    await member.save();

    res.status(201).json({
      success: true,
      message: 'Group created successfully',
      group
    });
  } catch (error) {
    next(error);
  }
};

exports.getGroups = async (req, res, next) => {
  try {
    // Find all memberships of the user
    const memberships = await GroupMember.find({ user: req.user._id }).populate('group');
    const groups = memberships.map(m => m.group).filter(g => g !== null);

    res.status(200).json({
      success: true,
      count: groups.length,
      groups
    });
  } catch (error) {
    next(error);
  }
};

exports.getGroupDetails = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    // Verify requesting user is a member of the group
    const isMember = await GroupMember.findOne({ group: group._id, user: req.user._id });
    if (!isMember) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this group' });
    }

    const members = await GroupMember.find({ group: group._id }).populate('user', 'name email profilePicture');
    const balances = await balanceService.calculateBalances(group._id);
    const settlements = await balanceService.getSuggestedSettlements(group._id);

    res.status(200).json({
      success: true,
      group,
      role: isMember.role,
      members: members.map(m => ({
        id: m.user._id,
        name: m.user.name,
        email: m.user.email,
        profilePicture: m.user.profilePicture,
        role: m.role,
        joinedAt: m.joinedAt
      })),
      balances: Object.values(balances),
      suggestedSettlements: settlements
    });
  } catch (error) {
    next(error);
  }
};

exports.addMember = async (req, res, next) => {
  try {
    const { email, role } = req.body;
    const groupId = req.params.id;

    // Check group exists
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    // Verify current user is admin of the group to add members
    const requester = await GroupMember.findOne({ group: groupId, user: req.user._id });
    if (!requester || requester.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only group admins can add members' });
    }

    // Find user by email
    let user = await User.findOne({ email });
    let isNewUserInvited = false;

    if (!user) {
      // User doesn't exist yet, we send email invitation and can optionally create a placeholder account
      isNewUserInvited = true;
      
      // Send invite email
      try {
        await sendEmail({
          to: email,
          subject: `Join Group "${group.name}" on SplitWise Pro`,
          text: `You have been invited by ${req.user.name} to join the group "${group.name}" on SplitWise Pro. Register today at our app!`,
          html: `<p>You have been invited by <strong>${req.user.name}</strong> to join the group <strong>"${group.name}"</strong> on SplitWise Pro.</p><p>Download our app or register online to begin splitting expenses!</p>`
        });
      } catch (mailErr) {
        logger.error('Failed to send group invite email: ', mailErr);
      }

      // Return a status indicating invitation sent
      return res.status(200).json({
        success: true,
        message: 'User does not exist in SplitWise Pro. An invitation email has been sent.'
      });
    }

    // Check if user is already a member
    const existingMember = await GroupMember.findOne({ group: groupId, user: user._id });
    if (existingMember) {
      return res.status(400).json({ success: false, message: 'User is already a member of this group' });
    }

    const member = new GroupMember({
      group: groupId,
      user: user._id,
      role: role || 'member'
    });

    await member.save();

    res.status(201).json({
      success: true,
      message: 'Member added successfully',
      member: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: member.role
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.removeMember = async (req, res, next) => {
  try {
    const groupId = req.params.id;
    const userIdToRemove = req.params.userId;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    // Requester must be group admin, or the user themselves trying to leave
    const requester = await GroupMember.findOne({ group: groupId, user: req.user._id });
    if (!requester) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const isSelfLeaving = req.user._id.toString() === userIdToRemove;
    if (!isSelfLeaving && requester.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only group admins can remove members' });
    }

    // Verify member exists in group
    const member = await GroupMember.findOne({ group: groupId, user: userIdToRemove });
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found in this group' });
    }

    // Verify balance is completely settled (i.e. balance is 0)
    const balances = await balanceService.calculateBalances(groupId);
    const userBalance = balances[userIdToRemove];
    if (userBalance && Math.abs(userBalance.balance) > 0.01) {
      return res.status(400).json({
        success: false,
        message: `Cannot remove member. User has an outstanding balance of ${userBalance.balance}`
      });
    }

    await GroupMember.deleteOne({ _id: member._id });

    res.status(200).json({
      success: true,
      message: isSelfLeaving ? 'Left group successfully' : 'Member removed successfully'
    });
  } catch (error) {
    next(error);
  }
};
