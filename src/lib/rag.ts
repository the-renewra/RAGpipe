import { embedText } from "./gemini";

export interface DocumentChunk {
  id: string;
  text: string;
  embedding: number[];
  metadata?: Record<string, any>;
}

// Simple in-memory vector store for the SPA
class VectorStore {
  chunks: DocumentChunk[] = [];

  private splitText(text: string, chunkSize: number = 1000, chunkOverlap: number = 200): string[] {
    const separators = ["\n\n", "\n", ". ", " ", ""];
    
    function splitRecursive(textToSplit: string, separatorIndex: number): string[] {
      if (separatorIndex >= separators.length) {
        const chunks: string[] = [];
        for (let i = 0; i < textToSplit.length; i += chunkSize - chunkOverlap) {
          chunks.push(textToSplit.slice(i, i + chunkSize));
        }
        return chunks;
      }

      const separator = separators[separatorIndex];
      const splits = textToSplit.split(separator);
      
      const goodChunks: string[] = [];
      let currentChunk = "";

      for (const split of splits) {
        const nextChunk = currentChunk ? currentChunk + separator + split : split;
        
        if (nextChunk.length <= chunkSize) {
          currentChunk = nextChunk;
        } else {
          if (currentChunk) {
            goodChunks.push(currentChunk);
            currentChunk = split;
          } else {
            // A single split is larger than chunk size
            const deeperChunks = splitRecursive(split, separatorIndex + 1);
            goodChunks.push(...deeperChunks);
            currentChunk = "";
          }
        }
      }
      
      if (currentChunk) {
        goodChunks.push(currentChunk);
      }
      
      return goodChunks;
    }

    return splitRecursive(text, 0).map(c => c.trim()).filter(c => c.length > 0);
  }

  async addDocument(text: string, metadata?: Record<string, any>, onProgress?: (progress: number) => void): Promise<string[]> {
    const rawChunks = this.splitText(text, 1000, 200);
    const addedChunkIds: string[] = [];
    
    for (let i = 0; i < rawChunks.length; i++) {
      const chunkText = rawChunks[i];
      try {
        const embedding = await embedText(chunkText);
        const id = crypto.randomUUID();
        this.chunks.push({
          id,
          text: chunkText,
          embedding,
          metadata,
        });
        addedChunkIds.push(id);
      } catch (error) {
        console.error("Failed to embed chunk:", error);
        throw error; // Rethrow to be caught by the UI
      }
      
      if (onProgress) {
        onProgress(Math.round(((i + 1) / rawChunks.length) * 100));
      }
    }
    return addedChunkIds;
  }

  async search(query: string, topK: number = 3): Promise<DocumentChunk[]> {
    const queryEmbedding = await embedText(query);
    
    // Calculate cosine similarity
    const scoredChunks = this.chunks.map((chunk) => {
      const score = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      return { chunk, score };
    });

    // Sort by score descending
    scoredChunks.sort((a, b) => b.score - a.score);

    return scoredChunks.slice(0, topK).map((sc) => sc.chunk);
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export const vectorStore = new VectorStore();
