"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function LandingPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && user) {
            router.replace("/lobby");
        }
    }, [user, loading, router]);

    if (loading) {
        return (
            <div className="page-center">
                <div className="spinner" />
            </div>
        );
    }

    return (
        <div className="landing">
            <div className="landing-bg" />
            <div className="landing-content">
                <div className="landing-hero">
                    <h1 className="landing-title">
                        গাফলা<span className="accent">GAFLA</span>
                    </h1>
                    <p className="landing-tagline">
                        বাংলাদেশের সেরা অনলাইন ডমিনো গেম
                    </p>
                    <p className="landing-desc">
                        Premium Bangladeshi Domino Experience — বন্ধুদের সাথে রিয়েল-টাইমে খেলুন
                    </p>

                    <div className="landing-features">
                        <div className="feature-card">
                            <div className="feature-icon">🎲</div>
                            <h3>রিয়েল-টাইম মাল্টিপ্লেয়ার</h3>
                            <p>৪ জন পর্যন্ত একসাথে খেলুন</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">📱</div>
                            <h3>যেকোনো ডিভাইস</h3>
                            <p>মোবাইল ও ডেস্কটপে খেলুন</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">🔗</div>
                            <h3>সহজে আমন্ত্রণ</h3>
                            <p>লিংক শেয়ার করে বন্ধুদের আনুন</p>
                        </div>
                    </div>

                    <div className="landing-actions">
                        <Link href="/signup" className="btn-prime landing-btn">
                            সাইন আপ / Sign Up
                        </Link>
                        <Link href="/signin" className="btn-outline landing-btn">
                            সাইন ইন / Sign In
                        </Link>
                    </div>

                    <div className="landing-links">
                        <Link href="/rules">খেলার নিয়ম / Rules</Link>
                        <Link href="/guide">কিভাবে খেলবেন / Guide</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
