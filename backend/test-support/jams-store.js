// Test-only persistence adapter: real schema validation, atomic version comparisons.
export function installJamsStore(t, Jam) {
  const rows = new Map();
  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) =>
    Array.isArray(row[key]) ? row[key].some(id => String(id) === String(value)) : String(row[key]) === String(value));
  const query = get => {
    let skip = 0, limit = Infinity;
    const result = () => { const value = get(); return copy(Array.isArray(value) ? value.slice(skip, skip + limit) : value); };
    const q = { lean: async () => result(), sort: () => q,
      skip: n => { skip = n; return q; }, limit: n => { limit = n; return q; } };
    return q;
  };
  t.mock.method(Jam, 'create', async fields => {
    const row = new Jam(fields); await row.validate();
    if ([...rows.values()].some(value => value.active && String(value.hostId) === String(row.hostId))) {
      throw Object.assign(new Error('Duplicate host'), { code: 11000 });
    }
    rows.set(row.id, copy({ ...row.toObject(), createdAt: new Date(), updatedAt: new Date() }));
    return row;
  });
  t.mock.method(Jam, 'find', filter => query(() => [...rows.values()].filter(row => matches(row, filter)).reverse()));
  t.mock.method(Jam, 'findOne', filter => query(() => [...rows.values()].find(row => matches(row, filter)) ?? null));
  t.mock.method(Jam, 'countDocuments', async filter => [...rows.values()].filter(row => matches(row, filter)).length);
  t.mock.method(Jam, 'findOneAndUpdate', async (filter, update) => {
    const row = [...rows.values()].find(row => matches(row, filter));
    if (!row) return null;
    const saved = { ...row, ...update.$set, version: row.version + update.$inc.version };
    await new Jam(saved).validate();
    if (!matches(rows.get(String(row._id)), filter)) return null;
    rows.set(String(row._id), copy(saved));
    return copy(saved);
  });
  return rows;
}
