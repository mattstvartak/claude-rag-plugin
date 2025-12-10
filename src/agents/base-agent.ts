import Anthropic from '@anthropic-ai/sdk';
import {
  AgentConfig,
  AgentContext,
  AgentMessage,
  AgentResponse,
  AgentRole,
} from '../core/types.js';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger('agent');

export abstract class BaseAgent {
  protected anthropic: Anthropic;
  protected config: AgentConfig;
  protected conversationHistory: AgentMessage[] = [];

  constructor(config: AgentConfig) {
    if (!process.env['ANTHROPIC_API_KEY']) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }

    this.anthropic = new Anthropic({
      apiKey: process.env['ANTHROPIC_API_KEY'],
    });
    this.config = config;
  }

  abstract get systemPrompt(): string;

  abstract process(context: AgentContext): Promise<AgentResponse>;

  protected async sendMessage(
    userMessage: string,
    systemOverride?: string
  ): Promise<string> {
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    logger.debug('Sending message to agent', {
      role: this.config.role,
      messageLength: userMessage.length,
    });

    const response = await this.anthropic.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens ?? 4096,
      temperature: this.config.temperature ?? 0.1,
      system: systemOverride ?? this.systemPrompt,
      messages: this.conversationHistory.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const assistantMessage = response.content[0];
    if (assistantMessage?.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    this.conversationHistory.push({
      role: 'assistant',
      content: assistantMessage.text,
    });

    return assistantMessage.text;
  }

  protected async sendMessageWithTools<T>(
    userMessage: string,
    tools: Anthropic.Tool[],
    toolHandler: (toolName: string, toolInput: unknown) => Promise<T>
  ): Promise<{ response: string; toolResults: T[] }> {
    const toolResults: T[] = [];

    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    let continueLoop = true;

    while (continueLoop) {
      const response = await this.anthropic.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens ?? 4096,
        temperature: this.config.temperature ?? 0.1,
        system: this.systemPrompt,
        tools,
        messages: this.conversationHistory.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      });

      // Process response
      let assistantContent = '';
      const toolUses: Array<{ id: string; name: string; input: unknown }> = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          assistantContent += block.text;
        } else if (block.type === 'tool_use') {
          toolUses.push({
            id: block.id,
            name: block.name,
            input: block.input,
          });
        }
      }

      // Store assistant message
      if (assistantContent) {
        this.conversationHistory.push({
          role: 'assistant',
          content: assistantContent,
        });
      }

      // Handle tool calls
      if (toolUses.length > 0) {
        for (const toolUse of toolUses) {
          try {
            const result = await toolHandler(toolUse.name, toolUse.input);
            toolResults.push(result);

            // Add tool result to conversation
            this.conversationHistory.push({
              role: 'user',
              content: `Tool ${toolUse.name} result: ${JSON.stringify(result)}`,
            });
          } catch (error) {
            this.conversationHistory.push({
              role: 'user',
              content: `Tool ${toolUse.name} error: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        }
      }

      // Check if we should continue
      continueLoop = toolUses.length > 0 && response.stop_reason === 'tool_use';
    }

    const lastMessage = this.conversationHistory[this.conversationHistory.length - 1];
    return {
      response: lastMessage?.role === 'assistant' ? lastMessage.content : '',
      toolResults,
    };
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  getHistory(): AgentMessage[] {
    return [...this.conversationHistory];
  }

  getRole(): AgentRole {
    return this.config.role;
  }
}
