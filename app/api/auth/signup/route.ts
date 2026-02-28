import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/user";
import { hashPassword, generateToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const { username, displayName, password } = await req.json();

        if (!username || !displayName || !password) {
            return NextResponse.json(
                { error: "সব ফিল্ড পূরণ করুন / All fields are required" },
                { status: 400 }
            );
        }

        if (username.length < 3 || username.length > 20) {
            return NextResponse.json(
                { error: "Username ৩-২০ অক্ষরের মধ্যে হতে হবে" },
                { status: 400 }
            );
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return NextResponse.json(
                { error: "Username এ শুধু ইংরেজি অক্ষর, সংখ্যা ও _ ব্যবহার করুন" },
                { status: 400 }
            );
        }

        if (password.length < 4) {
            return NextResponse.json(
                { error: "পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে" },
                { status: 400 }
            );
        }

        await connectDB();

        const existing = await User.findOne({
            username: username.toLowerCase(),
        });
        if (existing) {
            return NextResponse.json(
                { error: "এই Username আগে থেকেই আছে / Username already taken" },
                { status: 409 }
            );
        }

        const { hash, salt } = hashPassword(password);
        const authToken = generateToken();

        const user = await User.create({
            username: username.toLowerCase().trim(),
            displayName: displayName.trim(),
            passwordHash: hash,
            salt,
            authToken,
        });

        return NextResponse.json({
            user: {
                username: user.username,
                displayName: user.displayName,
            },
            token: authToken,
        });
    } catch (err: any) {
        console.error("Signup error:", err);
        return NextResponse.json(
            { error: "সাইন আপ ব্যর্থ / Signup failed" },
            { status: 500 }
        );
    }
}
