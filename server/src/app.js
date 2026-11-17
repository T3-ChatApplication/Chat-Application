import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import roomRoutes from './routes/rooms.js';
import unreadRoutes from './routes/unread.js';
import messageRoutes from './routes/messages.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { rateLimit } from './middleware/rateLimit.js';
import { sanitizeInput } from './middleware/sanitizeInput.js';
import { onlineCount } from './socket/presence.js';

// CLIENT_ORIGIN may hold several origins separated by commas
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim());

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json({ limit: '10kb' }));
  app.use(sanitizeInput);

  // Health check, also handy to see how many users are connected during a load test
  app.get('/api/health', async (req, res) => {
    const io = req.app.get('io');
    const onlineUsers = io ? await onlineCount(io).catch(() => null) : 0;
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()), onlineUsers });
  });

  // Rate limits per IP address. Login and register get a much stricter limit (password guessing).
  app.use('/api', rateLimit({ limit: Number(process.env.RATE_LIMIT_API) || 600, windowMs: 60 * 1000 }));
  app.use(
    '/api/auth',
    rateLimit({
      limit: Number(process.env.RATE_LIMIT_AUTH) || 50,
      windowMs: 15 * 60 * 1000,
      message: 'Too many login attempts, try again in a few minutes',
    })
  );
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/unread', unreadRoutes);
  app.use('/api/messages', messageRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
