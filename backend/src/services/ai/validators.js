const TOOL_NAMES = new Set([
    'create_expense',
    'update_expense',
    'delete_expense',
    'search_expenses',
    'get_expense_details',
    'create_group',
    'add_group_member',
    'remove_group_member',
    'create_settlement',
    'approve_settlement',
    'dashboard_summary',
    'analytics',
    'spending_prediction',
    'financial_advice'
]);

const validateAgainstSchema = (value, schema) => {
    if (!schema) {
        return { valid: true, value };
    }

    const expectedType = schema.type;
    if (expectedType === 'object') {
        if (value == null || typeof value !== 'object' || Array.isArray(value)) {
            return { valid: false, error: 'Expected object' };
        }

        if (Array.isArray(schema.required)) {
            for (const property of schema.required) {
                if (!(property in value)) {
                    return { valid: false, error: `Missing required property: ${property}` };
                }
            }
        }

        return { valid: true, value };
    }

    if (expectedType === 'array') {
        if (!Array.isArray(value)) {
            return { valid: false, error: 'Expected array' };
        }
        return { valid: true, value };
    }

    if (expectedType === 'string') {
        return { valid: typeof value === 'string', error: 'Expected string' };
    }

    if (expectedType === 'boolean') {
        return { valid: typeof value === 'boolean', error: 'Expected boolean' };
    }

    if (expectedType === 'number') {
        return { valid: typeof value === 'number', error: 'Expected number' };
    }

    return { valid: true, value };
};

const validatePlan = (payload) => {
    if (!payload || typeof payload !== 'object') {
        return { valid: false, error: 'Planner response must be an object' };
    }

    if (!Array.isArray(payload.plan)) {
        return { valid: false, error: 'Planner response must include a plan array' };
    }

    const normalizedPlan = payload.plan.map((step) => {
        if (!step || typeof step !== 'object') {
            return null;
        }

        const toolName = step.tool;
        if (typeof toolName !== 'string' || !TOOL_NAMES.has(toolName)) {
            return null;
        }

        return {
            tool: toolName,
            args: step.args && typeof step.args === 'object' && !Array.isArray(step.args) ? step.args : {},
            reason: typeof step.reason === 'string' ? step.reason : 'Resolved from the request'
        };
    }).filter(Boolean);

    if (!normalizedPlan.length) {
        return { valid: false, error: 'Planner response did not include any valid tool steps' };
    }

    return {
        valid: true,
        value: {
            plan: normalizedPlan,
            needsClarification: Boolean(payload.needsClarification),
            clarificationQuestion: typeof payload.clarificationQuestion === 'string' ? payload.clarificationQuestion : null,
            intent: typeof payload.intent === 'string' ? payload.intent : 'assistant'
        }
    };
};

const validateResponse = (payload) => {
    const schema = {
        type: 'object',
        required: ['reply', 'refreshDashboard']
    };

    return validateAgainstSchema(payload, schema);
};

module.exports = {
    TOOL_NAMES,
    validateAgainstSchema,
    validatePlan,
    validateResponse
};
