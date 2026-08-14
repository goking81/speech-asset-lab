import { describe, expect, test } from 'vitest';

import { needsOcrFallback } from './pdf-text-extractor';

describe('needsOcrFallback', () => {
  test('keeps a normal embedded English text layer', () => {
    expect(
      needsOcrFallback(
        'Ask a clarifying question when you need to understand the other person better.',
      ),
    ).toBe(false);
  });

  test('rejects a text layer with zero substitutions inside English words', () => {
    expect(
      needsOcrFallback(
        'I want t0 understand h0w t0 ask a clarifying questi0n before I make a decisi0n.',
      ),
    ).toBe(true);
  });

  test('rejects spaced Chinese glyphs that indicate an incorrectly decoded text layer', () => {
    expect(
      needsOcrFallback(
        '这 是 一 段 被 错 误 解 码 的 中 文 文 本 ， 每 个 汉 字 之 间 都 出 现 了 不 自 然 的 空 格 。',
      ),
    ).toBe(true);
  });
});
