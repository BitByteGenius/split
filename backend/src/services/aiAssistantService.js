const { createAiProvider } = require('./aiProvider');

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

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data?.message || 'Request failed');
    error.statusCode = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

const buildQueryString = (params) => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') {
      search.set(key, String(value));
    }
  });

  const query = search.toString();
  return query ? `?${query}` : '';
};

const formatCurrency = (amount) => `₹${Number(amount || 0).toFixed(2)}`;

const summarizeExpense = (expense) => {
  const groupName = expense.group?.name || 'Unknown group';
  const dateLabel = expense.date ? new Date(expense.date).toLocaleDateString('en-IN') : 'unknown date';
  return `${expense.title} in ${groupName} for ${formatCurrency(expense.amount)} on ${dateLabel}`;
};

const isAffirmative = (message) => /^(yes|y|confirm|go ahead|do it|delete it|update it|sure|okay|ok)\b/i.test(message.trim());
const isNegative = (message) => /^(no|n|cancel|stop|don't|do not)\b/i.test(message.trim());

const buildPlannerPrompt = (currentDateIso) => `
You are an expense assistant planner for a shared-expense app.
Return JSON only, with no markdown.
Today's date is ${currentDateIso}.

You must detect the user's intent and map it to one of:
- create_expense
- update_expense
- delete_expense
- search_expenses
- view_expense_details
- get_dashboard_summary
- get_statistics
- budget_analysis
- spending_prediction
- financial_advice
- general_question

Rules:
- Use only the user's own data context.
- If the user mentions relative dates like today, yesterday, this month, last month, last week, this year, convert them into ISO startDate and endDate.
- If a value is unknown, set it to null.
- Keep category short and lowercase when inferred.
- For "spent" or "add expense" requests, default the action to create_expense.
- If the user asks to compare periods, set analyticsType to "compare_periods".
- If the user asks about trends, prediction, savings, recurring expenses, daily average, monthly budget, or suggestions, map them to the closest supported intent above.

Return this shape exactly:
{
  "intent": "create_expense",
  "title": null,
  "amount": null,
  "category": null,
  "groupName": null,
  "expenseId": null,
  "matchText": null,
  "startDate": null,
  "endDate": null,
  "analyticsType": null,
  "newAmount": null,
  "newTitle": null,
  "newCategory": null,
  "notes": null,
  "date": null,
  "replyStyle": "short"
}
`;

const buildAnswerPrompt = (currentDateIso, userMessage, contextPayload) => `
You are a helpful AI assistant embedded inside an expense dashboard.
Today's date is ${currentDateIso}.
Answer using only the provided application data.
Be concise, clear, and action-oriented.
Do not invent facts.
If the data is missing for a requested metric, say so plainly.
Return JSON only in this exact shape:
{
  "reply": "text shown to the user",
  "refreshDashboard": false
}

User message:
${userMessage}

App data:
${JSON.stringify(contextPayload)}
`;

const chooseGroupForCreate = async (token, requestedGroupName) => {
  const groupsResponse = await callInternalApi('GET', '/groups', token);
  const groups = Array.isArray(groupsResponse.groups) ? groupsResponse.groups : [];

  if (groups.length === 0) {
    return { error: 'You are not part of any group yet, so I cannot add an expense.' };
  }

  if (requestedGroupName) {
    const normalizedTarget = requestedGroupName.trim().toLowerCase();
    const matched = groups.find((group) => group.name.toLowerCase().includes(normalizedTarget));
    if (matched) {
      return { group: matched };
    }
  }

  if (groups.length === 1) {
    return { group: groups[0] };
  }

  return {
    pendingAction: {
      type: 'select_group_for_create',
      groups: groups.map((group) => ({ id: group._id, name: group.name })),
      requestedGroupName
    },
    reply: `I found multiple groups. Which group should I use? ${groups.map((group, index) => `${index + 1}. ${group.name}`).join('  ')}`
  };
};

const resolvePendingGroupSelection = async (token, pendingAction, userMessage) => {
  const input = userMessage.trim().toLowerCase();
  const groups = Array.isArray(pendingAction.groups) ? pendingAction.groups : [];

  let matchedGroup = null;
  const numericIndex = Number.parseInt(input, 10);
  if (Number.isFinite(numericIndex) && numericIndex >= 1 && numericIndex <= groups.length) {
    matchedGroup = groups[numericIndex - 1];
  } else {
    matchedGroup = groups.find((group) => group.name.toLowerCase().includes(input));
  }

  if (!matchedGroup) {
    return {
      success: true,
      reply: 'I still could not match that to one of your groups. Reply with the group name or the number from the list.',
      pendingAction
    };
  }

  return executeCreateExpense(token, pendingAction.userId, pendingAction.createPayload, matchedGroup.id);
};

const searchExpenses = async (token, filters) => {
  const query = buildQueryString({
    title: filters.title,
    category: filters.category,
    startDate: filters.startDate,
    endDate: filters.endDate,
    amount: filters.amount,
    groupId: filters.groupId,
    limit: filters.limit || 10
  });

  const response = await callInternalApi('GET', `/expenses/search${query}`, token);
  return Array.isArray(response.expenses) ? response.expenses : [];
};

const executeCreateExpense = async (token, userId, plannedAction, forcedGroupId) => {
  const groupResolver = forcedGroupId ? { group: { _id: forcedGroupId } } : await chooseGroupForCreate(token, plannedAction.groupName);
  if (groupResolver.error) {
    return { success: true, reply: groupResolver.error, refreshDashboard: false };
  }
  if (groupResolver.pendingAction) {
    return {
      success: true,
      reply: groupResolver.reply,
      pendingAction: {
        ...groupResolver.pendingAction,
        createPayload: plannedAction,
        userId
      },
      refreshDashboard: false
    };
  }

  const groupId = forcedGroupId || groupResolver.group._id;
  const groupDetails = await callInternalApi('GET', `/groups/${groupId}`, token);
  const members = Array.isArray(groupDetails.members) ? groupDetails.members : [];
  const requester = members.find((member) => String(member.id) === String(userId)) || members[0];

  if (!members.length) {
    return { success: true, reply: 'I could not find group members for that group.', refreshDashboard: false };
  }

  const payload = {
    groupId,
    title: plannedAction.title || 'Untitled expense',
    amount: plannedAction.amount,
    category: plannedAction.category || 'general',
    date: plannedAction.date,
    notes: plannedAction.notes || '',
    splitMethod: 'equal',
    paidBy: requester.id,
    participants: members.map((member) => ({
      user: member.id,
      value: 0
    }))
  };

  const response = await callInternalApi('POST', '/expenses', token, payload);
  return {
    success: true,
    reply: `${response.message || 'Expense added successfully.'} I added ${formatCurrency(payload.amount)} for ${payload.title} in ${groupDetails.group.name}.`,
    refreshDashboard: true
  };
};

const executeDeleteExpense = async (token, expenseId) => {
  const response = await callInternalApi('DELETE', `/expenses/${expenseId}`, token);
  return {
    success: true,
    reply: response.message || 'Expense deleted successfully.',
    refreshDashboard: true
  };
};

const executeUpdateExpense = async (token, expenseId, updates) => {
  const response = await callInternalApi('PUT', `/expenses/${expenseId}`, token, updates);
  return {
    success: true,
    reply: response.message || 'Expense updated successfully.',
    refreshDashboard: true,
    expense: response.expense
  };
};

const buildAnalyticsContext = async (token, plannedAction) => {
  const [dashboard, statistics, filteredExpenses] = await Promise.all([
    callInternalApi('GET', '/analytics/dashboard', token),
    callInternalApi('GET', '/analytics/spending', token),
    searchExpenses(token, {
      startDate: plannedAction.startDate,
      endDate: plannedAction.endDate,
      category: plannedAction.category,
      limit: 50
    })
  ]);

  const totalForFilteredExpenses = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const now = plannedAction.endDate ? new Date(plannedAction.endDate) : new Date();
  const daysElapsed = Math.max(now.getDate(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyAverage = totalForFilteredExpenses / daysElapsed;
  const projectedMonthEnd = dailyAverage * daysInMonth;

  return {
    dashboard: dashboard.data,
    statistics: {
      categoryStats: statistics.categoryStats,
      monthlyStats: statistics.monthlyStats,
      groupStats: statistics.groupStats
    },
    filteredExpenses: filteredExpenses.map((expense) => ({
      id: expense.id,
      title: expense.title,
      amount: expense.amount,
      category: expense.category,
      date: expense.date,
      groupName: expense.group?.name
    })),
    computed: {
      filteredTotal: Number(totalForFilteredExpenses.toFixed(2)),
      dailyAverage: Number(dailyAverage.toFixed(2)),
      projectedMonthEnd: Number(projectedMonthEnd.toFixed(2)),
      hasBudget: false
    }
  };
};

const resolveExpenseMatch = async (token, plannedAction) => {
  const matches = await searchExpenses(token, {
    title: plannedAction.title || plannedAction.matchText,
    category: plannedAction.category,
    startDate: plannedAction.startDate,
    endDate: plannedAction.endDate,
    amount: plannedAction.amount,
    limit: 10
  });

  if (!matches.length) {
    return {
      success: true,
      reply: 'I could not find a matching expense in your account.',
      refreshDashboard: false
    };
  }

  if (matches.length > 1) {
    return {
      success: true,
      reply: `I found multiple matching expenses: ${matches.map((expense, index) => `${index + 1}. ${summarizeExpense(expense)}`).join('  ')} Reply with the title, amount, or date to clarify.`,
      pendingAction: {
        type: 'clarify_expense_match',
        action: plannedAction.intent,
        originalPlan: plannedAction
      },
      refreshDashboard: false
    };
  }

  return { match: matches[0] };
};

const handlePendingAction = async (token, userId, userMessage, pendingAction) => {
  if (!pendingAction || !pendingAction.type) {
    return null;
  }

  if (pendingAction.type === 'confirm_delete') {
    if (isAffirmative(userMessage)) {
      return executeDeleteExpense(token, pendingAction.expenseId);
    }
    if (isNegative(userMessage)) {
      return {
        success: true,
        reply: 'Okay, I did not delete anything.',
        refreshDashboard: false
      };
    }
    return {
      success: true,
      reply: `Please reply yes to delete ${pendingAction.summary}, or no to cancel.`,
      pendingAction,
      refreshDashboard: false
    };
  }

  if (pendingAction.type === 'select_group_for_create') {
    return resolvePendingGroupSelection(token, pendingAction, userMessage);
  }

  if (pendingAction.type === 'clarify_expense_match') {
    const originalPlan = pendingAction.originalPlan || {};
    const mergedPlan = {
      ...originalPlan,
      title: [originalPlan.title, userMessage].filter(Boolean).join(' ').trim() || null,
      matchText: [originalPlan.matchText, userMessage].filter(Boolean).join(' ').trim() || null
    };
    return handlePlannedAction(token, userId, mergedPlan, userMessage, new Date().toISOString());
  }

  return null;
};

const planAction = async (message, history, currentDateIso) => {
  const plannerMessages = [
    ...history.slice(-8).map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: item.content
    })),
    { role: 'user', content: message }
  ];

  return aiProvider.createJsonResponse({
    systemPrompt: buildPlannerPrompt(currentDateIso),
    messages: plannerMessages
  });
};

const answerFromContext = async (currentDateIso, userMessage, contextPayload, refreshDashboard = false) => {
  const answer = await aiProvider.createJsonResponse({
    systemPrompt: buildAnswerPrompt(currentDateIso, userMessage, contextPayload),
    messages: [{ role: 'user', content: userMessage }]
  });

  return {
    success: true,
    reply: answer.reply || 'I could not generate a response from the available data.',
    refreshDashboard: Boolean(answer.refreshDashboard || refreshDashboard)
  };
};

const fallbackAssistantReply = async (token, plannedAction, userMessage, currentDateIso) => {
  if (plannedAction.intent === 'get_dashboard_summary') {
    const dashboard = await callInternalApi('GET', '/analytics/dashboard', token);
    return answerFromContext(currentDateIso, userMessage, { dashboard: dashboard.data });
  }

  if ([
    'get_statistics',
    'budget_analysis',
    'spending_prediction',
    'financial_advice'
  ].includes(plannedAction.intent)) {
    const contextPayload = await buildAnalyticsContext(token, plannedAction);
    return answerFromContext(currentDateIso, userMessage, contextPayload);
  }

  if (plannedAction.intent === 'search_expenses') {
    const matches = await searchExpenses(token, {
      title: plannedAction.title || plannedAction.matchText,
      category: plannedAction.category,
      startDate: plannedAction.startDate,
      endDate: plannedAction.endDate,
      amount: plannedAction.amount,
      limit: 10
    });

    if (!matches.length) {
      return {
        success: true,
        reply: 'I could not find any matching expenses.',
        refreshDashboard: false
      };
    }

    return {
      success: true,
      reply: `Here are the closest matches: ${matches.map((expense, index) => `${index + 1}. ${summarizeExpense(expense)}`).join('  ')}`,
      refreshDashboard: false
    };
  }

  if (plannedAction.intent === 'view_expense_details') {
    const resolved = await resolveExpenseMatch(token, plannedAction);
    if (!resolved.match) {
      return resolved;
    }

    const details = await callInternalApi('GET', `/expenses/${resolved.match.id}`, token);
    const expense = details.expense;

    return {
      success: true,
      reply: `${summarizeExpense(expense)}. Split method: ${expense.splitMethod}. ${expense.notes ? `Notes: ${expense.notes}` : 'No notes added.'}`,
      refreshDashboard: false
    };
  }

  return {
    success: true,
    reply: 'I can help with expenses, analytics, and spending questions. Try asking about a recent expense, this month’s total, or adding a new expense.',
    refreshDashboard: false
  };
};

const handlePlannedAction = async (token, userId, plannedAction, userMessage, currentDateIso) => {
  if (plannedAction.intent === 'create_expense') {
    if (!plannedAction.amount || !plannedAction.title) {
      return {
        success: true,
        reply: 'I need at least the expense title and amount to add it.',
        refreshDashboard: false
      };
    }

    return executeCreateExpense(token, userId, plannedAction);
  }

  if (plannedAction.intent === 'delete_expense') {
    const resolved = await resolveExpenseMatch(token, plannedAction);
    if (!resolved.match) {
      return resolved;
    }

    return {
      success: true,
      reply: `I found ${summarizeExpense(resolved.match)}. Reply yes to confirm deletion.`,
      pendingAction: {
        type: 'confirm_delete',
        expenseId: resolved.match.id,
        summary: summarizeExpense(resolved.match)
      },
      refreshDashboard: false
    };
  }

  if (plannedAction.intent === 'update_expense') {
    const resolved = await resolveExpenseMatch(token, plannedAction);
    if (!resolved.match) {
      return resolved;
    }

    const updates = {};
    if (plannedAction.newAmount != null) {
      updates.amount = plannedAction.newAmount;
    }
    if (plannedAction.newTitle) {
      updates.title = plannedAction.newTitle;
    }
    if (plannedAction.newCategory) {
      updates.category = plannedAction.newCategory;
    }
    if (plannedAction.notes != null) {
      updates.notes = plannedAction.notes;
    }
    if (plannedAction.date) {
      updates.date = plannedAction.date;
    }

    if (!Object.keys(updates).length) {
      return {
        success: true,
        reply: 'I found the expense, but I still need the new value to update.',
        refreshDashboard: false
      };
    }

    return executeUpdateExpense(token, resolved.match.id, updates);
  }

  return fallbackAssistantReply(token, plannedAction, userMessage, currentDateIso);
};

const processAssistantMessage = async ({ token, userId, message, history = [], pendingAction }) => {
  if (!aiProvider.isConfigured) {
    return {
      success: true,
      reply: 'AI assistant is not configured yet. Add AI_API_KEY and AI_MODEL to backend/.env to enable it.',
      refreshDashboard: false
    };
  }

  const currentDateIso = new Date().toISOString();
  const pendingResolution = await handlePendingAction(token, userId, message, pendingAction);
  if (pendingResolution) {
    return pendingResolution;
  }

  const plannedAction = await planAction(message, history, currentDateIso);
  return handlePlannedAction(token, userId, plannedAction, message, currentDateIso);
};

module.exports = {
  processAssistantMessage
};
