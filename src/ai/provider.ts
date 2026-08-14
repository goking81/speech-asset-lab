export type AiProviderErrorCode = 'UNCONFIGURED' | 'TIMEOUT' | 'FAILED';

export class AiProviderError extends Error {
  constructor(
    public readonly code: AiProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export type AiProviderRequest = {
  taskId: string;
  role: string;
  text: string;
  releaseBundleVersion: string;
  responseFormat?: 'JSON_OBJECT';
};

export type AiProviderResult =
  { kind: 'DRAFT'; draft: string } | { kind: 'INSUFFICIENT_TEXT'; detail: string };

export interface AiProviderAdapter {
  readonly name: string;
  execute(request: AiProviderRequest): Promise<AiProviderResult>;
}

/** 未配置时的安全适配器：不读取密钥、不发起网络请求。 */
export class UnconfiguredAiProvider implements AiProviderAdapter {
  readonly name = 'unconfigured';

  async execute(_request: AiProviderRequest): Promise<AiProviderResult> {
    void _request;
    throw new AiProviderError('UNCONFIGURED', '尚未配置 AI Provider，任务已安全降级。');
  }
}

type FetchLike = typeof fetch;

/** DeepSeek Chat Completions 的服务端适配器；密钥仅从环境变量读取。 */
export class DeepSeekAiProvider implements AiProviderAdapter {
  readonly name = 'deepseek';

  constructor(
    private readonly config = {
      baseUrl: process.env.AI_BASE_URL ?? 'https://api.deepseek.com',
      model: process.env.AI_MODEL ?? 'deepseek-chat',
      apiKey: process.env.AI_API_KEY ?? '',
      timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 60_000),
    },
    private readonly request: FetchLike = fetch,
  ) {}

  async execute(input: AiProviderRequest): Promise<AiProviderResult> {
    if (!this.config.apiKey) throw new AiProviderError('UNCONFIGURED', 'DeepSeek API Key 未配置。');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.request(
        `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.model,
            temperature: 0.2,
            ...(input.responseFormat === 'JSON_OBJECT'
              ? { response_format: { type: 'json_object' } }
              : {}),
            messages: [
              {
                role: 'system',
                content:
                  'Return a concise draft only. Do not claim publication or user confirmation.',
              },
              {
                role: 'user',
                content: `Role: ${input.role}\nRelease: ${input.releaseBundleVersion}\nSource text:\n${input.text}`,
              },
            ],
          }),
        },
      );
      if (!response.ok)
        throw new AiProviderError('FAILED', `DeepSeek 请求失败（HTTP ${response.status}）。`);
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const draft = payload.choices?.[0]?.message?.content?.trim();
      if (!draft) throw new AiProviderError('FAILED', 'DeepSeek 未返回可用草稿。');
      return { kind: 'DRAFT', draft };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError')
        throw new AiProviderError('TIMEOUT', 'DeepSeek 请求超时。');
      throw new AiProviderError('FAILED', 'DeepSeek 请求失败。');
    } finally {
      clearTimeout(timer);
    }
  }
}

export type MockProviderBehavior =
  | { kind: 'DRAFT'; draft?: string }
  | { kind: 'INSUFFICIENT_TEXT'; detail?: string }
  | { kind: 'ERROR'; code: AiProviderErrorCode; message?: string };

export class MockAiProvider implements AiProviderAdapter {
  readonly name = 'mock';

  constructor(private readonly behavior: MockProviderBehavior = { kind: 'DRAFT' }) {}

  async execute(_request: AiProviderRequest): Promise<AiProviderResult> {
    void _request;

    if (this.behavior.kind === 'ERROR') {
      throw new AiProviderError(
        this.behavior.code,
        this.behavior.message ?? `Mock provider ${this.behavior.code.toLowerCase()}`,
      );
    }

    if (this.behavior.kind === 'INSUFFICIENT_TEXT') {
      return {
        kind: 'INSUFFICIENT_TEXT',
        detail: this.behavior.detail ?? 'INSUFFICIENT_TEXT',
      };
    }

    return { kind: 'DRAFT', draft: this.behavior.draft ?? 'Mock AI draft.' };
  }
}
