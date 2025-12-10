import { BaseAgent } from './base-agent.js';
import { AgentContext, AgentResponse, RetrievalResult } from '../core/types.js';
import { getConfigValue } from '../core/config.js';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger('analyzer-agent');

interface AnalysisResult {
  summary: string;
  keyFindings: string[];
  codePatterns?: string[];
  dependencies?: string[];
  suggestions?: string[];
  confidence: number;
}

export class AnalyzerAgent extends BaseAgent {
  constructor() {
    const agentConfig = getConfigValue('agents').analyzer;
    super({
      role: 'analyzer',
      model: agentConfig.model,
      temperature: 0.2,
      maxTokens: 8192,
    });
  }

  get systemPrompt(): string {
    return `You are an expert code and documentation analyzer. Your responsibilities:

1. **Code Analysis**: Understand code structure, patterns, and relationships
2. **Documentation Analysis**: Extract key information from docs and comments
3. **Pattern Recognition**: Identify design patterns, idioms, and conventions
4. **Dependency Analysis**: Track imports, exports, and module relationships
5. **Quality Assessment**: Note potential issues, improvements, or best practices

When analyzing code:
- Consider the broader context and architecture
- Identify the purpose and responsibility of each component
- Note any patterns or anti-patterns
- Track data flow and dependencies

Always provide structured, actionable insights.`;
  }

  async process(context: AgentContext): Promise<AgentResponse> {
    logger.info('AnalyzerAgent processing', {
      query: context.query,
      documentCount: context.documents.length,
    });

    if (context.documents.length === 0) {
      return {
        content: 'No documents provided for analysis.',
        reasoning: 'Cannot perform analysis without source documents.',
        metadata: { error: 'No documents' },
      };
    }

    // Group documents by type
    const groupedDocs = this.groupDocuments(context.documents);

    // Analyze each group
    const analyses: AnalysisResult[] = [];

    // Analyze code files
    if (groupedDocs.code.length > 0) {
      const codeAnalysis = await this.analyzeCode(context.query, groupedDocs.code);
      analyses.push(codeAnalysis);
    }

    // Analyze documentation
    if (groupedDocs.docs.length > 0) {
      const docsAnalysis = await this.analyzeDocs(context.query, groupedDocs.docs);
      analyses.push(docsAnalysis);
    }

    // Analyze configuration
    if (groupedDocs.config.length > 0) {
      const configAnalysis = await this.analyzeConfig(context.query, groupedDocs.config);
      analyses.push(configAnalysis);
    }

    // Synthesize findings
    const synthesis = await this.synthesizeAnalyses(context.query, analyses);

    return {
      content: synthesis.summary,
      reasoning: `Analyzed ${context.documents.length} documents across ${Object.keys(groupedDocs).filter((k) => groupedDocs[k as keyof typeof groupedDocs].length > 0).length} categories.`,
      actions: [
        {
          type: 'analyze',
          params: { query: context.query },
          result: synthesis,
        },
      ],
      metadata: {
        documentGroups: {
          code: groupedDocs.code.length,
          docs: groupedDocs.docs.length,
          config: groupedDocs.config.length,
        },
        individualAnalyses: analyses,
      },
    };
  }

  private groupDocuments(documents: RetrievalResult[]): {
    code: RetrievalResult[];
    docs: RetrievalResult[];
    config: RetrievalResult[];
  } {
    const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.rb', '.php'];
    const docExtensions = ['.md', '.mdx', '.txt', '.rst'];
    const configExtensions = ['.json', '.yaml', '.yml', '.toml', '.xml', '.env'];

    return {
      code: documents.filter((d) =>
        codeExtensions.some((ext) => d.document.metadata.fileType === ext)
      ),
      docs: documents.filter((d) =>
        docExtensions.some((ext) => d.document.metadata.fileType === ext)
      ),
      config: documents.filter((d) =>
        configExtensions.some((ext) => d.document.metadata.fileType === ext)
      ),
    };
  }

  private async analyzeCode(
    query: string,
    documents: RetrievalResult[]
  ): Promise<AnalysisResult> {
    const codeContext = documents
      .map(
        (d) => `### File: ${d.document.metadata.filePath}
\`\`\`${d.document.metadata.language || ''}
${d.document.content}
\`\`\``
      )
      .join('\n\n');

    const prompt = `Analyze the following code in relation to this query: "${query}"

${codeContext}

Provide a detailed analysis including:
1. Summary of what this code does
2. Key patterns and design decisions
3. Important functions/classes and their purposes
4. Dependencies and imports
5. Potential improvements or issues

Format as JSON:
{
  "summary": "...",
  "keyFindings": ["finding1", "finding2"],
  "codePatterns": ["pattern1", "pattern2"],
  "dependencies": ["dep1", "dep2"],
  "suggestions": ["suggestion1"],
  "confidence": 0.85
}`;

    const response = await this.sendMessage(prompt);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fall through to default
    }

    return {
      summary: response.slice(0, 500),
      keyFindings: ['Analysis completed'],
      confidence: 0.5,
    };
  }

  private async analyzeDocs(
    query: string,
    documents: RetrievalResult[]
  ): Promise<AnalysisResult> {
    const docsContext = documents
      .map(
        (d) => `### File: ${d.document.metadata.filePath}
${d.document.content}`
      )
      .join('\n\n---\n\n');

    const prompt = `Analyze the following documentation in relation to this query: "${query}"

${docsContext}

Extract:
1. Summary of the documentation
2. Key information relevant to the query
3. Any procedures, APIs, or instructions mentioned
4. Related topics or cross-references

Format as JSON:
{
  "summary": "...",
  "keyFindings": ["finding1", "finding2"],
  "suggestions": ["suggestion1"],
  "confidence": 0.85
}`;

    const response = await this.sendMessage(prompt);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fall through to default
    }

    return {
      summary: response.slice(0, 500),
      keyFindings: ['Documentation analyzed'],
      confidence: 0.5,
    };
  }

  private async analyzeConfig(
    query: string,
    documents: RetrievalResult[]
  ): Promise<AnalysisResult> {
    const configContext = documents
      .map(
        (d) => `### File: ${d.document.metadata.filePath}
\`\`\`${d.document.metadata.fileType.slice(1)}
${d.document.content}
\`\`\``
      )
      .join('\n\n');

    const prompt = `Analyze the following configuration files in relation to this query: "${query}"

${configContext}

Identify:
1. Purpose of each configuration
2. Key settings and their values
3. Environment-specific configurations
4. Dependencies or integrations configured

Format as JSON:
{
  "summary": "...",
  "keyFindings": ["finding1", "finding2"],
  "dependencies": ["dep1", "dep2"],
  "suggestions": ["suggestion1"],
  "confidence": 0.85
}`;

    const response = await this.sendMessage(prompt);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fall through to default
    }

    return {
      summary: response.slice(0, 500),
      keyFindings: ['Configuration analyzed'],
      confidence: 0.5,
    };
  }

  private async synthesizeAnalyses(
    query: string,
    analyses: AnalysisResult[]
  ): Promise<AnalysisResult> {
    if (analyses.length === 0) {
      return {
        summary: 'No analyses to synthesize',
        keyFindings: [],
        confidence: 0,
      };
    }

    if (analyses.length === 1) {
      return analyses[0]!;
    }

    const analysesContext = analyses
      .map(
        (a, i) => `Analysis ${i + 1}:
Summary: ${a.summary}
Findings: ${a.keyFindings.join(', ')}
Confidence: ${a.confidence}`
      )
      .join('\n\n');

    const prompt = `Synthesize these analyses into a unified response for the query: "${query}"

${analysesContext}

Create a comprehensive synthesis that:
1. Combines insights from all analyses
2. Resolves any contradictions
3. Prioritizes the most relevant findings
4. Provides actionable conclusions

Format as JSON:
{
  "summary": "...",
  "keyFindings": ["finding1", "finding2"],
  "codePatterns": ["pattern1"],
  "dependencies": ["dep1"],
  "suggestions": ["suggestion1"],
  "confidence": 0.85
}`;

    const response = await this.sendMessage(prompt);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fall through to default
    }

    // Merge all analyses
    return {
      summary: analyses.map((a) => a.summary).join(' '),
      keyFindings: analyses.flatMap((a) => a.keyFindings),
      codePatterns: analyses.flatMap((a) => a.codePatterns || []),
      dependencies: analyses.flatMap((a) => a.dependencies || []),
      suggestions: analyses.flatMap((a) => a.suggestions || []),
      confidence: analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length,
    };
  }
}
