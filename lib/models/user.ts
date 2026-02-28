import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
    username: string;
    displayName: string;
    passwordHash: string;
    salt: string;
    authToken: string;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        displayName: { type: String, required: true, trim: true },
        passwordHash: { type: String, required: true },
        salt: { type: String, required: true },
        authToken: { type: String, default: "" },
    },
    { timestamps: true }
);

export const User =
    mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
