import mongoose from 'mongoose';
import Message, { buildConversationId } from '../models/Message.js';

export async function getConversationHistory(req, res, next) {
  try {
    const otherUserId = req.params.userId;

    // Check that the requested user's ID is valid.
    if (!mongoose.isValidObjectId(otherUserId)) {
      return res.status(400).json({
        message: 'Invalid user ID',
      });
    }

    // Both participants get the same conversation ID.
    const conversationId = buildConversationId(
      req.userId,
      otherUserId
    );

    // Retrieve saved messages in chronological order.
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1, _id: 1 })
      .limit(200);

    return res.status(200).json({
      messages: messages.map((message) => message.toPublic()),
    });
  } catch (error) {
    return next(error);
  }
}