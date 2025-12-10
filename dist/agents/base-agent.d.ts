import Anthropic from '@anthropic-ai/sdk';
import { AgentConfig, AgentContext, AgentMessage, AgentResponse, AgentRole } from '../core/types.js';
export declare abstract class BaseAgent {
    protected anthropic: Anthropic;
    protected config: AgentConfig;
    protected conversationHistory: AgentMessage[];
    constructor(config: AgentConfig);
    abstract get systemPrompt(): string;
    abstract process(context: AgentContext): Promise<AgentResponse>;
    protected sendMessage(userMessage: string, systemOverride?: string): Promise<string>;
    protected sendMessageWithTools<T>(userMessage: string, tools: Anthropic.Tool[], toolHandler: (toolName: string, toolInput: unknown) => Promise<T>): Promise<{
        response: string;
        toolResults: T[];
    }>;
    clearHistory(): void;
    getHistory(): AgentMessage[];
    getRole(): AgentRole;
}
//# sourceMappingURL=base-agent.d.ts.map