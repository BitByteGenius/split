const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { protect, logAudit } = require('../middleware/auth');
const { validateAiAssistant } = require('../middleware/validators');

router.use(protect);

router.post('/assistant', validateAiAssistant, logAudit('ai.assistant'), aiController.askAssistant);

module.exports = router;
