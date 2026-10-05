import "server-only";
import crypto from "node:crypto";

// Client logins are encrypted with AES-256-GCM using LOGINS_ENCRYPTION_KEY (32 random
// bytes, base64), which lives only in the server's settings. The database only ever
// holds "v1:<iv>:<tag>:<ciphertext>".

function key() {
  const raw = process.env.LOGINS_ENCRYPTION_KEY;
  if (!raw) return null;
  const k = Buffer.from(raw, "base64");
  return k.length === 32 ? k : null;
}

export const vaultReady = () => !!key();

export function encryptSecret(plain: string): string {
  const k = key();
  if (!k) throw new Error("LOGINS_ENCRYPTION_KEY isn't set.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const k = key();
  if (!k) throw new Error("LOGINS_ENCRYPTION_KEY isn't set.");
  const [v, iv, tag, ct] = stored.split(":");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unreadable secret.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}
