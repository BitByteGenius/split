const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/dashboard', analyticsController.getUserDashboardData);
router.get('/spending', analyticsController.getSpendingAnalytics);

module.exports = router;
