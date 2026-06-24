import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export async function hash(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export async function compare(
  password: string,
  stored: string
): Promise<boolean> {
  const [salt, key] = stored.split(":");
  const derived = scryptSync(password, salt, 64);
  return timingSafeEqual(derived, Buffer.from(key, "hex"));
}
