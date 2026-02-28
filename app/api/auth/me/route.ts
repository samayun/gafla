import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/user";

export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get("authorization");
        const token = authHeader?.replace("Bearer ", "");

        if (!token) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        await connectDB();

        const user = await User.findOne({ authToken: token });
        if (!user) {
            return NextResponse.json(
                { error: "Invalid token" },
                { status: 401 }
            );
        }

        return NextResponse.json({
            user: {
                username: user.username,
                displayName: user.displayName,
            },
        });
    } catch (err: any) {
        console.error("Auth check error:", err);
        return NextResponse.json(
            { error: "Auth check failed" },
            { status: 500 }
        );
    }
}
