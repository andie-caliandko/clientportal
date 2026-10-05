import crypto from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

describe("login vault", () => {
  beforeAll(() => { process.env.LOGINS_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64"); });
  it("encrypts so the stored text doesn't contain the password, and decrypts it back", async () => {
    const { encryptSecret, decryptSecret } = await import("./vault");
    const stored = encryptSecret("hunter2-Instagram!");
    expect(stored).not.toContain("hunter2");
    expect(stored.startsWith("v1:")).toBe(true);
    expect(decryptSecret(stored)).toBe("hunter2-Instagram!");
    // Same password twice gives different stored text.
    expect(encryptSecret("hunter2-Instagram!")).not.toBe(stored);
  });
  it("refuses tampered text", async () => {
    const { encryptSecret, decryptSecret } = await import("./vault");
    const [v, iv, tag, ct] = encryptSecret("secret").split(":");
    const flipped = Buffer.from(ct, "base64"); flipped[0] ^= 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64")].join(":"))).toThrow();
  });
});
