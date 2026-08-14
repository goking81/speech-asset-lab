export type ZipMetadata = {
  entryCount: number;
  compressedBytes: number;
  uncompressedBytes: number;
};

const endOfCentralDirectory = 0x06054b50;
const centralDirectoryFile = 0x02014b50;

function uint16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function uint32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

export function readZipMetadata(bytes: Uint8Array): ZipMetadata {
  const minimumEndDirectorySize = 22;
  const searchStart = Math.max(0, bytes.length - 65_557);
  let endOffset = -1;

  for (let offset = bytes.length - minimumEndDirectorySize; offset >= searchStart; offset -= 1) {
    if (uint32(bytes, offset) === endOfCentralDirectory) {
      endOffset = offset;
      break;
    }
  }

  if (endOffset < 0) {
    throw new Error('ZIP_METADATA_INVALID');
  }

  const entryCount = uint16(bytes, endOffset + 10);
  const centralDirectoryOffset = uint32(bytes, endOffset + 16);
  let cursor = centralDirectoryOffset;
  let compressedBytes = 0;
  let uncompressedBytes = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.length || uint32(bytes, cursor) !== centralDirectoryFile) {
      throw new Error('ZIP_METADATA_INVALID');
    }

    compressedBytes += uint32(bytes, cursor + 20);
    uncompressedBytes += uint32(bytes, cursor + 24);
    cursor +=
      46 + uint16(bytes, cursor + 28) + uint16(bytes, cursor + 30) + uint16(bytes, cursor + 32);
  }

  return { entryCount, compressedBytes, uncompressedBytes };
}
