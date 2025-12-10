import { BaseAgent } from './base-agent.js';
import { AgentContext, AgentResponse, RetrievalResult } from '../core/types.js';
import { getConfigValue } from '../core/config.js';
import { getRetriever } from '../retrieval/retriever.js';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger('retriever-agent');

export class RetrieverAgent extends BaseAgent {
  private retriever = getRetriever();

  constructor() {
    const agentConfig = getConfigValue('agents').retriever;
    super({
      role: 'retriever',
      model: agentConfig.model,
      temperature: 0.1,
      maxTokens: 2048,
    });
  }

  get systemPrompt(): string {
    return `You are an intelligent document retrieval agent. Your job is to:
1. Analyze user queries to understand the information need
2. Formulate effective search queries
3. Evaluate retrieved documents for relevance
4. Suggest follow-up queries if initial results are insufficient

When analyzing a query:
- Identify key concepts, entities, and technical terms
- Consider synonyms and related terms
- Think about what type of document would contain the answer (code, documentation, config, etc.)

Always provide structured output with your reasoning.`;
  }

  async process(context: AgentContext): Promise<AgentResponse> {
    logger.info('RetrieverAgent processing query', { query: context.query });

    // First, analyze the query to understand the intent
    const analysisPrompt = `Analyze this developer query and suggest search strategies:

Query: "${context.query}"

Provide:
1. Main information need (what the user wants to know)
2. Key search terms to use
3. Document types likely to contain the answer (code, docs, config, tests, etc.)
4. Any alternative phrasings to consider

Format your response as JSON:
{
  "informationNeed": "...",
  "searchTerms": ["term1", "term2"],
  "documentTypes": ["code", "docs"],
  "alternativeQueries": ["query1", "query2"]
}`;

    const analysisResponse = await this.sendMessage(analysisPrompt);

    // Extract search strategy
    let searchStrategy: {
      informationNeed: string;
      searchTerms: string[];
      documentTypes: string[];
      alternativeQueries: string[];
    };

    try {
      const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        searchStrategy = JSON.parse(jsonMatch[0]);
      } else {
        searchStrategy = {
          informationNeed: context.query,
          searchTerms: context.query.split(' '),
          documentTypes: [],
          alternativeQueries: [],
        };
      }
    } catch {
      searchStrategy = {
        informationNeed: context.query,
        searchTerms: context.query.split(' '),
        documentTypes: [],
        alternativeQueries: [],
      };
    }

    // Perform retrieval with original query
    const results = await this.retriever.retrieve({
      query: context.query,
      topK: getConfigValue('agents').retriever.maxResults,
    });

    // If results are insufficient, try alternative queries
    let allResults = [...results];

    if (results.length < 3 && searchStrategy.alternativeQueries.length > 0) {
      for (const altQuery of searchStrategy.alternativeQueries.slice(0, 2)) {
        const altResults = await this.retriever.retrieve({
          query: altQuery,
          topK: 5,
        });

        // Merge results, avoiding duplicates
        for (const result of altResults) {
          if (!allResults.some((r) => r.document.id === result.document.id)) {
            allResults.push(result);
          }
        }
      }
    }

    // Evaluate and summarize results
    const evaluationPrompt = `Evaluate these search results for the query: "${context.query}"

Results:
${allResults
  .slice(0, 10)
  .map(
    (r, i) => `[${i + 1}] File: ${r.document.metadata.filePath} (Score: ${r.score.toFixed(3)})
Content preview: ${r.document.content.slice(0, 200)}...`
  )
  .join('\n\n')}

Rate the overall relevance (high/medium/low) and identify the most useful documents.
Format as JSON:
{
  "overallRelevance": "high|medium|low",
  "topDocuments": [1, 3, 5],
  "summary": "Brief summary of what was found",
  "suggestedFollowUp": "Optional follow-up query if needed"
}`;

    const evaluationResponse = await this.sendMessage(evaluationPrompt);

    let evaluation: {
      overallRelevance: string;
      topDocuments: number[];
      summary: string;
      suggestedFollowUp?: string;
    };

    try {
      const jsonMatch = evaluationResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        evaluation = JSON.parse(jsonMatch[0]);
      } else {
        evaluation = {
          overallRelevance: 'medium',
          topDocuments: allResults.slice(0, 5).map((_, i) => i + 1),
          summary: 'Results retrieved successfully',
        };
      }
    } catch {
      evaluation = {
        overallRelevance: 'medium',
        topDocuments: allResults.slice(0, 5).map((_, i) => i + 1),
        summary: 'Results retrieved successfully',
      };
    }

    // Filter to top documents
    const topResults = evaluation.topDocuments
      .map((idx) => allResults[idx - 1])
      .filter((r): r is RetrievalResult => r !== undefined);

    return {
      content: evaluation.summary,
      reasoning: `Search strategy: ${searchStrategy.informationNeed}. Found ${allResults.length} documents. Relevance: ${evaluation.overallRelevance}.`,
      actions: [
        {
          type: 'retrieve',
          params: { query: context.query, strategy: searchStrategy },
          result: topResults.length > 0 ? topResults : allResults.slice(0, 5),
        },
      ],
      metadata: {
        searchStrategy,
        evaluation,
        totalResults: allResults.length,
      },
    };
  }

  async quickRetrieve(query: string, topK: number = 5): Promise<RetrievalResult[]> {
    return this.retriever.retrieve({ query, topK });
  }
}
