import express from 'express';
import cors from 'cors';
import { config, isDebug, isDevelopment } from './config';
import quoteRoutes from './routes/quotes';

const app = express();

app.use(cors({
  origin: isDevelopment ? '*' : ['https://pinecut4you.co.uk', 'https://www.pinecut4you.co.uk'],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  if (isDebug) {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ 
    ok: true,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.1.0',
    updated: '2025-01-25',
  });
});

app.get('/', (_req, res) => {
  res.json({
    service: 'PineCut4You MCP Shipping API',
    version: '1.1.0',
    features: 'Smart weight distribution',
    endpoints: [
      'GET /health',
      'POST /instant-quote',
      'POST /quote',
      'GET /quote/:jobId',
    ],
  });
});

app.use('/', quoteRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`🚀 MCP Shipping API listening on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Debug mode: ${isDebug ? 'ON' : 'OFF'}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});