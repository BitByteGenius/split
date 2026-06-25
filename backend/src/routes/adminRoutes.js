const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, admin, logAudit } = require('../middleware/auth');

// Require admin authentication for all admin routes
router.use(protect, admin);

// User Management
router.get('/users', adminController.getUsers);
router.post('/users/:id/disable', logAudit('admin.disable_user'), adminController.disableUser);
router.post('/users/:id/enable', logAudit('admin.enable_user'), adminController.enableUser);
router.post('/users/:id/logout', logAudit('admin.force_logout_user'), adminController.forceLogoutUser);

// Group & Expense Management
router.get('/groups', adminController.getGroups);
router.get('/expenses', adminController.getExpenses);
router.get('/settlements', adminController.getSettlements);

// Monitoring & Logs
router.get('/logs', adminController.getAuditLogs);
router.get('/health', adminController.getSystemHealth);
router.get('/security/dashboard', adminController.getSecurityDashboard);

module.exports = router;
