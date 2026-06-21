const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, admin } = require('../middleware/auth');

router.use(protect, admin);

router.get('/users', adminController.getUsers);
router.get('/groups', adminController.getGroups);
router.get('/logs', adminController.getAuditLogs);
router.get('/health', adminController.getSystemHealth);

module.exports = router;
