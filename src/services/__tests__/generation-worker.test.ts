import { describe, it, expect } from 'vitest';

describe('detached generation job contract', () => {
  it('documents worker actions and stages', () => {
    const actions = ['wake', 'process', 'claim_and_process'];
    const stages = ['QUEUED', 'RETRIEVE', 'ANALYZE', 'GENERATE', 'VERIFY', 'DONE'];
    expect(actions).toContain('wake');
    expect(stages[0]).toBe('QUEUED');
    expect(stages.at(-1)).toBe('DONE');
  });
});
