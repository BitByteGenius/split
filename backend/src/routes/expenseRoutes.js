const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { protect, logAudit } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(protect);

router.post('/', upload.single('receipt'), logAudit('expense.create'), expenseController.addExpense);
router.get('/group/:groupId', expenseController.getExpenses);
router.delete('/:id', logAudit('expense.delete'), expenseController.deleteExpense);

module.exports = router;
