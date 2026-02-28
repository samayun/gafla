"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { connectSocket } from "@/lib/client-socket";
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
    gameOver?: boolean;
    gameWinnerSeat?: number;
    gameWinnerName?: string;
    winningPoints?: number;
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

    const handleInteraction = (e: React.MouseEvent | React.TouchEvent) => {
        if (e.type === "touchend") e.preventDefault();
        if ((playable || inHand) && onClick) onClick();
    };

    return (
        <div
            className={`domino ${horizontal ? "horizontal" : ""} ${playable ? "playable" : ""} ${inHand ? "in-hand" : ""} ${small ? "small" : ""}`}
            onClick={handleInteraction}
            onTouchEnd={handleInteraction}
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
        rules: { firstRoundStartWith00?: boolean; blockerGetsZero?: boolean; winningPoints?: number; maximumVenda?: number };
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

        socket.on("auto-pass", (data: { playerName: string; message: string }) => {
            showToast(data.message, false);
        });

        socket.on("left-room", () => {
            setGameState(null);
            setView("seat-select");
            router.push("/lobby");
        });

        socket.on("player-left", (data: { displayName: string; message: string }) => {
            showToast(data.message, false);
        });

        return () => {
            socket.off("joined");
            socket.off("rejoined");
            socket.off("game-state");
            socket.off("round-end");
            socket.off("error");
            socket.off("room-info");
            socket.off("auth-error");
            socket.off("auto-pass");
            socket.off("left-room");
            socket.off("player-left");
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

    const leaveRoom = () => {
        socketRef.current?.emit("leave-room");
    };

    const playableMoves = useMemo(() => {
        if (!gameState || gameState.turn !== gameState.mySeat || gameState.status !== "playing")
            return [];

        if (gameState.board.length === 0) {
            const isFirstRound = gameState.round === 1;
            const firstRoundStartWith00 = gameState.rules?.firstRoundStartWith00 ?? true;

            if (isFirstRound && firstRoundStartWith00) {
                const has00 = gameState.myHand.some((c) => c.a === 0 && c.b === 0);
                if (has00) {
                    const idx = gameState.myHand.findIndex((c) => c.a === 0 && c.b === 0);
                    return [{ idx, side: "tail" as const }];
                }
                return gameState.myHand.map((_, i) => ({ idx: i, side: "tail" as const }));
            }

            if (isFirstRound && !firstRoundStartWith00) {
                return gameState.myHand.map((_, i) => ({ idx: i, side: "tail" as const }));
            }

            // Round 2+: winner must play any venda (0:0 not mandatory). No venda = pass.
            const hasDouble = gameState.myHand.some((c) => c.a === c.b);
            if (hasDouble) {
                return gameState.myHand
                    .map((c, i) => (c.a === c.b ? { idx: i, side: "tail" as const } : null))
                    .filter(Boolean) as { idx: number; side: "head" | "tail" }[];
            }
            return [];
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
        await navigator.clipboard.writeText(url).catch(() => { });
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
                    <button className="stat-badge exit-btn" onClick={leaveRoom}>
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

                            {/* Room Rules Config - only shown to creator */}
                            {gameState?.creator === user.username && (
                                <div className="room-rules-config">
                                    <h4>রুমের নিয়ম / Room Rules</h4>
                                    <label className="rule-toggle">
                                        <input
                                            type="checkbox"
                                            checked={gameState?.rules?.firstRoundStartWith00 ?? true}
                                            onChange={(e) =>
                                                socketRef.current?.emit("update-rules", {
                                                    firstRoundStartWith00: e.target.checked,
                                                })
                                            }
                                        />
                                        <span className="toggle-slider" />
                                        <span className="toggle-label">
                                            শুধু গেমের প্রথম রাউন্ডে 0:0। পরের রাউন্ড = জয়ী ভেন্ডা দিয়ে শুরু
                                            <small>0:0 only in game's first round. Later rounds = winner starts with venda</small>
                                        </span>
                                    </label>
                                    <label className="rule-toggle">
                                        <input
                                            type="checkbox"
                                            checked={gameState?.rules?.blockerGetsZero ?? false}
                                            onChange={(e) =>
                                                socketRef.current?.emit("update-rules", {
                                                    blockerGetsZero: e.target.checked,
                                                })
                                            }
                                        />
                                        <span className="toggle-slider" />
                                        <span className="toggle-label">
                                            শর্ট/ব্লকে ব্লকার শূন্য পয়েন্ট পাবে
                                            <small>Blocker gets zero on block</small>
                                        </span>
                                    </label>
                                    <div className="rule-input-row">
                                        <label className="toggle-label">
                                            জয়ের পয়েন্ট / Winning Points
                                            <small>Default 100</small>
                                        </label>
                                        <input
                                            type="number"
                                            min={10}
                                            max={500}
                                            value={gameState?.rules?.winningPoints ?? 100}
                                            onChange={(e) => {
                                                const v = parseInt(e.target.value, 10);
                                                if (!isNaN(v)) socketRef.current?.emit("update-rules", { winningPoints: v });
                                            }}
                                            className="winning-points-input"
                                        />
                                    </div>
                                    <div className="rule-input-row">
                                        <label className="toggle-label">
                                            সর্বোচ্চ ভেন্ডা / Max Venda per Hand
                                            <small>No player gets more. Default 4</small>
                                        </label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={7}
                                            value={gameState?.rules?.maximumVenda ?? 4}
                                            onChange={(e) => {
                                                const v = parseInt(e.target.value, 10);
                                                if (!isNaN(v)) socketRef.current?.emit("update-rules", { maximumVenda: v });
                                            }}
                                            className="winning-points-input"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Show current rules for non-creators */}
                            {gameState?.creator !== user.username && gameState?.rules && (
                                <div className="room-rules-display">
                                    <p>
                                        {(gameState.rules?.firstRoundStartWith00 ?? true) ? "✓" : "✗"} গেম ১ম রাউন্ড: 0:0। পরের রাউন্ড: জয়ী ভেন্ডা &nbsp;|&nbsp;
                                        {gameState.rules.blockerGetsZero ? "✓" : "✗"} ব্লকারের শূন্য &nbsp;|&nbsp;
                                        জয়: {gameState.rules.winningPoints ?? 100} পয়েন্ট &nbsp;|&nbsp;
                                        ম্যাক্স ভেন্ডা: {gameState.rules.maximumVenda ?? 4}
                                    </p>
                                </div>
                            )}

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
                    <div className="turn-indicator">
                        {gameState?.board.length === 0 && gameState?.round && gameState.round > 1
                            ? "ভেন্ডা দিয়ে শুরু করুন / Start with venda"
                            : "আপনার পালা!"}
                    </div>
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
                <div className="side-chooser-overlay" onClick={() => setSideChoice(null)}>
                    <div className="side-chooser" onClick={(e) => e.stopPropagation()}>
                        <h3>কোন দিকে খেলবেন?</h3>
                        <p className="en-text">Play on which side?</p>
                        <div style={{ margin: "8px 0", display: "flex", justifyContent: "center" }}>
                            <DominoTile a={sideChoice.card.a} b={sideChoice.card.b} />
                        </div>
                        <div className="side-chooser-btns">
                            <button className="side-btn head" onClick={() => chooseSide("head")} onTouchEnd={(e) => { e.preventDefault(); chooseSide("head"); }}>
                                ← মাথা / HEAD
                            </button>
                            <button className="side-btn tail" onClick={() => chooseSide("tail")} onTouchEnd={(e) => { e.preventDefault(); chooseSide("tail"); }}>
                                লেজ / TAIL →
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Round End / Game Over */}
            {roundResult && (
                <div className="game-overlay">
                    <div className="game-modal">
                        <h2 style={{ marginBottom: "15px", fontSize: "1.6rem" }}>
                            {roundResult.gameOver ? "গেম শেষ! / GAME OVER" : roundResult.blocked ? "গেম ব্লক! / BLOCKED" : "রাউন্ড শেষ / ROUND OVER"}
                        </h2>
                        <h2 style={{ color: "var(--accent-primary)", marginBottom: "10px" }}>
                            {roundResult.gameOver && roundResult.gameWinnerName
                                ? `${roundResult.gameWinnerName} খেলা জিতেছে!`
                                : `${roundResult.winnerName} রাউন্ড জিতেছে!`}
                        </h2>
                        {roundResult.blocked && !roundResult.gameOver && (
                            <p style={{ color: "var(--accent-secondary)", fontWeight: 800, marginBottom: "10px" }}>
                                মাস্টারস্ট্রোক ব্লক!
                            </p>
                        )}
                        {roundResult.gameOver && (
                            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "10px" }}>
                                জয়ের লক্ষ্য: {roundResult.winningPoints ?? 100} পয়েন্ট
                            </p>
                        )}
                        {!roundResult.gameOver && (
                            <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginBottom: "8px" }}>
                                পরের রাউন্ডে <strong>{roundResult.winnerName}</strong> (জয়ী) প্রথম চাল দেবেন — যেকোনো ভেন্ডা দিয়ে, ভেন্ডা না থাকলে পাস। 0:0 লাগবে না।
                                <br />
                                <small style={{ opacity: 0.8 }}>Winner starts next round with any venda — not 0:0</small>
                            </p>
                        )}
                        <div style={{ marginTop: "20px" }}>
                            {roundResult.roundPoints.map((pts, i) => {
                                const player = gameState?.players.find((p) => p.seatIndex === i);
                                if (!player) return null;
                                const isGameWinner = roundResult.gameOver && roundResult.gameWinnerSeat === i;
                                return (
                                    <div key={i} className={`score-row ${isGameWinner ? "winner-row" : ""}`}>
                                        <span>{player.displayName}{isGameWinner ? " 🏆" : ""}</span>
                                        <span style={{ color: "var(--accent-primary)", fontWeight: 800 }}>
                                            +{pts} (মোট: {roundResult.totalScores[i]})
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        {roundResult.gameOver ? (
                            <button className="btn-prime" onClick={leaveRoom} style={{ marginTop: "16px" }}>
                                লবিতে ফিরুন / Back to Lobby
                            </button>
                        ) : (
                            <button className="btn-prime" onClick={handleNextRound}>
                                পরের রাউন্ড / NEXT ROUND
                            </button>
                        )}
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
