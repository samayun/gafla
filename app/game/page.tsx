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

    const tapped = useRef(false);

    const handleTouchEnd = (e: React.TouchEvent) => {
        if ((playable || inHand) && onClick) {
            e.preventDefault();
            e.stopPropagation();
            if (!tapped.current) {
                tapped.current = true;
                onClick();
                setTimeout(() => { tapped.current = false; }, 300);
            }
        }
    };

    const handleClick = (e: React.MouseEvent) => {
        if ((playable || inHand) && onClick) {
            e.preventDefault();
            onClick();
        }
    };

    return (
        <div
            className={`domino ${horizontal ? "horizontal" : ""} ${playable ? "playable" : ""} ${inHand ? "in-hand" : ""} ${small ? "small" : ""}`}
            onClick={handleClick}
            onTouchEnd={handleTouchEnd}
        >
            {half(a)}
            <div className="divider" />
            {half(b)}
        </div>
    );
}

const PLAYER_COUNT_OPTIONS = [
    { value: 1, label: "একক / Solo", emoji: "👤" },
    { value: 2, label: "জুটি / Duo", emoji: "👥" },
    { value: 3, label: "তিনজন / Trio", emoji: "👥+" },
    { value: 4, label: "চারজন / Quad", emoji: "👥👥" },
];

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
        rules: { firstRoundStartWith00?: boolean; blockerGetsZero?: boolean; winningPoints?: number; maximumVenda?: number; maxPlayers?: number };
    } | null>(null);
    const [copied, setCopied] = useState(false);
    const [botTurnOverlay, setBotTurnOverlay] = useState<{ playerName: string; action: "play" | "draw" | "pass" } | null>(null);
    const [showBoneyardPicker, setShowBoneyardPicker] = useState(false);

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
            setBotTurnOverlay(null);
        });

        socket.on("bot-turn", (data: { playerName: string; action: "play" | "draw" | "pass" }) => {
            setBotTurnOverlay({ playerName: data.playerName, action: data.action });
        });

        socket.on("rules-updated", (data: { rules: SanitizedState["rules"] }) => {
            setGameState((prev) => (prev ? { ...prev, rules: data.rules } : null));
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
            setBotTurnOverlay(null);
        });

        socket.on("left-room", () => {
            setGameState(null);
            setView("seat-select");
            router.push("/lobby");
        });

        socket.on("player-left", (data: { displayName: string; message: string }) => {
            showToast(data.message, false);
        });

        socket.on("deck-shuffled", (data: { message: string }) => {
            showToast(data.message, false);
        });

        socket.on("blocker-refill", (data: { message: string }) => {
            showToast(data.message, false);
        });

        return () => {
            socket.off("joined");
            socket.off("rejoined");
            socket.off("game-state");
            socket.off("bot-turn");
            socket.off("rules-updated");
            socket.off("round-end");
            socket.off("error");
            socket.off("room-info");
            socket.off("auth-error");
            socket.off("auto-pass");
            socket.off("left-room");
            socket.off("player-left");
            socket.off("deck-shuffled");
            socket.off("blocker-refill");
        };
    }, [token, roomCode, showToast, router]);

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
    const shuffleDeck = () => socketRef.current?.emit("shuffle-deck");

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

    const handleDraw = (boneyardIndex?: number) => {
        socketRef.current?.emit("draw-card", boneyardIndex != null ? { boneyardIndex } : undefined);
        setShowBoneyardPicker(false);
    };
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

    const isMyTurn = gameState?.turn === gameState?.mySeat && gameState?.status === "playing";
    const hasPossible = playableMoves.length > 0;
    const canDraw = isMyTurn && !hasPossible && (gameState?.boneyard || 0) > 0;
    const canPass = isMyTurn && !hasPossible && (gameState?.boneyard || 0) === 0;

    useEffect(() => {
        if (!canDraw) setShowBoneyardPicker(false);
    }, [canDraw]);

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

    const maxPlayersRaw = roomInfo?.rules?.maxPlayers ?? gameState?.rules?.maxPlayers ?? null;
    const maxPlayers = Number(maxPlayersRaw) || 4;
    const roomInfoLoaded = maxPlayersRaw !== null;

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
                        <button className="share-btn-sm whatsapp" onClick={shareWhatsApp} onTouchEnd={(e) => { e.preventDefault(); shareWhatsApp(); }}>WhatsApp</button>
                        <button className="share-btn-sm copy" onClick={copyInvite} onTouchEnd={(e) => { e.preventDefault(); copyInvite(); }}>
                            {copied ? "কপি হয়েছে ✓" : "লিংক কপি"}
                        </button>
                    </div>

                    {/* Player list: who's already here */}
                    {roomInfo && roomInfo.players.length > 0 && (
                        <div className="joined-players-section">
                            <p className="joined-label">রুমে আছেন / Already joined:</p>
                            <div className="joined-players-list">
                                {roomInfo.players.map((p) => (
                                    <span key={p.username} className={`joined-player-chip ${p.connected ? "online" : "offline"}`}>
                                        <span className={`player-dot ${p.connected ? "online" : "offline"}`} />
                                        {p.displayName} (সিট {p.seatIndex + 1})
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {!roomInfoLoaded ? (
                        <div style={{ textAlign: "center", padding: "30px 0" }}>
                            <div className="spinner" />
                            <p style={{ marginTop: "10px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                                রুমের তথ্য লোড হচ্ছে... / Loading room data...
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="input-group">
                                <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginTop: "10px" }}>
                                    {maxPlayers === 1
                                        ? "একক খেলা: কম্পিউটারের বিরুদ্ধে খেলুন / Solo: Play vs Computer"
                                        : "সিট বাছাই করুন / Select Your Seat:"}
                                </p>
                                <div className={`player-selector ${maxPlayers <= 2 ? "cols-2" : ""}`}>
                                    {Array.from({ length: maxPlayers }, (_, i) => {
                                        const existing = roomInfo?.players.find((p) => p.seatIndex === i);
                                        const taken = existing && existing.username !== user.username;

                                        return (
                                            <button
                                                key={i}
                                                className={`seat-btn ${seat === i ? "selected" : ""} ${taken ? "taken" : ""}`}
                                                onClick={() => !taken && setSeat(i)}
                                                onTouchEnd={(e) => {
                                                    e.preventDefault();
                                                    if (!taken) setSeat(i);
                                                }}
                                            >
                                                {maxPlayers === 1 ? "আমার সিট" : `সিট ${i + 1}`}
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

                            <button
                                className="btn-prime"
                                onClick={joinRoom}
                                onTouchEnd={(e) => { e.preventDefault(); joinRoom(); }}
                            >
                                {maxPlayers === 1 ? "খেলা শুরু / START SOLO" : "টেবিলে বসুন / JOIN TABLE"}
                            </button>
                        </>
                    )}

                    <button
                        className="btn-outline"
                        style={{ marginTop: "10px" }}
                        onClick={() => router.push("/lobby")}
                        onTouchEnd={(e) => { e.preventDefault(); router.push("/lobby"); }}
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

    // --- GAME VIEW --- (isMyTurn, hasPossible, canDraw, canPass computed above before any return)
    const activePlayers = gameState?.players || [];
    const activePlayerCount = activePlayers.length;

    // Dynamic position layout based on player count
    const getPositionLayout = () => {
        if (!gameState) return { order: [2, 1, 3, 0], classes: ["tag-top", "tag-right", "tag-left", "tag-bottom"] };

        const mySeat = gameState.mySeat;
        const otherPlayers = activePlayers.filter((p) => p.seatIndex !== mySeat);

        if (activePlayerCount === 1) {
            return { order: [mySeat], classes: ["tag-bottom"] };
        }
        if (activePlayerCount === 2) {
            const other = otherPlayers[0]?.seatIndex ?? 0;
            return { order: [other, mySeat], classes: ["tag-top", "tag-bottom"] };
        }
        if (activePlayerCount === 3) {
            const sorted = otherPlayers.map(p => p.seatIndex).sort((a, b) => a - b);
            return {
                order: [sorted[0], sorted[1], mySeat],
                classes: ["tag-top", "tag-right", "tag-bottom"],
            };
        }

        return {
            order: [
                (mySeat + 2) % 4,
                (mySeat + 1) % 4,
                (mySeat + 3) % 4,
                mySeat,
            ],
            classes: ["tag-top", "tag-right", "tag-left", "tag-bottom"],
        };
    };

    const { order: positionOrder, classes: positionClasses } = getPositionLayout();
    const isCreator = gameState?.creator === user.username;

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
                    <button
                        className="stat-badge exit-btn"
                        onClick={leaveRoom}
                        onTouchEnd={(e) => { e.preventDefault(); leaveRoom(); }}
                    >
                        বের হন
                    </button>
                </div>
            </header>

            {/* Robot turn overlay — animated "Robot X is playing / passing / drawing" */}
            {botTurnOverlay && (
                <div className="bot-turn-overlay" role="status" aria-live="polite">
                    <div className="bot-turn-pulse" />
                    <span className="bot-turn-text">
                        {botTurnOverlay.action === "play" && `${botTurnOverlay.playerName} খেলছে...`}
                        {botTurnOverlay.action === "draw" && `${botTurnOverlay.playerName} তাস তুলছে...`}
                        {botTurnOverlay.action === "pass" && `${botTurnOverlay.playerName} পাস করছে...`}
                    </span>
                    <span className="bot-turn-en">
                        {botTurnOverlay.action === "play" && `${botTurnOverlay.playerName} is playing...`}
                        {botTurnOverlay.action === "draw" && `${botTurnOverlay.playerName} is drawing...`}
                        {botTurnOverlay.action === "pass" && `${botTurnOverlay.playerName} passes...`}
                    </span>
                </div>
            )}

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
                                {activePlayerCount}/{maxPlayers} জন রুমে আছে •{" "}
                                {(maxPlayers === 1 ? activePlayerCount >= 1 : activePlayerCount >= 2)
                                    ? "শুরু করার জন্য প্রস্তুত!"
                                    : `কমপক্ষে ${maxPlayers === 1 ? "১" : "২"} জন দরকার`}
                            </p>
                            {maxPlayers === 1 && (
                                <p className="solo-hint" style={{ marginTop: "8px", fontSize: "0.9rem", opacity: 0.95 }}>
                                    একক খেলা: কম্পিউটারের বিরুদ্ধে • Solo: Play vs Computer
                                </p>
                            )}

                            {/* Room Rules Config - any player in lobby can update (player count; creator-only optional below) */}
                            <div className="room-rules-config">
                                <h4>রুমের নিয়ম / Room Rules</h4>

                                {/* Player count: anyone in room can set (1–4). Update anytime before start. */}
                                <div className="player-count-selector">
                                    <p className="toggle-label" style={{ marginBottom: "4px" }}>
                                        খেলোয়াড় সংখ্যা / Player Count
                                    </p>
                                    <p className="player-count-current" aria-live="polite">
                                        বর্তমান: {maxPlayers} জন / Current: {maxPlayers} players
                                    </p>
                                    <p className="player-count-hint" style={{ fontSize: "0.85rem", opacity: 0.9, marginTop: "2px" }}>
                                        যেকোনো সময় পরিবর্তন করা যাবে (শুরু করার আগে)
                                    </p>
                                    <div className="player-count-btns">
                                        {PLAYER_COUNT_OPTIONS.map((opt) => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                aria-pressed={maxPlayers === opt.value}
                                                aria-label={`${opt.value} players`}
                                                className={`player-count-btn ${maxPlayers === opt.value ? "active" : ""}`}
                                                onClick={() => {
                                                    setGameState((prev) =>
                                                        prev
                                                            ? { ...prev, rules: { ...(prev.rules || {}), maxPlayers: opt.value } }
                                                            : null
                                                    );
                                                    socketRef.current?.emit("update-rules", { maxPlayers: opt.value });
                                                }}
                                                onTouchEnd={(e) => {
                                                    e.preventDefault();
                                                    setGameState((prev) =>
                                                        prev
                                                            ? { ...prev, rules: { ...(prev.rules || {}), maxPlayers: opt.value } }
                                                            : null
                                                    );
                                                    socketRef.current?.emit("update-rules", { maxPlayers: opt.value });
                                                }}
                                            >
                                                <span className="pc-emoji">{opt.emoji}</span>
                                                <span className="pc-label">{opt.value}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {isCreator && (
                                    <>
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
                                            <small>0:0 only in game&apos;s first round. Later rounds = winner starts with venda</small>
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
                                </>
                                )}
                            </div>

                            {/* Show current rules for non-creators */}
                            {!isCreator && gameState?.rules && (
                                <div className="room-rules-display">
                                    <p>
                                        {(gameState.rules?.firstRoundStartWith00 ?? true) ? "✓" : "✗"} গেম ১ম রাউন্ড: 0:0। পরের রাউন্ড: জয়ী ভেন্ডা &nbsp;|&nbsp;
                                        {gameState.rules.blockerGetsZero ? "✓" : "✗"} ব্লকারের শূন্য &nbsp;|&nbsp;
                                        জয়: {gameState.rules.winningPoints ?? 100} পয়েন্ট &nbsp;|&nbsp;
                                        ম্যাক্স ভেন্ডা: {gameState.rules.maximumVenda ?? 4} &nbsp;|&nbsp;
                                        {PLAYER_COUNT_OPTIONS.find(o => o.value === maxPlayers)?.label || `${maxPlayers} জন`}
                                    </p>
                                </div>
                            )}

                            <div className="lobby-action-btns">
                                {/* Shuffle Deck Button */}
                                <button
                                    className="action-btn shuffle-btn"
                                    onClick={shuffleDeck}
                                    onTouchEnd={(e) => { e.preventDefault(); shuffleDeck(); }}
                                >
                                    🔀 শাফেল / Shuffle Deck
                                </button>

                                {/* Start Game Button */}
                                {(maxPlayers === 1 ? activePlayerCount >= 1 : activePlayerCount >= 2) && (
                                    <button
                                        className="action-btn start-game"
                                        onClick={startGame}
                                        onTouchEnd={(e) => { e.preventDefault(); startGame(); }}
                                    >
                                        খেলা শুরু / START GAME
                                    </button>
                                )}
                            </div>
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

                {/* Boneyard — responsive: show count; when canDraw, CTA opens modal to pick a tile */}
                <div className="boneyard">
                    <div className="bone-info">
                        <span className="bone-label">
                            বোনইয়ার্ড: <span className="accent">{gameState?.boneyard || 0}</span>
                        </span>
                        {canDraw && gameState?.boneyard ? (
                            <button
                                type="button"
                                className="bone-pick-cta"
                                onClick={() => setShowBoneyardPicker(true)}
                                onTouchEnd={(e) => { e.preventDefault(); setShowBoneyardPicker(true); }}
                            >
                                একটি গোপন তাস বেছে নিন
                            </button>
                        ) : null}
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
                    <button
                        className="action-btn action-btn-secondary"
                        onClick={() => handleDraw()}
                        onTouchEnd={(e) => { e.preventDefault(); handleDraw(); }}
                    >
                        বা র‍্যান্ডম / Or random
                    </button>
                )}
                {canPass && (
                    <button
                        className="action-btn pass"
                        onClick={handlePass}
                        onTouchEnd={(e) => { e.preventDefault(); handlePass(); }}
                    >
                        পাস / PASS
                    </button>
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

            {/* Boneyard Picker Modal — select one hidden tile from a responsive grid */}
            {showBoneyardPicker && canDraw && (gameState?.boneyard ?? 0) > 0 && (
                <div
                    className="boneyard-picker-overlay"
                    onClick={() => setShowBoneyardPicker(false)}
                    onTouchEnd={(e) => { e.preventDefault(); setShowBoneyardPicker(false); }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="boneyard-picker-title"
                >
                    <div className="boneyard-picker-modal" onClick={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
                        <h2 id="boneyard-picker-title" className="boneyard-picker-title">
                            বোনইয়ার্ড থেকে একটি তাস বেছে নিন
                        </h2>
                        <p className="boneyard-picker-subtitle">ট্যাপ করে একটি গোপন তাস নির্বাচন করুন / Tap a tile to pick</p>
                        <div className="boneyard-picker-grid">
                            {Array.from({ length: gameState?.boneyard ?? 0 }).map((_, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    className="boneyard-picker-tile"
                                    aria-label={`Pick tile ${i + 1}`}
                                    onClick={() => handleDraw(i)}
                                    onTouchEnd={(e) => { e.preventDefault(); handleDraw(i); }}
                                />
                            ))}
                        </div>
                        <div className="boneyard-picker-actions">
                            <button
                                type="button"
                                className="action-btn action-btn-secondary"
                                onClick={() => handleDraw()}
                                onTouchEnd={(e) => { e.preventDefault(); handleDraw(); }}
                            >
                                র‍্যান্ডম / Random
                            </button>
                            <button
                                type="button"
                                className="action-btn pass"
                                onClick={() => setShowBoneyardPicker(false)}
                                onTouchEnd={(e) => { e.preventDefault(); setShowBoneyardPicker(false); }}
                            >
                                বাতিল / Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Side Chooser */}
            {sideChoice && (
                <div className="side-chooser-overlay" onClick={() => setSideChoice(null)} onTouchEnd={(e) => { e.preventDefault(); setSideChoice(null); }}>
                    <div className="side-chooser" onClick={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
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
                            <button
                                className="btn-prime"
                                onClick={leaveRoom}
                                onTouchEnd={(e) => { e.preventDefault(); leaveRoom(); }}
                                style={{ marginTop: "16px" }}
                            >
                                লবিতে ফিরুন / Back to Lobby
                            </button>
                        ) : (
                            <button
                                className="btn-prime"
                                onClick={handleNextRound}
                                onTouchEnd={(e) => { e.preventDefault(); handleNextRound(); }}
                            >
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
