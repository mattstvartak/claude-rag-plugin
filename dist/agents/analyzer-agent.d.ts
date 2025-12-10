import { BaseAgent } from './base-agent.js';
import { AgentContext, AgentResponse } from '../core/types.js';
export declare class AnalyzerAgent extends BaseAgent {
    constructor();
    get systemPrompt(): string;
    process(context: AgentContext): Promise<AgentResponse>;
    private groupDocuments;
    private analyzeCode;
    private analyzeDocs;
    private analyzeConfig;
    private synthesizeAnalyses;
}
//# sourceMappingURL=analyzer-agent.d.ts.map