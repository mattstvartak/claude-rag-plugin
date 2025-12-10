"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SynthesizerAgent = void 0;
const base_agent_js_1 = require("./base-agent.js");
const config_js_1 = require("../core/config.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createChildLogger)('synthesizer-agent');
class SynthesizerAgent extends base_agent_js_1.BaseAgent {
    constructor() {
        const agentConfig = (0, config_js_1.getConfigValue)('agents').synthesizer;
        super({
            role: 'synthesizer',
            model: agentConfig.model,
            temperature: 0.3,
            maxTokens: agentConfig.maxTokens,
        });
    }
    get systemPrompt() {
        return `You are an expert technical writer and code assistant. Your job is to synthesize information from code analysis and documentation into clear, actionable responses.

Guidelines:
1. **Be Precise**: Use exact terminology from the codebase
2. **Show Examples**: Include relevant code snippets when helpful
3. **Cite Sources**: Reference specific files and line numbers
4. **Be Practical**: Focus on actionable information
5. **Anticipate Needs**: Suggest related topics or follow-up questions

When generating responses:
- Start with a direct answer to the question
- Provide context and explanation
- Include code examples when relevant
- List references to source files
- Suggest follow-up questions if appropriate

Your responses should be helpful for developers working with the codebase.`;
    }
    async process(context) {
        logger.info('SynthesizerAgent processing', {
            query: context.query,
            documentCount: context.documents.length,
        });
        // Build context from documents and previous analyses
        const documentContext = this.buildDocumentContext(context.documents);
        const analysisContext = this.extractAnalysisContext(context.metadata);
        const prompt = `Based on the following context, provide a comprehensive answer to this question:

**Question**: ${context.query}

**Retrieved Documents**:
${documentContext}

${analysisContext ? `**Previous Analysis**:\n${analysisContext}` : ''}

**Conversation History**:
${context.conversationHistory.map((m) => `${m.role}: ${m.content.slice(0, 200)}...`).join('\n')}

Provide a response that:
1. Directly answers the question
2. Explains the relevant code/concepts
3. Includes code examples if helpful
4. References source files
5. Suggests follow-up questions

Format your response as JSON:
{
  "answer": "Direct answer to the question...",
  "explanation": "Detailed explanation with context...",
  "codeExamples": ["example1", "example2"],
  "references": [
    {"filePath": "path/to/file.ts", "relevance": "Contains the main implementation"}
  ],
  "followUpQuestions": ["question1", "question2"],
  "confidence": 0.85
}`;
        const response = await this.sendMessage(prompt);
        let synthesis;
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                synthesis = JSON.parse(jsonMatch[0]);
            }
            else {
                synthesis = this.parseNonJsonResponse(response, context.documents);
            }
        }
        catch {
            synthesis = this.parseNonJsonResponse(response, context.documents);
        }
        // Format the final response
        const formattedResponse = this.formatResponse(synthesis);
        return {
            content: formattedResponse,
            reasoning: `Synthesized response from ${context.documents.length} documents with ${synthesis.confidence * 100}% confidence.`,
            actions: [
                {
                    type: 'synthesize',
                    params: { query: context.query },
                    result: synthesis,
                },
            ],
            metadata: {
                synthesis,
                documentCount: context.documents.length,
            },
        };
    }
    buildDocumentContext(documents) {
        return documents
            .slice(0, 10)
            .map((d, i) => `### [${i + 1}] ${d.document.metadata.filePath}
**Type**: ${d.document.metadata.fileType} | **Lines**: ${d.document.metadata.startLine || 'N/A'}-${d.document.metadata.endLine || 'N/A'} | **Score**: ${d.score.toFixed(3)}

\`\`\`${d.document.metadata.language || ''}
${d.document.content.slice(0, 1000)}${d.document.content.length > 1000 ? '\n... (truncated)' : ''}
\`\`\``)
            .join('\n\n');
    }
    extractAnalysisContext(metadata) {
        const analysis = metadata['analysis'];
        if (!analysis)
            return '';
        let context = '';
        if (analysis.summary) {
            context += `**Summary**: ${analysis.summary}\n`;
        }
        if (analysis.keyFindings && analysis.keyFindings.length > 0) {
            context += `**Key Findings**:\n${analysis.keyFindings.map((f) => `- ${f}`).join('\n')}\n`;
        }
        return context;
    }
    parseNonJsonResponse(response, documents) {
        return {
            answer: response.slice(0, 500),
            explanation: response,
            references: documents.slice(0, 5).map((d) => ({
                filePath: d.document.metadata.filePath,
                relevance: `Score: ${d.score.toFixed(3)}`,
            })),
            confidence: 0.6,
        };
    }
    formatResponse(synthesis) {
        let response = synthesis.answer;
        if (synthesis.explanation && synthesis.explanation !== synthesis.answer) {
            response += `\n\n## Explanation\n${synthesis.explanation}`;
        }
        if (synthesis.codeExamples && synthesis.codeExamples.length > 0) {
            response += '\n\n## Code Examples\n';
            synthesis.codeExamples.forEach((example, i) => {
                response += `\n### Example ${i + 1}\n\`\`\`\n${example}\n\`\`\`\n`;
            });
        }
        if (synthesis.references.length > 0) {
            response += '\n\n## References\n';
            synthesis.references.forEach((ref) => {
                response += `- **${ref.filePath}**: ${ref.relevance}\n`;
            });
        }
        if (synthesis.followUpQuestions && synthesis.followUpQuestions.length > 0) {
            response += '\n\n## Related Questions\n';
            synthesis.followUpQuestions.forEach((q) => {
                response += `- ${q}\n`;
            });
        }
        return response;
    }
    async generateCodeSuggestion(query, documents, analysisContext) {
        const prompt = `Based on the codebase analysis, generate a code suggestion for: "${query}"

Context from codebase:
${documents
            .slice(0, 5)
            .map((d) => `File: ${d.document.metadata.filePath}\n${d.document.content.slice(0, 500)}`)
            .join('\n\n')}

Analysis:
${analysisContext}

Generate clean, production-ready code that follows the patterns in the codebase.`;
        return this.sendMessage(prompt);
    }
}
exports.SynthesizerAgent = SynthesizerAgent;
//# sourceMappingURL=synthesizer-agent.js.map