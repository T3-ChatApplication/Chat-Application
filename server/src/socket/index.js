
import { Server } from 'socket.io';
import User from '../models/User.js';
import Message from '../models/Message.js';
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

  // Only authenticated users may open a socket.
  io.use((socket, next) => {
    try {
      socket.userId = verifyToken(socket.handshake.auth?.token);
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);

    socket.on('message:send', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};

      try {
        const errors = validateMessage(payload);
        if (errors.length) {
          return reply({ ok: false, error: errors[0] });
        }

        const { to } = payload;
        const text = payload.text.trim();

        const receiverExists = await User.exists({ _id: to });
        if (!receiverExists) {
          return reply({ ok: false, error: 'Receiver not found' });
        }

        // Both participants generate the same conversation ID.
        const conversationId = [String(socket.userId), String(to)]
          .sort()
          .join(':');

        // Save the message before broadcasting it.
        const savedMessage = await Message.create({
          conversationId,
          sender: socket.userId,
          receiver: to,
          text,
        });

        const message = {
          id: savedMessage._id.toString(),
          conversationId: savedMessage.conversationId,
          sender: String(savedMessage.sender),
          receiver: String(savedMessage.receiver),
          text: savedMessage.text,
          createdAt: savedMessage.createdAt.toISOString(),
        };

        // Send to both participants, including all their open tabs.
        io.to(`user:${to}`)
          .to(`user:${socket.userId}`)
          .emit('message:new', message);

        return reply({ ok: true, message });
      } catch (err) {
        console.error('message:send failed', err);
        return reply({ ok: false, error: 'Could not send message' });
      }
    });
  });

  return io;
}
