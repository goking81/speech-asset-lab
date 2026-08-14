import { describe, expect, it } from 'vitest';

import { defaultImportLimits, getImportLimits, mib, validateIntakeFile } from './import-limits';

describe('F1 import limits', () => {
  it('uses D-045 defaults and permits local overrides', () => {
    expect(defaultImportLimits).toEqual({
      maxFilesPerBatch: 100,
      maxFileBytes: 25 * mib,
      maxBatchBytes: 200 * mib,
      maxZipCompressionRatio: 100,
    });
    expect(getImportLimits({ IMPORT_MAX_FILES: '20' })).toMatchObject({ maxFilesPerBatch: 20 });
  });

  it('returns explicit error codes for unsafe or over-limit inputs', () => {
    const file = { relativePath: 'lesson.txt', extension: '.txt', sizeBytes: 10 };

    expect(
      validateIntakeFile({ ...file, relativePath: '../outside.txt' }, defaultImportLimits, 0),
    ).toBe('INVALID_RELATIVE_PATH');
    expect(validateIntakeFile({ ...file, extension: '.exe' }, defaultImportLimits, 0)).toBe(
      'UNSUPPORTED_FILE_TYPE',
    );
    expect(validateIntakeFile({ ...file, sizeBytes: 26 * mib }, defaultImportLimits, 0)).toBe(
      'FILE_SIZE_LIMIT_EXCEEDED',
    );
    expect(validateIntakeFile(file, defaultImportLimits, 200 * mib)).toBe(
      'BATCH_SIZE_LIMIT_EXCEEDED',
    );
    expect(
      validateIntakeFile(
        {
          relativePath: 'course.zip',
          extension: '.zip',
          sizeBytes: 10,
          compressedBytes: 1,
          uncompressedBytes: 101,
        },
        defaultImportLimits,
        0,
      ),
    ).toBe('ZIP_COMPRESSION_RATIO_EXCEEDED');
  });
});
