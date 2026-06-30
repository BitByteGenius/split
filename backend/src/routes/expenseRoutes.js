const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { protect, authorize, logAudit } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const { validateAddExpense, validateSearchExpenses, validateUpdateExpense } = require('../middleware/validators');
const upload = require('../middleware/upload');

router.use(protect);

router.post('/', upload.single('receipt'), validateAddExpense, logAudit('expense.create'), expenseController.addExpense);
router.get('/search', validateSearchExpenses, expenseController.searchExpenses);
router.get('/group/:groupId', expenseController.getExpenses);
router.get('/:id', expenseController.getExpenseDetails);
router.put('/:id', validateUpdateExpense, logAudit('expense.update'), expenseController.updateExpense);

// Deleting expense requires DELETE_EXPENSE (can be creator or group admin)
router.delete('/:id', authorize(PERMISSIONS.DELETE_EXPENSE), logAudit('expense.delete'), expenseController.deleteExpense);

module.exports = router;
