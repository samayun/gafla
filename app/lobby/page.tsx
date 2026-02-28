"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

function generateRoomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

export default function LobbyPage() {
    const { user, loading, logout } = useAuth();
    const router = useRouter();

    const [joinCode, setJoinCode] = useState("");
    const [createdRoom, setCreatedRoom] = useState("");
    const [showShare, setShowShare] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            router.replace("/signin?returnUrl=/lobby");
        }
    }, [user, loading, router]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const r = params.get("room");
        if (r) {
            setJoinCode(r);
        }
    }, []);

    const handleCreateRoom = useCallback(() => {
        const code = generateRoomCode();
        setCreatedRoom(code);
        setShowShare(true);
    }, []);

    const handleGoToRoom = useCallback(
        (code: string) => {
            router.push(`/game?room=${code.toUpperCase()}`);
        },
        [router]
    );

    const handleJoinRoom = useCallback(() => {
        if (joinCode.trim()) {
            handleGoToRoom(joinCode.trim());
        }
    }, [joinCode, handleGoToRoom]);

    const getInviteUrl = useCallback(() => {
        const base = typeof window !== "undefined" ? window.location.origin : "";
        return `${base}/game?room=${createdRoom}`;
    }, [createdRoom]);

    const shareWhatsApp = useCallback(() => {
        const url = getInviteUrl();
        const text = `গাফলা (GAFLA) খেলতে আসো! 🎲\nRoom Code: ${createdRoom}\n${url}`;
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
    }, [createdRoom, getInviteUrl]);

    const shareFacebook = useCallback(() => {
        const url = getInviteUrl();
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "_blank");
    }, [getInviteUrl]);

    const shareMessenger = useCallback(() => {
        const url = getInviteUrl();
        window.open(`fb-messenger://share/?link=${encodeURIComponent(url)}`, "_blank");
    }, [getInviteUrl]);

    const copyLink = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(getInviteUrl());
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const input = document.createElement("input");
            input.value = getInviteUrl();
            document.body.appendChild(input);
            input.select();
            document.execCommand("copy");
            document.body.removeChild(input);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [getInviteUrl]);

    if (loading || !user) {
        return (
            <div className="page-center">
                <div className="spinner" />
            </div>
        );
    }

    return (
        <div className="lobby-page">
            <header className="lobby-header">
                <div className="lobby-brand">
                    <h1>গাফলা <span className="accent">GAFLA</span></h1>
                </div>
                <div className="lobby-user-info">
                    <span className="user-badge">
                        {user.displayName} <small>@{user.username}</small>
                    </span>
                    <Link href="/customization" className="nav-link">কাস্টমাইজ</Link>
                    <Link href="/rules" className="nav-link">নিয়ম</Link>
                    <Link href="/guide" className="nav-link">গাইড</Link>
                    <button onClick={logout} className="btn-small btn-danger">
                        লগ আউট
                    </button>
                </div>
            </header>

            <div className="lobby-main">
                <div className="lobby-grid">
                    {/* Create Room */}
                    <div className="lobby-card">
                        <h2>রুম তৈরি করুন</h2>
                        <p>নতুন রুম তৈরি করে বন্ধুদের আমন্ত্রণ জানান</p>
                        <p className="en-text">Create a new room and invite friends</p>
                        <button className="btn-prime" onClick={handleCreateRoom}>
                            রুম তৈরি / Create Room
                        </button>
                    </div>

                    {/* Join Room */}
                    <div className="lobby-card">
                        <h2>রুমে যোগ দিন</h2>
                        <p>রুম কোড দিয়ে খেলায় যোগ দিন</p>
                        <p className="en-text">Enter room code to join a game</p>
                        <div className="join-input-group">
                            <input
                                type="text"
                                className="glass-input"
                                placeholder="রুম কোড / Room Code"
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                                maxLength={6}
                            />
                            <button
                                className="btn-prime"
                                onClick={handleJoinRoom}
                                disabled={!joinCode.trim()}
                            >
                                যোগ দিন / Join
                            </button>
                        </div>
                    </div>
                </div>

                {/* Share Modal */}
                {showShare && (
                    <div className="share-overlay" onClick={() => setShowShare(false)}>
                        <div className="share-modal" onClick={(e) => e.stopPropagation()}>
                            <h2>রুম তৈরি হয়েছে!</h2>
                            <div className="room-code-display">
                                <span className="room-code-big">{createdRoom}</span>
                            </div>
                            <p>এই কোড বা লিংক শেয়ার করে বন্ধুদের আমন্ত্রণ জানান</p>
                            <p className="en-text">Share this code or link to invite friends</p>

                            <div className="share-buttons">
                                <button className="share-btn whatsapp" onClick={shareWhatsApp}>
                                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                    </svg>
                                    WhatsApp
                                </button>
                                <button className="share-btn facebook" onClick={shareFacebook}>
                                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                    </svg>
                                    Facebook
                                </button>
                                <button className="share-btn messenger" onClick={shareMessenger}>
                                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                        <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.654V24l4.088-2.242c1.092.301 2.246.464 3.443.464 6.627 0 12-4.975 12-11.111S18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8.2l3.131 3.259L19.752 8.2l-6.561 6.763z" />
                                    </svg>
                                    Messenger
                                </button>
                                <button className="share-btn copy" onClick={copyLink}>
                                    {copied ? "কপি হয়েছে! ✓" : "লিংক কপি / Copy Link"}
                                </button>
                            </div>

                            <button
                                className="btn-prime"
                                style={{ marginTop: "20px" }}
                                onClick={() => handleGoToRoom(createdRoom)}
                            >
                                রুমে যান / Go to Room
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
