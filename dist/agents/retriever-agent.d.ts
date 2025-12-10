import { BaseAgent } from './base-agent.js';
import { AgentContext, AgentResponse, RetrievalResult } from '../core/types.js';
export declare class RetrieverAgent extends BaseAgent {
    private retriever;
    constructor();
    get systemPrompt(): string;
    process(context: AgentContext): Promise<AgentResponse>;
    quickRetrieve(query: string, topK?: number): Promise<RetrievalResult[]>;
}
//# sourceMappingURL=retriever-agent.d.ts.map