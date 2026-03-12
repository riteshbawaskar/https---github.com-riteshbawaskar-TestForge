export function errorHandler(err, req, res, next) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ detail: `File exceeds upload size limit` });
  }
  console.error(`[error] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ detail: err.message || 'Internal server error' });
}
