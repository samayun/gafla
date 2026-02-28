import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/user";
import { verifyPassword, generateToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const { username, password } = await req.json();

        if (!username || !password) {
            return NextResponse.json(
                { error: "Username ও পাসওয়ার্ড দিন / Enter username and password" },
                { status: 400 }
            );
        }

        await connectDB();

        const user = await User.findOne({
            username: username.toLowerCase().trim(),
        });
        if (!user) {
            return NextResponse.json(
                { error: "Username পাওয়া যায়নি / Username not found" },
                { status: 404 }
            );
        }

        if (!verifyPassword(password, user.passwordHash, user.salt)) {
            return NextResponse.json(
                { error: "পাসওয়ার্ড ভুল / Wrong password" },
                { status: 401 }
            );
        }

        const authToken = generateToken();
        user.authToken = authToken;
        await user.save();

        return NextResponse.json({
            user: {
                username: user.username,
                displayName: user.displayName,
            },
            token: authToken,
        });
    } catch (err: any) {
        console.error("Signin error:", err);
        return NextResponse.json(
            { error: "সাইন ইন ব্যর্থ / Signin failed" },
            { status: 500 }
        );
    }
}
