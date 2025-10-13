/**
 * local server entry file, for local development
 */

// CRITICAL: Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Use dynamic import to ensure environment variables are loaded first
const { default: app } = await import('./app.js');

/**
 * start server with port
 */
const START_PORT = Number(process.env.PORT) || 3030;

function start(port: number) {
  const server = app
    .listen(port, () => {
      console.log(`Server ready on port ${port}`);
    })
    .on('error', (err: any) => {
      if (err?.code === 'EADDRINUSE') {
        const next = port === START_PORT ? 3031 : port + 1;
        console.warn(`Port ${port} in use, retrying on ${next}...`);
        setTimeout(() => start(next), 300);
      } else {
        console.error('Server error:', err);
      }
    });
  return server;
}

start(START_PORT);

export default app;