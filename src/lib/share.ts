import "server-only";
import { createHash, randomBytes } from "node:crypto";

export const shareHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const newShareToken = () => randomBytes(18).toString("base64url"); // 24 characters
