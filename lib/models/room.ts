import mongoose, { Schema, Document } from "mongoose";

export interface ICard {
    a: number;
    b: number;
}

export interface IPlayer {
    username: string;
    displayName: string;
    seatIndex: number;
    connected: boolean;
    lastSeen: Date;
}

export interface IRoomRules {
    firstRoundStartWith00: boolean;
    blockerGetsZero: boolean;
    winningPoints: number;
    maximumVenda: number;
    maxPlayers: number;
    useLowestVendaForFewPlayers?: boolean;
    blockerRefill?: boolean;
}

/** Seat indices that are bot-controlled (e.g. [1,2,3] for single-player). */
export interface IRoom extends Document {
    code: string;
    creator: string;
    players: IPlayer[];
    botSeats?: number[];
    board: ICard[];
    hands: ICard[][];
    boneyard: ICard[];
    turn: number;
    status: "lobby" | "playing" | "ended";
    scores: number[];
    passes: number[];
    round: number;
    lastWinner: number;
    rules: IRoomRules;
    createdAt: Date;
    updatedAt: Date;
}

const CardSchema = new Schema<ICard>(
    { a: Number, b: Number },
    { _id: false }
);

const PlayerSchema = new Schema<IPlayer>(
    {
        username: { type: String, required: true },
        displayName: { type: String, required: true },
        seatIndex: { type: Number, required: true },
        connected: { type: Boolean, default: true },
        lastSeen: { type: Date, default: Date.now },
    },
    { _id: false }
);

const RulesSchema = new Schema<IRoomRules>(
    {
        firstRoundStartWith00: { type: Boolean, default: true },
        blockerGetsZero: { type: Boolean, default: true },
        winningPoints: { type: Number, default: 100 },
        maximumVenda: { type: Number, default: 4 },
        maxPlayers: { type: Number, default: 4, min: 1, max: 4 },
        useLowestVendaForFewPlayers: { type: Boolean, default: true },
        blockerRefill: { type: Boolean, default: true },
    },
    { _id: false }
);

const RoomSchema = new Schema<IRoom>(
    {
        code: { type: String, required: true, unique: true, uppercase: true },
        creator: { type: String, default: "" },
        players: { type: [PlayerSchema], default: [] },
        botSeats: { type: [Number], default: undefined },
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
        lastWinner: { type: Number, default: -1 },
        rules: { type: RulesSchema, default: () => ({}) },
    },
    { timestamps: true }
);

export const Room =
    mongoose.models.Room || mongoose.model<IRoom>("Room", RoomSchema);
