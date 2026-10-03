import { describe, it, expect } from 'vitest';
import { estimateCostUsd, padOrTrimEmbedding, EMBEDDING_TARGET_DIMS } from '../ai-providers/llm-client';
import { substituteTemplate } from '../notifications';

describe('pricing + embeddings helpers', () => {
  it('uses configurable per-model rates', () => {
    const withRates = estimateCostUsd(1_000_000, 1_000_000, {
      inputUsdPer1m: 1,
      outputUsdPer1m: 2,
    });
    expect(withRates).toBeCloseTo(3, 5);
  });

  it('pads embeddings to target dims', () => {
    const padded = padOrTrimEmbedding([0.1, 0.2], 4);
    expect(padded).toEqual([0.1, 0.2, 0, 0]);
    expect(padOrTrimEmbedding(Array(2000).fill(1)).length).toBe(EMBEDDING_TARGET_DIMS);
  });
});

describe('email template substitution', () => {
  it('replaces {{vars}}', () => {
    expect(substituteTemplate('สร้าง {{count}} ข้อ: {{reason}}', { count: '3', reason: 'ok' }))
      .toBe('สร้าง 3 ข้อ: ok');
  });
});
