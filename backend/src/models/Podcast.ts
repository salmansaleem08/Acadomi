import mongoose, { Schema, type InferSchemaType } from "mongoose";

const dialogueLineSchema = new Schema(
  {
    speaker: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const podcastSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sourceUploadId: { type: Schema.Types.ObjectId, ref: "Upload", required: true },
    title: { type: String, required: true, trim: true, maxlength: 220 },
    script: { type: [dialogueLineSchema], default: [] },
    /** GridFS file id in `podcastAudio` bucket */
    audioFileId: { type: Schema.Types.ObjectId, required: true },
    mimeType: { type: String, required: true },
    durationMs: { type: Number, default: 0 },
    byteLength: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type PodcastDoc = InferSchemaType<typeof podcastSchema> & {
  _id: mongoose.Types.ObjectId;
};

/** Plain object shape from `.lean()` queries */
export type PodcastLean = {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  sourceUploadId: mongoose.Types.ObjectId;
  title: string;
  script: { speaker: string; text: string }[];
  audioFileId: mongoose.Types.ObjectId;
  mimeType: string;
  durationMs: number;
  byteLength: number;
  createdAt: Date;
  updatedAt: Date;
};

export const Podcast =
  mongoose.models.Podcast ?? mongoose.model<PodcastDoc>("Podcast", podcastSchema);

export const PODCAST_GRIDFS_BUCKET = "podcastAudio";
