import mongoose, { Schema, type InferSchemaType } from "mongoose";

const visualHintsSchema = new Schema(
  {
    radar: [
      {
        label: { type: String, required: true },
        value: { type: Number, required: true },
      },
    ],
    barCompare: [
      {
        label: { type: String, required: true },
        you: { type: Number, required: true },
        ideal: { type: Number, required: true },
      },
    ],
  },
  { _id: false },
);

const evaluationSchema = new Schema(
  {
    scoreClarity: { type: Number, default: 0, min: 0, max: 100 },
    scoreConcepts: { type: Number, default: 0, min: 0, max: 100 },
    scoreFluency: { type: Number, default: 0, min: 0, max: 100 },
    totalScore: { type: Number, default: 0, min: 0, max: 100 },
    feedback: { type: String, default: "" },
    topicUnderstanding: { type: String, default: "" },
    weakness: { type: String, default: "" },
    strength: { type: String, default: "" },
    visualHints: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const roleReversalSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    topic: { type: String, required: true, trim: true, maxlength: 500 },
    sourceUploadId: { type: Schema.Types.ObjectId, ref: "Upload", required: true },
    transcript: { type: String, default: "" },
    attemptCount: { type: Number, default: 1, min: 1 },
    evaluation: { type: evaluationSchema, required: true },
    lastAudioMimeType: { type: String, default: "" },
  },
  { timestamps: true },
);

export type RoleReversalSessionDoc = InferSchemaType<typeof roleReversalSessionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const RoleReversalSession =
  mongoose.models.RoleReversalSession ??
  mongoose.model<RoleReversalSessionDoc>("RoleReversalSession", roleReversalSessionSchema);
