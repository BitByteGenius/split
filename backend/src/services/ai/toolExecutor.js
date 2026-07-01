const createToolExecutor = ({ toolRegistry, memoryManager, contextBuilder }) => ({
    executePlan: async ({ token, userId, plan = [], message, memory = {}, user, context }) => {
        const toolResults = [];
        let nextMemory = memory;

        for (const step of plan) {
            const toolName = step.tool;
            const args = step.args || {};

            const reference = memoryManager.resolveReference({ message, memory: nextMemory });
            const resolvedArgs = memoryManager.applyReference(args, reference);

            try {
                const result = await toolRegistry.execute(toolName, {
                    token,
                    userId,
                    args: resolvedArgs
                });

                toolResults.push({ tool: toolName, result });
                nextMemory = memoryManager.recordToolResult(nextMemory, toolName, result);
            } catch (error) {
                toolResults.push({
                    tool: toolName,
                    result: {
                        success: false,
                        message: error.message || 'The requested action could not be completed.'
                    }
                });
            }
        }

        return {
            toolResults,
            memory: nextMemory,
            context: await contextBuilder.buildContext({ token, user, groups: context.groups, dashboard: context.dashboard, analytics: context.analytics, memory: nextMemory })
        };
    }
});

module.exports = {
    createToolExecutor
};
