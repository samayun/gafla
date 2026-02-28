import mongoose, { Schema, Document } from "mongoose";

export interface IMove extends Document {
    roomCode: string;
    round: number;
    playerIndex: number;
    playerName: string;
    action: "play" | "draw" | "pass";
    card?: { a: number; b: number };
    side?: "head" | "tail";
    boardSnapshot: { a: number; b: number }[];
    timestamp: Date;
}

const MoveSchema = new Schema<IMove>(
    {
        roomCode: { type: String, required: true, index: true },
        round: { type: Number, required: true },
        playerIndex: { type: Number, required: true },
        playerName: { type: String, required: true },
        action: { type: String, enum: ["play", "draw", "pass"], required: true },
        card: {
            type: { a: Number, b: Number },
            default: undefined,
        },
        side: { type: String, enum: ["head", "tail"] },
        boardSnapshot: [{ a: Number, b: Number, _id: false }],
        timestamp: { type: Date, default: Date.now },
    },
    { timestamps: false }
);

export const Move =
    mongoose.models.Move || mongoose.model<IMove>("Move", MoveSchema);
