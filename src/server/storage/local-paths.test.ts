import { expect, test } from 'vitest';
import path from 'node:path';

import { getLocalPaths, resolveLocalFilePath } from './local-paths';

test('uses the local data directory defaults', () => {
  const paths = getLocalPaths({}, 'D:/workspace/speech-asset-lab');

  expect(paths).toEqual({
    dataDir: path.resolve('D:/workspace/speech-asset-lab/data'),
    filesDir: path.resolve('D:/workspace/speech-asset-lab/data/files'),
    logsDir: path.resolve('D:/workspace/speech-asset-lab/data/logs'),
    backupsDir: path.resolve('D:/workspace/speech-asset-lab/data/backups'),
  });
});

test('rejects file paths that escape the local files directory', () => {
  const paths = getLocalPaths({ APP_DATA_DIR: 'D:/safe-data' });

  expect(() => resolveLocalFilePath(paths.filesDir, '../outside.txt')).toThrow('路径超出本地目录');
  expect(resolveLocalFilePath(paths.filesDir, 'imports/lesson.txt')).toBe(
    path.resolve('D:/safe-data/files/imports/lesson.txt'),
  );
});
