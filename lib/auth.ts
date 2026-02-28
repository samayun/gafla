import crypto from "crypto";

export function hashPassword(
    password: string,
    existingSalt?: string
): { hash: string; salt: string } {
    const salt = existingSalt || crypto.randomBytes(16).toString("hex");
    const hash = crypto
        .pbkdf2Sync(password, salt, 10000, 64, "sha512")
        .toString("hex");
    return { hash, salt };
}

export function verifyPassword(
    password: string,
    storedHash: string,
    salt: string
): boolean {
    const { hash } = hashPassword(password, salt);
    return hash === storedHash;
}

export function generateToken(): string {
    return crypto.randomBytes(32).toString("hex");
}
