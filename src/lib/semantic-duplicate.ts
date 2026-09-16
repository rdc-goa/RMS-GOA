import { getTextSimilarity, normalizeText } from '@/lib/duplicate-utils';

const OPENAI_MODEL = 'text-embedding-3-small';
const OPENROUTER_MODEL = 'text-embedding-3-small';
const SEMANTIC_THRESHOLD = 0.9;

async function fetchOpenAIEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: OPENAI_MODEL, input: text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI embeddings request failed: ${body}`);
  }

  const data = await response.json();
  return data?.data?.[0]?.embedding || [];
}

async function fetchGeminiEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: "models/embedding-001",
      content: { parts: [{ text }] }
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini embeddings request failed: ${body}`);
  }

  const data = await response.json();
  return data?.embedding?.values || [];
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const embeddingCache = new Map<string, number[]>();

async function getEmbedding(text: string): Promise<number[]> {
  const normalized = normalizeText(text);
  if (embeddingCache.has(normalized)) {
    return embeddingCache.get(normalized)!;
  }

  const useOpenAI = !!process.env.OPENAI_API_KEY;
  const useGemini = !!process.env.GEMINI_API_KEY;

  let embedding: number[] = [];
  if (useOpenAI) {
    embedding = await fetchOpenAIEmbedding(normalized);
  } else if (useGemini) {
    embedding = await fetchGeminiEmbedding(normalized);
  }

  if (embedding.length > 0) {
    embeddingCache.set(normalized, embedding);
  }

  return embedding;
}

export async function computeSemanticSimilarity(textA: string, textB: string): Promise<number> {
  const normalizedA = normalizeText(textA);
  const normalizedB = normalizeText(textB);

  if (!normalizedA || !normalizedB) return 0;

  const apiKeyAvailable = !!process.env.OPENAI_API_KEY || !!process.env.GEMINI_API_KEY;
  if (!apiKeyAvailable) {
    return getTextSimilarity(normalizedA, normalizedB);
  }

  try {
    const [embeddingA, embeddingB] = await Promise.all([getEmbedding(normalizedA), getEmbedding(normalizedB)]);
    if (embeddingA.length === 0 || embeddingB.length === 0) {
      return getTextSimilarity(normalizedA, normalizedB);
    }
    return cosineSimilarity(embeddingA, embeddingB);
  } catch (error: any) {
    // Only log once and safely fallback
    console.warn('Semantic similarity API failed, using fallback.', error.message || error);
    return getTextSimilarity(normalizedA, normalizedB);
  }
}

export async function isHighProbabilityDuplicateText(textA: string, textB: string, threshold = SEMANTIC_THRESHOLD): Promise<number> {
  const similarity = await computeSemanticSimilarity(textA, textB);
  return similarity >= threshold ? similarity : similarity;
}
