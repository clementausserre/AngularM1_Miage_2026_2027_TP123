import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  trackIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Track' }], default: [],
    validate: value => value.length <= 200 && new Set(value.map(String)).size === value.length },
  version: { type: Number, default: 0, min: 0 },
}, { timestamps: true });
schema.index({ ownerId: 1, createdAt: -1, _id: -1 });
export const Playlist = mongoose.model('Playlist', schema);
