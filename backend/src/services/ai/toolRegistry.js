const createToolRegistry = ({ callInternalApi }) => {
    const getGroupDetails = async (token, groupId) => {
        if (!groupId) {
            return null;
        }

        try {
            return await callInternalApi('GET', `/groups/${groupId}`, token);
        } catch (error) {
            return null;
        }
    };

    const tools = {
        create_expense: async ({ token, userId, args = {} }) => {
            const groupId = args.groupId || args.groupName || null;
            if (!groupId) {
                return {
                    success: false,
                    message: 'I need a group for the expense before I can create it.',
                    requiresConfirmation: false,
                    refreshDashboard: false
                };
            }

            const groupDetails = await getGroupDetails(token, groupId);
            const members = Array.isArray(groupDetails?.members) ? groupDetails.members : [];
            const requester = members.find((member) => String(member.id) === String(userId)) || members[0];

            if (!members.length) {
                return {
                    success: false,
                    message: 'I could not find the group members needed to create that expense.',
                    requiresConfirmation: false,
                    refreshDashboard: false
                };
            }

            const payload = {
                groupId,
                title: args.title || 'Untitled expense',
                amount: Number(args.amount),
                category: args.category || 'general',
                date: args.date || new Date().toISOString(),
                notes: args.notes || '',
                splitMethod: 'equal',
                paidBy: requester?.id || userId,
                participants: members.map((member) => ({ user: member.id, value: 0 }))
            };

            const response = await callInternalApi('POST', '/expenses', token, payload);
            return {
                success: true,
                message: response.message || 'Expense added successfully.',
                data: response.expense,
                expense: response.expense,
                group: groupDetails?.group || null,
                refreshDashboard: true
            };
        },

        update_expense: async ({ token, args = {} }) => {
            const expenseId = args.expenseId || args.id;
            if (!expenseId) {
                return {
                    success: false,
                    message: 'I need the expense to update.',
                    requiresConfirmation: false,
                    refreshDashboard: false
                };
            }

            const updates = {};
            if (args.amount != null) updates.amount = Number(args.amount);
            if (args.title) updates.title = args.title;
            if (args.category) updates.category = args.category;
            if (args.notes != null) updates.notes = args.notes;
            if (args.date) updates.date = args.date;

            if (!Object.keys(updates).length) {
                return {
                    success: false,
                    message: 'I did not receive enough information to update that expense.',
                    requiresConfirmation: false,
                    refreshDashboard: false
                };
            }

            const response = await callInternalApi('PUT', `/expenses/${expenseId}`, token, updates);
            return {
                success: true,
                message: response.message || 'Expense updated successfully.',
                data: response.expense,
                expense: response.expense,
                refreshDashboard: true
            };
        },

        delete_expense: async ({ token, args = {} }) => {
            const expenseId = args.expenseId || args.id;
            if (!expenseId) {
                return {
                    success: false,
                    message: 'I need the expense to delete.',
                    requiresConfirmation: false,
                    refreshDashboard: false
                };
            }

            const response = await callInternalApi('DELETE', `/expenses/${expenseId}`, token);
            return {
                success: true,
                message: response.message || 'Expense deleted successfully.',
                refreshDashboard: true
            };
        },

        search_expenses: async ({ token, args = {} }) => {
            const searchParams = {
                title: args.title || args.matchText || null,
                category: args.category || null,
                startDate: args.startDate || null,
                endDate: args.endDate || null,
                amount: args.amount || null,
                groupId: args.groupId || null,
                limit: args.limit || 10
            };

            const query = new URLSearchParams(Object.entries(searchParams).filter(([, value]) => value != null && value !== '')).toString();
            const response = await callInternalApi('GET', `/expenses/search${query ? `?${query}` : ''}`, token);
            const expenses = Array.isArray(response.expenses) ? response.expenses : [];
            return {
                success: true,
                message: expenses.length ? 'I found matching expenses.' : 'I did not find matching expenses.',
                data: expenses,
                searchResults: expenses,
                refreshDashboard: false
            };
        },

        get_expense_details: async ({ token, args = {} }) => {
            const expenseId = args.expenseId || args.id;
            if (!expenseId) {
                return {
                    success: false,
                    message: 'I need the expense identifier.',
                    requiresConfirmation: false,
                    refreshDashboard: false
                };
            }

            const response = await callInternalApi('GET', `/expenses/${expenseId}`, token);
            return {
                success: true,
                message: 'Here is the expense details.',
                data: response.expense,
                expense: response.expense,
                refreshDashboard: false
            };
        },

        create_group: async ({ token, args = {} }) => {
            const response = await callInternalApi('POST', '/groups', token, {
                name: args.name,
                description: args.description || '',
                category: args.category || 'general',
                avatar: args.avatar || ''
            });
            return {
                success: true,
                message: response.message || 'Group created successfully.',
                data: response.group,
                group: response.group,
                refreshDashboard: true
            };
        },

        add_group_member: async ({ token, args = {} }) => {
            const response = await callInternalApi('POST', `/groups/${args.groupId}/members`, token, {
                email: args.email,
                role: args.role || 'member'
            });
            return {
                success: true,
                message: response.message || 'Member added successfully.',
                refreshDashboard: true
            };
        },

        remove_group_member: async ({ token, args = {} }) => {
            const response = await callInternalApi('DELETE', `/groups/${args.groupId}/members/${args.userId}`, token);
            return {
                success: true,
                message: response.message || 'Member removed successfully.',
                refreshDashboard: true
            };
        },

        create_settlement: async ({ token, args = {} }) => {
            const response = await callInternalApi('POST', '/settlements', token, {
                groupId: args.groupId,
                toUserId: args.toUserId,
                amount: Number(args.amount),
                transactionRef: args.transactionRef || ''
            });
            return {
                success: true,
                message: response.message || 'Settlement recorded successfully.',
                data: response.settlement,
                refreshDashboard: true
            };
        },

        approve_settlement: async ({ token, args = {} }) => {
            const response = await callInternalApi('PUT', `/settlements/${args.settlementId}/approve`, token);
            return {
                success: true,
                message: response.message || 'Settlement approved successfully.',
                refreshDashboard: true
            };
        },

        dashboard_summary: async ({ token }) => {
            const response = await callInternalApi('GET', '/analytics/dashboard', token);
            return {
                success: true,
                message: 'Here is your dashboard summary.',
                data: response.data,
                dashboard: response.data,
                refreshDashboard: false
            };
        },

        analytics: async ({ token, args = {} }) => {
            const response = await callInternalApi('GET', '/analytics/spending', token);
            return {
                success: true,
                message: 'Here is your spending analytics.',
                data: response,
                refreshDashboard: false
            };
        },

        spending_prediction: async ({ token, args = {} }) => {
            const analyticsResponse = await callInternalApi('GET', '/analytics/spending', token);
            const monthlyStats = Array.isArray(analyticsResponse.monthlyStats) ? analyticsResponse.monthlyStats : [];
            const latestMonth = monthlyStats[monthlyStats.length - 1] || { totalSpent: 0 };
            const projected = Number(latestMonth.totalSpent || 0) * 1.1;
            return {
                success: true,
                message: `Projected month-end spend is about ₹${projected.toFixed(2)}.`,
                data: { projectedMonthEnd: projected },
                refreshDashboard: false
            };
        },

        financial_advice: async ({ token }) => {
            const analyticsResponse = await callInternalApi('GET', '/analytics/spending', token);
            const categoryStats = Array.isArray(analyticsResponse.categoryStats) ? analyticsResponse.categoryStats : [];
            const biggestCategory = categoryStats[0] || null;
            const advice = biggestCategory
                ? `Your largest category is ${biggestCategory.category || 'general'} at ₹${Number(biggestCategory.totalSpent || 0).toFixed(2)}. Consider setting a cap for that area.`
                : 'You have not spent enough to generate a detailed advice summary yet.';

            return {
                success: true,
                message: advice,
                data: { advice },
                refreshDashboard: false
            };
        }
    };

    return {
        execute: async (toolName, context) => {
            const tool = tools[toolName];
            if (!tool) {
                throw new Error(`Unknown tool: ${toolName}`);
            }
            return tool(context);
        },
        availableTools: Object.keys(tools)
    };
};

module.exports = {
    createToolRegistry
};
