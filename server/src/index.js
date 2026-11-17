import 'dotenv/config';
import http from 'http';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { initSocket } from './socket/index.js';
import { attachClusterAdapter } from './socket/cluster.js';

const PORT = process.env.PORT || 5000;

// Mongoose reconnects by itself; these lines just make it visible in the logs
mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected, waiting to reconnect...'));
mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));

// A stray failed promise should be logged, not take the whole chat server down
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

// Close cleanly on Ctrl+C or a deploy, so clients see an ordinary disconnect and reconnect
function handleShutdown(io, closeCluster) {
  const stop = async () => {
    console.log('Shutting down...');
    setTimeout(() => process.exit(1), 5000).unref(); // do not hang forever
    io.close(); // also closes the HTTP server
    await closeCluster().catch(() => {});
    await mongoose.disconnect().catch(() => {});
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

async function start() {
  await connectDB(process.env.MONGO_URI);

  const app = createApp();
  const server = http.createServer(app);
  const io = initSocket(server);
  const closeCluster = await attachClusterAdapter(io); // no-op unless REDIS_URL is set
  // Controllers reach Socket.IO through the app (req.app.get('io'))
  app.set('io', io);
  handleShutdown(io, closeCluster);

  server.listen(PORT, () => console.log(`ChatSphere server running on port ${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
