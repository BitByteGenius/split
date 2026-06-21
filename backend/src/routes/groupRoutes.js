const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const { protect, logAudit } = require('../middleware/auth');

router.use(protect);

router.post('/', logAudit('group.create'), groupController.createGroup);
router.get('/', groupController.getGroups);
router.get('/:id', groupController.getGroupDetails);
router.post('/:id/members', logAudit('group.add_member'), groupController.addMember);
router.delete('/:id/members/:userId', logAudit('group.remove_member'), groupController.removeMember);

module.exports = router;
