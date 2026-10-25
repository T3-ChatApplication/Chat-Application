import { Server } from 'socket.io';
import { verifyToken } from '../utils/token.js';

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
    // Each user has a personal room, so later steps can reach every open tab/device
    socket.join(`user:${socket.userId}`);
  });

  return io;
}
