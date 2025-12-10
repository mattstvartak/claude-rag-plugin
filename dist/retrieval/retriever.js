"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRetriever = exports.IntelligentRetriever = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const config_js_1 = require("../core/config.js");
const vector_store_js_1 = require("../core/vector-store.js");
const logger_js_1 = require("../utils/logger.js");
const provider_js_1 = require("../embeddings/provider.js");
const cache_js_1 = require("../utils/cache.js");
const hashing_js_1 = require("../utils/hashing.js");
const logger = (0, logger_js_1.createChildLogger)('retriever');
class IntelligentRetriever {
    anthropic = null;
    cache = (0, cache_js_1.getRetrievalCache)();
    constructor() {
        if (process.env['ANTHROPIC_API_KEY']) {
            this.anthropic = new sdk_1.default({
                apiKey: process.env['ANTHROPIC_API_KEY'],
            });
        }
    }
    async retrieve(query) {
        const retrievalConfig = (0, config_js_1.getConfigValue)('retrieval');
        const topK = query.topK ?? retrievalConfig.topK;
        const minScore = query.minScore ?? retrievalConfig.minScore;
        logger.info('Starting retrieval', { query: query.query, topK, minScore });
        // Check cache
        const cacheKey = (0, hashing_js_1.hashContent)(JSON.stringify({ query: query.query, topK, filters: query.filters }));
        const cached = this.cache.get(cacheKey);
        if (cached) {
            logger.debug('Retrieval cache hit');
            return cached;
        }
        let results;
        if (retrievalConfig.hybridSearch.enabled) {
            const hybridResults = await this.hybridSearch(query.query, topK, query.filters);
            results = hybridResults.fusedResults;
        }
        else {
            results = await this.semanticSearch(query.query, topK, query.filters);
        }
        // Filter by minimum score
        results = results.filter((r) => r.score >= minScore);
        // Rerank if enabled
        if (query.rerank !== false && retrievalConfig.reranking.enabled && this.anthropic) {
            results = await this.rerank(query.query, results, retrievalConfig.reranking.topN);
        }
        // Cache results
        this.cache.set(cacheKey, results);
        logger.info('Retrieval completed', { resultsCount: results.length });
        return results;
    }
    async semanticSearch(query, topK, filters) {
        const vectorStore = (0, vector_store_js_1.getVectorStore)();
        await vectorStore.initialize();
        const embeddingProvider = (0, provider_js_1.getEmbeddingProvider)();
        const queryEmbedding = await embeddingProvider.generateEmbedding(query);
        return await vectorStore.query(queryEmbedding, topK, filters);
    }
    async hybridSearch(query, topK, filters) {
        const retrievalConfig = (0, config_js_1.getConfigValue)('retrieval');
        // Semantic search
        const semanticResults = await this.semanticSearch(query, topK * 2, filters);
        // Keyword search (simple approach using content matching)
        const keywordResults = await this.keywordSearch(query, topK * 2, filters);
        // Reciprocal Rank Fusion
        const fusedResults = this.reciprocalRankFusion(semanticResults, keywordResults, retrievalConfig.hybridSearch.semanticWeight, retrievalConfig.hybridSearch.keywordWeight, topK);
        return {
            semanticResults,
            keywordResults,
            fusedResults,
        };
    }
    async keywordSearch(query, topK, filters) {
        // For keyword search, we'll use a simple approach:
        // Get more results from semantic search and re-score based on keyword matching
        const vectorStore = (0, vector_store_js_1.getVectorStore)();
        await vectorStore.initialize();
        const embeddingProvider = (0, provider_js_1.getEmbeddingProvider)();
        const queryEmbedding = await embeddingProvider.generateEmbedding(query);
        const results = await vectorStore.query(queryEmbedding, topK * 3, filters);
        // Re-score based on keyword matching
        const keywords = this.extractKeywords(query);
        const scoredResults = results.map((result) => {
            const keywordScore = this.calculateKeywordScore(result.document.content, keywords);
            return {
                ...result,
                score: keywordScore,
            };
        });
        // Sort by keyword score and take top K
        return scoredResults
            .filter((r) => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }
    extractKeywords(query) {
        // Simple keyword extraction: split by spaces, remove common words
        const stopWords = new Set([
            'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
            'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
            'to', 'was', 'were', 'will', 'with', 'the', 'this', 'but', 'they',
            'have', 'had', 'what', 'when', 'where', 'who', 'which', 'why', 'how',
        ]);
        return query
            .toLowerCase()
            .split(/\s+/)
            .filter((word) => word.length > 2 && !stopWords.has(word))
            .map((word) => word.replace(/[^\w]/g, ''));
    }
    calculateKeywordScore(content, keywords) {
        const lowerContent = content.toLowerCase();
        let score = 0;
        for (const keyword of keywords) {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            const matches = lowerContent.match(regex);
            if (matches) {
                score += matches.length;
            }
        }
        // Normalize by content length
        return score / Math.sqrt(content.length);
    }
    reciprocalRankFusion(semanticResults, keywordResults, semanticWeight, keywordWeight, topK) {
        const k = 60; // RRF constant
        const scoreMap = new Map();
        // Add semantic results
        semanticResults.forEach((result, rank) => {
            const rrf = semanticWeight / (k + rank + 1);
            const existing = scoreMap.get(result.document.id);
            if (existing) {
                existing.score += rrf;
            }
            else {
                scoreMap.set(result.document.id, { result, score: rrf });
            }
        });
        // Add keyword results
        keywordResults.forEach((result, rank) => {
            const rrf = keywordWeight / (k + rank + 1);
            const existing = scoreMap.get(result.document.id);
            if (existing) {
                existing.score += rrf;
            }
            else {
                scoreMap.set(result.document.id, { result, score: rrf });
            }
        });
        // Sort by combined score and take top K
        return [...scoreMap.values()]
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map(({ result, score }) => ({ ...result, score }));
    }
    async rerank(query, results, topN) {
        if (!this.anthropic || results.length === 0) {
            return results.slice(0, topN);
        }
        const retrievalConfig = (0, config_js_1.getConfigValue)('retrieval');
        logger.debug('Reranking results', { count: results.length, topN });
        try {
            // Prepare context for reranking
            const documentsContext = results
                .map((r, i) => `[Document ${i + 1}]
File: ${r.document.metadata.filePath}
Content:
${r.document.content.slice(0, 500)}${r.document.content.length > 500 ? '...' : ''}`)
                .join('\n\n');
            const response = await this.anthropic.messages.create({
                model: retrievalConfig.reranking.model,
                max_tokens: 1024,
                messages: [
                    {
                        role: 'user',
                        content: `Given the following query and documents, rank the documents by relevance to the query. Return ONLY a JSON array of document numbers in order of relevance (most relevant first).

Query: ${query}

Documents:
${documentsContext}

Return format: [1, 3, 2, ...] (just the numbers, most relevant first)`,
                    },
                ],
            });
            // Parse the ranking
            const content = response.content[0];
            if (content?.type !== 'text') {
                return results.slice(0, topN);
            }
            const rankingMatch = content.text.match(/\[[\d,\s]+\]/);
            if (!rankingMatch) {
                return results.slice(0, topN);
            }
            const ranking = JSON.parse(rankingMatch[0]);
            const rerankedResults = [];
            for (const rank of ranking) {
                const index = rank - 1;
                if (index >= 0 && index < results.length) {
                    const result = results[index];
                    if (result) {
                        rerankedResults.push(result);
                    }
                }
                if (rerankedResults.length >= topN)
                    break;
            }
            // Recalculate scores based on new ranking
            return rerankedResults.map((result, index) => ({
                ...result,
                score: 1 - index / rerankedResults.length,
            }));
        }
        catch (error) {
            logger.error('Reranking failed', { error });
            return results.slice(0, topN);
        }
    }
    async findSimilarDocuments(documentId, topK = 5) {
        const vectorStore = (0, vector_store_js_1.getVectorStore)();
        await vectorStore.initialize();
        // Get the document's embedding by querying with its content
        const results = await vectorStore.query([], 1, { id: documentId });
        if (results.length === 0) {
            return [];
        }
        const sourceDoc = results[0];
        // Search for similar documents
        const embeddingProvider = (0, provider_js_1.getEmbeddingProvider)();
        const embedding = await embeddingProvider.generateEmbedding(sourceDoc.document.content);
        const similar = await vectorStore.query(embedding, topK + 1);
        // Filter out the source document
        return similar.filter((r) => r.document.id !== documentId).slice(0, topK);
    }
    async queryWithContext(query, contextFilePaths) {
        // Retrieve documents, prioritizing those from context files
        const allResults = await this.retrieve({
            query,
            topK: 20,
            rerank: false,
        });
        // Boost scores for documents in context files
        const boostedResults = allResults.map((result) => {
            const isInContext = contextFilePaths.some((path) => result.document.metadata.filePath.includes(path));
            return {
                ...result,
                score: isInContext ? result.score * 1.5 : result.score,
            };
        });
        // Re-sort and return top results
        return boostedResults.sort((a, b) => b.score - a.score).slice(0, 10);
    }
}
exports.IntelligentRetriever = IntelligentRetriever;
// Singleton instance
let retrieverInstance = null;
const getRetriever = () => {
    if (!retrieverInstance) {
        retrieverInstance = new IntelligentRetriever();
    }
    return retrieverInstance;
};
exports.getRetriever = getRetriever;
//# sourceMappingURL=retriever.js.map