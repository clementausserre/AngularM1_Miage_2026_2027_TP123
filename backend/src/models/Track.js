import mongoose from "mongoose";

const coverSchema = new mongoose.Schema({
  storedName: { type: String, required: true, select: false },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true, min: 1 },
  width: { type: Number, required: true, min: 1 },
  height: { type: Number, required: true, min: 1 },
  version: { type: String, required: true },
}, { _id: false });

export function publicTrack(track) {
  return {
    id: String(track._id),
    ownerId: String(track.ownerId),
    title: track.title,
    originalName: track.originalName,
    mimeType: track.mimeType,
    size: track.size,
    createdAt: track.createdAt,
    cover: track.cover ? {
      mimeType: track.cover.mimeType, size: track.cover.size,
      width: track.cover.width, height: track.cover.height, version: track.cover.version,
    } : null,
  };
}

/*
 * Ce schéma conserve les métadonnées d'une piste. Le fichier audio lui-même
 * reste sur le disque ; storedName contient le nom technique utilisé côté
 * serveur et n'est jamais exposé par toPublic().
 */
const schema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true, select: false },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    cover: { type: coverSchema, default: null },
  },
  { timestamps: true },
);

// Cet index accélère la liste des pistes d'un utilisateur triées par date.
schema.index({ ownerId: 1, createdAt: -1 });

/**
 * Convertit un document Mongoose en objet sûr pour le frontend.
 * L'identifiant MongoDB devient la propriété simple `id` attendue par Angular.
 */
schema.methods.toPublic = function () {
  return publicTrack(this);
};

export const Track = mongoose.model("Track", schema);
