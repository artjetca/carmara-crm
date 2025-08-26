/**
 * Vercel deploy entry handler, for serverless deployment
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ success: true, message: 'ok' });
});

// Basic auth endpoint for testing
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }
  
  // For now, just return success for testing
  res.json({
    success: true,
    data: {
      user: { email, id: 'test-user' },
      session: { access_token: 'test-token' }
    }
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found'
  });
});

// Error handler
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('API Error:', error);
  res.status(500).json({
    success: false,
    error: 'Server internal error'
  });
});

export default app;