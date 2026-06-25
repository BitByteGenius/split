const User = require('../models/User');
const Group = require('../models/Group');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const AuditLog = require('../models/AuditLog');
const mongoose = require('mongoose');
const os = require('os');

exports.getUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await User.countDocuments();
    const users = await User.find()
      .select('-passwordHash')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      users
    });
  } catch (error) {
    next(error);
  }
};

exports.disableUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isDisabled = true;
    user.sessions = []; // Revoke active sessions instantly
    await user.save();

    res.status(200).json({ success: true, message: 'User account disabled and sessions revoked successfully.' });
  } catch (error) {
    next(error);
  }
};

exports.enableUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isDisabled = false;
    await user.save();

    res.status(200).json({ success: true, message: 'User account enabled successfully.' });
  } catch (error) {
    next(error);
  }
};

exports.forceLogoutUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.sessions = [];
    await user.save();

    res.status(200).json({ success: true, message: 'User sessions cleared successfully. Force logged out.' });
  } catch (error) {
    next(error);
  }
};

exports.getGroups = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await Group.countDocuments();
    const groups = await Group.find()
      .populate('createdBy', 'name email')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      groups
    });
  } catch (error) {
    next(error);
  }
};

exports.getExpenses = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await Expense.countDocuments();
    const expenses = await Expense.find()
      .populate('group', 'name')
      .populate('paidBy', 'name email')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      expenses
    });
  } catch (error) {
    next(error);
  }
};

exports.getSettlements = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await Settlement.countDocuments();
    const settlements = await Settlement.find()
      .populate('group', 'name')
      .populate('payer', 'name email')
      .populate('payee', 'name email')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      settlements
    });
  } catch (error) {
    next(error);
  }
};

exports.getAuditLogs = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.action) {
      query.action = new RegExp(req.query.action, 'i');
    }

    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .populate('user', 'name email')
      .skip(skip)
      .limit(limit)
      .sort({ timestamp: -1 });

    res.status(200).json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      logs
    });
  } catch (error) {
    next(error);
  }
};

exports.getSystemHealth = async (req, res, next) => {
  try {
    const dbState = mongoose.connection.readyState;
    let dbStatus = 'disconnected';
    if (dbState === 1) dbStatus = 'connected';
    else if (dbState === 2) dbStatus = 'connecting';
    else if (dbState === 3) dbStatus = 'disconnecting';

    const health = {
      status: 'OK',
      timestamp: new Date(),
      uptime: process.uptime(),
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        cpuCores: os.cpus().length,
        freeMemory: os.freemem(),
        totalMemory: os.totalmem(),
        memoryUsage: process.memoryUsage()
      },
      services: {
        database: {
          status: dbStatus,
          name: 'MongoDB'
        },
        cache: {
          status: process.env.USE_REDIS === 'false' ? 'in-memory-fallback' : 'connected',
          name: 'Redis'
        }
      }
    };

    if (dbState !== 1) {
      health.status = 'DEGRADED';
    }

    res.status(200).json({
      success: true,
      health
    });
  } catch (error) {
    next(error);
  }
};

exports.getSecurityDashboard = async (req, res, next) => {
  try {
    const failedLogins = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$failedLoginAttempts' } } }
    ]);
    const failedLoginAttemptsCount = failedLogins.length > 0 ? failedLogins[0].total : 0;

    const lockedAccountsCount = await User.countDocuments({
      lockUntil: { $gt: new Date() }
    });

    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    const otpAbuseCount = await User.countDocuments({
      otpRequestCount: { $gte: 3 },
      otpRequestWindowStart: { $gt: oneHourAgo }
    });

    const tokenReuseCount = await AuditLog.countDocuments({
      action: 'SECURITY_EVENT_TOKEN_REUSE'
    });

    const recentSecurityEvents = await AuditLog.find({
      action: { $in: ['ACCOUNT_LOCKOUT', 'SECURITY_EVENT_TOKEN_REUSE', 'auth.login_failed', 'auth.password_reset'] }
    })
      .populate('user', 'name email')
      .sort({ timestamp: -1 })
      .limit(10);

    res.status(200).json({
      success: true,
      metrics: {
        failedLoginAttempts: failedLoginAttemptsCount,
        lockedAccounts: lockedAccountsCount,
        otpAbuse: otpAbuseCount,
        tokenReuse: tokenReuseCount
      },
      recentEvents: recentSecurityEvents
    });
  } catch (error) {
    next(error);
  }
};
