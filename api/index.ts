/**
 * Vercel deploy entry handler, for serverless deployment, please don't modify this file
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
// Import without extension for TS/Node runtime compatibility on Vercel
import app from './app';

// Export the Express app directly; Express apps are request handlers compatible with Vercel
export default app;