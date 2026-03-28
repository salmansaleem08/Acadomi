import mongoose, { Schema, type InferSchemaType } from "mongoose";

const fileMetaSchema = new Schema(
  {
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
  },
  { _id: false },
);

const uploadSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: {
      type: String,
      enum: ["pdf", "image", "audio"],
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    userPrompt: { type: String, default: "" },
    extractedText: { type: String, default: "" },
    processedContent: { type: String, default: "" },
    fileMeta: { type: [fileMetaSchema], default: [] },
    status: {
      type: String,
      enum: ["processing", "completed", "failed"],
      default: "processing",
    },
    errorMessage: { type: String },
  },
  { timestamps: true },
);

export type UploadDoc = InferSchemaType<typeof uploadSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Upload =
  mongoose.models.Upload ?? mongoose.model<UploadDoc>("Upload", uploadSchema);
