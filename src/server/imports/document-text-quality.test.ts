import { describe, expect, it } from 'vitest';

import { needsOcrFallback } from './document-text-quality';

describe('needsOcrFallback', () => {
  it('保留正常的 PDF 文字层', () => {
    expect(
      needsOcrFallback(
        'Purposeful questions have a clear purpose. They are intentional and invite openness.',
      ),
    ).toBe(false);
  });

  it('将空文本和常见损坏文字层送入 OCR', () => {
    expect(needsOcrFallback('')).toBe(true);
    expect(needsOcrFallback('0 0 0 0 0 0 0 0 0 0 0 0')).toBe(true);
    expect(needsOcrFallback('bad � � � � � � � � � PDF text')).toBe(true);
  });
});
