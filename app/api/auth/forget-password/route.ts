import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/user";
import { hashPassword, generateToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const { username, newPassword } = await req.json();

        if (!username) {
            return NextResponse.json(
                { error: "Username দিন / Enter your username" },
                { status: 400 }
            );
        }

        await connectDB();

        const user = await User.findOne({
            username: username.toLowerCase().trim(),
        });

        if (!user) {
            return NextResponse.json(
                { error: "এই Username পাওয়া যায়নি / Username not found" },
                { status: 404 }
            );
        }

        if (!newPassword) {
            return NextResponse.json({
                exists: true,
                displayName: user.displayName,
                message: "Username পাওয়া গেছে। নতুন পাসওয়ার্ড দিন।",
            });
        }

        if (newPassword.length < 4) {
            return NextResponse.json(
                { error: "পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে" },
                { status: 400 }
            );
        }

        const { hash, salt } = hashPassword(newPassword);
        const authToken = generateToken();

        user.passwordHash = hash;
        user.salt = salt;
        user.authToken = authToken;
        await user.save();

        return NextResponse.json({
            success: true,
            message: "পাসওয়ার্ড পরিবর্তন সফল / Password updated successfully",
            user: {
                username: user.username,
                displayName: user.displayName,
            },
            token: authToken,
        });
    } catch (err: any) {
        console.error("Forget password error:", err);
        return NextResponse.json(
            { error: "পাসওয়ার্ড রিসেট ব্যর্থ / Password reset failed" },
            { status: 500 }
        );
    }
}
