import { Router } from 'express';
import { db } from '../db/database.js';

const router = Router();

router.get('/:id', (req, res) => {
  const job = db.prepare('SELECT * FROM generation_jobs WHERE id=?').get(req.params.id);
  if (!job) return res.status(404).json({ detail: 'Job not found' });
  res.json(job);
});

router.get('/:id/stream', (req, res) => {
  const jobId = req.params.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const poll = setInterval(() => {
    const job = db.prepare('SELECT * FROM generation_jobs WHERE id=?').get(jobId);
    if (!job) {
      send({ error: 'Job not found' });
      res.write('event: done\ndata: {}\n\n');
      clearInterval(poll);
      res.end();
      return;
    }
    send({ id: job.id, status: job.status, progress: job.progress_message, error: job.error_message });
    if (job.status === 'COMPLETE' || job.status === 'FAILED') {
      res.write('event: done\ndata: {}\n\n');
      clearInterval(poll);
      res.end();
    }
  }, 1500);

  req.on('close', () => clearInterval(poll));
});

export default router;
