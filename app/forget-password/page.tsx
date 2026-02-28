"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function ForgetPasswordPage() {
    const [step, setStep] = useState<"check" | "reset">("check");
    const [username, setUsername] = useState("");
    const [foundName, setFoundName] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const { login } = useAuth();
    const router = useRouter();

    const handleCheckUsername = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSubmitting(true);

        try {
            const res = await fetch("/api/auth/forget-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error);
                return;
            }

            if (data.exists) {
                setFoundName(data.displayName);
                setStep("reset");
            }
        } catch {
            setError("কিছু ভুল হয়েছে / Something went wrong");
        } finally {
            setSubmitting(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (newPassword !== confirmPassword) {
            setError("পাসওয়ার্ড মিলছে না / Passwords don't match");
            return;
        }

        setSubmitting(true);

        try {
            const res = await fetch("/api/auth/forget-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, newPassword }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error);
                return;
            }

            if (data.success) {
                login(data.token, data.user);
                setSuccess(data.message);
                setTimeout(() => router.push("/lobby"), 1500);
            }
        } catch {
            setError("কিছু ভুল হয়েছে / Something went wrong");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <h1 className="auth-title">পাসওয়ার্ড রিসেট</h1>
                <p className="auth-subtitle">
                    {step === "check"
                        ? "আপনার username দিন / Enter your username"
                        : `স্বাগতম, ${foundName}! নতুন পাসওয়ার্ড দিন`}
                </p>

                {step === "check" ? (
                    <form onSubmit={handleCheckUsername} className="auth-form">
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

                        {error && <div className="auth-error">{error}</div>}

                        <button type="submit" className="btn-prime" disabled={submitting}>
                            {submitting ? "খুঁজছি..." : "Username খুঁজুন / Find Account"}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleResetPassword} className="auth-form">
                        <div className="input-group">
                            <label>নতুন পাসওয়ার্ড / New Password</label>
                            <input
                                type="password"
                                className="glass-input"
                                placeholder="কমপক্ষে ৪ অক্ষর"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                minLength={4}
                                required
                            />
                        </div>
                        <div className="input-group">
                            <label>পাসওয়ার্ড নিশ্চিত করুন / Confirm</label>
                            <input
                                type="password"
                                className="glass-input"
                                placeholder="আবার লিখুন"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                minLength={4}
                                required
                            />
                        </div>

                        {error && <div className="auth-error">{error}</div>}
                        {success && <div className="auth-success">{success}</div>}

                        <button type="submit" className="btn-prime" disabled={submitting}>
                            {submitting ? "পরিবর্তন হচ্ছে..." : "পাসওয়ার্ড পরিবর্তন / Reset"}
                        </button>
                    </form>
                )}

                <div className="auth-footer">
                    <p>
                        <Link href="/signin">সাইন ইন এ ফিরে যান</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
