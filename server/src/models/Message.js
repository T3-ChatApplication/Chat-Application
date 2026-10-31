import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // A one-to-one message has a receiver, a group message has a room
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: 1 });

messageSchema.pre('validate', function requireTarget(next) {
  if (!this.receiver && !this.room) {
    return next(new Error('A message needs a receiver or a room'));
  }
  return next();
});

// Same id for both users of a one-to-one chat, regardless of who is "sender"
export function buildConversationId(userA, userB) {
  return [String(userA), String(userB)].sort().join('_');
}

// Id that groups all the messages of a chat room
export function buildRoomConversationId(roomId) {
  return `room_${roomId}`;
}

messageSchema.methods.toPublic = function toPublic() {
  const message = {
    id: this._id.toString(),
    conversationId: this.conversationId,
    sender: this.sender.toString(),
    text: this.text,
    createdAt: this.createdAt,
  };
  if (this.receiver) message.receiver = this.receiver.toString();
  if (this.room) message.room = this.room.toString();
  return message;
};

export default mongoose.model('Message', messageSchema);
