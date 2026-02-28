import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/user";

export async function POST(req: NextRequest) {
    try {
        const { username } = await req.json();

        if (!username) {
            return NextResponse.json({ available: false });
        }

        await connectDB();

        const existing = await User.findOne({
            username: username.toLowerCase().trim(),
        });

        return NextResponse.json({ available: !existing });
    } catch {
        return NextResponse.json({ available: false });
    }
}
