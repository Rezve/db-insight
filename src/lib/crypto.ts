import crypto from "crypto";
import fs from "fs";
import path from "path";

const KEY_PATH = path.join(process.cwd(), "data", ".key");
const KEY_LENGTH = 32; // 256 bits for AES-256
const IV_LENGTH = 16;
const ALGORITHM = "aes-256-gcm";
const AUTH_TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function ensureKeyExists(): Buffer {
  if (cachedKey) return cachedKey;

  if (fs.existsSync(KEY_PATH)) {
    cachedKey = fs.readFileSync(KEY_PATH);
    if (cachedKey.length !== KEY_LENGTH) {
      throw new Error(`Encryption key at ${KEY_PATH} has invalid length: ${cachedKey.length}, expected ${KEY_LENGTH}`);
    }
    return cachedKey;
  }

  // Generate new key
  const key = crypto.randomBytes(KEY_LENGTH);

  // Ensure data directory exists
  const dataDir = path.dirname(KEY_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Write with restricted permissions (owner read/write only)
  fs.writeFileSync(KEY_PATH, key, { mode: 0o600 });
  cachedKey = key;

  return key;
}

export function encrypt(plaintext: string): string {
  const key = ensureKeyExists();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decrypt(encrypted: string): string {
  const key = ensureKeyExists();

  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format");
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: ${iv.length}`);
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: ${authTag.length}`);
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
