import { v4 as uuidv4 } from 'uuid';
import { BaseAgent } from './base-agent.js';
import { RetrieverAgent } from './retriever-agent.js';
import { AnalyzerAgent } from './analyzer-agent.js';
import { SynthesizerAgent } from './synthesizer-agent.js';
import {
  AgentContext,
  AgentMessage,
  AgentResponse,
  OrchestratorPlan,
  RetrievalResult,
  Task,
} from '../core/types.js';
import { getConfigValue } from '../core/config.js';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger('orchestrator');

interface OrchestratorOptions {
  maxIterations?: number;
  verbose?: boolean;
}

export class Orchestrator extends BaseAgent {
  private retrieverAgent: RetrieverAgent;
  private analyzerAgent: AnalyzerAgent;
  private synthesizerAgent: SynthesizerAgent;
  private maxIterations: number;
  private verbose: boolean;

  constructor(options: OrchestratorOptions = {}) {
    const agentConfig = getConfigValue('agents').orchestrator;
    super({
      role: 'orchestrator',
      model: agentConfig.model,
      temperature: agentConfig.temperature,
      maxTokens: 4096,
    });

    this.retrieverAgent = new RetrieverAgent();
    this.analyzerAgent = new AnalyzerAgent();
    this.synthesizerAgent = new SynthesizerAgent();
    this.maxIterations = options.maxIterations ?? agentConfig.maxIterations;
    this.verbose = options.verbose ?? false;
  }

  get systemPrompt(): string {
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

  async process(context: AgentContext): Promise<AgentResponse> {
    logger.info('Orchestrator starting', { query: context.query });

    // Step 1: Analyze the query and create a plan
    const plan = await this.createPlan(context.query);

    if (this.verbose) {
      logger.info('Plan created', { plan });
    }

    // Step 2: Execute the plan
    const results = await this.executePlan(plan, context);

    // Step 3: Generate final response
    const finalResponse = await this.generateFinalResponse(
      context.query,
      results,
      context.conversationHistory
    );

    return finalResponse;
  }

  private async createPlan(query: string): Promise<OrchestratorPlan> {
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

    let planData: {
      queryType: string;
      strategy: 'sequential' | 'parallel' | 'adaptive';
      steps: Array<{ agent: string; purpose: string }>;
      estimatedComplexity: string;
    };

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        planData = JSON.parse(jsonMatch[0]);
      } else {
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
    } catch {
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
    const tasks: Task[] = planData.steps.map((step, index) => ({
      id: uuidv4(),
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

  private async executePlan(
    plan: OrchestratorPlan,
    context: AgentContext
  ): Promise<{
    retrievedDocuments: RetrievalResult[];
    analysis: AgentResponse | null;
    iterations: number;
  }> {
    let retrievedDocuments: RetrievalResult[] = [];
    let analysis: AgentResponse | null = null;
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
            const retrieverContext: AgentContext = {
              query: context.query,
              documents: [],
              conversationHistory: context.conversationHistory,
              metadata: context.metadata,
            };

            const retrieverResponse = await this.retrieverAgent.process(retrieverContext);

            // Extract retrieved documents from response
            const retrieveAction = retrieverResponse.actions?.find(
              (a) => a.type === 'retrieve'
            );
            if (retrieveAction?.result) {
              retrievedDocuments = retrieveAction.result as RetrievalResult[];
            }

            task.result = retrieverResponse;
            break;
          }

          case 'analyze': {
            // Analysis task - only if we have documents
            if (retrievedDocuments.length > 0) {
              const analyzerContext: AgentContext = {
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
      } catch (error) {
        task.status = 'failed';
        task.error = error instanceof Error ? error.message : String(error);
        logger.error('Task failed', { taskId: task.id, error: task.error });
      }

      iterations++;
    }

    return { retrievedDocuments, analysis, iterations };
  }

  private async generateFinalResponse(
    query: string,
    results: {
      retrievedDocuments: RetrievalResult[];
      analysis: AgentResponse | null;
    },
    conversationHistory: AgentMessage[]
  ): Promise<AgentResponse> {
    const synthesizerContext: AgentContext = {
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
  async query(query: string): Promise<string> {
    const response = await this.process({
      query,
      documents: [],
      conversationHistory: [],
      metadata: {},
    });

    return response.content;
  }

  // Quick retrieval without full orchestration
  async quickSearch(query: string, topK: number = 5): Promise<RetrievalResult[]> {
    return this.retrieverAgent.quickRetrieve(query, topK);
  }

  // Reset all agent histories
  clearAllHistory(): void {
    this.clearHistory();
    this.retrieverAgent.clearHistory();
    this.analyzerAgent.clearHistory();
    this.synthesizerAgent.clearHistory();
  }
}

// Factory function
export const createOrchestrator = (options?: OrchestratorOptions): Orchestrator => {
  return new Orchestrator(options);
};
