import crypto from "node:crypto";
import mongoose, { Schema, type InferSchemaType } from "mongoose";

export function bookmarkLineFingerprint(lineText: string): string {
  return crypto
    .createHash("sha256")
    .update(lineText.trim().toLowerCase().replace(/\s+/g, " "))
    .digest("hex");
}

const conceptBookmarkSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sourceUploadId: { type: Schema.Types.ObjectId, ref: "Upload", required: true, index: true },
    /** Full narration script, ELI5 script, or Q&A answer the learner bookmarked (not subtitle chunks). */
    lineText: { type: String, required: true, trim: true, maxlength: 16000 },
    lineFingerprint: { type: String, required: true, index: true },
    tutorSessionId: { type: Schema.Types.ObjectId, ref: "TutorSession", default: null },
    slideIndex: { type: Number, default: null },
    slideTitle: { type: String, default: "", trim: true, maxlength: 300 },
    /** Where the line came from during tutor mode */
    subtitleSource: {
      type: String,
      enum: ["narration", "qa_answer"],
      default: "narration",
    },
    /** Gemini recap script; generated once, then only TTS runs on repeat visits. */
    recapScript: { type: String, default: "", trim: true, maxlength: 6500 },
  },
  { timestamps: true },
);

conceptBookmarkSchema.index(
  { userId: 1, sourceUploadId: 1, lineFingerprint: 1 },
  { unique: true },
);

export type ConceptBookmarkDoc = InferSchemaType<typeof conceptBookmarkSchema> & {
  _id: mongoose.Types.ObjectId;
};

export type ConceptBookmarkLean = {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  sourceUploadId: mongoose.Types.ObjectId;
  lineText: string;
  lineFingerprint: string;
  tutorSessionId: mongoose.Types.ObjectId | null;
  slideIndex: number | null;
  slideTitle: string;
  subtitleSource: "narration" | "qa_answer";
  recapScript?: string;
  createdAt: Date;
  updatedAt: Date;
};

export const ConceptBookmark =
  mongoose.models.ConceptBookmark ??
  mongoose.model<ConceptBookmarkDoc>("ConceptBookmark", conceptBookmarkSchema);
