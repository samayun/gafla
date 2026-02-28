import { Server as SocketServer } from "socket.io";
import { connectDB } from "./db";
import { Room, IRoom } from "./models/room";
import { Move } from "./models/move";
import {
    createShuffledDeck,
    dealHands,
    findStarter,
    validatePlay,
    placeCard,
    getPlayableMoves,
    isBlocked,
    handPoints,
    getBlockedWinner,
    sanitizeForPlayer,
} from "./game-engine";

export function initSocketHandlers(io: SocketServer) {
    io.on("connection", (socket) => {
        console.log(`🔌 Socket connected: ${socket.id}`);

        let currentRoom = "";
        let currentSeat = -1;

        // --- JOIN ROOM ---
        socket.on("join-room", async (data: { room: string; name: string; seat: number }) => {
            try {
                await connectDB();
                const roomCode = data.room.toUpperCase();
                currentRoom = roomCode;
                currentSeat = data.seat;

                let room = await Room.findOne({ code: roomCode });

                if (!room) {
                    // Create new room
                    room = new Room({
                        code: roomCode,
                        players: [],
                        hands: [[], [], [], []],
                        scores: [0, 0, 0, 0],
                        passes: [0, 0, 0, 0],
                    });
                }

                // Check if seat is taken by someone else
                const existingPlayer = room.players.find(
                    (p: { seatIndex: number; }) => p.seatIndex === data.seat
                );
                if (existingPlayer && existingPlayer.name !== data.name) {
                    socket.emit("error", { message: `Seat ${data.seat + 1} is already taken by ${existingPlayer.name}` });
                    return;
                }

                if (existingPlayer) {
                    // Reconnecting player
                    existingPlayer.socketId = socket.id;
                    existingPlayer.connected = true;
                    existingPlayer.lastSeen = new Date();
                } else {
                    // New player
                    room.players.push({
                        name: data.name,
                        seatIndex: data.seat,
                        socketId: socket.id,
                        connected: true,
                        lastSeen: new Date(),
                    });
                }

                await room.save();

                // Join socket room
                socket.join(roomCode);

                // Send state to joining player
                socket.emit("joined", sanitizeForPlayer(room, data.seat));

                // Broadcast lobby update to all in room
                broadcastState(io, room);

                console.log(`👤 ${data.name} joined room ${roomCode} at seat ${data.seat}`);
            } catch (err) {
                console.error("join-room error:", err);
                socket.emit("error", { message: "Failed to join room" });
            }
        });

        // --- START GAME ---
        socket.on("start-game", async () => {
            try {
                await connectDB();
                const room = await Room.findOne({ code: currentRoom });
                if (!room) return;

                if (room.players.length < 2) {
                    socket.emit("error", { message: "Need at least 2 players!" });
                    return;
                }

                // Initialize game
                const deck = createShuffledDeck();
                const { hands, boneyard } = dealHands(deck);

                room.board = [];
                room.hands = hands;
                room.boneyard = boneyard;
                room.status = "playing";
                room.passes = [0, 0, 0, 0];
                room.turn = findStarter(hands);
                room.round = (room.round || 0) + 1;

                await room.save();
                broadcastState(io, room);

                console.log(`🎮 Game started in room ${currentRoom}, round ${room.round}`);
            } catch (err) {
                console.error("start-game error:", err);
            }
        });

        // --- PLAY CARD ---
        socket.on("play-card", async (data: { cardIdx: number; side: "head" | "tail" }) => {
            try {
                await connectDB();
                const room = await Room.findOne({ code: currentRoom });
                if (!room || room.status !== "playing") return;
                if (room.turn !== currentSeat) {
                    socket.emit("error", { message: "Not your turn!" });
                    return;
                }

                const hand = room.hands[currentSeat];
                const validation = validatePlay(hand, data.cardIdx, data.side, room.board);
                if (!validation.valid) {
                    socket.emit("error", { message: validation.reason || "Invalid move" });
                    return;
                }

                const card = hand[data.cardIdx];

                // Place card on board
                room.board = placeCard(room.board, card, data.side);

                // Remove from hand
                room.hands[currentSeat].splice(data.cardIdx, 1);
                room.passes = [0, 0, 0, 0];

                // Record move
                await Move.create({
                    roomCode: currentRoom,
                    round: room.round,
                    playerIndex: currentSeat,
                    playerName: room.players.find((p: { seatIndex: number; }) => p.seatIndex === currentSeat)?.name || "Unknown",
                    action: "play",
                    card: { a: card.a, b: card.b },
                    side: data.side,
                    boardSnapshot: room.board,
                });

                // Check win condition
                if (room.hands[currentSeat].length === 0) {
                    await endRound(io, room, currentSeat, false);
                    return;
                }

                // Check blocked
                if (isBlocked(room.hands, room.board, room.boneyard)) {
                    const winner = getBlockedWinner(room.hands);
                    await endRound(io, room, winner, true);
                    return;
                }

                // Advance turn (skip empty seats)
                room.turn = nextActiveTurn(room, currentSeat);

                await room.save();
                broadcastState(io, room);
            } catch (err) {
                console.error("play-card error:", err);
            }
        });

        // --- DRAW CARD ---
        socket.on("draw-card", async () => {
            try {
                await connectDB();
                const room = await Room.findOne({ code: currentRoom });
                if (!room || room.status !== "playing") return;
                if (room.turn !== currentSeat) return;
                if (room.boneyard.length === 0) return;

                // Can only draw if no valid moves
                const possibles = getPlayableMoves(room.hands[currentSeat], room.board);
                if (possibles.length > 0) {
                    socket.emit("error", { message: "You have playable cards!" });
                    return;
                }

                const drawn = room.boneyard.pop()!;
                room.hands[currentSeat].push(drawn);

                // Record move
                await Move.create({
                    roomCode: currentRoom,
                    round: room.round,
                    playerIndex: currentSeat,
                    playerName: room.players.find((p: { seatIndex: number; }) => p.seatIndex === currentSeat)?.name || "Unknown",
                    action: "draw",
                    card: { a: drawn.a, b: drawn.b },
                    boardSnapshot: room.board,
                });

                await room.save();
                broadcastState(io, room);
            } catch (err) {
                console.error("draw-card error:", err);
            }
        });

        // --- PASS TURN ---
        socket.on("pass-turn", async () => {
            try {
                await connectDB();
                const room = await Room.findOne({ code: currentRoom });
                if (!room || room.status !== "playing") return;
                if (room.turn !== currentSeat) return;

                // Can only pass if no cards to draw and no valid moves
                const possibles = getPlayableMoves(room.hands[currentSeat], room.board);
                if (possibles.length > 0) {
                    socket.emit("error", { message: "You have playable cards!" });
                    return;
                }
                if (room.boneyard.length > 0) {
                    socket.emit("error", { message: "You must draw from boneyard first!" });
                    return;
                }

                room.passes[currentSeat] = 1;

                // Record move
                await Move.create({
                    roomCode: currentRoom,
                    round: room.round,
                    playerIndex: currentSeat,
                    playerName: room.players.find((p: { seatIndex: number; }) => p.seatIndex === currentSeat)?.name || "Unknown",
                    action: "pass",
                    boardSnapshot: room.board,
                });

                // Check if all active players passed
                const allPassed = room.players.every((p: { seatIndex: string | number; }) => room.passes[p.seatIndex] === 1);
                if (allPassed) {
                    const winner = getBlockedWinner(room.hands);
                    await endRound(io, room, winner, true);
                    return;
                }

                room.turn = nextActiveTurn(room, currentSeat);
                await room.save();
                broadcastState(io, room);
            } catch (err) {
                console.error("pass-turn error:", err);
            }
        });

        // --- NEXT ROUND ---
        socket.on("next-round", async () => {
            try {
                await connectDB();
                const room = await Room.findOne({ code: currentRoom });
                if (!room) return;

                const deck = createShuffledDeck();
                const { hands, boneyard } = dealHands(deck);

                room.board = [];
                room.hands = hands;
                room.boneyard = boneyard;
                room.status = "playing";
                room.passes = [0, 0, 0, 0];
                room.turn = findStarter(hands);
                room.round = (room.round || 0) + 1;

                await room.save();
                broadcastState(io, room);
            } catch (err) {
                console.error("next-round error:", err);
            }
        });

        // --- GET ROOM INFO (for lobby) ---
        socket.on("get-room-info", async (data: { room: string }) => {
            try {
                await connectDB();
                const room = await Room.findOne({ code: data.room.toUpperCase() });
                if (room) {
                    socket.emit("room-info", {
                        players: room.players.map((p: { name: any; seatIndex: any; connected: any; }) => ({
                            name: p.name,
                            seatIndex: p.seatIndex,
                            connected: p.connected,
                        })),
                        status: room.status,
                    });
                } else {
                    socket.emit("room-info", { players: [], status: "lobby" });
                }
            } catch (err) {
                console.error("get-room-info error:", err);
            }
        });

        // --- DISCONNECT ---
        socket.on("disconnect", async () => {
            console.log(`❌ Socket disconnected: ${socket.id}`);
            if (!currentRoom) return;

            try {
                await connectDB();
                const room = await Room.findOne({ code: currentRoom });
                if (!room) return;

                const player = room.players.find((p: { socketId: string; }) => p.socketId === socket.id);
                if (player) {
                    player.connected = false;
                    player.lastSeen = new Date();
                    await room.save();
                    broadcastState(io, room);
                }
            } catch (err) {
                console.error("disconnect error:", err);
            }
        });
    });
}

/** Find next active player's turn */
function nextActiveTurn(room: IRoom, currentSeat: number): number {
    const activeSeatIndices = room.players.map((p) => p.seatIndex).sort();
    if (activeSeatIndices.length === 0) return 0;

    // Find next seat after currentSeat  
    let next = (currentSeat + 1) % 4;
    for (let i = 0; i < 4; i++) {
        if (activeSeatIndices.includes(next)) return next;
        next = (next + 1) % 4;
    }
    return activeSeatIndices[0];
}

/** End a round: calculate scores, save, broadcast */
async function endRound(
    io: SocketServer,
    room: IRoom,
    winnerSeat: number,
    blocked: boolean
) {
    room.status = "ended";
    const pts = room.hands.map(handPoints);
    pts[winnerSeat] = 0;

    // Add round points to cumulative scores
    for (let i = 0; i < 4; i++) {
        room.scores[i] = (room.scores[i] || 0) + pts[i];
    }

    await room.save();

    // Broadcast with round result
    const winnerPlayer = room.players.find((p) => p.seatIndex === winnerSeat);
    io.to(room.code).emit("round-end", {
        winner: winnerSeat,
        winnerName: winnerPlayer?.name || `Player ${winnerSeat + 1}`,
        blocked,
        roundPoints: pts,
        totalScores: room.scores,
    });

    broadcastState(io, room);
}

/** Broadcast sanitized state to each player in the room */
function broadcastState(io: SocketServer, room: IRoom) {
    for (const player of room.players) {
        if (player.socketId) {
            io.to(player.socketId).emit(
                "game-state",
                sanitizeForPlayer(room, player.seatIndex)
            );
        }
    }
}
