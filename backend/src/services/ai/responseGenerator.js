const createResponseGenerator = ({ aiProvider, templates, validators }) => ({
    generate: async ({ message, toolResults = [], memory = {}, context = {} }) => {
        const systemPrompt = templates.buildResponderPrompt({ currentDateIso: new Date().toISOString() });
        const response = await aiProvider.createStructuredResponse({
            systemPrompt,
            messages: [
                { role: 'user', content: message },
                { role: 'assistant', content: JSON.stringify(toolResults) }
            ],
            schema: {
                type: 'object',
                required: ['reply', 'refreshDashboard']
            },
            retries: 2
        });

        const validated = validators.validateResponse(response);
        if (!validated.valid) {
            return {
                reply: 'I completed the request, but I could not format a polished reply.',
                refreshDashboard: false
            };
        }

        return validated.value;
    }
});

module.exports = {
    createResponseGenerator
};
