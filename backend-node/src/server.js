import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { migrate } from './db/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import projectsRouter     from './routes/projects.js';
import documentsRouter    from './routes/documents.js';
import requirementsRouter from './routes/requirements.js';
import testcasesRouter    from './routes/testcases.js';
import jobsRouter         from './routes/jobs.js';

migrate();

const app = express();

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'] }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/v1/projects',     projectsRouter);
app.use('/api/v1/documents',    documentsRouter);
app.use('/api/v1/requirements', requirementsRouter);
app.use('/api/v1/testcases',    testcasesRouter);
app.use('/api/v1/jobs',         jobsRouter);

app.get('/health', (req, res) => res.json({ status: 'ok', version: '2.0.0', runtime: 'node' }));
app.get('/ready',  (req, res) => res.json({ status: 'ready' }));

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[testforge] Server running on http://localhost:${config.port}`);
  console.log(`[testforge] LLM:       ${config.defaultLlmProvider} / ${config.defaultLlmModel}`);
  console.log(`[testforge] Embedding: ${config.embeddingProvider} / ${config.embeddingModel}`);
  console.log(`[testforge] Qdrant:    ${config.qdrantUrl}`);
});
