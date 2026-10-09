import mongoose from 'mongoose';
import { randomInt } from 'node:crypto';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  code: { type: String, required: true, unique: true, match: /^GPC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/ },
});
export const FriendCode = mongoose.model('FriendCode', schema);

export function generateFriendCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const value = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('');
  return `GPC-${value.slice(0, 4)}-${value.slice(4)}`;
}

// Separate collection: existing accounts need no rewrite and simultaneous tabs share one code.
export async function ensureFriendCode(userId) {
  const existing = await FriendCode.findOne({ userId }).lean();
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await FriendCode.findOneAndUpdate({ userId },
        { $setOnInsert: { userId, code: generateFriendCode() } },
        { upsert: true, new: true, runValidators: true }).lean();
      return result.code;
    } catch (error) {
      if (error.code !== 11000) throw error;
      console.info('[friends] Attribution concurrente ou collision de code, nouvelle tentative');
      const winner = await FriendCode.findOne({ userId }).lean();
      if (winner) return winner.code;
    }
  }
  throw new Error('Friend code allocation failed');
}
