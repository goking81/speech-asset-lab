import { expect, test } from 'vitest';

import { selectUsableR1Candidates } from './r1-draft-processor';

const source =
  'Managing up is how we proactively build a productive, mutually beneficial relationship with our boss.';
const segments = [{ id: 'segment-1', sequence: 1, text: source }];

test('R1 只保留与来源精确对齐的完整英文语流', () => {
  const result = selectUsableR1Candidates(
    {
      candidates: [
        {
          title: '向上管理',
          coreIdea: '主动建立互利关系',
          flowText: source,
          nodes: [{ type: 'CLAIM', text: source }],
          evidence: [{ segment: 1 }],
        },
      ],
    },
    segments,
  );

  expect(result.rejectionReasons).toEqual([]);
  expect(result).toMatchObject({ rejectedCount: 0, candidates: [{ flowText: source }] });
});

test('R1 会过滤中文总结、节目介绍和无法对齐来源的草稿', () => {
  const result = selectUsableR1Candidates(
    {
      candidates: [
        {
          title: '总结',
          coreIdea: '文章概述',
          flowText: '这篇文章介绍如何管理上级。',
          nodes: [{ type: 'CLAIM', text: '文章介绍' }],
          evidence: [{ segment: 1 }],
        },
        {
          title: '片头',
          coreIdea: '节目介绍',
          flowText: "You're listening to Women at Work from Harvard Business Review.",
          nodes: [{ type: 'CLAIM', text: "You're listening to" }],
          evidence: [{ segment: 1 }],
        },
      ],
    },
    segments,
  );

  expect(result).toMatchObject({ candidates: [], rejectedCount: 2 });
});

test('R1 可在来源夹有翻译或标点差异时，为英文节点定位原文证据', () => {
  const translatedSegments = [
    {
      id: 'segment-2',
      sequence: 2,
      text: 'It’s the effort we put into understanding their priorities before deciding how we can support the work. 这需要先理解对方的优先事项。',
    },
  ];
  const flowText =
    "It's the effort we put into understanding their priorities before deciding how we can support the work.";

  const result = selectUsableR1Candidates(
    {
      candidates: [
        {
          title: '理解优先事项',
          coreIdea: '先理解对方关注的重点',
          flowText,
          nodes: [{ type: 'REASON', text: flowText }],
          evidence: [{ segment: 2 }],
        },
      ],
    },
    translatedSegments,
  );

  expect(result).toMatchObject({
    rejectedCount: 0,
    candidates: [{ evidence: [{ sourceSegmentId: 'segment-2', startOffset: 0 }] }],
  });
});
