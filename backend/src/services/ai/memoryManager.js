const DEFAULT_MEMORY = {
    lastExpenseId: null,
    lastExpense: null,
    lastGroup: null,
    lastDashboard: null,
    lastSearchResult: null,
    pendingConfirmation: null,
    recentToolOutputs: [],
    conversationHistory: []
};

const normalizeMemory = (memory = {}) => {
    const normalized = {
        ...DEFAULT_MEMORY,
        ...(memory || {})
    };

    normalized.recentToolOutputs = Array.isArray(memory?.recentToolOutputs) ? memory.recentToolOutputs.slice(-8) : [];
    normalized.conversationHistory = Array.isArray(memory?.conversationHistory) ? memory.conversationHistory.slice(-20) : [];

    return normalized;
};

const isAffirmative = (message = '') => /^(yes|y|confirm|go ahead|do it|delete it|update it|sure|okay|ok|approve|accepted|proceed)\b/i.test(message.trim());
const isNegative = (message = '') => /^(no|n|cancel|stop|don't|do not|reject|skip)\b/i.test(message.trim());

const resolveReference = ({ message = '', memory = {} }) => {
    const normalized = normalizeMemory(memory);
    const text = message.trim().toLowerCase();

    if (!text) {
        return null;
    }

    if ((/(same group|use the same group|this group|that group)/.test(text) || /use same group/.test(text)) && normalized.lastGroup?.id) {
        return { targetType: 'group', targetId: normalized.lastGroup.id, reason: 'last group' };
    }

    if ((/(same category|this category|that category)/.test(text)) && normalized.lastExpense?.category) {
        return { targetType: 'category', value: normalized.lastExpense.category, reason: 'last category' };
    }

    if ((/(that expense|this expense|the expense|it|delete it|update it|change it)/.test(text) || /^(delete|update|edit|remove)$/i.test(message.trim())) && normalized.lastExpenseId) {
        return { targetType: 'expense', targetId: normalized.lastExpenseId, reason: 'last expense' };
    }

    if (/(that group|this group)/.test(text) && normalized.lastGroup?.id) {
        return { targetType: 'group', targetId: normalized.lastGroup.id, reason: 'last group' };
    }

    return null;
};

const applyReference = (args = {}, reference) => {
    if (!reference) {
        return args;
    }

    const nextArgs = { ...args };
    if (reference.targetType === 'expense' && !nextArgs.expenseId && !nextArgs.id) {
        nextArgs.expenseId = reference.targetId;
    }
    if (reference.targetType === 'group' && !nextArgs.groupId && !nextArgs.groupName) {
        nextArgs.groupId = reference.targetId;
    }
    if (reference.targetType === 'category' && !nextArgs.category) {
        nextArgs.category = reference.value;
    }
    return nextArgs;
};

const addConversationTurn = (memory = {}, role, content) => {
    const normalized = normalizeMemory(memory);
    normalized.conversationHistory = [
        ...normalized.conversationHistory,
        { role, content: String(content || '') }
    ].slice(-20);
    return normalized;
};

const recordToolResult = (memory = {}, toolName, result = {}) => {
    const normalized = normalizeMemory(memory);
    normalized.recentToolOutputs = [
        ...normalized.recentToolOutputs,
        {
            tool: toolName,
            message: result.message || '',
            timestamp: new Date().toISOString(),
            data: result.data || null
        }
    ].slice(-8);

    if (result.expense) {
        normalized.lastExpenseId = result.expense.id || result.expense._id || normalized.lastExpenseId;
        normalized.lastExpense = result.expense;
    }

    if (result.group) {
        normalized.lastGroup = {
            id: result.group.id || result.group._id,
            name: result.group.name
        };
    }

    if (result.dashboard) {
        normalized.lastDashboard = result.dashboard;
    }

    if (result.searchResults) {
        normalized.lastSearchResult = result.searchResults;
    }

    return normalized;
};

const createPendingConfirmation = (memory = {}, pendingConfirmation) => {
    const normalized = normalizeMemory(memory);
    normalized.pendingConfirmation = pendingConfirmation;
    return normalized;
};

const clearPendingConfirmation = (memory = {}) => {
    const normalized = normalizeMemory(memory);
    normalized.pendingConfirmation = null;
    return normalized;
};

const persistMemory = async (user, memory) => {
    if (!user) {
        return null;
    }

    const normalized = normalizeMemory(memory);
    user.aiMemory = normalized;
    await user.save({ validateBeforeSave: false });
    return normalized;
};

module.exports = {
    DEFAULT_MEMORY,
    normalizeMemory,
    resolveReference,
    applyReference,
    addConversationTurn,
    recordToolResult,
    createPendingConfirmation,
    clearPendingConfirmation,
    persistMemory,
    isAffirmative,
    isNegative
};
