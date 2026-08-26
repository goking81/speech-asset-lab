import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { extractPdfTextWithLocalOcr, LocalOcrError } from './local-ocr-service';

const execFileAsync = promisify(execFile);

export class PdfTextExtractionError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'PDF_PARSER_UNAVAILABLE'
      | 'PDF_TEXT_EXTRACTION_FAILED'
      | 'PDF_TEXT_NOT_FOUND'
      | LocalOcrError['code'],
  ) {
    super(message);
    this.name = 'PdfTextExtractionError';
  }
}

export type PdfExtractionOptions = {
  onOcrProgress?: (progress: { currentPage: number; totalPages: number }) => Promise<void> | void;
  forceOcr?: boolean;
};

const extractScript = [
  'import sys',
  'from pypdf import PdfReader',
  'reader = PdfReader(sys.argv[1])',
  'pages = []',
  'for page in reader.pages:',
  '    pages.append(page.extract_text() or "")',
  'sys.stdout.write("\\n\\n".join(pages))',
].join('\n');

/**
 * 判断 PDF 内嵌文字层是否可信。
 *
 * 有些课件 PDF 看起来带有文字层，但字体编码会把字母读成 0/O，或在中文之间
 * 插入空格。这种内容不会出现替换字符，却同样不适合直接进入资产筛选，因此改走
 * 本地 OCR 取得按页面渲染后的真实文字。
 */
export function needsOcrFallback(text: string) {
  const replacementCharacters = (text.match(/�/g) ?? []).length;
  const nonWhitespaceLength = text.replace(/\s/g, '').length;
  const isolatedZeroes = (text.match(/(?<!\d)0(?!\d)/g) ?? []).length;
  const zeroInsideWords = (text.match(/(?:[A-Za-z]0|0[A-Za-z])/g) ?? []).length;
  const cjkCharacters = (text.match(/[\u3400-\u9fff]/gu) ?? []).length;
  const spacedCjkPairs = (text.match(/[\u3400-\u9fff]\s+[\u3400-\u9fff]/gu) ?? []).length;
  const controlCharacters = (text.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu) ?? []).length;

  const hasReplacementNoise =
    replacementCharacters >= Math.max(8, Math.ceil(Math.max(text.length, 1) * 0.02));
  const hasZeroNoise =
    isolatedZeroes + zeroInsideWords * 2 >=
    Math.max(8, Math.ceil(Math.max(nonWhitespaceLength, 1) * 0.008));
  const hasSpacedCjkNoise =
    cjkCharacters >= 20 && spacedCjkPairs >= Math.max(12, Math.ceil(cjkCharacters * 0.3));

  return (
    !text || hasReplacementNoise || hasZeroNoise || hasSpacedCjkNoise || controlCharacters >= 4
  );
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * PDF 仅在本机读取；不会上传文件，也不会调用 AI。可通过环境变量指定独立 Python。
 */
async function pythonCandidates() {
  const configured = process.env.PDF_PYTHON_EXECUTABLE?.trim();
  const candidates = configured ? [configured] : [];

  if (process.platform === 'win32') {
    const bundledPython = path.join(
      os.homedir(),
      '.cache',
      'codex-runtimes',
      'codex-primary-runtime',
      'dependencies',
      'python',
      'python.exe',
    );
    if (await exists(bundledPython)) candidates.push(bundledPython);
  }

  candidates.push('python3', 'python');
  return [...new Set(candidates)];
}

async function extractEmbeddedPdfText(filePath: string) {
  for (const python of await pythonCandidates()) {
    try {
      const { stdout } = await execFileAsync(python, ['-c', extractScript, filePath], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      const text = stdout.replace(/\r\n?/g, '\n').trim();

      if (needsOcrFallback(text)) {
        throw new PdfTextExtractionError('PDF 中没有可靠的可提取文本。', 'PDF_TEXT_NOT_FOUND');
      }

      return text;
    } catch (error) {
      if (error instanceof PdfTextExtractionError) throw error;
      const stderr =
        typeof error === 'object' && error && 'stderr' in error && typeof error.stderr === 'string'
          ? error.stderr
          : '';
      const isUnavailable =
        (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') ||
        stderr.includes("No module named 'pypdf'");

      if (!isUnavailable) {
        throw new PdfTextExtractionError('无法读取此 PDF 文件。', 'PDF_TEXT_EXTRACTION_FAILED');
      }
    }
  }

  throw new PdfTextExtractionError(
    '本机 PDF 解析组件不可用；请安装包含 pypdf 的 Python，或设置 PDF_PYTHON_EXECUTABLE。',
    'PDF_PARSER_UNAVAILABLE',
  );
}

export async function extractPdfText(filePath: string, options?: PdfExtractionOptions) {
  if (options?.forceOcr) {
    return extractPdfTextWithLocalOcr(filePath, options.onOcrProgress);
  }

  try {
    return await extractEmbeddedPdfText(filePath);
  } catch (error) {
    if (!(error instanceof PdfTextExtractionError) || error.code !== 'PDF_TEXT_NOT_FOUND') {
      throw error;
    }

    try {
      return await extractPdfTextWithLocalOcr(filePath, options?.onOcrProgress);
    } catch (ocrError) {
      if (ocrError instanceof LocalOcrError) {
        throw new PdfTextExtractionError(ocrError.message, ocrError.code);
      }
      throw ocrError;
    }
  }
}
