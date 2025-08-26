/**
 * This is a API server
 */

import express, { type Request, type Response, type NextFunction }  from 'express';

// Environment variables are loaded in server.ts
import cors from 'cors';

// Remove ESM-specific code that may cause issues in Vercel
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// env is already loaded by `import 'dotenv/config'`

const app: express.Application = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * health should be available even if other routes fail to initialize
 */
app.get('/api/health', (req: Request, res: Response): void => {
  res.status(200).json({ success: true, message: 'ok' });
});

/**
 * API Routes (loaded with better error handling for Vercel)
 */
try {
  // Use require for better Vercel compatibility
  const authRoutes = require('./routes/auth').default || require('./routes/auth');
  app.use('/api/auth', authRoutes);
} catch (e: any) {
  console.error('[routes] failed to init /api/auth:', e?.message || e);
}

try {
  const customersRoutes = require('./routes/customers').default || require('./routes/customers');
  app.use('/api/customers', customersRoutes);
} catch (e: any) {
  console.error('[routes] failed to init /api/customers:', e?.message || e);
}

try {
  const geocodeRoutes = require('./routes/geocode').default || require('./routes/geocode');
  app.use('/api/geocode', geocodeRoutes);
} catch (e: any) {
  console.error('[routes] failed to init /api/geocode:', e?.message || e);
}

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({
    success: false,
    error: 'Server internal error'
  });
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found'
  });
});

export default app;

// Global error handlers to surface details in Vercel function logs
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});