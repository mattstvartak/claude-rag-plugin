import { BaseAgent } from './base-agent.js';
import { AgentContext, AgentResponse, RetrievalResult } from '../core/types.js';
export declare class SynthesizerAgent extends BaseAgent {
    constructor();
    get systemPrompt(): string;
    process(context: AgentContext): Promise<AgentResponse>;
    private buildDocumentContext;
    private extractAnalysisContext;
    private parseNonJsonResponse;
    private formatResponse;
    generateCodeSuggestion(query: string, documents: RetrievalResult[], analysisContext: string): Promise<string>;
}
//# sourceMappingURL=synthesizer-agent.d.ts.map