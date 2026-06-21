const express = require('express');
const router = express.Router();
const settlementController = require('../controllers/settlementController');
const { protect, logAudit } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(protect);

router.post('/', upload.single('receipt'), logAudit('settlement.create'), settlementController.createSettlement);
router.get('/group/:groupId', settlementController.getSettlements);
router.put('/:id/approve', logAudit('settlement.approve'), settlementController.approveSettlement);

module.exports = router;
