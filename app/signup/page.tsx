"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function SignupPage() {
    const [displayName, setDisplayName] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [checking, setChecking] = useState(false);
    const [available, setAvailable] = useState<boolean | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const { user, loading, login } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && user) router.replace("/lobby");
    }, [user, loading, router]);

    // Check username availability with debounce
    useEffect(() => {
        if (username.length < 3) {
            setAvailable(null);
            return;
        }
        setChecking(true);
        const timer = setTimeout(async () => {
            try {
                const res = await fetch("/api/auth/check-username", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username }),
                });
                const data = await res.json();
                setAvailable(data.available);
            } catch {
                setAvailable(null);
            } finally {
                setChecking(false);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [username]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSubmitting(true);

        try {
            const res = await fetch("/api/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, displayName, password }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error);
                return;
            }

            login(data.token, data.user);
            router.push("/lobby");
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
                <h1 className="auth-title">সাইন আপ</h1>
                <p className="auth-subtitle">নতুন অ্যাকাউন্ট তৈরি করুন / Create Account</p>

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="input-group">
                        <label>নাম / Display Name</label>
                        <input
                            type="text"
                            className="glass-input"
                            placeholder="আপনার নাম লিখুন"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label>
                            ইউজারনেম / Username
                            {checking && <span className="check-status checking">চেক করা হচ্ছে...</span>}
                            {!checking && available === true && (
                                <span className="check-status ok">ব্যবহারযোগ্য ✓</span>
                            )}
                            {!checking && available === false && (
                                <span className="check-status taken">আগে থেকেই আছে ✗</span>
                            )}
                        </label>
                        <input
                            type="text"
                            className="glass-input"
                            placeholder="username (ইংরেজি, সংখ্যা, _)"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                            minLength={3}
                            maxLength={20}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label>পাসওয়ার্ড / Password</label>
                        <input
                            type="password"
                            className="glass-input"
                            placeholder="কমপক্ষে ৪ অক্ষর"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            minLength={4}
                            required
                        />
                    </div>

                    {error && <div className="auth-error">{error}</div>}

                    <button
                        type="submit"
                        className="btn-prime"
                        disabled={submitting || available === false}
                    >
                        {submitting ? "তৈরি হচ্ছে..." : "অ্যাকাউন্ট তৈরি করুন / Sign Up"}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>
                        আগে থেকেই অ্যাকাউন্ট আছে?{" "}
                        <Link href="/signin">সাইন ইন করুন</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
