const buildContext = async ({ token, user, groups, dashboard, analytics, memory = {}, callInternalApi }) => {
    const [groupResponse, dashboardResponse, analyticsResponse] = await Promise.all([
        callInternalApi ? callInternalApi('GET', '/groups', token).catch(() => ({ groups: [] })) : Promise.resolve({ groups: [] }),
        callInternalApi ? callInternalApi('GET', '/analytics/dashboard', token).catch(() => ({ data: {} })) : Promise.resolve({ data: {} }),
        callInternalApi ? callInternalApi('GET', '/analytics/spending', token).catch(() => ({})) : Promise.resolve({})
    ]);

    const recentExpenses = Array.isArray(groups?.recentExpenses) ? groups.recentExpenses : [];
    return {
        user: user ? {
            id: user._id?.toString?.() || user.id,
            name: user.name,
            email: user.email,
            role: user.role
        } : null,
        groups: Array.isArray(groupResponse?.groups) ? groupResponse.groups : [],
        recentExpenses,
        dashboard: dashboardResponse?.data || dashboard || {},
        analytics: analyticsResponse || analytics || {},
        memory: {
            lastExpenseId: memory.lastExpenseId || null,
            lastExpense: memory.lastExpense || null,
            lastGroup: memory.lastGroup || null,
            pendingConfirmation: memory.pendingConfirmation || null
        },
        currentDate: new Date().toISOString()
    };
};

module.exports = {
    buildContext
};
