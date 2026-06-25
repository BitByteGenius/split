const express = require('express');
const router = express.Router();
const settlementController = require('../controllers/settlementController');
const { protect, authorize, logAudit } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const { validateCreateSettlement } = require('../middleware/validators');
const upload = require('../middleware/upload');

router.use(protect);

router.post('/', upload.single('receipt'), validateCreateSettlement, logAudit('settlement.create'), settlementController.createSettlement);
router.get('/group/:groupId', settlementController.getSettlements);

// Approve settlement requires APPROVE_SETTLEMENT (group admin)
router.put('/:id/approve', authorize(PERMISSIONS.APPROVE_SETTLEMENT), logAudit('settlement.approve'), settlementController.approveSettlement);

module.exports = router;
