import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  pair: { type: String, required: true, unique: true },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted'], default: 'pending', required: true },
}, { timestamps: true });
schema.index({ requester: 1, status: 1, createdAt: -1 });
schema.index({ recipient: 1, status: 1, createdAt: -1 });
export const Friendship = mongoose.model('Friendship', schema);
export const friendPair = (a, b) => [String(a), String(b)].sort().join(':');
