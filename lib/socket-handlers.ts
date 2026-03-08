import { Server as SocketServer, Socket } from "socket.io";
import { connectDB } from "./db";
import { Room, IRoom, ICard } from "./models/room";
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
    hasDouble,
} from "./game-engine";

const userSockets = new Map<string, Set<string>>();
/** Auto-leave timeout: roomCode -> username -> timeoutId. Cleared on rejoin. */
const disconnectTimers = new Map<string, Map<string, ReturnType<typeof setTimeout>>>();
const DISCONNECT_GRACE_MS = 90_000;

const socketMeta = new Map<
    string,
    { username: string; displayName: string; currentRoom: string; currentSeat: number }
>();

function getActiveSeats(room: IRoom): number[] {
    return room.players.map((p) => p.seatIndex).sort((a, b) => a - b);
}

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

            await rejoinActiveRoom(io, socket, username);

            // --- LEAVE ROOM ---
            socket.on("leave-room", async () => {
                try {
                    await connectDB();
                    const meta = socketMeta.get(socket.id);
                    if (!meta?.currentRoom) return;

                    const roomCode = meta.currentRoom;
                    const room = await Room.findOne({ code: roomCode });
                    if (!room) {
                        meta.currentRoom = "";
                        meta.currentSeat = -1;
                        socket.leave(roomCode);
                        emitToUser(io, username, "left-room", { room: roomCode });
                        return;
                    }

                    await removePlayerFromRoom(io, room, username);
                    emitToUser(io, username, "left-room", { room: roomCode });
                } catch (err) {
                    console.error("leave-room error:", err);
                }
            });

            // --- JOIN ROOM ---
            socket.on("join-room", async (data: { room: string; seat: number }) => {
                try {
                    await connectDB();
                    const roomCode = data.room.toUpperCase();
                    const meta = socketMeta.get(socket.id);
                    if (!meta) return;

                    if (meta.currentRoom && meta.currentRoom !== roomCode) {
                        const oldRoom = await Room.findOne({ code: meta.currentRoom });
                        if (oldRoom) {
                            await removePlayerFromRoom(io, oldRoom, username);
                        }
                    }

                    let room = await Room.findOne({ code: roomCode });

                    if (!room) {
                        const defaultRules = {
                            firstRoundStartWith00: true,
                            blockerGetsZero: true,
                            winningPoints: 100,
                            maximumVenda: 4,
                            maxPlayers: 4,
                            useLowestVendaForFewPlayers: true,
                            blockerRefill: true,
                        };
                        room = new Room({
                            code: roomCode,
                            creator: username,
                            players: [],
                            hands: [[], [], [], []],
                            scores: [0, 0, 0, 0],
                            passes: [0, 0, 0, 0],
                            rules: defaultRules,
                        });
                    }

                    const maxPlayers = room.rules?.maxPlayers ?? 4;

                    // Validate seat is within maxPlayers range
                    if (data.seat >= maxPlayers) {
                        socket.emit("error", {
                            message: `এই রুমে সর্বোচ্চ ${maxPlayers} জন খেলতে পারবে / This room allows max ${maxPlayers} players`,
                        });
                        return;
                    }

                    const existingPlayer = room.players.find(
                        (p: { seatIndex: number }) => p.seatIndex === data.seat
                    );
                    if (existingPlayer && existingPlayer.username !== username) {
                        socket.emit("error", {
                            message: `সিট ${data.seat + 1} ${existingPlayer.displayName} এর দখলে / taken by ${existingPlayer.displayName}`,
                        });
                        return;
                    }

                    // Check if room is full (unless player already has a seat)
                    const playerAlreadyInRoom = room.players.find(
                        (p: { username: string }) => p.username === username
                    );
                    if (!playerAlreadyInRoom && room.players.length >= maxPlayers) {
                        socket.emit("error", {
                            message: `রুম ভর্তি (${maxPlayers}/${maxPlayers}) / Room is full`,
                        });
                        return;
                    }

                    const playerInOtherSeat = room.players.find(
                        (p: { username: any; seatIndex: number }) => p.username === username && p.seatIndex !== data.seat
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

                    meta.currentRoom = roomCode;
                    meta.currentSeat = data.seat;

                    await room.save();

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

                    const maxPlayers = room.rules?.maxPlayers ?? 4;
                    const isSolo = room.players.length === 1;
                    const minPlayers = maxPlayers === 1 || isSolo ? 1 : 2;

                    if (room.players.length < minPlayers) {
                        socket.emit("error", {
                            message: minPlayers === 1
                                ? "কমপক্ষে ১ জন খেলোয়াড় দরকার / Need at least 1 player!"
                                : "কমপক্ষে ২ জন খেলোয়াড় দরকার / Need at least 2 players!",
                        });
                        return;
                    }

                    // Solo = 1 human vs 1 computer (2 hands). 2 players = 2 seats. 3–4 = 4 seats (fill with bots).
                    const occupiedSeats = room.players.map((p: { seatIndex: number }) => p.seatIndex);
                    const maxSeats = isSolo ? 2 : (maxPlayers === 2 ? 2 : 4);
                    const allSeats = Array.from({ length: maxSeats }, (_, i) => i);
                    const emptySeats = allSeats.filter((s) => !occupiedSeats.includes(s));
                    if (emptySeats.length > 0) {
                        room.botSeats = emptySeats.slice();
                        for (let i = 0; i < emptySeats.length; i++) {
                            const s = emptySeats[i]!;
                            room.players.push({
                                username: `bot_${s}`,
                                displayName: `Robot ${i + 1}`,
                                seatIndex: s,
                                connected: true,
                                lastSeen: new Date(),
                            });
                        }
                        room.markModified("botSeats");
                        room.markModified("players");
                    } else {
                        room.botSeats = [];
                    }

                    const activeSeats = getActiveSeats(room);
                    const deck = createShuffledDeck();
                    const maxVenda = room.rules?.maximumVenda ?? 4;
                    const { hands, boneyard } = dealHands(deck, maxVenda, activeSeats);

                    room.board = [];
                    room.hands = hands;
                    room.boneyard = boneyard;
                    room.status = "playing";
                    room.passes = [0, 0, 0, 0];
                    room.round = (room.round || 0) + 1;

                    const isFirstRound = room.round === 1;

                    if (isFirstRound && (room.rules?.firstRoundStartWith00 ?? true)) {
                        room.turn = findStarter(hands, activeSeats);
                    } else if (room.lastWinner >= 0 && activeSeats.includes(room.lastWinner)) {
                        room.turn = room.lastWinner;
                    } else {
                        room.turn = findStarter(hands, activeSeats);
                    }

                    room.markModified("hands");
                    room.markModified("boneyard");
                    await room.save();

                    // processAutoTurns will save, broadcast, and schedule bot if needed
                    await processAutoTurns(io, room);
                    console.log(`🎮 Game started in ${meta.currentRoom}, round ${room.round}, seats=${JSON.stringify(activeSeats)}, botSeats=${JSON.stringify(room.botSeats)}, turn=${room.turn}`);
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

                    const activeSeats = getActiveSeats(room);
                    const hand = room.hands[meta.currentSeat];
                    const require00ForFirstMove = room.round === 1 && (room.rules?.firstRoundStartWith00 ?? true);
                    const winnerStartsWithVenda = room.round > 1;
                    const validation = validatePlay(hand, data.cardIdx, data.side, room.board, require00ForFirstMove, winnerStartsWithVenda);
                    if (!validation.valid) {
                        socket.emit("error", { message: validation.reason || "Invalid move" });
                        return;
                    }

                    const card = hand[data.cardIdx];
                    room.board = placeCard(room.board, card, data.side);
                    room.hands[meta.currentSeat].splice(data.cardIdx, 1);
                    room.passes = [0, 0, 0, 0];

                    const player = room.players.find((p: { seatIndex: number }) => p.seatIndex === meta.currentSeat);
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

                    if (isBlocked(room.hands, room.board, room.boneyard, activeSeats)) {
                        const winner = getBlockedWinner(room.hands, activeSeats);
                        await endRound(io, room, winner, true);
                        return;
                    }

                    room.turn = nextActiveTurn(room, meta.currentSeat);
                    await processAutoTurns(io, room);
                } catch (err) {
                    console.error("play-card error:", err);
                }
            });

            // --- DRAW CARD --- (optional boneyardIndex for "select card if blocked" in 1–3 player games)
            socket.on("draw-card", async (data?: { boneyardIndex?: number }) => {
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

                    let drawn: ICard;
                    const idx = data?.boneyardIndex;
                    if (typeof idx === "number" && idx >= 0 && idx < room.boneyard.length) {
                        drawn = room.boneyard.splice(idx, 1)[0]!;
                    } else {
                        drawn = room.boneyard.pop()!;
                    }
                    room.hands[meta.currentSeat].push(drawn);

                    const player = room.players.find((p: { seatIndex: number }) => p.seatIndex === meta.currentSeat);
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

                    const activeSeats = getActiveSeats(room);
                    const hand = room.hands[meta.currentSeat];
                    const possibles = getPlayableMoves(hand, room.board);
                    const vendaRequired = room.board.length === 0 && room.round > 1;
                    const hasNoVenda = vendaRequired && !hasDouble(hand);
                    if (possibles.length > 0 && !hasNoVenda) {
                        socket.emit("error", { message: "আপনার খেলার মতো তাস আছে!" });
                        return;
                    }
                    if (room.boneyard.length > 0 && !hasNoVenda) {
                        socket.emit("error", { message: "আগে বোনইয়ার্ড থেকে তাস তুলুন!" });
                        return;
                    }

                    room.passes[meta.currentSeat] = 1;

                    const player = room.players.find((p: { seatIndex: number }) => p.seatIndex === meta.currentSeat);
                    await Move.create({
                        roomCode: meta.currentRoom,
                        round: room.round,
                        playerIndex: meta.currentSeat,
                        playerName: player?.displayName || username,
                        action: "pass",
                        boardSnapshot: room.board,
                    });

                    const allPassed = activeSeats.every(
                        (seat) => room.passes[seat] === 1
                    );
                    if (allPassed) {
                        const winner = getBlockedWinner(room.hands, activeSeats);
                        await endRound(io, room, winner, true);
                        return;
                    }

                    room.turn = nextActiveTurn(room, meta.currentSeat);
                    await processAutoTurns(io, room);
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

                    const activeSeats = getActiveSeats(room);
                    const deck = createShuffledDeck();
                    const maxVenda = room.rules?.maximumVenda ?? 4;
                    const { hands, boneyard } = dealHands(deck, maxVenda, activeSeats);

                    room.board = [];
                    room.hands = hands;
                    room.boneyard = boneyard;
                    room.status = "playing";
                    room.passes = [0, 0, 0, 0];
                    room.round = (room.round || 0) + 1;

                    const winnerStillInRoom = room.lastWinner >= 0 && activeSeats.includes(room.lastWinner);
                    if (winnerStillInRoom) {
                        room.turn = room.lastWinner;
                    } else {
                        room.turn = activeSeats.length > 0 ? activeSeats[0]! : findStarter(hands, activeSeats);
                    }

                    await room.save();
                    await processAutoTurns(io, room);
                } catch (err) {
                    console.error("next-round error:", err);
                }
            });

            // --- SHUFFLE DECK (re-deal in lobby) ---
            socket.on("shuffle-deck", async () => {
                try {
                    await connectDB();
                    const meta = socketMeta.get(socket.id);
                    if (!meta?.currentRoom) return;

                    const room = await Room.findOne({ code: meta.currentRoom });
                    if (!room) return;

                    if (room.status === "playing") {
                        socket.emit("error", { message: "খেলা চলাকালীন শাফেল করা যাবে না / Cannot shuffle during game" });
                        return;
                    }

                    const activeSeats = getActiveSeats(room);
                    if (activeSeats.length === 0) {
                        socket.emit("error", { message: "কোনো খেলোয়াড় নেই / No players" });
                        return;
                    }

                    const deck = createShuffledDeck();
                    const maxVenda = room.rules?.maximumVenda ?? 4;
                    const { hands, boneyard } = dealHands(deck, maxVenda, activeSeats);

                    room.hands = hands;
                    room.boneyard = boneyard;
                    room.board = [];
                    room.passes = [0, 0, 0, 0];

                    await room.save();

                    io.to(room.code).emit("deck-shuffled", {
                        message: "তাস শাফেল হয়েছে! / Deck shuffled!",
                    });
                    broadcastState(io, room);
                    console.log(`🔀 Deck shuffled in room ${room.code}`);
                } catch (err) {
                    console.error("shuffle-deck error:", err);
                }
            });

            // --- UPDATE RULES ---
            socket.on("update-rules", async (data: {
                firstRoundStartWith00?: boolean;
                blockerGetsZero?: boolean;
                winningPoints?: number;
                maximumVenda?: number;
                maxPlayers?: number;
                useLowestVendaForFewPlayers?: boolean;
                blockerRefill?: boolean;
            }) => {
                try {
                    await connectDB();
                    const meta = socketMeta.get(socket.id);
                    if (!meta?.currentRoom) return;

                    const room = await Room.findOne({ code: meta.currentRoom });
                    if (!room) return;
                    const isInRoom = room.players.some((p: { username: string }) => p.username === username);
                    if (!isInRoom) {
                        socket.emit("error", { message: "রুমে যোগ দিয়ে নিয়ম পরিবর্তন করুন" });
                        return;
                    }
                    if (room.status === "playing") {
                        socket.emit("error", { message: "খেলা চলাকালীন নিয়ম পরিবর্তন করা যাবে না" });
                        return;
                    }

                    if (!room.rules || typeof room.rules !== "object") {
                        (room as any).rules = {};
                    }
                    const r = room.rules as any;
                    if (r.firstRoundStartWith00 === undefined) r.firstRoundStartWith00 = true;
                    if (r.blockerGetsZero === undefined) r.blockerGetsZero = true;
                    if (r.winningPoints === undefined) r.winningPoints = 100;
                    if (r.maximumVenda === undefined) r.maximumVenda = 4;
                    if (r.maxPlayers === undefined) r.maxPlayers = 4;
                    if (r.useLowestVendaForFewPlayers === undefined) r.useLowestVendaForFewPlayers = true;
                    if (r.blockerRefill === undefined) r.blockerRefill = true;

                    if (data.firstRoundStartWith00 !== undefined) room.rules.firstRoundStartWith00 = data.firstRoundStartWith00;
                    if (data.blockerGetsZero !== undefined) room.rules.blockerGetsZero = data.blockerGetsZero;
                    if (data.winningPoints !== undefined) {
                        const v = Math.max(10, Math.min(500, data.winningPoints));
                        room.rules.winningPoints = v;
                    }
                    if (data.maximumVenda !== undefined) {
                        const mv = Math.max(1, Math.min(7, data.maximumVenda));
                        room.rules.maximumVenda = mv;
                    }
                    if (data.maxPlayers !== undefined) {
                        const mp = Math.max(1, Math.min(4, data.maxPlayers));
                        if (room.players.length > mp) {
                            const overflow = room.players.filter((p: { seatIndex: number }) => p.seatIndex >= mp);
                            for (const p of overflow) {
                                await removePlayerFromRoom(io, room, p.username);
                            }
                        }
                        room.rules.maxPlayers = mp;
                    }
                    if (data.useLowestVendaForFewPlayers !== undefined) room.rules.useLowestVendaForFewPlayers = data.useLowestVendaForFewPlayers;
                    if (data.blockerRefill !== undefined) room.rules.blockerRefill = data.blockerRefill;

                    room.markModified("rules");
                    await room.save();

                    const rulesPayload = {
                        firstRoundStartWith00: room.rules.firstRoundStartWith00 ?? true,
                        blockerGetsZero: room.rules.blockerGetsZero ?? true,
                        winningPoints: room.rules.winningPoints ?? 100,
                        maximumVenda: room.rules.maximumVenda ?? 4,
                        maxPlayers: room.rules.maxPlayers ?? 4,
                        useLowestVendaForFewPlayers: room.rules.useLowestVendaForFewPlayers ?? true,
                        blockerRefill: room.rules.blockerRefill ?? true,
                    };
                    io.to(room.code).emit("rules-updated", { rules: rulesPayload });
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
                        const rules = room.rules && typeof room.rules === "object" ? room.rules : {};
                        const normalizedRules = {
                            firstRoundStartWith00: rules.firstRoundStartWith00 ?? true,
                            blockerGetsZero: rules.blockerGetsZero ?? true,
                            winningPoints: rules.winningPoints ?? 100,
                            maximumVenda: rules.maximumVenda ?? 4,
                            maxPlayers: rules.maxPlayers ?? 4,
                            useLowestVendaForFewPlayers: rules.useLowestVendaForFewPlayers ?? true,
                            blockerRefill: rules.blockerRefill ?? true,
                        };
                        socket.emit("room-info", {
                            players: room.players.map((p: { username: string; displayName: any; seatIndex: any }) => ({
                                username: p.username,
                                displayName: p.displayName,
                                seatIndex: p.seatIndex,
                                connected: isUserOnline(p.username),
                            })),
                            status: room.status,
                            creator: room.creator,
                            rules: normalizedRules,
                        });
                    } else {
                        socket.emit("room-info", {
                            players: [],
                            status: "lobby",
                            rules: {
                                firstRoundStartWith00: true,
                                blockerGetsZero: true,
                                winningPoints: 100,
                                maximumVenda: 4,
                                maxPlayers: 4,
                                useLowestVendaForFewPlayers: true,
                                blockerRefill: true,
                            },
                        });
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

                if (!isUserOnline(username) && currentRoom) {
                    try {
                        await connectDB();
                        const room = await Room.findOne({ code: currentRoom });
                        if (!room) return;

                        const player = room.players.find((p: { username: any }) => p.username === username);
                        if (player) {
                            player.connected = false;
                            player.lastSeen = new Date();
                            await room.save();
                            broadcastState(io, room);

                            const t = setTimeout(async () => {
                                try {
                                    const r = await Room.findOne({ code: currentRoom });
                                    if (!r || isUserOnline(username)) return;
                                    const stillDisconnected = r.players.find((p: { username: string }) => p.username === username);
                                    if (stillDisconnected && !stillDisconnected.connected) {
                                        await removePlayerFromRoom(io, r, username);
                                    }
                                } catch (e) {
                                    console.error("auto-leave timeout error:", e);
                                } finally {
                                    disconnectTimers.get(currentRoom)?.delete(username);
                                }
                            }, DISCONNECT_GRACE_MS);
                            if (!disconnectTimers.has(currentRoom)) disconnectTimers.set(currentRoom, new Map());
                            disconnectTimers.get(currentRoom)!.set(username, t);
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

async function removePlayerFromRoom(io: SocketServer, room: IRoom, username: string): Promise<void> {
    const playerIdx = room.players.findIndex((p) => p.username === username);
    if (playerIdx < 0) return;

    const leavingPlayer = room.players[playerIdx];
    room.players.splice(playerIdx, 1);

    io.to(room.code).emit("player-left", {
        username,
        displayName: leavingPlayer?.displayName || username,
        message: `${leavingPlayer?.displayName || username} রুম ছেড়ে চলে গেছে`,
    });

    if (room.status === "playing") {
        room.status = "lobby";
        room.board = [];
        room.hands = [[], [], [], []];
        room.boneyard = [];
        room.passes = [0, 0, 0, 0];
        room.turn = 0;
        room.round = 0;
        room.lastWinner = -1;
        room.scores = [0, 0, 0, 0];
    }

    if (room.creator === username && room.players.length > 0) {
        room.creator = room.players[0].username;
    }

    const allSockets = userSockets.get(username);
    if (allSockets) {
        for (const sid of allSockets) {
            const s = io.sockets.sockets.get(sid);
            if (s) s.leave(room.code);
            const m = socketMeta.get(sid);
            if (m) {
                m.currentRoom = "";
                m.currentSeat = -1;
            }
        }
    }

    await room.save();
    broadcastState(io, room);
}

async function rejoinActiveRoom(io: SocketServer, socket: Socket, username: string) {
    try {
        await connectDB();
        const room = await Room.findOne({
            "players.username": username,
            status: { $in: ["lobby", "playing"] },
        });

        if (room) {
            const player = room.players.find((p: { username: string }) => p.username === username);
            if (player) {
                const timers = disconnectTimers.get(room.code);
                const t = timers?.get(username);
                if (t) {
                    clearTimeout(t);
                    timers?.delete(username);
                }
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
    const activeSeatIndices = room.players.map((p) => p.seatIndex).sort((a, b) => a - b);
    if (activeSeatIndices.length === 0) return 0;

    // For single player, always return the same seat
    if (activeSeatIndices.length === 1) return activeSeatIndices[0];

    const currentIdx = activeSeatIndices.indexOf(currentSeat);
    const nextIdx = (currentIdx + 1) % activeSeatIndices.length;
    return activeSeatIndices[nextIdx];
}

async function processAutoTurns(io: SocketServer, room: IRoom): Promise<void> {
    const activeSeats = getActiveSeats(room);
    const maxIterations = activeSeats.length;

    for (let i = 0; i < maxIterations; i++) {
        const currentSeat = room.turn;

        // Bot seats are handled entirely by executeBotTurn — stop here.
        if (isBotSeat(room, currentSeat)) break;

        const hand = room.hands[currentSeat];
        if (!hand || hand.length === 0) break;
        const moves = getPlayableMoves(hand, room.board);

        if (room.board.length === 0 && room.round > 1) {
            if (!hasDouble(hand)) {
                room.passes[currentSeat] = 1;
                const player = room.players.find((p) => p.seatIndex === currentSeat);
                const playerName = player?.displayName || `Player ${currentSeat + 1}`;
                await Move.create({ roomCode: room.code, round: room.round, playerIndex: currentSeat, playerName, action: "pass", boardSnapshot: room.board });
                io.to(room.code).emit("auto-pass", { seat: currentSeat, playerName, message: `${playerName} অটো-পাস (ভেন্ডা নেই)` });

                if (activeSeats.every((seat) => room.passes[seat] === 1)) {
                    room.passes = [0, 0, 0, 0];
                    break;
                }
                room.turn = nextActiveTurn(room, currentSeat);
                continue;
            }
            break;
        }

        if (moves.length > 0) break;
        if (room.boneyard.length > 0) break;

        room.passes[currentSeat] = 1;
        const player = room.players.find((p) => p.seatIndex === currentSeat);
        const playerName = player?.displayName || `Player ${currentSeat + 1}`;
        await Move.create({ roomCode: room.code, round: room.round, playerIndex: currentSeat, playerName, action: "pass", boardSnapshot: room.board });
        io.to(room.code).emit("auto-pass", { seat: currentSeat, playerName, message: `${playerName} অটো-পাস হয়েছে (কোনো চাল নেই)` });

        if (activeSeats.every((seat) => room.passes[seat] === 1)) {
            const winner = getBlockedWinner(room.hands, activeSeats);
            await endRound(io, room, winner, true);
            return;
        }
        room.turn = nextActiveTurn(room, currentSeat);
    }

    await room.save();
    broadcastState(io, room);
    scheduleBotTurn(io, room);
}

// ─── BOT SYSTEM ──────────────────────────────────────────────

const BOT_TURN_DELAY_MS = 900;

function delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function getBotSeats(room: IRoom): number[] {
    const stored = (room as any).botSeats;
    if (Array.isArray(stored) && stored.length > 0) return stored;
    return (room.players || [])
        .filter((p: { username: string }) => String(p.username || "").startsWith("bot_"))
        .map((p: { seatIndex: number }) => p.seatIndex);
}

function isBotSeat(room: IRoom, seat: number): boolean {
    return getBotSeats(room).includes(seat);
}

function scheduleBotTurn(io: SocketServer, room: IRoom): void {
    if (room.status !== "playing") return;
    if (!isBotSeat(room, room.turn)) return;
    const code = room.code;
    setTimeout(() => executeBotTurn(io, code), 200);
}

async function executeBotTurn(io: SocketServer, roomCode: string): Promise<void> {
    try {
        await connectDB();
        const room = await Room.findOne({ code: roomCode });
        if (!room || room.status !== "playing") return;
        if (!isBotSeat(room, room.turn)) return;

        const currentSeat = room.turn;
        const hand = room.hands[currentSeat];
        const activeSeats = getActiveSeats(room);
        if (!hand || hand.length === 0) return;

        const player = room.players.find((p: { seatIndex: number }) => p.seatIndex === currentSeat);
        const playerName = player?.displayName || `Robot ${currentSeat + 1}`;

        const emitBotAction = (action: "play" | "draw" | "pass") => {
            io.to(roomCode).emit("bot-turn", { seat: currentSeat, playerName, action });
        };

        // Round > 1, empty board: must start with a double (venda). No double = pass.
        if (room.board.length === 0 && room.round > 1 && !hasDouble(hand)) {
            emitBotAction("pass");
            await delay(BOT_TURN_DELAY_MS);
            room.passes[currentSeat] = 1;
            await Move.create({ roomCode, round: room.round, playerIndex: currentSeat, playerName, action: "pass", boardSnapshot: room.board });
            io.to(roomCode).emit("auto-pass", { seat: currentSeat, playerName, message: `${playerName} অটো-পাস (ভেন্ডা নেই)` });
            if (activeSeats.every((s) => room.passes[s] === 1)) {
                room.passes = [0, 0, 0, 0];
                await room.save();
                broadcastState(io, room);
                return;
            }
            room.turn = nextActiveTurn(room, currentSeat);
            await room.save();
            broadcastState(io, room);
            scheduleBotTurn(io, room);
            return;
        }

        // Try to play a card
        let moves = getPlayableMoves(hand, room.board);
        if (moves.length > 0) {
            emitBotAction("play");
            await delay(BOT_TURN_DELAY_MS);
            const doubles = moves.filter((m) => hand[m.idx].a === hand[m.idx].b);
            const pick = doubles.length > 0 ? doubles : moves;
            const move = pick[Math.floor(Math.random() * pick.length)]!;
            const card = hand[move.idx];
            room.board = placeCard(room.board, card, move.side);
            room.hands[currentSeat].splice(move.idx, 1);
            room.passes = [0, 0, 0, 0];
            await Move.create({ roomCode, round: room.round, playerIndex: currentSeat, playerName, action: "play", card: { a: card.a, b: card.b }, side: move.side, boardSnapshot: room.board });

            if (room.hands[currentSeat].length === 0) { await endRound(io, room, currentSeat, false); return; }
            if (isBlocked(room.hands, room.board, room.boneyard, activeSeats)) { await endRound(io, room, getBlockedWinner(room.hands, activeSeats), true); return; }

            room.turn = nextActiveTurn(room, currentSeat);
            await room.save();
            broadcastState(io, room);
            scheduleBotTurn(io, room);
            return;
        }

        // Draw from boneyard until we can play or boneyard is empty
        while (room.boneyard.length > 0 && getPlayableMoves(room.hands[currentSeat], room.board).length === 0) {
            emitBotAction("draw");
            await delay(BOT_TURN_DELAY_MS);
            const drawn = room.boneyard.pop()!;
            room.hands[currentSeat].push(drawn);
            await Move.create({ roomCode, round: room.round, playerIndex: currentSeat, playerName, action: "draw", card: { a: drawn.a, b: drawn.b }, boardSnapshot: room.board });
            await room.save();
            broadcastState(io, room);
        }

        // After drawing, try to play again
        moves = getPlayableMoves(room.hands[currentSeat], room.board);
        if (moves.length > 0) {
            emitBotAction("play");
            await delay(BOT_TURN_DELAY_MS);
            const doubles = moves.filter((m) => room.hands[currentSeat][m.idx].a === room.hands[currentSeat][m.idx].b);
            const pick = doubles.length > 0 ? doubles : moves;
            const move = pick[Math.floor(Math.random() * pick.length)]!;
            const card = room.hands[currentSeat][move.idx];
            room.board = placeCard(room.board, card, move.side);
            room.hands[currentSeat].splice(move.idx, 1);
            room.passes = [0, 0, 0, 0];
            await Move.create({ roomCode, round: room.round, playerIndex: currentSeat, playerName, action: "play", card: { a: card.a, b: card.b }, side: move.side, boardSnapshot: room.board });

            if (room.hands[currentSeat].length === 0) { await endRound(io, room, currentSeat, false); return; }
            if (isBlocked(room.hands, room.board, room.boneyard, activeSeats)) { await endRound(io, room, getBlockedWinner(room.hands, activeSeats), true); return; }

            room.turn = nextActiveTurn(room, currentSeat);
            await room.save();
            broadcastState(io, room);
            scheduleBotTurn(io, room);
            return;
        }

        // No moves even after drawing — pass
        emitBotAction("pass");
        await delay(BOT_TURN_DELAY_MS);
        room.passes[currentSeat] = 1;
        await Move.create({ roomCode, round: room.round, playerIndex: currentSeat, playerName, action: "pass", boardSnapshot: room.board });
        io.to(roomCode).emit("auto-pass", { seat: currentSeat, playerName, message: `${playerName} পাস (কোনো চাল নেই)` });

        if (activeSeats.every((s) => room.passes[s] === 1)) {
            await endRound(io, room, getBlockedWinner(room.hands, activeSeats), true);
            return;
        }
        room.turn = nextActiveTurn(room, currentSeat);
        await room.save();
        broadcastState(io, room);
        scheduleBotTurn(io, room);
    } catch (err) {
        console.error("executeBotTurn error:", err);
    }
}

async function endRound(
    io: SocketServer,
    room: IRoom,
    winnerSeat: number,
    blocked: boolean
) {
    const activeSeats = getActiveSeats(room);
    room.status = "ended";
    room.lastWinner = winnerSeat;
    const pts = room.hands.map(handPoints);
    pts[winnerSeat] = 0;

    if (blocked && room.rules.blockerGetsZero) {
        pts[winnerSeat] = 0;
    }

    for (const seat of activeSeats) {
        room.scores[seat] = (room.scores[seat] || 0) + pts[seat];
    }

    const winningPoints = room.rules?.winningPoints ?? 100;
    const activeScores = activeSeats.map((s) => room.scores[s]);
    const maxScore = Math.max(...activeScores);
    const gameOver = maxScore >= winningPoints;
    const gameWinnerSeat = gameOver ? activeSeats[activeScores.indexOf(maxScore)] : -1;
    const gameWinnerPlayer = gameWinnerSeat >= 0 ? room.players.find((p) => p.seatIndex === gameWinnerSeat) : null;

    await room.save();

    const winnerPlayer = room.players.find((p) => p.seatIndex === winnerSeat);
    const winnerName = winnerPlayer?.displayName || `Player ${winnerSeat + 1}`;
    io.to(room.code).emit("round-end", {
        winner: winnerSeat,
        winnerName,
        blocked,
        roundPoints: pts,
        totalScores: room.scores,
        gameOver,
        gameWinnerSeat,
        gameWinnerName: gameWinnerPlayer?.displayName || (gameWinnerSeat >= 0 ? `Player ${gameWinnerSeat + 1}` : ""),
        winningPoints,
        nextRoundStarter: winnerSeat,
        nextRoundStarterName: winnerName,
    });

    broadcastState(io, room);
}

function broadcastState(io: SocketServer, room: IRoom) {
    for (const player of room.players) {
        const state = sanitizeForPlayer(room, player.seatIndex);
        emitToUser(io, player.username, "game-state", state);
    }
}
