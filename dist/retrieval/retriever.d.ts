import { RetrievalQuery, RetrievalResult } from '../core/types.js';
export declare class IntelligentRetriever {
    private anthropic;
    private cache;
    constructor();
    retrieve(query: RetrievalQuery): Promise<RetrievalResult[]>;
    private semanticSearch;
    private hybridSearch;
    private keywordSearch;
    private extractKeywords;
    private calculateKeywordScore;
    private reciprocalRankFusion;
    private rerank;
    findSimilarDocuments(documentId: string, topK?: number): Promise<RetrievalResult[]>;
    queryWithContext(query: string, contextFilePaths: string[]): Promise<RetrievalResult[]>;
}
export declare const getRetriever: () => IntelligentRetriever;
//# sourceMappingURL=retriever.d.ts.map