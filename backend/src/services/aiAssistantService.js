const { createAiProvider } = require('./aiProvider');
const { createAiAgent } = require('./ai/agent');

const aiProvider = createAiProvider();
const INTERNAL_API_BASE_URL = process.env.INTERNAL_API_BASE_URL || `http://127.0.0.1:${process.env.PORT || 5000}`;

const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: token
});

const callInternalApi = async (method, path, token, body) => {
  const response = await fetch(`${INTERNAL_API_BASE_URL}/api${path}`, {
    method,
    headers: jsonHeaders(token),
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || 'Request failed');
    error.statusCode = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

const processAssistantMessage = async ({ token, userId, message, history = [], pendingAction, user }) => {
  if (!aiProvider.isConfigured) {
    return {
      success: true,
      reply: 'AI assistant is not configured yet. Add AI_API_KEY and AI_MODEL to backend/.env to enable it.',
      refreshDashboard: false
    };
  }

  try {
    const agent = createAiAgent({ aiProvider, callInternalApi, user });
    return agent.process({
      token,
      userId,
      message,
      history,
      memory: user?.aiMemory || {},
      context: {
        groups: {},
        dashboard: {},
        analytics: {}
      }
    });
  } catch (error) {
    return {
      success: true,
      reply: error.message || 'I hit an unexpected issue while processing your request.',
      refreshDashboard: false
    };
  }
};

module.exports = {
  processAssistantMessage
};
