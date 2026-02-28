import { connectDB } from "@/lib/db";
import { Room } from "@/lib/models/room";
import { User } from "@/lib/models/user";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ code: string }> }
) {
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

        const { code } = await params;
        const room = await Room.findOne({ code: code?.toUpperCase() });
        if (!room) {
            return NextResponse.json({ error: "Room not found" }, { status: 404 });
        }

        if (room.creator !== user.username) {
            return NextResponse.json({ error: "Only room creator can update config" }, { status: 403 });
        }

        if (room.status === "playing") {
            return NextResponse.json({ error: "Cannot change config during game" }, { status: 400 });
        }

        const body = await req.json();

        if (body.firstRoundStartWith00 !== undefined) {
            room.rules.firstRoundStartWith00 = !!body.firstRoundStartWith00;
        }
        if (body.blockerGetsZero !== undefined) {
            room.rules.blockerGetsZero = !!body.blockerGetsZero;
        }
        if (typeof body.winningPoints === "number") {
            room.rules.winningPoints = Math.max(10, Math.min(500, body.winningPoints));
        }
        if (typeof body.maximumVenda === "number") {
            room.rules.maximumVenda = Math.max(1, Math.min(7, body.maximumVenda));
        }

        await room.save();

        return NextResponse.json({ ok: true, rules: room.rules });
    } catch (err) {
        console.error("Room config update error:", err);
        return NextResponse.json({ error: "Failed to update config" }, { status: 500 });
    }
}
