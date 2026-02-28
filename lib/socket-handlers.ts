import { Server as SocketServer, Socket } from "socket.io";
import { connectDB } from "./db";
import { Room, IRoom } from "./models/room";
import { Move } from "./models/move";
import { User } from "./models/user";
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

// username → Set<socketId> for multi-tab support
const userSockets = new Map<string, Set<string>>();
// socketId → { username, displayName, currentRoom, currentSeat }
const socketMeta = new Map<
    string,
    { username: string; displayName: string; currentRoom: string; currentSeat: number }
>();

function trackSocket(socketId: string, username: string, displayName: string) {
    if (!userSockets.has(username)) {
        userSockets.set(username, new Set());
    }
    userSockets.get(username)!.add(socketId);
    socketMeta.set(socketId, { username, displayName, currentRoom: "", currentSeat: -1 });
}

function untrackSocket(socketId: string) {
    const meta = socketMeta.get(socketId);
    if (meta) {
        const sockets = userSockets.get(meta.username);
        if (sockets) {
            sockets.delete(socketId);
            if (sockets.size === 0) userSockets.delete(meta.username);
        }
        socketMeta.delete(socketId);
    }
}

function isUserOnline(username: string): boolean {
    const sockets = userSockets.get(username);
    return !!sockets && sockets.size > 0;
}

function emitToUser(io: SocketServer, username: string, event: string, data: any) {
    const sockets = userSockets.get(username);
    if (sockets) {
        for (const sid of sockets) {
            io.to(sid).emit(event, data);
        }
    }
}

export function initSocketHandlers(io: SocketServer) {
    io.on("connection", async (socket: Socket) => {
        const token = socket.handshake.auth?.token;

        if (!token) {
            socket.emit("auth-error", { message: "Authentication required" });
            socket.disconnect();
            return;
        }

        try {
            await connectDB();
            const user = await User.findOne({ authToken: token });
            if (!user) {
                socket.emit("auth-error", { message: "Invalid auth token" });
                socket.disconnect();
                return;
            }

            const username = user.username;
            const displayName = user.displayName;

            trackSocket(socket.id, username, displayName);
            console.log(`🔌 ${displayName} (${username}) connected [${socket.id}]`);

            // Rejoin any active room this user is in
            await rejoinActiveRoom(io, socket, username);

            // --- JOIN ROOM ---
            socket.on("join-room", async (data: { room: string; seat: number }) => {
                try {
                    await connectDB();
                    const roomCode = data.room.toUpperCase();
                    const meta = socketMeta.get(socket.id);
                    if (!meta) return;

                    meta.currentRoom = roomCode;
                    meta.currentSeat = data.seat;

                    let room = await Room.findOne({ code: roomCode });

                    if (!room) {
                        room = new Room({
                            code: roomCode,
                            creator: username,
                            players: [],
                            hands: [[], [], [], []],
                            scores: [0, 0, 0, 0],
                            passes: [0, 0, 0, 0],
                        });
                    }

                    const existingPlayer = room.players.find(
                        (p: { seatIndex: number; }) => p.seatIndex === data.seat
                    );
                    if (existingPlayer && existingPlayer.username !== username) {
                        socket.emit("error", {
                            message: `Seat ${data.seat + 1} ${existingPlayer.displayName} এর দখলে / taken by ${existingPlayer.displayName}`,
                        });
                        return;
                    }

                    const playerInOtherSeat = room.players.find(
                        (p: { username: any; seatIndex: number; }) => p.username === username && p.seatIndex !== data.seat
                    );
                    if (playerInOtherSeat) {
                        playerInOtherSeat.seatIndex = data.seat;
                        playerInOtherSeat.connected = true;
                        playerInOtherSeat.lastSeen = new Date();
                    } else if (existingPlayer && existingPlayer.username === username) {
                        existingPlayer.connected = true;
                        existingPlayer.lastSeen = new Date();
                    } else {
                        room.players.push({
                            username,
                            displayName,
                            seatIndex: data.seat,
                            connected: true,
                            lastSeen: new Date(),
                        });
                    }

                    await room.save();

                    // Join all of this user's sockets to the room channel
                    const allSockets = userSockets.get(username);
                    if (allSockets) {
                        for (const sid of allSockets) {
                            const s = io.sockets.sockets.get(sid);
                            if (s) s.join(roomCode);
                            const m = socketMeta.get(sid);
                            if (m) {
                                m.currentRoom = roomCode;
                                m.currentSeat = data.seat;
                            }
                        }
                    }

                    emitToUser(io, username, "joined", sanitizeForPlayer(room, data.seat));
                    broadcastState(io, room);

                    console.log(`👤 ${displayName} joined room ${roomCode} seat ${data.seat}`);
                } catch (err) {
                    console.error("join-room error:", err);
                    socket.emit("error", { message: "রুমে যোগ দিতে ব্যর্থ / Failed to join room" });
                }
            });

            // --- START GAME ---
            socket.on("start-game", async () => {
                try {
                    await connectDB();
                    const meta = socketMeta.get(socket.id);
                    if (!meta?.currentRoom) return;

                    const room = await Room.findOne({ code: meta.currentRoom });
                    if (!room) return;

                    if (room.players.length < 2) {
                        socket.emit("error", { message: "কমপক্ষে ২ জন খেলোয়াড় দরকার / Need at least 2 players!" });
                        return;
                    }

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
                    console.log(`🎮 Game started in ${meta.currentRoom}, round ${room.round}`);
                } catch (err) {
                    console.error("start-game error:", err);
                }
            });

            // --- PLAY CARD ---
            socket.on("play-card", async (data: { cardIdx: number; side: "head" | "tail" }) => {
                try {
                    await connectDB();
                    const meta = socketMeta.get(socket.id);
                    if (!meta?.currentRoom) return;

                    const room = await Room.findOne({ code: meta.currentRoom });
                    if (!room || room.status !== "playing") return;
                    if (room.turn !== meta.currentSeat) {
                        socket.emit("error", { message: "এখন আপনার পালা না / Not your turn!" });
                        return;
                    }

                    const hand = room.hands[meta.currentSeat];
                    const validation = validatePlay(hand, data.cardIdx, data.side, room.board);
                    if (!validation.valid) {
                        socket.emit("error", { message: validation.reason || "Invalid move" });
                        return;
                    }

                    const card = hand[data.cardIdx];
                    room.board = placeCard(room.board, card, data.side);
                    room.hands[meta.currentSeat].splice(data.cardIdx, 1);
                    room.passes = [0, 0, 0, 0];

                    const player = room.players.find((p: { seatIndex: number; }) => p.seatIndex === meta.currentSeat);
                    await Move.create({
                        roomCode: meta.currentRoom,
                        round: room.round,
                        playerIndex: meta.currentSeat,
                        playerName: player?.displayName || username,
                        action: "play",
                        card: { a: card.a, b: card.b },
                        side: data.side,
                        boardSnapshot: room.board,
                    });

                    if (room.hands[meta.currentSeat].length === 0) {
                        await endRound(io, room, meta.currentSeat, false);
                        return;
                    }

                    if (isBlocked(room.hands, room.board, room.boneyard)) {
                        const winner = getBlockedWinner(room.hands);
                        await endRound(io, room, winner, true);
                        return;
                    }

                    room.turn = nextActiveTurn(room, meta.currentSeat);
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
                    const meta = socketMeta.get(socket.id);
                    if (!meta?.currentRoom) return;

                    const room = await Room.findOne({ code: meta.currentRoom });
                    if (!room || room.status !== "playing") return;
                    if (room.turn !== meta.currentSeat) return;
                    if (room.boneyard.length === 0) return;

                    const possibles = getPlayableMoves(room.hands[meta.currentSeat], room.board);
                    if (possibles.length > 0) {
                        socket.emit("error", { message: "আপনার খেলার মতো তাস আছে / You have playable cards!" });
                        return;
                    }

                    const drawn = room.boneyard.pop()!;
                    room.hands[meta.currentSeat].push(drawn);

                    const player = room.players.find((p: { seatIndex: number; }) => p.seatIndex === meta.currentSeat);
                    await Move.create({
                        roomCode: meta.currentRoom,
                        round: room.round,
                        playerIndex: meta.currentSeat,
                        playerName: player?.displayName || username,
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
                    const meta = socketMeta.get(socket.id);
                    if (!meta?.currentRoom) return;

                    const room = await Room.findOne({ code: meta.currentRoom });
                    if (!room || room.status !== "playing") return;
                    if (room.turn !== meta.currentSeat) return;

                    const possibles = getPlayableMoves(room.hands[meta.currentSeat], room.board);
                    if (possibles.length > 0) {
                        socket.emit("error", { message: "আপনার খেলার মতো তাস আছে!" });
                        return;
                    }
                    if (room.boneyard.length > 0) {
                        socket.emit("error", { message: "আগে বোনইয়ার্ড থেকে তাস তুলুন!" });
                        return;
                    }

                    room.passes[meta.currentSeat] = 1;

                    const player = room.players.find((p: { seatIndex: number; }) => p.seatIndex === meta.currentSeat);
                    await Move.create({
                        roomCode: meta.currentRoom,
                        round: room.round,
                        playerIndex: meta.currentSeat,
                        playerName: player?.displayName || username,
                        action: "pass",
                        boardSnapshot: room.board,
                    });

                    const allPassed = room.players.every(
                        (p: { seatIndex: string | number; }) => room.passes[p.seatIndex] === 1
                    );
                    if (allPassed) {
                        const winner = getBlockedWinner(room.hands);
                        await endRound(io, room, winner, true);
                        return;
                    }

                    room.turn = nextActiveTurn(room, meta.currentSeat);
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
                    const meta = socketMeta.get(socket.id);
                    if (!meta?.currentRoom) return;

                    const room = await Room.findOne({ code: meta.currentRoom });
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

            // --- UPDATE RULES ---
            socket.on("update-rules", async (data: { mustStartWith00?: boolean; blockerGetsZero?: boolean }) => {
                try {
                    await connectDB();
                    const meta = socketMeta.get(socket.id);
                    if (!meta?.currentRoom) return;

                    const room = await Room.findOne({ code: meta.currentRoom });
                    if (!room) return;
                    if (room.creator !== username) {
                        socket.emit("error", { message: "শুধু রুম তৈরিকারী নিয়ম পরিবর্তন করতে পারবে" });
                        return;
                    }
                    if (room.status === "playing") {
                        socket.emit("error", { message: "খেলা চলাকালীন নিয়ম পরিবর্তন করা যাবে না" });
                        return;
                    }

                    if (data.mustStartWith00 !== undefined) room.rules.mustStartWith00 = data.mustStartWith00;
                    if (data.blockerGetsZero !== undefined) room.rules.blockerGetsZero = data.blockerGetsZero;
                    await room.save();
                    broadcastState(io, room);
                } catch (err) {
                    console.error("update-rules error:", err);
                }
            });

            // --- GET ROOM INFO ---
            socket.on("get-room-info", async (data: { room: string }) => {
                try {
                    await connectDB();
                    const room = await Room.findOne({ code: data.room.toUpperCase() });
                    if (room) {
                        socket.emit("room-info", {
                            players: room.players.map((p: { username: string; displayName: any; seatIndex: any; }) => ({
                                username: p.username,
                                displayName: p.displayName,
                                seatIndex: p.seatIndex,
                                connected: isUserOnline(p.username),
                            })),
                            status: room.status,
                            creator: room.creator,
                            rules: room.rules,
                        });
                    } else {
                        socket.emit("room-info", { players: [], status: "lobby", rules: {} });
                    }
                } catch (err) {
                    console.error("get-room-info error:", err);
                }
            });

            // --- DISCONNECT ---
            socket.on("disconnect", async () => {
                console.log(`❌ ${displayName} disconnected [${socket.id}]`);
                const meta = socketMeta.get(socket.id);
                const currentRoom = meta?.currentRoom;

                untrackSocket(socket.id);

                // Only mark player as disconnected if they have NO remaining sockets
                if (!isUserOnline(username) && currentRoom) {
                    try {
                        await connectDB();
                        const room = await Room.findOne({ code: currentRoom });
                        if (!room) return;

                        const player = room.players.find((p: { username: any; }) => p.username === username);
                        if (player) {
                            player.connected = false;
                            player.lastSeen = new Date();
                            await room.save();
                            broadcastState(io, room);
                        }
                    } catch (err) {
                        console.error("disconnect error:", err);
                    }
                }
            });
        } catch (err) {
            console.error("Connection auth error:", err);
            socket.emit("auth-error", { message: "Authentication failed" });
            socket.disconnect();
        }
    });
}

async function rejoinActiveRoom(io: SocketServer, socket: Socket, username: string) {
    try {
        await connectDB();
        const room = await Room.findOne({
            "players.username": username,
            status: { $in: ["lobby", "playing"] },
        });

        if (room) {
            const player = room.players.find((p: { username: string; }) => p.username === username);
            if (player) {
                const meta = socketMeta.get(socket.id);
                if (meta) {
                    meta.currentRoom = room.code;
                    meta.currentSeat = player.seatIndex;
                }
                socket.join(room.code);
                player.connected = true;
                player.lastSeen = new Date();
                await room.save();

                socket.emit("rejoined", sanitizeForPlayer(room, player.seatIndex));
                broadcastState(io, room);
            }
        }
    } catch (err) {
        console.error("rejoin error:", err);
    }
}

function nextActiveTurn(room: IRoom, currentSeat: number): number {
    const activeSeatIndices = room.players.map((p) => p.seatIndex).sort();
    if (activeSeatIndices.length === 0) return 0;

    let next = (currentSeat + 1) % 4;
    for (let i = 0; i < 4; i++) {
        if (activeSeatIndices.includes(next)) return next;
        next = (next + 1) % 4;
    }
    return activeSeatIndices[0];
}

async function endRound(
    io: SocketServer,
    room: IRoom,
    winnerSeat: number,
    blocked: boolean
) {
    room.status = "ended";
    const pts = room.hands.map(handPoints);
    pts[winnerSeat] = 0;

    if (blocked && room.rules.blockerGetsZero) {
        // The player who caused the block also gets zero
        pts[winnerSeat] = 0;
    }

    for (let i = 0; i < 4; i++) {
        room.scores[i] = (room.scores[i] || 0) + pts[i];
    }

    await room.save();

    const winnerPlayer = room.players.find((p) => p.seatIndex === winnerSeat);
    io.to(room.code).emit("round-end", {
        winner: winnerSeat,
        winnerName: winnerPlayer?.displayName || `Player ${winnerSeat + 1}`,
        blocked,
        roundPoints: pts,
        totalScores: room.scores,
    });

    broadcastState(io, room);
}

function broadcastState(io: SocketServer, room: IRoom) {
    for (const player of room.players) {
        const state = sanitizeForPlayer(room, player.seatIndex);
        emitToUser(io, player.username, "game-state", state);
    }
}
