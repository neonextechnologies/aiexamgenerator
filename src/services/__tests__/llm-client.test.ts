import { describe, expect, it } from 'vitest';
import {
  buildUsageLogRow,
  completeJson,
  estimateCostUsd,
  extractQuestions,
  LlmProviderError,
  parseModelJson,
  probeProvider,
  resolveProviderConfig,
} from '../ai-providers/llm-client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const baseRequest = {
  apiKey: 'test-key',
  model: 'test-model',
  system: 'Return JSON questions.',
  user: 'Create 1 question',
  timeoutMs: 1000,
};

describe('LLM provider client', () => {
  it('calls OpenAI chat completions and normalizes token usage', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      return jsonResponse(200, {
        choices: [{ message: { content: '{"questions":[{"questionText":"ข้อ 1"}]}' } }],
        usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
      });
    };

    const result = await completeJson({ ...baseRequest, providerType: 'openai', temperature: 0.2, maxTokens: 400 }, fetchImpl);
    const body = JSON.parse(String(calls[0].init.body));
    const headers = calls[0].init.headers as Record<string, string>;

    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(headers.Authorization).toBe('Bearer test-key');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.max_completion_tokens).toBe(400);
    expect(body.temperature).toBe(0.2);
    expect(extractQuestions(result.json)).toEqual([{ questionText: 'ข้อ 1' }]);
    expect(result.usage).toMatchObject({
      provider: 'openai',
      inputTokens: 11,
      outputTokens: 7,
      totalTokens: 18,
      estimatedCostUsd: estimateCostUsd(11, 7),
    });
  });

  it('retries OpenAI without organization headers after 401', async () => {
    const headersSeen: Array<Record<string, string>> = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      const headers = (init?.headers || {}) as Record<string, string>;
      headersSeen.push(headers);
      if (headers['OpenAI-Organization']) return jsonResponse(401, { error: 'bad org' });
      return jsonResponse(200, {
        choices: [{ message: { content: '{"questions":[]}' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    };

    await completeJson({
      ...baseRequest,
      providerType: 'openai',
      organizationId: 'org-1',
      projectId: 'proj-1',
    }, fetchImpl);

    expect(headersSeen).toHaveLength(2);
    expect(headersSeen[0]['OpenAI-Organization']).toBe('org-1');
    expect(headersSeen[1]['OpenAI-Organization']).toBeUndefined();
    expect(headersSeen[1]['OpenAI-Project']).toBeUndefined();
  });

  it('uses max_tokens for OpenAI-compatible endpoints and retries without JSON mode', async () => {
    const bodies: unknown[] = [];
    let attempt = 0;
    const fetchImpl: typeof fetch = async (url, init) => {
      attempt += 1;
      bodies.push(JSON.parse(String(init?.body)));
      expect(String(url)).toBe('http://localhost:11434/v1/chat/completions');
      if (attempt === 1) return jsonResponse(400, { error: 'response_format unsupported' });
      return jsonResponse(200, {
        choices: [{ message: { content: '{"questions":[{"questionText":"Q"}]}' } }],
        usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
      });
    };

    const result = await completeJson({
      ...baseRequest,
      providerType: 'openai_compatible',
      baseUrl: 'http://localhost:11434/v1',
      maxTokens: 256,
    }, fetchImpl);

    expect(bodies).toHaveLength(2);
    expect((bodies[0] as { max_tokens: number }).max_tokens).toBe(256);
    expect((bodies[0] as { response_format?: unknown }).response_format).toBeDefined();
    expect((bodies[1] as { response_format?: unknown }).response_format).toBeUndefined();
    expect(extractQuestions(result.json)).toHaveLength(1);
  });

  it('calls Gemini generateContent and reads usageMetadata', async () => {
    let requested = '';
    let payload: Record<string, unknown> = {};
    const fetchImpl: typeof fetch = async (url, init) => {
      requested = String(url);
      payload = JSON.parse(String(init?.body));
      return jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: '{"questions":[{"questionText":"จากหลักฐาน"}]}' }] } }],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 9, totalTokenCount: 29 },
      });
    };

    const result = await completeJson({
      ...baseRequest,
      providerType: 'gemini',
      model: 'models/gemini-1.5-pro',
      apiKey: 'gem-key',
    }, fetchImpl);

    expect(requested).toContain('/models/gemini-1.5-pro:generateContent');
    expect(requested).toContain('key=gem-key');
    expect((payload.generationConfig as { responseMimeType: string }).responseMimeType).toBe('application/json');
    expect(result.usage.inputTokens).toBe(20);
    expect(result.usage.outputTokens).toBe(9);
    expect(result.usage.totalTokens).toBe(29);
    expect(result.usage.provider).toBe('gemini');
  });

  it('calls Anthropic messages and accepts tool-use JSON', async () => {
    let payload: Record<string, unknown> = {};
    const fetchImpl: typeof fetch = async (url, init) => {
      expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
      const headers = init?.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('anthropic-key');
      expect(headers['anthropic-version']).toBe('2023-06-01');
      payload = JSON.parse(String(init?.body));
      return jsonResponse(200, {
        content: [{ type: 'tool_use', name: 'emit_result', input: { questions: [{ questionText: 'คลอด' }] } }],
        usage: { input_tokens: 15, output_tokens: 6 },
      });
    };

    const result = await completeJson({
      ...baseRequest,
      providerType: 'anthropic',
      apiKey: 'anthropic-key',
      model: 'claude-3-5-sonnet-latest',
    }, fetchImpl);

    expect((payload.tool_choice as { name: string }).name).toBe('emit_result');
    expect(result.usage).toMatchObject({ provider: 'anthropic', inputTokens: 15, outputTokens: 6, totalTokens: 21 });
    expect(extractQuestions(result.json)).toEqual([{ questionText: 'คลอด' }]);
  });

  it('parses fenced JSON when Anthropic returns text', async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse(200, {
      content: [{ type: 'text', text: '```json\n{"questions":[{"questionText":"ข้อความ"}]}\n```' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const result = await completeJson({ ...baseRequest, providerType: 'anthropic', jsonMode: false }, fetchImpl);
    expect(extractQuestions(result.json)).toEqual([{ questionText: 'ข้อความ' }]);
  });

  it('redacts the API key from provider errors', async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse(403, { error: 'bad key secret-value' });
    await expect(completeJson({ ...baseRequest, providerType: 'gemini', apiKey: 'secret-value' }, fetchImpl))
      .rejects.toMatchObject({
        name: 'LlmProviderError',
        status: 403,
        provider: 'gemini',
      });
    try {
      await completeJson({ ...baseRequest, providerType: 'gemini', apiKey: 'secret-value' }, fetchImpl);
    } catch (error) {
      expect(error).toBeInstanceOf(LlmProviderError);
      expect((error as LlmProviderError).details).not.toContain('secret-value');
      expect((error as LlmProviderError).details).toContain('[redacted]');
    }
  });

  it('times out hung provider calls', async () => {
    const fetchImpl: typeof fetch = (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const abort = new Error('aborted');
        abort.name = 'AbortError';
        reject(abort);
      });
    });
    await expect(completeJson({ ...baseRequest, providerType: 'openai', timeoutMs: 20 }, fetchImpl))
      .rejects.toMatchObject({ timedOut: true, status: 504, provider: 'openai' });
  });

  it('resolves keys from the provider row, then the named secret', () => {
    const fromRow = resolveProviderConfig({
      provider: {
        id: 'prov-gemini',
        provider_type: 'gemini',
        generation_model: 'gemini-1.5-flash',
        secret_ref: 'GEMINI_API_KEY',
        encrypted_api_key: btoa('row-key'),
        timeout_ms: 5000,
      },
      env: { GEMINI_API_KEY: 'env-key' },
    });
    expect(fromRow.apiKey).toBe('row-key');
    expect(fromRow.model).toBe('gemini-1.5-flash');
    expect(fromRow.providerType).toBe('gemini');
    expect(fromRow.secretName).toBe('GEMINI_API_KEY');

    const fromEnv = resolveProviderConfig({
      provider: { id: 'prov-anthropic', provider_type: 'anthropic', secret_ref: 'ANTHROPIC_API_KEY' },
      env: { ANTHROPIC_API_KEY: 'env-claude', ANTHROPIC_QUESTION_MODEL: 'claude-3-5-haiku-latest' },
    });
    expect(fromEnv.apiKey).toBe('env-claude');
    expect(fromEnv.model).toBe('claude-3-5-haiku-latest');

    const fallbackOpenAI = resolveProviderConfig({ env: { OPENAI_API_KEY: 'sk-env', OPENAI_QUESTION_MODEL: 'gpt-4o-mini' } });
    expect(fallbackOpenAI.providerType).toBe('openai');
    expect(fallbackOpenAI.apiKey).toBe('sk-env');
    expect(fallbackOpenAI.model).toBe('gpt-4o-mini');

    const demo = resolveProviderConfig({ provider: { provider_type: 'demo' } });
    expect(demo.demo).toBe(true);
    expect(demo.apiKey).toBe('');
  });

  it('probes a missing key without calling the network', async () => {
    let called = false;
    const fetchImpl: typeof fetch = async () => {
      called = true;
      return jsonResponse(200, {});
    };
    const config = resolveProviderConfig({ provider: { provider_type: 'gemini', secret_ref: 'GEMINI_API_KEY' }, env: {} });
    const result = await probeProvider(config, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.status).toBe('missing_key');
    expect(called).toBe(false);
  });

  it('builds an ai_usage_logs row', () => {
    const row = buildUsageLogRow({
      id: 'usage-1',
      userId: 'user-1',
      courseId: 'course-1',
      requestType: 'question_generation',
      status: 'success',
      createdAt: '2026-10-02T00:00:00.000Z',
      usage: {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        inputTokens: 4,
        outputTokens: 5,
        estimatedCostUsd: estimateCostUsd(4, 5),
        latencyMs: 90,
      },
    });
    expect(row).toEqual({
      id: 'usage-1',
      user_id: 'user-1',
      course_id: 'course-1',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      request_type: 'question_generation',
      input_tokens: 4,
      output_tokens: 5,
      estimated_cost_usd: estimateCostUsd(4, 5),
      latency_ms: 90,
      status: 'success',
      created_at: '2026-10-02T00:00:00.000Z',
    });
  });

  it('extracts JSON objects wrapped in prose', () => {
    expect(parseModelJson('คำตอบ\n[{"questionText":"ก"}]')).toEqual([{ questionText: 'ก' }]);
  });
});
