const mib = 1024 * 1024;
const ocrTimeoutMs = 90_000;

type CloudOcrEnvironment = {
  OCR_SPACE_API_KEY?: string;
  CLOUD_OCR_MAX_FILE_BYTES?: string;
  CLOUD_OCR_MAX_PAGES?: string;
};

type OcrSpaceResponse = {
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
  ErrorDetails?: string;
  ParsedResults?: Array<{ ParsedText?: string | null }>;
};

export class CloudOcrError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'CLOUD_OCR_NOT_CONFIGURED'
      | 'CLOUD_OCR_FREE_LIMIT_EXCEEDED'
      | 'CLOUD_OCR_FAILED'
      | 'CLOUD_OCR_TEXT_NOT_FOUND',
  ) {
    super(message);
    this.name = 'CloudOcrError';
  }
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getEnvironment(
  environment: CloudOcrEnvironment = process.env as unknown as CloudOcrEnvironment,
) {
  const apiKey = environment.OCR_SPACE_API_KEY?.trim();
  if (!apiKey) {
    throw new CloudOcrError(
      '扫描 PDF 需要云端 OCR 密钥。请配置 OCR_SPACE_API_KEY 后重新解析。',
      'CLOUD_OCR_NOT_CONFIGURED',
    );
  }

  return {
    apiKey,
    // OCR.space 免费层单文件上限为 1 MiB；保留环境变量是为了将来切换到付费层时无需改代码。
    maxFileBytes: positiveInteger(environment.CLOUD_OCR_MAX_FILE_BYTES, mib),
    maxPages: positiveInteger(environment.CLOUD_OCR_MAX_PAGES, 3),
  };
}

function messageFromResponse(payload: OcrSpaceResponse) {
  const message = Array.isArray(payload.ErrorMessage)
    ? payload.ErrorMessage.join('；')
    : payload.ErrorMessage;
  return message || payload.ErrorDetails || 'OCR 服务未返回可用文字。';
}

/**
 * 仅在 PDF 缺少可靠文字层时调用的兜底 OCR。
 *
 * 原件仍保存在私有 Supabase Storage；此适配器会将需要 OCR 的扫描 PDF 通过 HTTPS
 * 提交到配置的 OCR 服务，返回的仅是解析文本。密钥只存在于 Worker 服务端环境。
 */
export class CloudOcrService {
  constructor(
    private readonly environment: CloudOcrEnvironment = process.env as unknown as CloudOcrEnvironment,
  ) {}

  async extractPdfText(input: { name: string; content: Uint8Array }) {
    const { apiKey, maxFileBytes, maxPages } = getEnvironment(this.environment);
    if (input.content.byteLength > maxFileBytes) {
      throw new CloudOcrError(
        `扫描 PDF 为 ${formatBytes(input.content.byteLength)}，超过当前免费 OCR 的 ${formatBytes(maxFileBytes)} 单文件限制。请拆分为更小的文件后重试。`,
        'CLOUD_OCR_FREE_LIMIT_EXCEEDED',
      );
    }
    const estimatedPageCount = estimatePdfPageCount(input.content);
    if (estimatedPageCount !== null && estimatedPageCount > maxPages) {
      throw new CloudOcrError(
        `扫描 PDF 约有 ${estimatedPageCount} 页，超过当前免费 OCR 的 ${maxPages} 页限制。请拆分后重试。`,
        'CLOUD_OCR_FREE_LIMIT_EXCEEDED',
      );
    }

    const body = new FormData();
    body.set(
      'file',
      new Blob([input.content.slice().buffer as ArrayBuffer], { type: 'application/pdf' }),
      input.name,
    );
    body.set('language', 'eng');
    body.set('OCREngine', '2');
    body.set('scale', 'true');
    body.set('detectOrientation', 'true');
    body.set('isOverlayRequired', 'false');

    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ocrTimeoutMs);
    try {
      response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: { apikey: apiKey },
        body,
        signal: controller.signal,
      });
    } catch {
      throw new CloudOcrError(
        '云端 OCR 在 90 秒内未完成。文件已保留，可稍后重试或拆分为更小的扫描件。',
        'CLOUD_OCR_FAILED',
      );
    } finally {
      clearTimeout(timeout);
    }

    let payload: OcrSpaceResponse;
    try {
      payload = (await response.json()) as OcrSpaceResponse;
    } catch {
      throw new CloudOcrError('云端 OCR 服务返回了无法识别的响应。', 'CLOUD_OCR_FAILED');
    }

    if (!response.ok || payload.IsErroredOnProcessing) {
      const message = messageFromResponse(payload);
      throw new CloudOcrError(
        `云端 OCR 未完成：${message}`,
        isOcrFreeLimitMessage(message) ? 'CLOUD_OCR_FREE_LIMIT_EXCEEDED' : 'CLOUD_OCR_FAILED',
      );
    }

    const text = (payload.ParsedResults ?? [])
      .map((result) => result.ParsedText?.trim() ?? '')
      .filter(Boolean)
      .join('\n\n')
      .trim();
    if (!text) {
      throw new CloudOcrError('OCR 未从扫描 PDF 中识别出可用文字。', 'CLOUD_OCR_TEXT_NOT_FOUND');
    }

    return text;
  }
}

/**
 * 常见 PDF 会以未压缩的 `/Type /Page` 对象记录页数。若文档采用对象流而无法可靠读取，
 * 返回 null 并交由 OCR 服务继续校验；这样不会把不确定的估计当成事实。
 */
function estimatePdfPageCount(content: Uint8Array) {
  const source = new TextDecoder('latin1').decode(content);
  const pages = source.match(/\/Type\s*\/Page\b/g) ?? [];
  return pages.length > 0 ? pages.length : null;
}

function isOcrFreeLimitMessage(message: string) {
  return /(?:page|pages|file size|too large|free).*(?:limit|maximum|max)|(?:limit|maximum|max).*(?:page|pages|file size|free)/i.test(
    message,
  );
}

function formatBytes(bytes: number) {
  return `${Math.max(1, Math.ceil(bytes / mib))} MiB`;
}
