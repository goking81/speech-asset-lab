/**
 * 云端来源原件只通过服务端访问 Supabase Storage。
 * Bucket 始终保持私有；浏览器不会得到 service key 或公开对象 URL。
 */
const sourceOriginalBucket = 'source-originals';

export class CloudSourceOriginalStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudSourceOriginalStoreError';
  }
}

type StorageEnvironment = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

function getStorageEnvironment(
  environment: StorageEnvironment = process.env as unknown as StorageEnvironment,
) {
  const baseUrl = environment.SUPABASE_URL?.trim().replace(/\/$/, '');
  const serviceKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!baseUrl || !serviceKey) {
    throw new CloudSourceOriginalStoreError(
      '云端私有来源存储尚未配置。请设置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY 后再导入。',
    );
  }

  return { baseUrl, serviceKey };
}

function encodedObjectPath(objectKey: string) {
  return objectKey
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

export class CloudSourceOriginalStore {
  constructor(
    private readonly environment: StorageEnvironment = process.env as unknown as StorageEnvironment,
  ) {}

  async put(objectKey: string, content: Uint8Array, contentType: string) {
    const { baseUrl, serviceKey } = getStorageEnvironment(this.environment);
    const response = await fetch(
      `${baseUrl}/storage/v1/object/${sourceOriginalBucket}/${encodedObjectPath(objectKey)}`,
      {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
          'content-type': contentType,
          'x-upsert': 'false',
        },
        body: content.slice().buffer as ArrayBuffer,
      },
    );

    if (!response.ok) {
      throw new CloudSourceOriginalStoreError(
        `云端私有来源文件保存失败（${response.status}）。请稍后重试。`,
      );
    }
  }

  async read(objectKey: string) {
    const { baseUrl, serviceKey } = getStorageEnvironment(this.environment);
    const response = await fetch(
      `${baseUrl}/storage/v1/object/${sourceOriginalBucket}/${encodedObjectPath(objectKey)}`,
      {
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
        },
      },
    );

    if (!response.ok) {
      throw new CloudSourceOriginalStoreError(
        `云端私有来源文件读取失败（${response.status}）。请稍后重试。`,
      );
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  async remove(objectKey: string) {
    const { baseUrl, serviceKey } = getStorageEnvironment(this.environment);
    const response = await fetch(`${baseUrl}/storage/v1/object/${sourceOriginalBucket}`, {
      method: 'DELETE',
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ prefixes: [objectKey] }),
    });

    if (!response.ok && response.status !== 404) {
      throw new CloudSourceOriginalStoreError(`云端私有来源文件清理失败（${response.status}）。`);
    }
  }
}

export const cloudSourceOriginalBucket = sourceOriginalBucket;
