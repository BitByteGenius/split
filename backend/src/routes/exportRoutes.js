const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/group/:groupId/csv', exportController.exportGroupExpensesCSV);
router.get('/group/:groupId/pdf', exportController.exportGroupExpensesHTML);

module.exports = router;
