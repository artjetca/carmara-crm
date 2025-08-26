/**
 * This is a API server
 */

import express, { type Request, type Response, type NextFunction }  from 'express';

// Environment variables are loaded in server.ts
import cors from 'cors';
import authRoutes from './routes/auth';
import customersRoutes from './routes/customers';
import geocodeRoutes from './routes/geocode';

// Remove ESM-specific code that may cause issues in Vercel
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// env is already loaded by `import 'dotenv/config'`

const app: express.Application = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * API Routes
 */
app.use('/api/auth', authRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/geocode', geocodeRoutes);

/**
 * health
 */
app.use('/api/health', (req: Request, res: Response, next: NextFunction): void => {
  res.status(200).json({
    success: true,
    message: 'ok'
  });
});

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