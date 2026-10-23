import mongoose from 'mongoose';

const userIds = {
  type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  default: [],
  validate: ids => ids.length <= 20 && new Set(ids.map(String)).size === ids.length,
};
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  active: { type: Boolean, required: true, default: true },
  participantIds: userIds,
  invitedIds: userIds,
  version: { type: Number, required: true, default: 0, min: 0, validate: Number.isSafeInteger },
}, { timestamps: true });
schema.pre('validate', function () {
  const participants = this.participantIds.map(String), invitations = this.invitedIds.map(String);
  if (participants.length + invitations.length > 20 || invitations.some(id => participants.includes(id))) {
    this.invalidate('invitedIds', 'Participants et invitations doivent être distincts, avec 20 places maximum.');
  }
  if (this.active && !participants.includes(String(this.hostId))) {
    this.invalidate('participantIds', 'L’hôte doit participer à sa jam active.');
  }
});
schema.index({ hostId: 1 }, { unique: true, partialFilterExpression: { active: true } });
schema.index({ participantIds: 1, active: 1, createdAt: -1, _id: -1 });
schema.index({ invitedIds: 1, active: 1, createdAt: -1, _id: -1 });
export const Jam = mongoose.model('Jam', schema);
