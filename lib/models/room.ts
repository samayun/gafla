import mongoose, { Schema, Document } from "mongoose";

export interface ICard {
    a: number;
    b: number;
}

export interface IPlayer {
    name: string;
    seatIndex: number;
    socketId: string;
    connected: boolean;
    lastSeen: Date;
}

export interface IRoom extends Document {
    code: string;
    players: IPlayer[];
    board: ICard[];
    hands: ICard[][];
    boneyard: ICard[];
    turn: number;
    status: "lobby" | "playing" | "ended";
    scores: number[];
    passes: number[];
    round: number;
    createdAt: Date;
    updatedAt: Date;
}

const CardSchema = new Schema<ICard>(
    { a: Number, b: Number },
    { _id: false }
);

const PlayerSchema = new Schema<IPlayer>(
    {
        name: { type: String, required: true },
        seatIndex: { type: Number, required: true },
        socketId: { type: String, default: "" },
        connected: { type: Boolean, default: true },
        lastSeen: { type: Date, default: Date.now },
    },
    { _id: false }
);

const RoomSchema = new Schema<IRoom>(
    {
        code: { type: String, required: true, unique: true, uppercase: true },
        players: { type: [PlayerSchema], default: [] },
        board: { type: [CardSchema], default: [] },
        hands: { type: [[CardSchema]], default: [[], [], [], []] },
        boneyard: { type: [CardSchema], default: [] },
        turn: { type: Number, default: 0 },
        status: {
            type: String,
            enum: ["lobby", "playing", "ended"],
            default: "lobby",
        },
        scores: { type: [Number], default: [0, 0, 0, 0] },
        passes: { type: [Number], default: [0, 0, 0, 0] },
        round: { type: Number, default: 0 },
    },
    { timestamps: true }
);

export const Room =
    mongoose.models.Room || mongoose.model<IRoom>("Room", RoomSchema);
