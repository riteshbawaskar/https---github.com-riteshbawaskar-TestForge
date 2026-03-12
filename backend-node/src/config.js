import 'dotenv/config';

export const config = {
  port:              parseInt(process.env.PORT || '8000'),
  nodeEnv:           process.env.NODE_ENV || 'development',

  dbPath:            process.env.DB_PATH || './testforge.db',
  encryptionSecret:  process.env.ENCRYPTION_SECRET || 'changeme_set_in_dotenv_32chars!!',

  anthropicApiKey:   process.env.ANTHROPIC_API_KEY || '',
  openaiApiKey:      process.env.OPENAI_API_KEY || '',
  geminiApiKey:      process.env.GEMINI_API_KEY || '',

  defaultLlmProvider: process.env.DEFAULT_LLM_PROVIDER || 'anthropic',
  defaultLlmModel:    process.env.DEFAULT_LLM_MODEL || 'claude-sonnet-4-6',
  llmMaxTokens:       parseInt(process.env.LLM_MAX_TOKENS || '4096'),

  embeddingProvider: process.env.EMBEDDING_PROVIDER || 'openai',
  embeddingModel:    process.env.EMBEDDING_MODEL    || 'text-embedding-3-small',

  qdrantUrl:    process.env.QDRANT_URL    || 'http://localhost:6333',
  qdrantApiKey: process.env.QDRANT_API_KEY || '',

  uploadDir:   process.env.UPLOAD_DIR   || './uploads',
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB || '50'),

  chunkSize:    parseInt(process.env.CHUNK_SIZE    || '1800'),
  chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '200'),
  ragTopK:      parseInt(process.env.RAG_TOP_K     || '5'),
};
