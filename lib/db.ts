import mongoose from "mongoose";

const DB_URL = process.env.DB_URL || "mongodb+srv://sam:sam@pengo.3wefaci.mongodb.net/gafla";

let cached = (global as any).mongoose as {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
};

if (!cached) {
    cached = (global as any).mongoose = { conn: null, promise: null };
}

export async function connectDB() {
    if (cached.conn) return cached.conn;

    if (!cached.promise) {
        cached.promise = mongoose.connect(DB_URL, {
            dbName: "gafla",
        });
    }

    cached.conn = await cached.promise;
    console.log("✅ MongoDB connected");
    return cached.conn;
}
