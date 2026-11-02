import Message from '../models/Message.js';

// Checks for any messages queued while this user was offline, marks them delivered,
// and delivers them to the user's socket upon login/connect. Also informs the senders.
export async function deliverOfflineMessages(io, socket) {
  try {
    const queued = await Message.find({
      receiver: socket.userId,
      delivered: false,
    }).sort({ createdAt: 1 });

    if (!queued || queued.length === 0) return [];

    const now = new Date();
    const ids = queued.map((m) => m._id);

    await Message.updateMany(
      { _id: { $in: ids } },
      { $set: { delivered: true, status: 'delivered', deliveredAt: now } }
    );

    const publicMessages = queued.map((m) => {
      const pub = m.toPublic();
      pub.delivered = true;
      pub.status = 'delivered';
      pub.deliveredAt = now;
      return pub;
    });

    // Send the batch of offline messages to the newly connected user
    socket.emit('message:offline', { messages: publicMessages });

    // Also emit message:new for each delivered message so standard listeners process them
    for (const msg of publicMessages) {
      socket.emit('message:new', msg);
    }

    // Notify the original senders that their messages reached the recipient
    if (io) {
      const senders = [...new Set(queued.map((m) => m.sender.toString()))];
      for (const senderId of senders) {
        const messageIds = queued
          .filter((m) => m.sender.toString() === senderId)
          .map((m) => m._id.toString());
        io.to(`user:${senderId}`).emit('message:delivered', {
          to: socket.userId,
          messageIds,
        });
      }
    }

    return publicMessages;
  } catch (err) {
    console.error('deliverOfflineMessages failed', err);
    return [];
  }
}
