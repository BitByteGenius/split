const createPlanner = ({ aiProvider, templates, validators }) => ({
    plan: async ({ message, history = [], memory = {}, context = {} }) => {
        const systemPrompt = templates.buildPlannerPrompt({
            currentDateIso: new Date().toISOString(),
            context,
            memory
        });

        const response = await aiProvider.createStructuredResponse({
            systemPrompt,
            messages: [
                { role: 'user', content: message },
                ...(history || []).slice(-8).map((item) => ({
                    role: item.role === 'assistant' ? 'assistant' : 'user',
                    content: item.content || ''
                }))
            ],
            schema: {
                type: 'object',
                required: ['plan', 'needsClarification', 'clarificationQuestion', 'intent']
            },
            retries: 2
        });

        const validated = validators.validatePlan(response);
        if (!validated.valid) {
            return {
                plan: [{ tool: 'dashboard_summary', args: {}, reason: 'Fallback planning path' }],
                needsClarification: false,
                clarificationQuestion: null,
                intent: 'assistant'
            };
        }

        return validated.value;
    }
});

module.exports = {
    createPlanner
};
