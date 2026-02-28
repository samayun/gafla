"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { connectSocket, resetSocket } from "@/lib/client-socket";
import type { SanitizedState } from "@/lib/game-engine";
import type { Socket } from "socket.io-client";

const DOTS: Record<number, string[]> = {
    1: ["d1"],
    2: ["d2a", "d2b"],
    3: ["d3a", "d3b", "d3c"],
    4: ["d4a", "d4b", "d4c", "d4d"],
    5: ["d5a", "d5b", "d5c", "d5d", "d5e"],
    6: ["d6a", "d6b", "d6c", "d6d", "d6e", "d6f"],
};

interface SideChoice {
    cardIdx: number;
    card: { a: number; b: number };
}

interface RoundResult {
    winner: number;
    winnerName: string;
    blocked: boolean;
    roundPoints: number[];
    totalScores: number[];
}

function DominoTile({
    a,
    b,
    horizontal = false,
    playable = false,
    inHand = false,
    small = false,
    onClick,
}: {
    a: number;
    b: number;
    horizontal?: boolean;
    playable?: boolean;
    inHand?: boolean;
    small?: boolean;
    onClick?: () => void;
}) {
    const half = (v: number) => (
        <div className="half">
            {DOTS[v]?.map((pos) => (
                <div key={pos} className={`dot ${pos} v${v}`} />
            ))}
        </div>
    );

    return (
        <div
            className={`domino ${horizontal ? "horizontal" : ""} ${playable ? "playable" : ""} ${inHand ? "in-hand" : ""} ${small ? "small" : ""}`}
            onClick={playable || inHand ? onClick : undefined}
        >
            {half(a)}
            <div className="divider" />
            {half(b)}
        </div>
    );
}

export default function GamePageWrapper() {
    return (
        <Suspense fallback={<div className="page-center"><div className="spinner" /></div>}>
            <GamePage />
        </Suspense>
    );
}

function GamePage() {
    const { user, token, loading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const roomCode = searchParams.get("room")?.toUpperCase() || "";

    const [view, setView] = useState<"seat-select" | "game">("seat-select");
    const [seat, setSeat] = useState(0);
    const [gameState, setGameState] = useState<SanitizedState | null>(null);
    const [toasts, setToasts] = useState<{ id: number; text: string; error?: boolean }[]>([]);
    const [sideChoice, setSideChoice] = useState<SideChoice | null>(null);
    const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
    const [roomInfo, setRoomInfo] = useState<{
        players: { username: string; displayName: string; seatIndex: number; connected: boolean }[];
        status: string;
        creator: string;
        rules: { mustStartWith00: boolean; blockerGetsZero: boolean };
    } | null>(null);
    const [copied, setCopied] = useState(false);

    const toastId = useRef(0);
    const socketRef = useRef<Socket | null>(null);

    const showToast = useCallback((text: string, error = false) => {
        const id = ++toastId.current;
        setToasts((prev) => [...prev, { id, text, error }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
    }, []);

    useEffect(() => {
        if (!loading && !user) {
            router.replace(`/signin?returnUrl=/game?room=${roomCode}`);
        }
    }, [user, loading, router, roomCode]);

    // Socket setup
    useEffect(() => {
        if (!token || !roomCode) return;

        const socket = connectSocket(token);
        socketRef.current = socket;

        socket.on("joined", (state: SanitizedState) => {
            setGameState(state);
            setView("game");
        });

        socket.on("rejoined", (state: SanitizedState) => {
            setGameState(state);
            setView("game");
        });

        socket.on("game-state", (state: SanitizedState) => {
            setGameState(state);
        });

        socket.on("round-end", (result: RoundResult) => {
            setRoundResult(result);
        });

        socket.on("error", (data: { message: string }) => {
            showToast(data.message, true);
        });

        socket.on("room-info", (info: any) => {
            setRoomInfo(info);
        });

        socket.on("auth-error", () => {
            router.replace("/signin");
        });

        return () => {
            socket.off("joined");
            socket.off("rejoined");
            socket.off("game-state");
            socket.off("round-end");
            socket.off("error");
            socket.off("room-info");
            socket.off("auth-error");
        };
    }, [token, roomCode, showToast, router]);

    // Poll room info for seat selection
    useEffect(() => {
        if (view !== "seat-select" || !roomCode || !socketRef.current) return;

        const poll = () => {
            socketRef.current?.emit("get-room-info", { room: roomCode });
        };
        poll();
        const interval = setInterval(poll, 2000);
        return () => clearInterval(interval);
    }, [view, roomCode]);

    const joinRoom = useCallback(() => {
        if (!roomCode) return;
        socketRef.current?.emit("join-room", { room: roomCode, seat });
    }, [roomCode, seat]);

    const startGame = () => socketRef.current?.emit("start-game");

    const handlePlayCard = (cardIdx: number) => {
        if (!gameState || gameState.turn !== gameState.mySeat) return;
        const card = gameState.myHand[cardIdx];

        if (gameState.board.length === 0) {
            socketRef.current?.emit("play-card", { cardIdx, side: "tail" });
            return;
        }

        const head = gameState.board[0].a;
        const tail = gameState.board[gameState.board.length - 1].b;
        const canHead = card.a === head || card.b === head;
        const canTail = card.a === tail || card.b === tail;

        if (canHead && canTail && head !== tail) {
            setSideChoice({ cardIdx, card });
        } else if (canHead) {
            socketRef.current?.emit("play-card", { cardIdx, side: "head" });
        } else if (canTail) {
            socketRef.current?.emit("play-card", { cardIdx, side: "tail" });
        }
    };

    const chooseSide = (side: "head" | "tail") => {
        if (!sideChoice) return;
        socketRef.current?.emit("play-card", { cardIdx: sideChoice.cardIdx, side });
        setSideChoice(null);
    };

    const handleDraw = () => socketRef.current?.emit("draw-card");
    const handlePass = () => socketRef.current?.emit("pass-turn");

    const handleNextRound = () => {
        setRoundResult(null);
        socketRef.current?.emit("next-round");
    };

    const exitGame = () => {
        resetSocket();
        router.push("/lobby");
    };

    const playableMoves = useMemo(() => {
        if (!gameState || gameState.turn !== gameState.mySeat || gameState.status !== "playing")
            return [];

        if (gameState.board.length === 0) {
            const has00 = gameState.myHand.some((c) => c.a === 0 && c.b === 0);
            if (has00) {
                const idx = gameState.myHand.findIndex((c) => c.a === 0 && c.b === 0);
                return [{ idx, side: "tail" as const }];
            }
            return gameState.myHand.map((_, i) => ({ idx: i, side: "tail" as const }));
        }

        const head = gameState.board[0].a;
        const tail = gameState.board[gameState.board.length - 1].b;
        const moves: { idx: number; side: "head" | "tail" }[] = [];

        gameState.myHand.forEach((c, i) => {
            if (c.a === head || c.b === head) moves.push({ idx: i, side: "head" });
            if (c.a === tail || c.b === tail) {
                if (!moves.find((m) => m.idx === i)) moves.push({ idx: i, side: "tail" });
            }
        });

        return moves;
    }, [gameState]);

    const copyInvite = async () => {
        const url = `${window.location.origin}/game?room=${roomCode}`;
        await navigator.clipboard.writeText(url).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const shareWhatsApp = () => {
        const url = `${window.location.origin}/game?room=${roomCode}`;
        const text = `গাফলা খেলতে আসো! 🎲\nRoom: ${roomCode}\n${url}`;
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
    };

    if (loading || !user) {
        return <div className="page-center"><div className="spinner" /></div>;
    }

    if (!roomCode) {
        return (
            <div className="page-center">
                <div className="auth-card">
                    <h2>রুম কোড নেই</h2>
                    <p>Please provide a room code.</p>
                    <button className="btn-prime" onClick={() => router.push("/lobby")}>
                        লবিতে যান / Go to Lobby
                    </button>
                </div>
            </div>
        );
    }

    // --- SEAT SELECTION ---
    if (view === "seat-select") {
        return (
            <div className="lobby-container">
                <div className="lobby-card" style={{ maxWidth: "600px" }}>
                    <h1 className="lobby-title">
                        গাফলা <span style={{ color: "var(--accent-primary)" }}>GAFLA</span>
                    </h1>
                    <p className="lobby-subtitle">রুম: {roomCode}</p>

                    <div className="invite-bar">
                        <button className="share-btn-sm whatsapp" onClick={shareWhatsApp}>WhatsApp</button>
                        <button className="share-btn-sm copy" onClick={copyInvite}>
                            {copied ? "কপি হয়েছে ✓" : "লিংক কপি"}
                        </button>
                    </div>

                    <div className="input-group">
                        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginTop: "10px" }}>
                            সিট বাছাই করুন / Select Your Seat:
                        </p>
                        <div className="player-selector">
                            {[0, 1, 2, 3].map((i) => {
                                const existing = roomInfo?.players.find((p) => p.seatIndex === i);
                                const taken = existing && existing.username !== user.username;

                                return (
                                    <button
                                        key={i}
                                        className={`seat-btn ${seat === i ? "selected" : ""} ${taken ? "taken" : ""}`}
                                        onClick={() => !taken && setSeat(i)}
                                    >
                                        সিট {i + 1}
                                        <span className="seat-status">
                                            {existing
                                                ? existing.connected
                                                    ? existing.displayName
                                                    : `${existing.displayName} (দূরে)`
                                                : "খালি / Empty"}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <button className="btn-prime" onClick={joinRoom}>
                        টেবিলে বসুন / JOIN TABLE
                    </button>

                    <button
                        className="btn-outline"
                        style={{ marginTop: "10px" }}
                        onClick={() => router.push("/lobby")}
                    >
                        লবিতে ফিরুন / Back to Lobby
                    </button>
                </div>

                {toasts.map((t) => (
                    <div key={t.id} className={`toast ${t.error ? "error" : ""}`}>{t.text}</div>
                ))}
            </div>
        );
    }

    // --- GAME VIEW ---
    const isMyTurn = gameState?.turn === gameState?.mySeat && gameState?.status === "playing";
    const hasPossible = playableMoves.length > 0;
    const canDraw = isMyTurn && !hasPossible && (gameState?.boneyard || 0) > 0;
    const canPass = isMyTurn && !hasPossible && (gameState?.boneyard || 0) === 0;

    const positionOrder = gameState
        ? [
            (gameState.mySeat + 2) % 4,
            (gameState.mySeat + 1) % 4,
            (gameState.mySeat + 3) % 4,
            gameState.mySeat,
        ]
        : [2, 1, 3, 0];
    const positionClasses = ["tag-top", "tag-right", "tag-left", "tag-bottom"];

    return (
        <div className="game-view">
            {/* Header */}
            <header className="game-header">
                <div className="header-left">
                    <div className="logo">গাফলা</div>
                </div>
                <div className="header-stats">
                    <div className="stat-badge">
                        রুম: <span className="accent">{gameState?.code || roomCode}</span>
                    </div>
                    <div className="stat-badge hide-mobile">
                        আমি: <span style={{ color: "var(--accent-secondary)" }}>{user.displayName}</span>
                    </div>
                    <button className="stat-badge exit-btn" onClick={exitGame}>
                        বের হন
                    </button>
                </div>
            </header>

            {/* Main Board */}
            <div className="main-board">
                <div className="board-viewport">
                    {gameState?.status === "playing" || gameState?.status === "ended" ? (
                        <div className="domino-chain snake-layout">
                            {gameState.board.map((c, i) => (
                                <DominoTile
                                    key={i}
                                    a={c.a}
                                    b={c.b}
                                    horizontal={c.a !== c.b}
                                    small
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="waiting-message">
                            <h2>
                                খেলোয়াড়দের জন্য অপেক্ষা
                                <span className="pulse-dot">...</span>
                            </h2>
                            <p>
                                {gameState?.players.length || 0}/4 জন রুমে আছে •{" "}
                                {(gameState?.players.length || 0) >= 2
                                    ? "শুরু করার জন্য প্রস্তুত!"
                                    : "কমপক্ষে ২ জন দরকার"}
                            </p>
                            {(gameState?.players.length || 0) >= 2 && (
                                <button className="action-btn start-game" style={{ marginTop: "20px" }} onClick={startGame}>
                                    খেলা শুরু / START GAME
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Player Tags */}
                {positionOrder.map((seatIdx, posIdx) => {
                    const player = gameState?.players.find((p) => p.seatIndex === seatIdx);
                    const isActive = gameState?.turn === seatIdx;
                    const handSize = gameState?.handSizes?.[seatIdx] || 0;
                    const score = gameState?.scores?.[seatIdx] || 0;

                    return (
                        <div
                            key={seatIdx}
                            className={`player-tag ${positionClasses[posIdx]} ${isActive ? "active" : ""}`}
                        >
                            <span className="tag-name">
                                {player?.displayName || `সিট ${seatIdx + 1}`}
                            </span>
                            <span className="tag-status">
                                {player
                                    ? player.connected ? "অনলাইন" : "দূরে"
                                    : "খালি"}{" "}
                                | {handSize} তাস | {score} পয়েন্ট
                            </span>
                        </div>
                    );
                })}

                {/* Boneyard */}
                <div className="boneyard">
                    <div className="bone-stack">
                        {Array.from({ length: Math.min(gameState?.boneyard || 0, 5) }).map((_, i) => (
                            <div key={i} className="card-back" />
                        ))}
                    </div>
                    <div className="bone-label">
                        বোনইয়ার্ড: <span className="accent">{gameState?.boneyard || 0}</span>
                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="action-bar">
                {isMyTurn && (
                    <div className="turn-indicator">আপনার পালা!</div>
                )}
                {canDraw && (
                    <button className="action-btn" onClick={handleDraw}>তাস তুলুন / DRAW</button>
                )}
                {canPass && (
                    <button className="action-btn pass" onClick={handlePass}>পাস / PASS</button>
                )}
            </div>

            {/* My Hand */}
            <div className="game-footer">
                <div className="hand-container">
                    <div className="my-hand">
                        {gameState?.myHand.map((c, i) => {
                            const isPlayable = playableMoves.some((m) => m.idx === i);
                            return (
                                <DominoTile
                                    key={`${c.a}-${c.b}-${i}`}
                                    a={c.a}
                                    b={c.b}
                                    playable={isPlayable}
                                    inHand
                                    onClick={() => isPlayable && handlePlayCard(i)}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Side Chooser */}
            {sideChoice && (
                <div className="side-chooser-overlay">
                    <div className="side-chooser">
                        <h3>কোন দিকে খেলবেন?</h3>
                        <p className="en-text">Play on which side?</p>
                        <div className="side-chooser-btns">
                            <button className="side-btn head" onClick={() => chooseSide("head")}>
                                ← মাথা / HEAD
                            </button>
                            <button className="side-btn tail" onClick={() => chooseSide("tail")}>
                                লেজ / TAIL →
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Round End */}
            {roundResult && (
                <div className="game-overlay">
                    <div className="game-modal">
                        <h2 style={{ marginBottom: "15px", fontSize: "1.6rem" }}>
                            {roundResult.blocked ? "গেম ব্লক! / BLOCKED" : "রাউন্ড শেষ / ROUND OVER"}
                        </h2>
                        <h2 style={{ color: "var(--accent-primary)", marginBottom: "10px" }}>
                            {roundResult.winnerName} জিতেছে!
                        </h2>
                        {roundResult.blocked && (
                            <p style={{ color: "var(--accent-secondary)", fontWeight: 800, marginBottom: "10px" }}>
                                মাস্টারস্ট্রোক ব্লক!
                            </p>
                        )}
                        <div style={{ marginTop: "20px" }}>
                            {roundResult.roundPoints.map((pts, i) => {
                                const player = gameState?.players.find((p) => p.seatIndex === i);
                                if (!player) return null;
                                return (
                                    <div key={i} className="score-row">
                                        <span>{player.displayName}</span>
                                        <span style={{ color: "var(--accent-primary)", fontWeight: 800 }}>
                                            +{pts} পয়েন্ট (মোট: {roundResult.totalScores[i]})
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        <button className="btn-prime" onClick={handleNextRound}>
                            পরের রাউন্ড / NEXT ROUND
                        </button>
                    </div>
                </div>
            )}

            {/* Toasts */}
            {toasts.map((t) => (
                <div key={t.id} className={`toast ${t.error ? "error" : ""}`}>{t.text}</div>
            ))}
        </div>
    );
}
