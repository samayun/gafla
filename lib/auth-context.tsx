"use client";

import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    ReactNode,
} from "react";

interface AuthUser {
    username: string;
    displayName: string;
}

interface AuthContextType {
    user: AuthUser | null;
    token: string | null;
    loading: boolean;
    login: (token: string, user: AuthUser) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    token: null,
    loading: true,
    login: () => {},
    logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const stored = localStorage.getItem("gafla_token");
        if (stored) {
            setToken(stored);
            fetch("/api/auth/me", {
                headers: { Authorization: `Bearer ${stored}` },
            })
                .then((r) => (r.ok ? r.json() : Promise.reject()))
                .then((data) => {
                    setUser(data.user);
                    setToken(stored);
                })
                .catch(() => {
                    localStorage.removeItem("gafla_token");
                    setToken(null);
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    const login = useCallback((newToken: string, newUser: AuthUser) => {
        localStorage.setItem("gafla_token", newToken);
        setToken(newToken);
        setUser(newUser);
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem("gafla_token");
        localStorage.removeItem("gafla_prefs");
        setToken(null);
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider value={{ user, token, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
