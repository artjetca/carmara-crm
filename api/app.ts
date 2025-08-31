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
 * API Routes
 */
// Import routes
import authRoutes from './routes/auth.js'
import customersRoutes from './routes/customers.js'
import geocodeRoutes from './routes/geocode.js'
import distanceRoutes from './routes/distance.js'

app.use('/api/auth', authRoutes)
app.use('/api/customers', customersRoutes)
app.use('/api/geocode', geocodeRoutes)
app.use('/api/distance', distanceRoutes)

console.log('[routes] All routes loaded successfully')

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