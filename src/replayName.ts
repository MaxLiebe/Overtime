import { readFileSync, writeFileSync } from "node:fs";
import { parseReplayHeader } from "./replayParser.js";

function buildStrPropertyValue(name: string): Buffer {
  const strBytes = Buffer.from(`${name.replace(/\0/g, "").trim()}\0`, "latin1");
  const propSize = 4 + strBytes.length;
  const block = Buffer.alloc(4 + 4 + 4 + strBytes.length);
  block.writeInt32LE(propSize, 0);
  block.writeInt32LE(0, 4);
  block.writeInt32LE(strBytes.length, 8);
  strBytes.copy(block, 12);
  return block;
}

function buildReplayNameProperty(name: string): Buffer {
  const key = Buffer.from("ReplayName\0", "latin1");
  const type = Buffer.from("StrProperty\0", "latin1");
  return Buffer.concat([
    Buffer.from([0x0b, 0, 0, 0]),
    key,
    Buffer.from([0x0c, 0, 0, 0]),
    type,
    buildStrPropertyValue(name),
  ]);
}

function findReplayNameRange(header: Buffer): { start: number; end: number } | null {
  const marker = Buffer.from("ReplayName\0", "latin1");
  const idx = header.indexOf(marker);
  if (idx < 4) {
    return null;
  }

  const keyLen = header.readInt32LE(idx - 4);
  if (keyLen !== marker.length) {
    return null;
  }

  let offset = idx + marker.length;
  const typeLen = header.readInt32LE(offset);
  offset += 4;
  const typeName = header.subarray(offset, offset + typeLen - 1).toString("latin1");
  offset += typeLen;

  if (typeName !== "StrProperty") {
    return null;
  }

  const propSize = header.readInt32LE(offset);
  offset += 4;
  offset += 4;
  const strLen = header.readInt32LE(offset);
  offset += 4;

  if (propSize !== 4 + strLen || offset + strLen > header.length) {
    return null;
  }

  return { start: idx - 4, end: offset + strLen };
}

export function sanitizeReplayName(input: string): string {
  const name = input.trim().replace(/[\u0000-\u001f]/g, "");
  if (!name) {
    throw new Error("Enter a replay name.");
  }

  return name;
}

export function readReplayName(filePath: string): string | undefined {
  const properties = parseReplayHeader(filePath).properties ?? {};
  const replayName = properties.ReplayName;
  if (typeof replayName !== "string") {
    return undefined;
  }

  const trimmed = replayName.trim();
  return trimmed || undefined;
}

export function setReplayName(filePath: string, replayName: string): void {
  const sanitized = sanitizeReplayName(replayName);
  const raw = readFileSync(filePath);
  const headerSize = raw.readInt32LE(0);

  if (headerSize <= 0 || 8 + headerSize > raw.length) {
    throw new Error("Replay file header is invalid.");
  }

  const headerCrc = raw.readUInt32LE(4);
  const header = Buffer.from(raw.subarray(8, 8 + headerSize));
  const body = raw.subarray(8 + headerSize);
  const range = findReplayNameRange(header);
  const replayNameProperty = buildReplayNameProperty(sanitized);

  let newHeader: Buffer;
  if (range) {
    newHeader = Buffer.concat([
      header.subarray(0, range.start),
      replayNameProperty,
      header.subarray(range.end),
    ]);
  } else {
    const versionIdx = header.indexOf("ReplayVersion");
    if (versionIdx < 4) {
      throw new Error("Could not locate replay metadata to rename this file.");
    }

    const insertAt = versionIdx - 4;
    newHeader = Buffer.concat([
      header.subarray(0, insertAt),
      replayNameProperty,
      header.subarray(insertAt),
    ]);
  }

  const output = Buffer.alloc(8 + newHeader.length + body.length);
  output.writeInt32LE(newHeader.length, 0);
  output.writeUInt32LE(headerCrc, 4);
  newHeader.copy(output, 8);
  body.copy(output, 8 + newHeader.length);
  writeFileSync(filePath, output);
}
