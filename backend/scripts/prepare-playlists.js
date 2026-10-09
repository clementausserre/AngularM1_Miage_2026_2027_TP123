import mongoose from 'mongoose';
import { Playlist } from '../src/models/Playlist.js';

try {
  if (!process.env.MONGODB_URI) throw new Error('MissingDatabaseConfiguration');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await Playlist.createIndexes();
  const indexes = await Playlist.collection.indexes();
  console.log(JSON.stringify({ collection: Playlist.collection.name, documents: await Playlist.countDocuments(),
    indexes: indexes.map(index => ({ key: index.key, unique: Boolean(index.unique) })) }));
  console.log('Collection playlists prête dans MongoDB. Aucun morceau ni compte modifié.');
} catch (error) {
  console.error('Préparation MongoDB impossible.', { type: error.name, code: error.code });
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
