import { describe, expect, it } from 'vitest';

import { CloudOcrService } from './cloud-ocr-service';

describe('CloudOcrService', () => {
  it('未配置服务端密钥时不提交扫描件', async () => {
    const service = new CloudOcrService({});

    await expect(
      service.extractPdfText({ name: 'scan.pdf', content: new Uint8Array([1, 2, 3]) }),
    ).rejects.toMatchObject({ code: 'CLOUD_OCR_NOT_CONFIGURED' });
  });

  it('在发起网络请求前拦截超过免费 OCR 上限的扫描件', async () => {
    const service = new CloudOcrService({
      OCR_SPACE_API_KEY: 'test-key',
      CLOUD_OCR_MAX_FILE_BYTES: '3',
    });

    await expect(
      service.extractPdfText({ name: 'scan.pdf', content: new Uint8Array([1, 2, 3, 4]) }),
    ).rejects.toMatchObject({ code: 'CLOUD_OCR_FREE_LIMIT_EXCEEDED' });
  });

  it('在发起网络请求前拦截超过免费页数限制的扫描 PDF', async () => {
    const service = new CloudOcrService({
      OCR_SPACE_API_KEY: 'test-key',
      CLOUD_OCR_MAX_PAGES: '3',
    });
    const fourPagePdf = new TextEncoder().encode(
      '%PDF-1.7\n/Type /Page\n/Type /Page\n/Type /Page\n/Type /Page\n',
    );

    await expect(
      service.extractPdfText({ name: 'four-pages.pdf', content: fourPagePdf }),
    ).rejects.toMatchObject({ code: 'CLOUD_OCR_FREE_LIMIT_EXCEEDED' });
  });
});
