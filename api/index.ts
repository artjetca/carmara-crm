/**
 * Vercel deploy entry handler, for serverless deployment, please don't modify this file
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
// Import without extension for TS/Node runtime compatibility on Vercel
import app from './app';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}