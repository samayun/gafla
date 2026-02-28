"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getSocket } from "@/lib/client-socket";
import type { SanitizedState } from "@/lib/game-engine";

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
  onClick,
}: {
  a: number;
  b: number;
  horizontal?: boolean;
  playable?: boolean;
  inHand?: boolean;
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
      className={`domino ${horizontal ? "horizontal" : ""} ${playable ? "playable" : ""
        } ${inHand ? "in-hand" : ""}`}
      onClick={playable || inHand ? onClick : undefined}
    >
      {half(a)}
      <div className="divider" />
      {half(b)}
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<"lobby" | "game">("lobby");
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [seat, setSeat] = useState(0);
  const [gameState, setGameState] = useState<SanitizedState | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string; error?: boolean }[]>([]);
  const [sideChoice, setSideChoice] = useState<SideChoice | null>(null);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [roomInfo, setRoomInfo] = useState<{
    players: { name: string; seatIndex: number; connected: boolean }[];
    status: string;
  } | null>(null);

  const toastId = useRef(0);
  const socketRef = useRef(getSocket());

  const showToast = useCallback((text: string, error = false) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, text, error }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  // Socket setup
  useEffect(() => {
    const socket = socketRef.current;

    socket.on("joined", (state: SanitizedState) => {
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

    return () => {
      socket.off("joined");
      socket.off("game-state");
      socket.off("round-end");
      socket.off("error");
      socket.off("room-info");
    };
  }, [showToast]);

  // Poll room info in lobby
  useEffect(() => {
    if (view !== "lobby" || !room.trim()) return;

    const interval = setInterval(() => {
      socketRef.current.emit("get-room-info", { room: room.trim() });
    }, 2000);

    return () => clearInterval(interval);
  }, [view, room]);

  // Read room from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("room");
    if (r) setRoom(r);
  }, []);

  const joinRoom = () => {
    if (!name.trim() || !room.trim()) {
      showToast("Name and Room are required!", true);
      return;
    }

    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set("room", room.trim());
    window.history.pushState({}, "", url.toString());

    socketRef.current.emit("join-room", {
      room: room.trim(),
      name: name.trim(),
      seat,
    });
  };

  const startGame = () => {
    socketRef.current.emit("start-game");
  };

  const handlePlayCard = (cardIdx: number) => {
    if (!gameState || gameState.turn !== gameState.mySeat) return;

    const card = gameState.myHand[cardIdx];

    if (gameState.board.length === 0) {
      // First move, place directly
      socketRef.current.emit("play-card", { cardIdx, side: "tail" });
      return;
    }

    const head = gameState.board[0].a;
    const tail = gameState.board[gameState.board.length - 1].b;

    const canHead = card.a === head || card.b === head;
    const canTail = card.a === tail || card.b === tail;

    if (canHead && canTail && head !== tail) {
      // Card can play on both sides — ask user
      setSideChoice({ cardIdx, card });
    } else if (canHead) {
      socketRef.current.emit("play-card", { cardIdx, side: "head" });
    } else if (canTail) {
      socketRef.current.emit("play-card", { cardIdx, side: "tail" });
    }
  };

  const chooseSide = (side: "head" | "tail") => {
    if (!sideChoice) return;
    socketRef.current.emit("play-card", {
      cardIdx: sideChoice.cardIdx,
      side,
    });
    setSideChoice(null);
  };

  const handleDraw = () => {
    socketRef.current.emit("draw-card");
  };

  const handlePass = () => {
    socketRef.current.emit("pass-turn");
  };

  const handleNextRound = () => {
    setRoundResult(null);
    socketRef.current.emit("next-round");
  };

  const exitGame = () => {
    window.location.reload();
  };

  // Calculate playable moves for current player
  const getPlayableMoves = () => {
    if (!gameState || gameState.turn !== gameState.mySeat || gameState.status !== "playing")
      return [];

    if (gameState.board.length === 0) {
      // Must start with 0:0 if you have it
      const has00 = gameState.myHand.some(
        (c) => c.a === 0 && c.b === 0
      );
      if (has00) {
        const idx = gameState.myHand.findIndex(
          (c) => c.a === 0 && c.b === 0
        );
        return [{ idx, side: "tail" as const }];
      }
      return gameState.myHand.map((_, i) => ({
        idx: i,
        side: "tail" as const,
      }));
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
  };

  // --- LOBBY VIEW ---
  if (view === "lobby") {
    return (
      <div className="lobby-container">
        <div className="lobby-card">
          <h1 className="lobby-title">
            DOMINO{" "}
            <span style={{ color: "var(--accent-primary)" }}>ROYAL</span>
          </h1>
          <p className="lobby-subtitle">
            Premium Bangladeshi Experience
          </p>

          <div className="input-group">
            <input
              type="text"
              className="glass-input"
              placeholder="Enter Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinRoom()}
            />
            <input
              type="text"
              className="glass-input"
              placeholder="Enter Room (e.g. BD-CLUB)"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinRoom()}
            />
            <p
              style={{
                fontSize: "0.9rem",
                color: "var(--text-secondary)",
                marginTop: "10px",
              }}
            >
              Select Your Seat:
            </p>
            <div className="player-selector">
              {[0, 1, 2, 3].map((i) => {
                const existing = roomInfo?.players.find(
                  (p) => p.seatIndex === i
                );
                const taken = existing && existing.name !== name.trim();

                return (
                  <button
                    key={i}
                    className={`seat-btn ${seat === i ? "selected" : ""} ${taken ? "taken" : ""
                      }`}
                    onClick={() => !taken && setSeat(i)}
                  >
                    Seat {i + 1}
                    <span className="seat-status">
                      {existing
                        ? existing.connected
                          ? existing.name
                          : `${existing.name} (Away)`
                        : "Empty"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button className="btn-prime" onClick={joinRoom}>
            JOIN TABLE
          </button>
        </div>

        {/* Toasts */}
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.error ? "error" : ""}`}>
            {t.text}
          </div>
        ))}
      </div>
    );
  }

  // --- GAME VIEW ---
  const isMyTurn =
    gameState?.turn === gameState?.mySeat &&
    gameState?.status === "playing";
  const playableMoves = getPlayableMoves();
  const hasPossible = playableMoves.length > 0;
  const canDraw = isMyTurn && !hasPossible && (gameState?.boneyard || 0) > 0;
  const canPass = isMyTurn && !hasPossible && (gameState?.boneyard || 0) === 0;

  // Map player seats to visual positions relative to current player
  const positionOrder = gameState
    ? [
      (gameState.mySeat + 2) % 4, // top (opposite)
      (gameState.mySeat + 1) % 4, // right
      (gameState.mySeat + 3) % 4, // left
      gameState.mySeat, // bottom (me)
    ]
    : [2, 1, 3, 0];

  const positionClasses = ["tag-top", "tag-right", "tag-left", "tag-bottom"];

  return (
    <div className="game-view">
      {/* Header */}
      <header className="game-header">
        <div className="flex items-center gap-3">
          <div className="logo">DOMINO</div>
          <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-white/40 border border-white/10 rounded-full bg-white/5 backdrop-blur-md">
            Free Edition
          </div>
        </div>
        <div className="header-stats">
          <div className="stat-badge">
            ROOM:{" "}
            <span style={{ color: "var(--accent-primary)" }}>
              {gameState?.code || room}
            </span>
          </div>
          <div className="stat-badge">
            ME:{" "}
            <span style={{ color: "var(--accent-secondary)" }}>{name}</span>
          </div>
          <button className="stat-badge exit-btn" onClick={exitGame}>
            EXIT
          </button>
        </div>
      </header>

      {/* Main Board */}
      <div className="main-board">
        <div className="board-viewport">
          {gameState?.status === "playing" || gameState?.status === "ended" ? (
            <div className="domino-chain">
              {gameState.board.map((c, i) => (
                <DominoTile
                  key={i}
                  a={c.a}
                  b={c.b}
                  horizontal={c.a !== c.b}
                />
              ))}
            </div>
          ) : (
            <div className="waiting-message">
              <h2>
                Waiting for players
                <span className="pulse-dot">...</span>
              </h2>
              <p>
                {gameState?.players.length || 0}/4 players in room •{" "}
                {gameState?.players.length && gameState.players.length >= 2
                  ? "Ready to start!"
                  : "Need at least 2 players"}
              </p>
              {gameState?.players.length && gameState.players.length >= 2 && (
                <button
                  className="action-btn start-game"
                  style={{ marginTop: "20px" }}
                  onClick={startGame}
                >
                  🎲 START GAME
                </button>
              )}
            </div>
          )}
        </div>

        {/* Player Tags */}
        {positionOrder.map((seatIdx, posIdx) => {
          const player = gameState?.players.find(
            (p) => p.seatIndex === seatIdx
          );
          const isActive = gameState?.turn === seatIdx;
          const handSize = gameState?.handSizes?.[seatIdx] || 0;

          return (
            <div
              key={seatIdx}
              className={`player-tag ${positionClasses[posIdx]} ${isActive ? "active" : ""
                }`}
            >
              <span className="tag-name">
                {player?.name || `Seat ${seatIdx + 1}`}
              </span>
              <span className="tag-status">
                {player
                  ? player.connected
                    ? "Online"
                    : "Away"
                  : "Empty"}{" "}
                | {handSize} Cards
              </span>
            </div>
          );
        })}

        {/* Boneyard */}
        <div className="boneyard">
          <div>
            {Array.from({
              length: Math.min(gameState?.boneyard || 0, 6),
            }).map((_, i) => (
              <div
                key={i}
                className="card-back"
                style={{
                  transform: `rotate(${Math.random() * 6 - 3}deg)`,
                }}
              />
            ))}
          </div>
          <div className="bone-label">
            BONEYARD:{" "}
            <span style={{ color: "var(--accent-primary)" }}>
              {gameState?.boneyard || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="action-bar">
        {canDraw && (
          <button className="action-btn" onClick={handleDraw}>
            DRAW CARD
          </button>
        )}
        {canPass && (
          <button className="action-btn pass" onClick={handlePass}>
            PASS TURN
          </button>
        )}
      </div>

      {/* Footer / My Hand */}
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
                  inHand={true}
                  onClick={() => isPlayable && handlePlayCard(i)}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Side Chooser Modal */}
      {sideChoice && (
        <div className="side-chooser-overlay">
          <div className="side-chooser">
            <h3>Play on which side?</h3>
            <div className="side-chooser-btns">
              <button
                className="side-btn head"
                onClick={() => chooseSide("head")}
              >
                ← HEAD
              </button>
              <button
                className="side-btn tail"
                onClick={() => chooseSide("tail")}
              >
                TAIL →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Round End Modal */}
      {roundResult && (
        <div className="game-overlay">
          <div className="game-modal">
            <h2 style={{ marginBottom: "20px", fontSize: "2rem" }}>
              {roundResult.blocked ? "GAME BLOCKED" : "ROUND OVER"}
            </h2>
            <h2
              style={{
                color: "var(--accent-primary)",
                marginBottom: "15px",
              }}
            >
              {roundResult.winnerName} WON!
            </h2>
            {roundResult.blocked && (
              <p
                style={{
                  color: "var(--accent-secondary)",
                  fontWeight: 800,
                  marginBottom: "15px",
                }}
              >
                MASTERSTROKE BLOCK WIN!
              </p>
            )}
            <div style={{ marginTop: "25px" }}>
              {roundResult.roundPoints.map((pts, i) => {
                const player = gameState?.players.find(
                  (p) => p.seatIndex === i
                );
                if (!player) return null;

                return (
                  <div key={i} className="score-row">
                    <span>{player.name}</span>
                    <span
                      style={{
                        color: "var(--accent-primary)",
                        fontWeight: 800,
                      }}
                    >
                      +{pts} PTS (Total:{" "}
                      {roundResult.totalScores[i]})
                    </span>
                  </div>
                );
              })}
            </div>
            <button className="btn-prime" onClick={handleNextRound}>
              START NEXT ROUND
            </button>
          </div>
        </div>
      )}

      {/* Toasts */}
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.error ? "error" : ""}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
