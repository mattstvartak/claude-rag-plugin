"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrchestrator = exports.Orchestrator = void 0;
const uuid_1 = require("uuid");
const base_agent_js_1 = require("./base-agent.js");
const retriever_agent_js_1 = require("./retriever-agent.js");
const analyzer_agent_js_1 = require("./analyzer-agent.js");
const synthesizer_agent_js_1 = require("./synthesizer-agent.js");
const config_js_1 = require("../core/config.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createChildLogger)('orchestrator');
class Orchestrator extends base_agent_js_1.BaseAgent {
    retrieverAgent;
    analyzerAgent;
    synthesizerAgent;
    maxIterations;
    verbose;
    constructor(options = {}) {
        const agentConfig = (0, config_js_1.getConfigValue)('agents').orchestrator;
        super({
            role: 'orchestrator',
            model: agentConfig.model,
            temperature: agentConfig.temperature,
            maxTokens: 4096,
        });
        this.retrieverAgent = new retriever_agent_js_1.RetrieverAgent();
        this.analyzerAgent = new analyzer_agent_js_1.AnalyzerAgent();
        this.synthesizerAgent = new synthesizer_agent_js_1.SynthesizerAgent();
        this.maxIterations = options.maxIterations ?? agentConfig.maxIterations;
        this.verbose = options.verbose ?? false;
    }
    get systemPrompt() {
        return `You are an intelligent orchestrator for a code-aware RAG system. Your job is to:

1. **Understand Intent**: Analyze user queries to determine what they need
2. **Plan Actions**: Create a strategy using retrieval, analysis, and synthesis
3. **Coordinate Agents**: Delegate tasks to specialized agents
4. **Ensure Quality**: Verify that responses adequately address the query

Available agents:
- **Retriever**: Searches the codebase for relevant documents
- **Analyzer**: Performs deep analysis of code and documentation
- **Synthesizer**: Creates comprehensive responses from analyzed content

Query types you handle:
- Code explanation ("How does X work?")
- Code location ("Where is X implemented?")
- Code generation ("How do I implement X?")
- Debugging ("Why is X happening?")
- Architecture ("How is the project structured?")

Always provide structured plans and clear reasoning.`;
    }
    async process(context) {
        logger.info('Orchestrator starting', { query: context.query });
        // Step 1: Analyze the query and create a plan
        const plan = await this.createPlan(context.query);
        if (this.verbose) {
            logger.info('Plan created', { plan });
        }
        // Step 2: Execute the plan
        const results = await this.executePlan(plan, context);
        // Step 3: Generate final response
        const finalResponse = await this.generateFinalResponse(context.query, results, context.conversationHistory);
        return finalResponse;
    }
    async createPlan(query) {
        const planningPrompt = `Analyze this developer query and create an execution plan:

Query: "${query}"

Determine:
1. What type of query is this? (explanation, location, generation, debugging, architecture)
2. What information is needed?
3. Which agents should be involved and in what order?

Provide a plan as JSON:
{
  "queryType": "explanation|location|generation|debugging|architecture",
  "strategy": "sequential|parallel|adaptive",
  "steps": [
    {"agent": "retriever|analyzer|synthesizer", "purpose": "why this step"}
  ],
  "estimatedComplexity": "simple|moderate|complex"
}`;
        const response = await this.sendMessage(planningPrompt);
        let planData;
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                planData = JSON.parse(jsonMatch[0]);
            }
            else {
                planData = {
                    queryType: 'explanation',
                    strategy: 'sequential',
                    steps: [
                        { agent: 'retriever', purpose: 'Find relevant code' },
                        { agent: 'analyzer', purpose: 'Analyze retrieved content' },
                        { agent: 'synthesizer', purpose: 'Generate response' },
                    ],
                    estimatedComplexity: 'moderate',
                };
            }
        }
        catch {
            planData = {
                queryType: 'explanation',
                strategy: 'sequential',
                steps: [
                    { agent: 'retriever', purpose: 'Find relevant code' },
                    { agent: 'synthesizer', purpose: 'Generate response' },
                ],
                estimatedComplexity: 'simple',
            };
        }
        // Convert to tasks
        const tasks = planData.steps.map((step, index) => ({
            id: (0, uuid_1.v4)(),
            type: step.agent === 'retriever' ? 'query' : step.agent === 'analyzer' ? 'analyze' : 'synthesize',
            input: { purpose: step.purpose, order: index },
            status: 'pending',
        }));
        return {
            tasks,
            strategy: planData.strategy,
            estimatedSteps: tasks.length,
        };
    }
    async executePlan(plan, context) {
        let retrievedDocuments = [];
        let analysis = null;
        let iterations = 0;
        for (const task of plan.tasks) {
            if (iterations >= this.maxIterations) {
                logger.warn('Max iterations reached', { iterations });
                break;
            }
            task.status = 'running';
            task.startedAt = new Date().toISOString();
            try {
                switch (task.type) {
                    case 'query': {
                        // Retrieval task
                        const retrieverContext = {
                            query: context.query,
                            documents: [],
                            conversationHistory: context.conversationHistory,
                            metadata: context.metadata,
                        };
                        const retrieverResponse = await this.retrieverAgent.process(retrieverContext);
                        // Extract retrieved documents from response
                        const retrieveAction = retrieverResponse.actions?.find((a) => a.type === 'retrieve');
                        if (retrieveAction?.result) {
                            retrievedDocuments = retrieveAction.result;
                        }
                        task.result = retrieverResponse;
                        break;
                    }
                    case 'analyze': {
                        // Analysis task - only if we have documents
                        if (retrievedDocuments.length > 0) {
                            const analyzerContext = {
                                query: context.query,
                                documents: retrievedDocuments,
                                conversationHistory: context.conversationHistory,
                                metadata: context.metadata,
                            };
                            analysis = await this.analyzerAgent.process(analyzerContext);
                            task.result = analysis;
                        }
                        break;
                    }
                    case 'synthesize': {
                        // Synthesis happens in generateFinalResponse
                        task.result = { deferred: true };
                        break;
                    }
                }
                task.status = 'completed';
                task.completedAt = new Date().toISOString();
            }
            catch (error) {
                task.status = 'failed';
                task.error = error instanceof Error ? error.message : String(error);
                logger.error('Task failed', { taskId: task.id, error: task.error });
            }
            iterations++;
        }
        return { retrievedDocuments, analysis, iterations };
    }
    async generateFinalResponse(query, results, conversationHistory) {
        const synthesizerContext = {
            query,
            documents: results.retrievedDocuments,
            conversationHistory,
            metadata: {
                analysis: results.analysis?.metadata,
            },
        };
        const synthesisResponse = await this.synthesizerAgent.process(synthesizerContext);
        return {
            content: synthesisResponse.content,
            reasoning: `Orchestrated response: Retrieved ${results.retrievedDocuments.length} documents, ${results.analysis ? 'performed analysis' : 'skipped analysis'}, synthesized final response.`,
            actions: [
                ...(results.analysis?.actions || []),
                ...(synthesisResponse.actions || []),
            ],
            metadata: {
                orchestration: {
                    documentsRetrieved: results.retrievedDocuments.length,
                    analysisPerformed: !!results.analysis,
                },
                ...synthesisResponse.metadata,
            },
        };
    }
    // Direct query method for simple use cases
    async query(query) {
        const response = await this.process({
            query,
            documents: [],
            conversationHistory: [],
            metadata: {},
        });
        return response.content;
    }
    // Quick retrieval without full orchestration
    async quickSearch(query, topK = 5) {
        return this.retrieverAgent.quickRetrieve(query, topK);
    }
    // Reset all agent histories
    clearAllHistory() {
        this.clearHistory();
        this.retrieverAgent.clearHistory();
        this.analyzerAgent.clearHistory();
        this.synthesizerAgent.clearHistory();
    }
}
exports.Orchestrator = Orchestrator;
// Factory function
const createOrchestrator = (options) => {
    return new Orchestrator(options);
};
exports.createOrchestrator = createOrchestrator;
//# sourceMappingURL=orchestrator.js.map