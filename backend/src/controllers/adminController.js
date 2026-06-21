const User = require('../models/User');
const Group = require('../models/Group');
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
      .select('-passwordHash -refreshToken')
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
