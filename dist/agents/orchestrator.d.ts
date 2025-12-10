import { BaseAgent } from './base-agent.js';
import { AgentContext, AgentResponse, RetrievalResult } from '../core/types.js';
interface OrchestratorOptions {
    maxIterations?: number;
    verbose?: boolean;
}
export declare class Orchestrator extends BaseAgent {
    private retrieverAgent;
    private analyzerAgent;
    private synthesizerAgent;
    private maxIterations;
    private verbose;
    constructor(options?: OrchestratorOptions);
    get systemPrompt(): string;
    process(context: AgentContext): Promise<AgentResponse>;
    private createPlan;
    private executePlan;
    private generateFinalResponse;
    query(query: string): Promise<string>;
    quickSearch(query: string, topK?: number): Promise<RetrievalResult[]>;
    clearAllHistory(): void;
}
export declare const createOrchestrator: (options?: OrchestratorOptions) => Orchestrator;
export {};
//# sourceMappingURL=orchestrator.d.ts.map