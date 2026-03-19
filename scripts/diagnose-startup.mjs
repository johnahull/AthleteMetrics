// Diagnostic: attempt to load dist/index.js and report the error
// Falls back to a minimal HTTP server so the healthcheck passes

import { createServer } from 'http';

const PORT = process.env.PORT || 5000;

// Start a minimal HTTP server first so healthcheck passes
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'diagnostic',
    error: globalError,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      HAS_SESSION_SECRET: !!process.env.SESSION_SECRET,
      SESSION_SECRET_LENGTH: process.env.SESSION_SECRET?.length,
      HAS_DATABASE_URL: !!process.env.DATABASE_URL,
      HAS_ADMIN_USER: !!process.env.ADMIN_USER,
      HAS_ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
      ADMIN_PASSWORD_LENGTH: process.env.ADMIN_PASSWORD?.length,
      IS_PR_ENVIRONMENT: process.env.IS_PR_ENVIRONMENT,
    },
    timestamp: new Date().toISOString()
  }));
});

let globalError = null;

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`[diag] Diagnostic server listening on ${PORT}`);
  console.log(`[diag] NODE_ENV=${process.env.NODE_ENV}`);
  console.log(`[diag] SESSION_SECRET length=${process.env.SESSION_SECRET?.length}`);
  console.log(`[diag] ADMIN_USER=${process.env.ADMIN_USER ? 'SET' : 'UNSET'}`);
  console.log(`[diag] ADMIN_PASSWORD length=${process.env.ADMIN_PASSWORD?.length}`);
  console.log(`[diag] DATABASE_URL=${process.env.DATABASE_URL ? 'SET' : 'UNSET'}`);

  // Now try to import the main app to see what error we get
  console.log('[diag] Attempting to import dist/index.js...');
  try {
    await import('../dist/index.js');
    console.log('[diag] dist/index.js loaded successfully (unexpected!)');
    globalError = 'loaded_ok';
  } catch (err) {
    console.error('[diag] dist/index.js FAILED to load:', err.message);
    console.error('[diag] Stack:', err.stack);
    globalError = {
      message: err.message,
      code: err.code,
      stack: err.stack?.split('\n').slice(0, 10)
    };
  }
});
