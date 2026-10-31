import mongoose from 'mongoose';
import Message, { buildConversationId, buildRoomConversationId } from '../models/Message.js';
import Room from '../models/Room.js';
import { isObjectId } from '../utils/validators.js';

// Newest N messages of a conversation (optionally older than ?before=), oldest first
async function loadHistory(conversationId, req) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const query = { conversationId };
  if (req.query.before) {
    const before = new Date(req.query.before);
    if (!Number.isNaN(before.getTime())) query.createdAt = { $lt: before };
  }

  // Newest N, then reversed so the client receives them in reading order
  const docs = await Message.find(query).sort({ createdAt: -1 }).limit(limit);
  return docs.reverse().map((m) => m.toPublic());
}

// GET /api/messages/:userId?limit=50&before=<ISO date>
// Returns the one-to-one history between the logged-in user and :userId, oldest first.
export async function getHistory(req, res, next) {
  try {
    const { userId: otherId } = req.params;
    if (!mongoose.isValidObjectId(otherId)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const messages = await loadHistory(buildConversationId(req.userId, otherId), req);
    return res.json({ messages });
  } catch (err) {
    return next(err);
  }
}

// GET /api/messages/room/:roomId?limit=50&before=<ISO date>
// Group history, readable by room members only.
export async function getRoomHistory(req, res, next) {
  try {
    const { roomId } = req.params;
    if (!isObjectId(roomId)) return res.status(400).json({ message: 'Invalid room id' });

    const isMember = await Room.exists({ _id: roomId, members: req.userId });
    if (!isMember) return res.status(403).json({ message: 'Join the room to read its messages' });

    const messages = await loadHistory(buildRoomConversationId(roomId), req);
    return res.json({ messages });
  } catch (err) {
    return next(err);
  }
}
