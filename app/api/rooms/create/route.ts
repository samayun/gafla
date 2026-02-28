import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Room } from "@/lib/models/room";
import { User } from "@/lib/models/user";

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get("authorization") || "";
        const token = authHeader.replace("Bearer ", "");
        if (!token) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectDB();
        const user = await User.findOne({ authToken: token });
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { code } = await req.json();
        if (!code) {
            return NextResponse.json({ error: "Room code required" }, { status: 400 });
        }

        const existing = await Room.findOne({ code: code.toUpperCase() });
        if (existing) {
            return NextResponse.json({ ok: true, code: existing.code });
        }

        const room = await Room.create({
            code: code.toUpperCase(),
            creator: user.username,
            players: [],
            hands: [[], [], [], []],
            scores: [0, 0, 0, 0],
            passes: [0, 0, 0, 0],
        });

        return NextResponse.json({ ok: true, code: room.code });
    } catch (err) {
        console.error("Create room error:", err);
        return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
    }
}
