/**
 * 判断 PDF 提取出的文字是否像是可用的原文。
 *
 * 该规则不依赖本机文件系统，因此本机解析器和 Cloudflare 文档转换都可以复用。
 * 当文字层缺失或损坏时，调用方应转入 OCR，而不是把乱码交给 AI 生成候选资产。
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
