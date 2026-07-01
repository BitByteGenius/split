const { createPlanner } = require('./planner');
const { createToolRegistry } = require('./toolRegistry');
const { createToolExecutor } = require('./toolExecutor');
const { createResponseGenerator } = require('./responseGenerator');
const { buildContext } = require('./contextBuilder');
const memoryManager = require('./memoryManager');

const createAiAgent = ({ aiProvider, callInternalApi, user }) => {
    const toolRegistry = createToolRegistry({ callInternalApi });
    const planner = createPlanner({ aiProvider, templates: require('./promptTemplates'), validators: require('./validators') });
    const responseGenerator = createResponseGenerator({ aiProvider, templates: require('./promptTemplates'), validators: require('./validators') });
    const executor = createToolExecutor({ toolRegistry, memoryManager, contextBuilder: { buildContext } });

    return {
        process: async ({ token, userId, message, history = [], memory = {}, context = {} }) => {
            const nextContext = await buildContext({ token, user, groups: context.groups, dashboard: context.dashboard, analytics: context.analytics, memory, callInternalApi });
            const plan = await planner.plan({ message, history, memory, context: nextContext });
            const execution = await executor.executePlan({ token, userId, plan: plan.plan || [], message, memory, user, context: nextContext });
            const response = await responseGenerator.generate({ message, toolResults: execution.toolResults, memory: execution.memory, context: execution.context });

            if (user && typeof user.save === 'function') {
                await memoryManager.persistMemory(user, execution.memory);
            }

            return {
                success: true,
                reply: response.reply,
                refreshDashboard: Boolean(response.refreshDashboard),
                memory: execution.memory,
                toolResults: execution.toolResults
            };
        }
    };
};

module.exports = {
    createAiAgent
};
