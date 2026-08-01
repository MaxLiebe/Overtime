const CRC32_POLY = 0x04c11db7;

function crc32(data: Buffer, seed = 0): number {
  let crc = seed ^ 0xffffffff;
  for (const byte of data) {
    crc ^= byte << 24;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x80000000) {
        crc = (crc << 1) ^ CRC32_POLY;
      } else {
        crc <<= 1;
      }
    }
  }
  return (crc ^ 0xffffffff) | 0;
}

export function decodeBuildId(version: string): number {
  const buf = Buffer.allocUnsafe(version.length * 2);
  for (let i = 0; i < version.length; i++) {
    const code = version.charCodeAt(i);
    buf[i * 2] = code & 0xff;
    buf[i * 2 + 1] = (code >> 8) & 0xff;
  }
  return crc32(buf, 0);
}
