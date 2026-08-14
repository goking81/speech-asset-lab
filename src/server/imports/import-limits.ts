export const mib = 1024 * 1024;

export type ImportLimits = {
  maxFilesPerBatch: number;
  maxFileBytes: number;
  maxBatchBytes: number;
  maxZipCompressionRatio: number;
};

export const defaultImportLimits: ImportLimits = {
  maxFilesPerBatch: 100,
  maxFileBytes: 25 * mib,
  maxBatchBytes: 200 * mib,
  maxZipCompressionRatio: 100,
};

type ImportLimitEnvironment = {
  IMPORT_MAX_FILES?: string;
  IMPORT_MAX_FILE_BYTES?: string;
  IMPORT_MAX_BATCH_BYTES?: string;
  IMPORT_MAX_ZIP_COMPRESSION_RATIO?: string;
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getImportLimits(
  environment: ImportLimitEnvironment = process.env as ImportLimitEnvironment,
): ImportLimits {
  return {
    maxFilesPerBatch: positiveInteger(
      environment.IMPORT_MAX_FILES,
      defaultImportLimits.maxFilesPerBatch,
    ),
    maxFileBytes: positiveInteger(
      environment.IMPORT_MAX_FILE_BYTES,
      defaultImportLimits.maxFileBytes,
    ),
    maxBatchBytes: positiveInteger(
      environment.IMPORT_MAX_BATCH_BYTES,
      defaultImportLimits.maxBatchBytes,
    ),
    maxZipCompressionRatio: positiveInteger(
      environment.IMPORT_MAX_ZIP_COMPRESSION_RATIO,
      defaultImportLimits.maxZipCompressionRatio,
    ),
  };
}

export type IntakeErrorCode =
  | 'BATCH_FILE_LIMIT_EXCEEDED'
  | 'FILE_SIZE_LIMIT_EXCEEDED'
  | 'BATCH_SIZE_LIMIT_EXCEEDED'
  | 'ZIP_COMPRESSION_RATIO_EXCEEDED'
  | 'ZIP_METADATA_INVALID'
  | 'INVALID_RELATIVE_PATH'
  | 'UNSUPPORTED_FILE_TYPE';

export type IntakeFileDescriptor = {
  relativePath: string;
  extension: string;
  sizeBytes: number;
  compressedBytes?: number;
  uncompressedBytes?: number;
};

const supportedExtensions = new Set(['.txt', '.docx', '.pdf', '.zip']);

export function validateIntakeFile(
  file: IntakeFileDescriptor,
  limits: ImportLimits,
  currentBatchBytes: number,
): IntakeErrorCode | null {
  if (
    !file.relativePath.trim() ||
    /(^[\\/])|(^[A-Za-z]:)|(^|[\\/])\.\.([\\/]|$)/.test(file.relativePath)
  ) {
    return 'INVALID_RELATIVE_PATH';
  }

  if (!supportedExtensions.has(file.extension.toLowerCase())) {
    return 'UNSUPPORTED_FILE_TYPE';
  }

  if (file.sizeBytes > limits.maxFileBytes) {
    return 'FILE_SIZE_LIMIT_EXCEEDED';
  }

  if (currentBatchBytes + file.sizeBytes > limits.maxBatchBytes) {
    return 'BATCH_SIZE_LIMIT_EXCEEDED';
  }

  if (
    file.extension.toLowerCase() === '.zip' &&
    file.compressedBytes !== undefined &&
    file.uncompressedBytes !== undefined &&
    file.compressedBytes > 0 &&
    file.uncompressedBytes / file.compressedBytes > limits.maxZipCompressionRatio
  ) {
    return 'ZIP_COMPRESSION_RATIO_EXCEEDED';
  }

  return null;
}
