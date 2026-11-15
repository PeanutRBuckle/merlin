/**
 * Central-directory preflight for ZIP archives. Parses only the directory
 * (tens of bytes per entry) so inflated bombs are rejected BEFORE allocation.
 * Also validates EOCD sanity, per-entry flags/method, and every local file
 * header (sizes must agree with the central directory and the compressed
 * data span must exist in the file), and exposes each entry's CRC-32 so the
 * caller can verify inflated content — fflate's unzipSync does NOT check CRC.
 */
export type ZipEntry = {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  isDirectory: boolean;
  crc32: number;
  localOffset: number;
  flags: number;
};

export class ZipPreflightError extends Error {}

// CRC-32 (IEEE 802.3), table-driven, for content-integrity verification.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function readU16(b: Uint8Array, i: number): number {
  return b[i] | (b[i + 1] << 8);
}
function readU32(b: Uint8Array, i: number): number {
  return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
}

/**
 * Returns the central directory entries, or throws ZipPreflightError when the
 * archive is truncated/corrupt, lies about sizes, is encrypted, or uses an
 * unsupported method or zip64.
 */
export function preflightZip(data: Uint8Array): ZipEntry[] {
  const view = data;
  // Locate the EOCD: it lives in the last 22 + 65535 bytes.
  const scanStart = Math.max(0, view.length - (22 + 0xffff));
  let eocd = -1;
  for (let i = view.length - 22; i >= scanStart; i--) {
    if (readU32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipPreflightError('Truncated or corrupt archive (missing central directory).');
  const diskNumber = readU16(view, eocd + 4);
  const diskWithCd = readU16(view, eocd + 6);
  if (diskNumber !== 0 || diskWithCd !== 0) {
    throw new ZipPreflightError('Multi-disk archives are not supported.');
  }
  const entryCount = readU16(view, eocd + 10);
  const cdSize = readU32(view, eocd + 12);
  const cdOffset = readU32(view, eocd + 16);
  const commentLength = readU16(view, eocd + 20);
  if (eocd + 22 + commentLength > view.length) {
    throw new ZipPreflightError('Truncated or corrupt archive (EOCD comment out of bounds).');
  }
  if (cdOffset === 0xffffffff || entryCount === 0xffff) {
    throw new ZipPreflightError('Zip64 archives are not supported.');
  }
  if (cdOffset + cdSize > eocd) {
    throw new ZipPreflightError('Truncated or corrupt archive (central directory out of bounds).');
  }
  if (entryCount * 46 > cdSize) {
    throw new ZipPreflightError('Truncated or corrupt archive (entry count exceeds directory size).');
  }
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let n = 0; n < entryCount; n++) {
    if (p + 46 > cdOffset + cdSize || readU32(view, p) !== 0x02014b50) {
      throw new ZipPreflightError('Truncated or corrupt archive (bad central directory entry).');
    }
    const flags = readU16(view, p + 8);
    const method = readU16(view, p + 10);
    const crc = readU32(view, p + 16);
    const compressedSize = readU32(view, p + 20);
    const uncompressedSize = readU32(view, p + 24);
    const nameLength = readU16(view, p + 28);
    const extraLength = readU16(view, p + 30);
    const commentLength2 = readU16(view, p + 32);
    const localOffset = readU32(view, p + 42);
    if (p + 46 + nameLength + extraLength + commentLength2 > cdOffset + cdSize) {
      throw new ZipPreflightError('Truncated or corrupt archive (central directory entry out of bounds).');
    }
    if (p + 46 + nameLength + extraLength + commentLength2 > view.length) {
      throw new ZipPreflightError('Truncated or corrupt archive (entry name out of bounds).');
    }
    const name = new TextDecoder().decode(view.subarray(p + 46, p + 46 + nameLength));
    const isDirectory = name.endsWith('/');
    if (flags & 0x1) {
      throw new ZipPreflightError('Encrypted archives are not supported.');
    }
    // Zip64 size/offset sentinels in a non-zip64 directory are a lie.
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new ZipPreflightError('Zip64 archives are not supported.');
    }
    if (method !== 0 && method !== 8) {
      throw new ZipPreflightError(`Unsupported compression method ${method} in archive.`);
    }
    // Validate the local file header and the compressed data span.
    if (localOffset + 30 > view.length || readU32(view, localOffset) !== 0x04034b50) {
      throw new ZipPreflightError('Truncated or corrupt archive (missing local header).');
    }
    const lFlags = readU16(view, localOffset + 6);
    const lMethod = readU16(view, localOffset + 8);
    const lCSize = readU32(view, localOffset + 18);
    const lUSize = readU32(view, localOffset + 22);
    const lNameLen = readU16(view, localOffset + 26);
    const lExtraLen = readU16(view, localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    if (!isDirectory) {
      const localName = new TextDecoder().decode(view.subarray(localOffset + 30, localOffset + 30 + lNameLen));
      if (localName !== name) {
        throw new ZipPreflightError('Possible zip bomb: local header disagrees with the central directory (name).');
      }
      if (lFlags !== flags) {
        throw new ZipPreflightError('Possible zip bomb: local header disagrees with the central directory (flags).');
      }
      if (lMethod !== method) {
        throw new ZipPreflightError('Possible zip bomb: local header disagrees with the central directory (method).');
      }
      // With a data descriptor (bit 3) the local sizes are zero by spec.
      if (!(flags & 0x8)) {
        if (lCSize !== compressedSize || lUSize !== uncompressedSize) {
          throw new ZipPreflightError('Possible zip bomb: local header sizes do not match the central directory.');
        }
      }
      if (compressedSize > 0) {
        // The compressed data span must stay before the central directory.
        if (dataStart + compressedSize > cdOffset) {
          throw new ZipPreflightError('Truncated or corrupt archive (entry data overlaps the central directory).');
        }
      }
      if (method === 0 && compressedSize !== uncompressedSize) {
        throw new ZipPreflightError('Possible zip bomb: stored entry sizes disagree.');
      }
    }
    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      method,
      isDirectory,
      crc32: crc,
      localOffset,
      flags,
    });
    p += 46 + nameLength + extraLength + commentLength2;
  }
  if (p !== cdOffset + cdSize) {
    throw new ZipPreflightError('Truncated or corrupt archive (central directory length mismatch).');
  }
  // Duplicate entry names collapse to one key in unzipSync's object — reject
  // the ambiguity before extraction instead of silently discarding a file.
  const seen = new Set(entries.map((e) => e.name));
  if (seen.size !== entries.length) {
    throw new ZipPreflightError('Duplicate entry names in archive.');
  }
  return entries;
}
