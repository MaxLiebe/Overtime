import { createHmac } from "node:crypto";
import { PSY_SIG_KEY } from "./constants.js";

export function generatePsySig(body: Buffer | string): string {
  const data = typeof body === "string" ? Buffer.from(body) : body;
  return createHmac("sha256", PSY_SIG_KEY)
    .update("-")
    .update(data)
    .digest("base64");
}
