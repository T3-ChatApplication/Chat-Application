import { Server } from 'socket.io';
import User from '../models/User.js';
import Room from '../models/Room.js';
import Message, { buildConversationId } from '../models/Message.js';
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

  io.on('connection', async (socket) => {
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

        // Save first, then deliver, so what users see is always what is stored
        const saved = await Message.create({
          conversationId: buildConversationId(socket.userId, to),
          sender: socket.userId,
          receiver: to,
          text,
        });

        const message = saved.toPublic();
        // Deliver to both participants (sender gets it too, so all their tabs stay in sync)
        io.to(`user:${to}`).to(`user:${socket.userId}`).emit('message:new', message);
        return reply({ ok: true, message });
      } catch (err) {
        console.error('message:send failed', err);
        return reply({ ok: false, error: 'Could not send message' });
      }
    });

    // Join the socket room of every chat room the user belongs to.
    // Done after the handlers above are registered, so no event is missed while this loads.
    try {
      const rooms = await Room.find({ members: socket.userId }).select('_id').lean();
      socket.join(rooms.map((r) => `room:${r._id}`));
    } catch (err) {
      console.error('Could not join rooms', err);
    }
  });

  return io;
}
