"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function SigninPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const { user, loading, login } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && user) router.replace("/lobby");
    }, [user, loading, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSubmitting(true);

        try {
            const res = await fetch("/api/auth/signin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error);
                return;
            }

            login(data.token, data.user);
            const returnUrl = new URLSearchParams(window.location.search).get("returnUrl");
            router.push(returnUrl || "/lobby");
        } catch {
            setError("কিছু ভুল হয়েছে / Something went wrong");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="page-center">
                <div className="spinner" />
            </div>
        );
    }

    return (
        <div className="auth-page">
            <div className="auth-card">
                <h1 className="auth-title">সাইন ইন</h1>
                <p className="auth-subtitle">আপনার অ্যাকাউন্টে লগ ইন করুন / Sign In</p>

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="input-group">
                        <label>ইউজারনেম / Username</label>
                        <input
                            type="text"
                            className="glass-input"
                            placeholder="আপনার username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toLowerCase())}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label>পাসওয়ার্ড / Password</label>
                        <input
                            type="password"
                            className="glass-input"
                            placeholder="পাসওয়ার্ড দিন"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    {error && <div className="auth-error">{error}</div>}

                    <button type="submit" className="btn-prime" disabled={submitting}>
                        {submitting ? "লগ ইন হচ্ছে..." : "সাইন ইন / Sign In"}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>
                        <Link href="/forget-password">পাসওয়ার্ড ভুলে গেছেন?</Link>
                    </p>
                    <p>
                        অ্যাকাউন্ট নেই?{" "}
                        <Link href="/signup">সাইন আপ করুন</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
