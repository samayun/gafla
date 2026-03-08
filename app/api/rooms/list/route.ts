import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Room } from "@/lib/models/room";

export async function GET() {
    try {
        await connectDB();

        const rooms = await Room.find(
            { status: { $in: ["lobby", "playing"] } },
            { code: 1, creator: 1, players: 1, status: 1, round: 1, rules: 1 }
        )
            .sort({ updatedAt: -1 })
            .limit(30)
            .lean();

        const list = rooms.map((r: any) => {
            const maxPlayers = r.rules?.maxPlayers ?? 4;
            return {
                code: r.code,
                creator: r.creator,
                status: r.status,
                round: r.round || 0,
                playerCount: r.players?.length || 0,
                maxPlayers,
                seats: Array.from({ length: maxPlayers }, (_, i) => {
                    const p = r.players?.find((pl: any) => pl.seatIndex === i);
                    return p
                        ? { occupied: true, displayName: p.displayName, username: p.username }
                        : { occupied: false };
                }),
            };
        });

        return NextResponse.json({ rooms: list });
    } catch (err) {
        console.error("List rooms error:", err);
        return NextResponse.json({ rooms: [] });
    }
}
