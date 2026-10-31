import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

// Room names are unique whatever the letter case ("General" and "general" clash)
roomSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
roomSchema.index({ members: 1 });

// Works for plain ObjectIds and for populated members
const idOf = (member) => String(member._id || member);

// What the API returns. Pass { withMembers: true } only when members were populated.
roomSchema.methods.toPublic = function toPublic(viewerId, { withMembers = false } = {}) {
  const viewer = String(viewerId);
  const room = {
    id: this._id.toString(),
    name: this.name,
    memberCount: this.members.length,
    isMember: this.members.some((m) => idOf(m) === viewer),
    createdBy: idOf(this.createdBy),
  };
  if (withMembers) {
    room.members = this.members.map((m) => ({ id: idOf(m), username: m.username }));
  }
  return room;
};

export default mongoose.model('Room', roomSchema);
