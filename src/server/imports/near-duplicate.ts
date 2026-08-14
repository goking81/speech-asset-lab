export const nearDuplicateThreshold = 0.85;

function tokens(value: string) {
  return new Set((value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(Boolean));
}

export function tokenJaccardSimilarity(left: string, right: string) {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  const union = new Set([...leftTokens, ...rightTokens]);

  if (union.size === 0) {
    return 0;
  }

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;

  return intersection / union.size;
}
