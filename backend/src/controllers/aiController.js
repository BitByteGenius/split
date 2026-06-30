const { processAssistantMessage } = require('../services/aiAssistantService');

exports.askAssistant = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const { message, history, pendingAction } = req.body;

    const result = await processAssistantMessage({
      token: authHeader,
      userId: req.user._id,
      message,
      history,
      pendingAction
    });

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};
