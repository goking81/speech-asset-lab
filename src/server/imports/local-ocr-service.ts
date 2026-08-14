import { execFile } from 'node:child_process';
import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class LocalOcrError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'OCR_ENGINE_UNAVAILABLE'
      | 'OCR_LANGUAGE_UNAVAILABLE'
      | 'PDF_RENDERER_UNAVAILABLE'
      | 'OCR_PROCESS_FAILED'
      | 'OCR_TEXT_NOT_FOUND',
  ) {
    super(message);
    this.name = 'LocalOcrError';
  }
}

export type OcrProgress = { currentPage: number; totalPages: number };

function ocrRenderDpi() {
  const configured = Number.parseInt(process.env.OCR_RENDER_DPI?.trim() ?? '', 10);
  if (!Number.isFinite(configured)) return 300;
  return Math.min(450, Math.max(200, configured));
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function rendererCandidates() {
  const configured = process.env.PDF_POPPLER_EXECUTABLE?.trim();
  const candidates = configured ? [configured] : [];

  if (process.platform === 'win32') {
    const bundledRenderer = path.join(
      os.homedir(),
      '.cache',
      'codex-runtimes',
      'codex-primary-runtime',
      'dependencies',
      'native',
      'poppler',
      'Library',
      'bin',
      'pdftoppm.exe',
    );
    if (await exists(bundledRenderer)) candidates.push(bundledRenderer);
  }

  candidates.push('pdftoppm');
  return [...new Set(candidates)];
}

async function tesseractCandidates() {
  const configured = process.env.OCR_TESSERACT_EXECUTABLE?.trim();
  const candidates = configured ? [configured] : [];

  if (process.platform === 'win32') {
    const installedTesseract = path.join('C:', 'Program Files', 'Tesseract-OCR', 'tesseract.exe');
    if (await exists(installedTesseract)) candidates.push(installedTesseract);
  }

  candidates.push('tesseract');
  return [...new Set(candidates)];
}

function powershellCandidates() {
  const configured = process.env.OCR_POWERSHELL_EXECUTABLE?.trim();
  return [...new Set(configured ? [configured, 'pwsh', 'powershell'] : ['pwsh', 'powershell'])];
}

const windowsOcrCommand = [
  'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
  'function Await-WinRt([object]$TaskOperation, [Type]$ResultType) {',
  '  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like "IAsyncOperation*" } | Select-Object -First 1',
  '  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($TaskOperation))',
  '  $task.Wait() | Out-Null',
  '  return $task.Result',
  '}',
  '$storageFileType = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]',
  '$randomAccessStreamType = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]',
  '$bitmapDecoderType = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]',
  '$softwareBitmapType = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime]',
  '$ocrResultType = [Windows.Media.Ocr.OcrResult, Windows.Media.Ocr, ContentType=WindowsRuntime]',
  '$ocrEngineType = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType=WindowsRuntime]',
  '$languageType = [Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime]',
  '$file = Await-WinRt ($storageFileType::GetFileFromPathAsync($env:SPEECH_ASSET_LAB_OCR_IMAGE)) $storageFileType',
  '$stream = Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) $randomAccessStreamType',
  '$decoder = Await-WinRt ($bitmapDecoderType::CreateAsync($stream)) $bitmapDecoderType',
  '$bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) $softwareBitmapType',
  '$engine = $ocrEngineType::TryCreateFromLanguage($languageType::new($env:SPEECH_ASSET_LAB_OCR_LANGUAGE))',
  'if ($null -eq $engine) { throw "Windows OCR language pack unavailable" }',
  '$ocrOutput = Await-WinRt ($engine.RecognizeAsync($bitmap)) $ocrResultType',
  '[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($ocrOutput.Text))',
].join('\n');

function executableUnavailable(error: unknown) {
  return typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT';
}

async function renderPdfPages(pdfPath: string, outputPrefix: string) {
  let lastError: unknown;
  for (const renderer of await rendererCandidates()) {
    try {
      await execFileAsync(renderer, ['-r', String(ocrRenderDpi()), '-png', pdfPath, outputPrefix], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 90_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      return;
    } catch (error) {
      if (!executableUnavailable(error)) {
        throw new LocalOcrError('无法将 PDF 页面转换为本地 OCR 图像。', 'OCR_PROCESS_FAILED');
      }
      lastError = error;
    }
  }

  throw new LocalOcrError(
    '本机 PDF 页面渲染组件不可用。',
    lastError ? 'PDF_RENDERER_UNAVAILABLE' : 'OCR_PROCESS_FAILED',
  );
}

async function tesseractLanguage(tesseract: string) {
  const configured = process.env.OCR_TESSERACT_LANGUAGE?.trim();
  if (configured) return configured;

  try {
    const { stdout } = await execFileAsync(tesseract, ['--list-langs'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 256 * 1024,
    });
    const languages = new Set(
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^[a-z_]+$/iu.test(line)),
    );
    if (languages.has('eng') && languages.has('chi_sim')) return 'eng+chi_sim';
    if (languages.has('eng')) return 'eng';
    if (languages.has('chi_sim')) return 'chi_sim';
  } catch {
    // 语言列表不可读时仍尝试 Tesseract 的标准英文语言包。
  }

  return 'eng';
}

async function recognizeWithTesseract(imagePath: string) {
  let lastError: unknown;
  for (const tesseract of await tesseractCandidates()) {
    try {
      const language = await tesseractLanguage(tesseract);
      const { stdout } = await execFileAsync(
        tesseract,
        [imagePath, 'stdout', '-l', language, '--psm', '3', '-c', 'preserve_interword_spaces=1'],
        {
          encoding: 'buffer',
          windowsHide: true,
          timeout: 60_000,
          maxBuffer: 4 * 1024 * 1024,
        },
      );
      return stdout.toString('utf8').trim();
    } catch (error) {
      const stderr =
        typeof error === 'object' && error && 'stderr' in error && typeof error.stderr === 'string'
          ? error.stderr
          : '';
      if (executableUnavailable(error)) {
        lastError = error;
        continue;
      }
      if (stderr.includes('eng.traineddata')) {
        throw new LocalOcrError('本机 OCR 缺少英文识别语言包。', 'OCR_LANGUAGE_UNAVAILABLE');
      }
      throw new LocalOcrError('本机 OCR 识别页面失败。', 'OCR_PROCESS_FAILED');
    }
  }

  throw new LocalOcrError(
    '本机 OCR 引擎不可用；请安装 Tesseract OCR 或设置 OCR_TESSERACT_EXECUTABLE。',
    lastError ? 'OCR_ENGINE_UNAVAILABLE' : 'OCR_PROCESS_FAILED',
  );
}

function windowsOcrLanguages() {
  const configured = process.env.OCR_WINDOWS_LANGUAGE?.trim();
  return configured ? [configured] : ['en-US', 'zh-CN'];
}

async function recognizeWithWindowsOcr(imagePath: string) {
  let lastError: unknown;

  for (const powershell of powershellCandidates()) {
    for (const language of windowsOcrLanguages()) {
      try {
        const { stdout } = await execFileAsync(
          powershell,
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            windowsOcrCommand,
          ],
          {
            encoding: 'buffer',
            env: {
              ...process.env,
              SPEECH_ASSET_LAB_OCR_IMAGE: imagePath,
              SPEECH_ASSET_LAB_OCR_LANGUAGE: language,
            },
            windowsHide: true,
            timeout: 60_000,
            maxBuffer: 4 * 1024 * 1024,
          },
        );
        return Buffer.from(stdout.toString('ascii').trim(), 'base64').toString('utf8').trim();
      } catch (error) {
        if (executableUnavailable(error)) {
          lastError = error;
          break;
        }
        const stderr =
          typeof error === 'object' &&
          error &&
          'stderr' in error &&
          typeof error.stderr === 'string'
            ? error.stderr
            : '';
        if (stderr.includes('language pack unavailable') || stderr.includes('语言包不可用')) {
          lastError = error;
          continue;
        }
        lastError = error;
      }
    }
  }

  throw new LocalOcrError(
    '本机 OCR 引擎不可用；请安装 Tesseract OCR 或启用 Windows OCR。',
    lastError ? 'OCR_ENGINE_UNAVAILABLE' : 'OCR_PROCESS_FAILED',
  );
}

async function recognizeImage(imagePath: string) {
  try {
    return await recognizeWithTesseract(imagePath);
  } catch (error) {
    if (!(error instanceof LocalOcrError) || error.code !== 'OCR_ENGINE_UNAVAILABLE') throw error;
    return recognizeWithWindowsOcr(imagePath);
  }
}

/** 仅在 PDF 没有文字层时运行的离线英文 OCR 回退。 */
export async function extractPdfTextWithLocalOcr(
  pdfPath: string,
  onProgress?: (progress: OcrProgress) => Promise<void> | void,
) {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'speech-asset-lab-ocr-'));
  const outputPrefix = path.join(tempDirectory, 'page');

  try {
    await renderPdfPages(pdfPath, outputPrefix);
    const imageFiles = (await readdir(tempDirectory))
      .filter((fileName) => fileName.startsWith('page-') && fileName.endsWith('.png'))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

    if (imageFiles.length === 0) {
      throw new LocalOcrError('PDF 没有可用于 OCR 的页面图像。', 'OCR_TEXT_NOT_FOUND');
    }
    if (imageFiles.length > 80) {
      throw new LocalOcrError('PDF 页数超过本地 OCR 单次 80 页上限。', 'OCR_PROCESS_FAILED');
    }

    const pages: string[] = [];
    await onProgress?.({ currentPage: 0, totalPages: imageFiles.length });
    for (const [index, fileName] of imageFiles.entries()) {
      pages.push(await recognizeImage(path.join(tempDirectory, fileName)));
      await onProgress?.({ currentPage: index + 1, totalPages: imageFiles.length });
    }
    const text = pages.filter(Boolean).join('\n\n').trim();

    if (!text) {
      throw new LocalOcrError('OCR 未从 PDF 页面识别出文字。', 'OCR_TEXT_NOT_FOUND');
    }

    return text;
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}
