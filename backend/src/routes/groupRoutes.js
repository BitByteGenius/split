const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const { protect, authorize, logAudit } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const { validateCreateGroup, validateAddMember } = require('../middleware/validators');

router.use(protect);

router.post('/', validateCreateGroup, logAudit('group.create'), groupController.createGroup);
router.get('/', groupController.getGroups);
router.get('/:id', groupController.getGroupDetails);

// Group administration routes guarded by group member permissions
router.post('/:id/members', authorize(PERMISSIONS.ADD_MEMBER), validateAddMember, logAudit('group.add_member'), groupController.addMember);
router.delete('/:id/members/:userId', authorize(PERMISSIONS.REMOVE_MEMBER), logAudit('group.remove_member'), groupController.removeMember);

module.exports = router;
