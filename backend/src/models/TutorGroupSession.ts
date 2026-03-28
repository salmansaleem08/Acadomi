import mongoose, { Schema, type InferSchemaType } from "mongoose";

const tutorGroupSessionSchema = new Schema(
  {
    tutorSessionId: { type: Schema.Types.ObjectId, ref: "TutorSession", required: true, index: true },
    hostUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    inviteeUserIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    acceptedUserIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    declinedUserIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    status: {
      type: String,
      enum: ["gathering", "live", "ended", "cancelled"],
      default: "gathering",
    },
    displayTitle: { type: String, required: true, trim: true, maxlength: 240 },
  },
  { timestamps: true },
);

export type TutorGroupSessionLean = {
  _id: mongoose.Types.ObjectId;
  tutorSessionId: mongoose.Types.ObjectId;
  hostUserId: mongoose.Types.ObjectId;
  inviteeUserIds: mongoose.Types.ObjectId[];
  acceptedUserIds: mongoose.Types.ObjectId[];
  declinedUserIds: mongoose.Types.ObjectId[];
  status: string;
  displayTitle: string;
  createdAt: Date;
  updatedAt: Date;
};

export const TutorGroupSession =
  mongoose.models.TutorGroupSession ??
  mongoose.model("TutorGroupSession", tutorGroupSessionSchema);
