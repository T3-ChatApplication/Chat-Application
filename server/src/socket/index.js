import { randomUUID } from 'crypto';
import { Server } from 'socket.io';
import User from '../models/User.js';
import { verifyToken } from '../utils/token.js';
import { validateMessage } from '../utils/validators.js';

// CLIENT_ORIGIN may hold several origins separated by commas
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim());

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins },
  });

  // Only authenticated users may open a socket (token sent in the handshake)
  io.use((socket, next) => {
    try {
      socket.userId = verifyToken(socket.handshake.auth?.token);
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    // Each user has a personal room, so a message reaches every open tab/device
    socket.join(`user:${socket.userId}`);

    // Client emits: socket.emit('message:send', { to, text }, ack)
    socket.on('message:send', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const errors = validateMessage(payload);
        if (errors.length) return reply({ ok: false, error: errors[0] });

        const { to } = payload;
        const text = payload.text.trim();

        const receiverExists = await User.exists({ _id: to });
        if (!receiverExists) return reply({ ok: false, error: 'Receiver not found' });

        // Step 6 delivers messages live but does not store them yet.
        // Saving to MongoDB is added in the persistence step.
        const message = {
          id: randomUUID(),
          sender: socket.userId,
          receiver: to,
          text,
          createdAt: new Date().toISOString(),
        };

        // Deliver to both participants (sender gets it too, so all their tabs stay in sync)
        io.to(`user:${to}`).to(`user:${socket.userId}`).emit('message:new', message);
        return reply({ ok: true, message });
      } catch (err) {
        console.error('message:send failed', err);
        return reply({ ok: false, error: 'Could not send message' });
      }
    });
  });

  return io;
}
