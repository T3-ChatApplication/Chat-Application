import { Server } from 'socket.io';
import User from '../models/User.js';
import Room from '../models/Room.js';
import Message, { buildConversationId, buildRoomConversationId } from '../models/Message.js';
import { registerPresence, presence } from './presence.js';
import { deliverOfflineMessages } from './delivery.js';
import { verifyToken } from '../utils/token.js';
import { validateMessage } from '../utils/validators.js';

// CLIENT_ORIGIN may hold several origins separated by commas
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim());

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins },
    // A client that drops for up to 2 minutes (Wi-Fi blip, laptop sleep) reconnects with the same
    // session and is sent the events it missed. Longer gaps are handled by the client reloading history.
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
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
    registerPresence(io, socket);

    // Deliver any messages stored/queued while this user was offline upon login/reconnect
    await deliverOfflineMessages(io, socket);

    // Client emits: socket.emit('message:send', { to, text }, ack)
    socket.on('message:send', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const errors = validateMessage(payload);
        if (errors.length) return reply({ ok: false, error: errors[0] });

        const { to, room } = payload;
        const text = payload.text.trim();

        // Group message: only members may post. Save first, then broadcast to the whole room.
        if (room) {
          const isMember = await Room.exists({ _id: room, members: socket.userId });
          if (!isMember) return reply({ ok: false, error: 'You are not a member of this room' });

          const saved = await Message.create({
            conversationId: buildRoomConversationId(room),
            sender: socket.userId,
            room,
            text,
          });

          const message = saved.toPublic();
          io.to(`room:${room}`).emit('message:new', message);
          return reply({ ok: true, message });
        }

        // One-to-one message
        const receiverExists = await User.exists({ _id: to });
        if (!receiverExists) return reply({ ok: false, error: 'Receiver not found' });

        const isReceiverOnline = presence.isOnline(to);
        const now = new Date();

        // Save first, then deliver, so what users see is always what is stored.
        // If receiver is offline, it is stored/queued for delivery on their next login.
        const saved = await Message.create({
          conversationId: buildConversationId(socket.userId, to),
          sender: socket.userId,
          receiver: to,
          text,
          delivered: isReceiverOnline,
          status: isReceiverOnline ? 'delivered' : 'sent',
          deliveredAt: isReceiverOnline ? now : null,
        });

        const message = saved.toPublic();
        if (isReceiverOnline) {
          // Deliver to both participants (sender gets it too, so all their tabs stay in sync)
          io.to(`user:${to}`).to(`user:${socket.userId}`).emit('message:new', message);
        } else {
          // Deliver to sender only; receiver gets it queued and delivered upon next login
          io.to(`user:${socket.userId}`).emit('message:new', message);
        }
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
