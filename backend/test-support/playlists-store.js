// Test-only adapter: real Mongoose schemas, isolated in-memory persistence.
export function installPlaylistsStore(Playlist) {
  const rows = new Map();
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => String(row[key]) === String(value));
  const query = get => {
    let skip = 0, limit = Infinity;
    const result = () => { const value = get(); return Array.isArray(value) ? value.slice(skip, skip + limit) : value; };
    const q = { lean: async () => result(), sort: () => q,
      skip: n => { skip = n; return q; }, limit: n => { limit = n; return q; },
      then: (resolve, reject) => Promise.resolve().then(result).then(resolve, reject) };
    return q;
  };
  Playlist.create = async fields => {
    const row = new Playlist(fields); await row.validate();
    rows.set(row.id, { ...row.toObject(), createdAt: new Date(), updatedAt: new Date() }); return row;
  };
  Playlist.find = filter => query(() => [...rows.values()].filter(row => matches(row, filter)).reverse());
  Playlist.findOne = filter => query(() => [...rows.values()].find(row => matches(row, filter)) ?? null);
  Playlist.countDocuments = async filter => [...rows.values()].filter(row => matches(row, filter)).length;
  Playlist.findOneAndUpdate = (filter, update) => query(() => {
    const row = [...rows.values()].find(row => matches(row, filter));
    if (!row) return null;
    const saved = { ...row, ...update.$set, version: row.version + update.$inc.version, updatedAt: new Date() };
    rows.set(String(row._id), saved); return saved;
  });
  Playlist.findOneAndDelete = async filter => {
    const row = [...rows.values()].find(row => matches(row, filter));
    if (!row) return null; rows.delete(String(row._id)); return row;
  };
  return rows;
}
