import mongoose from 'mongoose';
import { FriendCode } from '../src/models/FriendCode.js';
import { Friendship } from '../src/models/Friendship.js';

// Uses the application's database without printing its URI or user data.
try {
  if (!process.env.MONGODB_URI) throw new Error('MissingDatabaseConfiguration');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  for (const model of [FriendCode, Friendship]) {
    await model.createIndexes();
    const indexes = await model.collection.indexes();
    console.log(JSON.stringify({ collection: model.collection.name,
      documents: await model.countDocuments(),
      indexes: indexes.map(index => ({ key: index.key, unique: Boolean(index.unique) })) }));
  }
  console.log('Collections et index du système d’amis prêts dans MongoDB.');
} catch (error) {
  console.error('Préparation MongoDB impossible.', { type: error.name, code: error.code });
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
