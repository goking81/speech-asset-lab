/**
 * 把用户在题库中一次输入的多道题拆成独立候选项。
 *
 * 首选分隔方式是“一行一道题”。为兼容曾经粘贴成一行的英文问句，也会在问号后的空白处拆分。
 */
export function splitQuestionCandidates(value: string) {
  return value
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .flatMap((line) => line.split(/(?<=[?？])\s+(?=\S)/gu))
    .map((candidate) => candidate.trim())
    .filter(Boolean);
}
