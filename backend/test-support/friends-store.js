// In-memory persistence adapter for HTTP/browser tests only. MongoDB indexes are tested separately by schema inspection.
export function installFriendsStore({ FriendCode, Friendship, users }) {
  const codes = new Map();
  const relations = new Map();
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) =>
    key === '$or' ? value.some(part => matches(row, part)) : String(row[key]) === String(value));
  const query = get => {
    let offset = 0, limit = Infinity, populate = false;
    const result = () => {
      const value = get();
      if (!Array.isArray(value)) return value;
      return value.slice(offset, offset + limit).map(row => populate ? { ...row,
        requester: users.get(String(row.requester)) ?? null, recipient: users.get(String(row.recipient)) ?? null } : row);
    };
    const q = { lean: async () => result(), select: () => q, sort: () => q,
      skip: n => { offset = n; return q; }, limit: n => { limit = n; return q; },
      populate: () => { populate = true; return q; }, then: (yes, no) => Promise.resolve(result()).then(yes, no) };
    return q;
  };
  FriendCode.findOne = filter => query(() => [...codes.values()].find(row => matches(row, filter)) ?? null);
  FriendCode.findOneAndUpdate = (filter, update) => query(() => {
    const existing = codes.get(String(filter.userId));
    if (existing) return existing;
    const value = update.$setOnInsert;
    if ([...codes.values()].some(row => row.code === value.code)) throw Object.assign(new Error('Duplicate code'), { code: 11000 });
    codes.set(String(value.userId), { ...value }); return value;
  });
  Friendship.create = async fields => {
    if ([...relations.values()].some(row => row.pair === fields.pair)) throw Object.assign(new Error('Duplicate relation'), { code: 11000 });
    const doc = new Friendship(fields); await doc.validate();
    // Repeat the uniqueness check after validation to simulate concurrent writes.
    if ([...relations.values()].some(row => row.pair === fields.pair)) throw Object.assign(new Error('Duplicate relation'), { code: 11000 });
    const row = { ...doc.toObject(), createdAt: new Date() };
    relations.set(doc.id, row); return doc;
  };
  Friendship.findOne = filter => query(() => [...relations.values()].find(row => matches(row, filter)) ?? null);
  Friendship.find = filter => query(() => [...relations.values()].filter(row => matches(row, filter)).reverse());
  Friendship.countDocuments = async filter => [...relations.values()].filter(row => matches(row, filter)).length;
  Friendship.findOneAndUpdate = async (filter, update) => {
    const row = [...relations.values()].find(row => matches(row, filter));
    if (!row) return null; Object.assign(row, update.$set); return row;
  };
  Friendship.findOneAndDelete = async filter => {
    const row = [...relations.values()].find(row => matches(row, filter));
    if (!row) return null; relations.delete(String(row._id)); return row;
  };
  return { codes, relations, query };
}
