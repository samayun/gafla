import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(token?: string): Socket {
    if (!socket) {
        const authToken =
            token || (typeof window !== "undefined" ? localStorage.getItem("gafla_token") : null);

        socket = io({
            transports: ["websocket", "polling"],
            autoConnect: false,
            auth: { token: authToken },
        });
    }
    return socket;
}

export function resetSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}

export function connectSocket(token: string): Socket {
    resetSocket();
    socket = io({
        transports: ["websocket", "polling"],
        autoConnect: true,
        auth: { token },
    });
    return socket;
}
