import { ICard, IRoom } from "./models/room";

export function createShuffledDeck(): ICard[] {
    const deck: ICard[] = [];
    for (let i = 0; i <= 6; i++) {
        for (let j = i; j <= 6; j++) {
            deck.push({ a: i, b: j });
        }
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function countDoubles(hand: ICard[]): number {
    return hand.filter((c) => c.a === c.b).length;
}

function rawDeal(deck: ICard[]): { hands: ICard[][]; boneyard: ICard[] } {
    const hands: ICard[][] = [];
    const remaining = [...deck];
    for (let i = 0; i < 4; i++) {
        hands.push(remaining.splice(0, 7));
    }
    return { hands, boneyard: remaining };
}

export function dealHands(deck: ICard[], maxVenda: number = 4): { hands: ICard[][]; boneyard: ICard[] } {
    const MAX_ATTEMPTS = 50;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const shuffled = [...deck];
        if (attempt > 0) {
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
        }
        const result = rawDeal(shuffled);
        const hasTooManyDoubles = result.hands.some((h) => countDoubles(h) > maxVenda);
        if (!hasTooManyDoubles) return result;
    }

    return rawDeal(deck);
}

export function findStarter(hands: ICard[][]): number {
    for (let p = 0; p < 4; p++) {
        if (hands[p].some((c) => c.a === 0 && c.b === 0)) return p;
    }
    return 0;
}

export function getEndpoints(board: ICard[]): { head: number; tail: number } | null {
    if (board.length === 0) return null;
    return { head: board[0].a, tail: board[board.length - 1].b };
}

export function canPlayOn(card: ICard, value: number): boolean {
    return card.a === value || card.b === value;
}

export function getPlayableMoves(
    hand: ICard[],
    board: ICard[]
): { idx: number; side: "head" | "tail" }[] {
    if (board.length === 0) {
        return hand.map((_, i) => ({ idx: i, side: "tail" as const }));
    }

    const { head, tail } = getEndpoints(board)!;
    const moves: { idx: number; side: "head" | "tail" }[] = [];

    hand.forEach((c, i) => {
        if (canPlayOn(c, head)) moves.push({ idx: i, side: "head" });
        if (canPlayOn(c, tail)) moves.push({ idx: i, side: "tail" });
    });

    return moves;
}

export function placeCard(
    board: ICard[],
    card: ICard,
    side: "head" | "tail"
): ICard[] {
    const newBoard = [...board];

    if (newBoard.length === 0) {
        newBoard.push({ a: card.a, b: card.b });
        return newBoard;
    }

    const { head, tail } = getEndpoints(newBoard)!;

    if (side === "head") {
        if (card.b === head) {
            newBoard.unshift({ a: card.a, b: card.b });
        } else {
            newBoard.unshift({ a: card.b, b: card.a });
        }
    } else {
        if (card.a === tail) {
            newBoard.push({ a: card.a, b: card.b });
        } else {
            newBoard.push({ a: card.b, b: card.a });
        }
    }

    return newBoard;
}

/**
 * Empty board (first move of round):
 * - Round 1 + firstRoundStartWith00: 0:0 holder must play 0:0
 * - Round 2+: winner must play any venda (double), 0:0 not mandatory. No venda = auto-pass.
 */
export function validatePlay(
    hand: ICard[],
    cardIdx: number,
    side: "head" | "tail",
    board: ICard[],
    require00ForFirstMove: boolean,
    winnerStartsWithVenda: boolean
): { valid: boolean; reason?: string } {
    if (cardIdx < 0 || cardIdx >= hand.length) {
        return { valid: false, reason: "Invalid card index" };
    }

    const card = hand[cardIdx];

    if (board.length === 0) {
        if (require00ForFirstMove) {
            const has00 = hand.some((c) => c.a === 0 && c.b === 0);
            if (has00 && (card.a !== 0 || card.b !== 0)) {
                return { valid: false, reason: "0:0 দিয়ে শুরু করতে হবে / Must start with 0:0!" };
            }
        }
        if (winnerStartsWithVenda) {
            const hasDouble = hand.some((c) => c.a === c.b);
            if (hasDouble && card.a !== card.b) {
                return { valid: false, reason: "যেকোনো ভেন্ডা (ডাবল) দিয়ে শুরু করুন / Start with any venda (double)!" };
            }
        }
        return { valid: true };
    }

    const { head, tail } = getEndpoints(board)!;

    if (side === "head" && canPlayOn(card, head)) return { valid: true };
    if (side === "tail" && canPlayOn(card, tail)) return { valid: true };

    return { valid: false, reason: "তাস বোর্ডের সাথে মিলছে না / Card doesn't match" };
}

/** Check if a player has any double tile */
export function hasDouble(hand: ICard[]): boolean {
    return hand.some((c) => c.a === c.b);
}

export function isBlocked(hands: ICard[][], board: ICard[], boneyard: ICard[]): boolean {
    if (boneyard.length > 0) return false;
    for (let i = 0; i < 4; i++) {
        if (getPlayableMoves(hands[i], board).length > 0) return false;
    }
    return true;
}

export function handPoints(hand: ICard[]): number {
    return hand.reduce((sum, c) => sum + c.a + c.b, 0);
}

export function getBlockedWinner(hands: ICard[][]): number {
    const pts = hands.map(handPoints);
    return pts.indexOf(Math.min(...pts));
}

export function sanitizeForPlayer(room: IRoom, playerSeat: number) {
    const handSizes = room.hands.map((h) => h.length);
    return {
        code: room.code,
        board: room.board,
        myHand: room.hands[playerSeat] || [],
        handSizes,
        boneyard: room.boneyard.length,
        turn: room.turn,
        status: room.status,
        scores: room.scores,
        passes: room.passes,
        round: room.round,
        lastWinner: room.lastWinner,
        rules: room.rules,
        creator: room.creator,
        players: room.players.map((p) => ({
            username: p.username,
            displayName: p.displayName,
            seatIndex: p.seatIndex,
            connected: p.connected,
        })),
        mySeat: playerSeat,
    };
}

export type SanitizedState = ReturnType<typeof sanitizeForPlayer>;
