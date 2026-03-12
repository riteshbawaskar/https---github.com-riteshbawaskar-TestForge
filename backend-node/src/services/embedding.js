/**
 * Multi-provider embedding service.
 * Providers: openai | gemini | local (requires @xenova/transformers)
 */
import { config } from '../config.js';

let _localModel = null;

function vectorSize() {
  const p = config.embeddingProvider.toLowerCase();
  if (p === 'local')  return 384;
  if (p === 'gemini') return 768;
  if (config.embeddingModel.includes('large')) return 3072;
  return 1536; // openai small / ada
}

export { vectorSize };

async function embedOpenAI(texts) {
  if (!config.openaiApiKey) {
    throw new Error(
      'EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is not set.\n' +
      'Options:\n' +
      '  A) Add OPENAI_API_KEY to .env\n' +
      '  B) Set EMBEDDING_PROVIDER=gemini + GEMINI_API_KEY\n' +
      '  C) Set EMBEDDING_PROVIDER=local (npm install @xenova/transformers)'
    );
  }
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const resp = await client.embeddings.create({
    model: config.embeddingModel,
    input: texts,
  });
  return resp.data.map(d => d.embedding);
}

async function embedGemini(texts) {
  if (!config.geminiApiKey) {
    throw new Error('EMBEDDING_PROVIDER=gemini but GEMINI_API_KEY is not set.');
  }
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const model = config.embeddingModel === 'text-embedding-3-small'
    ? 'text-embedding-004'
    : config.embeddingModel;
  const embedModel = genAI.getGenerativeModel({ model });

  const results = [];
  for (const text of texts) {
    const result = await embedModel.embedContent(text);
    results.push(result.embedding.values);
  }
  return results;
}

async function embedLocal(texts) {
  try {
    if (!_localModel) {
      const { pipeline } = await import('@xenova/transformers');
      const modelName = config.embeddingModel === 'text-embedding-3-small'
        ? 'Xenova/all-MiniLM-L6-v2'
        : config.embeddingModel;
      console.log(`[embed] Loading local model: ${modelName}`);
      _localModel = await pipeline('feature-extraction', modelName, { quantized: true });
    }
    const results = [];
    for (const text of texts) {
      const output = await _localModel(text, { pooling: 'mean', normalize: true });
      results.push(Array.from(output.data));
    }
    return results;
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error('EMBEDDING_PROVIDER=local requires @xenova/transformers.\nRun: npm install @xenova/transformers');
    }
    throw e;
  }
}

export async function embed(texts) {
  const p = config.embeddingProvider.toLowerCase();
  if (p === 'gemini') return embedGemini(texts);
  if (p === 'local')  return embedLocal(texts);
  return embedOpenAI(texts);
}

export function checkEmbeddingConfig() {
  const p = config.embeddingProvider.toLowerCase();
  if (p === 'openai' && !config.openaiApiKey) {
    throw new Error(
      'Cannot index document: OPENAI_API_KEY is not set.\n\n' +
      'Quick fix — add ONE of these to .env:\n' +
      '  A) OPENAI_API_KEY=sk-...\n' +
      '  B) EMBEDDING_PROVIDER=gemini + GEMINI_API_KEY=...\n' +
      '  C) EMBEDDING_PROVIDER=local  (npm install @xenova/transformers)'
    );
  }
  if (p === 'gemini' && !config.geminiApiKey) {
    throw new Error('EMBEDDING_PROVIDER=gemini but GEMINI_API_KEY is not set.');
  }
}
