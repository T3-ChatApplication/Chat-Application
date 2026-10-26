
import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: 1 });

export function buildConversationId(userA, userB) {
  return [String(userA), String(userB)].sort().join('_');
}

messageSchema.methods.toPublic = function () {
  return {
    id: this._id.toString(),
    conversationId: this.conversationId,
    sender: this.sender.toString(),
    receiver: this.receiver.toString(),
    text: this.text,
    createdAt: this.createdAt.toISOString(),
  };
};

export default mongoose.model('Message', messageSchema);
