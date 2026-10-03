export type LlmProviderType = 'openai' | 'openai_compatible' | 'gemini' | 'anthropic';

export interface ModelPricingRates {
  inputUsdPer1m: number;
  outputUsdPer1m: number;
  embeddingUsdPer1m?: number | null;
}

export interface ProviderRow {
  id?: string;
  name?: string;
  provider_type?: string | null;
  is_enabled?: boolean | null;
  base_url?: string | null;
  default_model?: string | null;
  generation_model?: string | null;
  analysis_model?: string | null;
  verification_model?: string | null;
  embedding_model?: string | null;
  temperature?: number | null;
  max_tokens?: number | null;
  timeout_ms?: number | null;
  secret_ref?: string | null;
  encrypted_api_key?: string | null;
  key_encryption?: string | null;
  key_hint?: string | null;
}

export interface LlmRequest {
  providerType: LlmProviderType;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
  system: string;
  user: string;
  temperature?: number | null;
  maxTokens?: number | null;
  timeoutMs?: number | null;
  jsonMode?: boolean;
  organizationId?: string | null;
  projectId?: string | null;
  /** Optional per-model rates from ai_model_pricing; defaults used when omitted. */
  rates?: ModelPricingRates | null;
}

export interface LlmUsage {
  provider: LlmProviderType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
}

export interface LlmCompletion {
  text: string;
  json: unknown;
  usage: LlmUsage;
}

export interface ResolvedLlmProvider {
  demo: boolean;
  providerId: string | null;
  providerType: LlmProviderType | 'demo';
  apiKey: string;
  model: string;
  baseUrl: string | null;
  temperature: number | null;
  maxTokens: number;
  timeoutMs: number;
  organizationId: string | null;
  projectId: string | null;
  secretName: string;
  reason?: string;
}

export interface ProbeResult {
  ok: boolean;
  message: string;
  status: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_TOKENS = 8000;
const PROBE_TIMEOUT_MS = 20_000;

export const DEFAULT_SECRET_REF: Record<LlmProviderType, string> = {
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai_compatible: 'COMPAT_API_KEY',
};

export const DEFAULT_MODEL: Record<LlmProviderType, string> = {
  openai: 'gpt-4o',
  gemini: 'gemini-1.5-pro',
  anthropic: 'claude-3-5-sonnet-latest',
  openai_compatible: 'gpt-4o',
};

const MODEL_ENV: Record<LlmProviderType, string> = {
  openai: 'OPENAI_QUESTION_MODEL',
  gemini: 'GEMINI_QUESTION_MODEL',
  anthropic: 'ANTHROPIC_QUESTION_MODEL',
  openai_compatible: 'COMPAT_QUESTION_MODEL',
};

const KNOWN_TYPES = new Set<string>(['demo', 'openai', 'openai_compatible', 'gemini', 'anthropic']);

export class LlmProviderError extends Error {
  readonly status: number;
  readonly details: string;
  readonly timedOut: boolean;
  readonly provider: string;

  constructor(message: string, opts: { status: number; details?: string; timedOut?: boolean; provider: string }) {
    super(message);
    this.name = 'LlmProviderError';
    this.status = opts.status;
    this.details = opts.details || '';
    this.timedOut = Boolean(opts.timedOut);
    this.provider = opts.provider;
  }
}

/** Default rates used when no pricing row is available (USD per token). */
export const DEFAULT_INPUT_USD_PER_TOKEN = 0.0000025;
export const DEFAULT_OUTPUT_USD_PER_TOKEN = 0.00001;

export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  rates?: ModelPricingRates | null,
): number {
  const inputPer = rates ? rates.inputUsdPer1m / 1_000_000 : DEFAULT_INPUT_USD_PER_TOKEN;
  const outputPer = rates ? rates.outputUsdPer1m / 1_000_000 : DEFAULT_OUTPUT_USD_PER_TOKEN;
  return (inputTokens * inputPer) + (outputTokens * outputPer);
}

export function estimateEmbeddingCostUsd(tokens: number, rates?: ModelPricingRates | null): number {
  const per = rates?.embeddingUsdPer1m != null
    ? rates.embeddingUsdPer1m / 1_000_000
    : 0.00000002;
  return tokens * per;
}

export const EMBEDDING_TARGET_DIMS = 1536;

export function padOrTrimEmbedding(values: number[], dims = EMBEDDING_TARGET_DIMS): number[] {
  if (values.length === dims) return values;
  if (values.length > dims) return values.slice(0, dims);
  return [...values, ...Array(dims - values.length).fill(0)];
}

export async function createEmbedding(input: {
  providerType: LlmProviderType;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
  text: string;
  timeoutMs?: number;
  organizationId?: string | null;
  projectId?: string | null;
}, fetchImpl: typeof fetch = fetch): Promise<{ embedding: number[]; model: string; tokens: number }> {
  const text = input.text.slice(0, 8000);
  if (!input.apiKey.trim()) {
    throw new LlmProviderError('ไม่มี API key สำหรับสร้าง embeddings', { status: 401, provider: input.providerType });
  }
  if (input.providerType === 'anthropic') {
    throw new LlmProviderError('Anthropic ไม่รองรับ embeddings — เลือก OpenAI/Gemini/compatible', {
      status: 400,
      provider: input.providerType,
    });
  }
  if (input.providerType === 'gemini') {
    const model = input.model || 'text-embedding-004';
    const url = `${defaultBaseUrl('gemini', input.baseUrl, {})}/models/${model}:embedContent?key=${encodeURIComponent(input.apiKey)}`;
    const response = await fetchWithTimeout(fetchImpl, url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text }] } }),
    }, input.timeoutMs || 60_000, 'gemini');
    const rawText = await response.text();
    if (!response.ok) {
      throw new LlmProviderError(`Gemini embedding HTTP ${response.status}`, {
        status: response.status,
        details: redactSecrets(rawText, input.apiKey).slice(0, 200),
        provider: 'gemini',
      });
    }
    const data = parseJsonObject(rawText, {
      providerType: 'gemini', apiKey: input.apiKey, model, system: '', user: '',
    });
    const values = (asRecord(data.embedding)?.values as number[]) || [];
    return { embedding: padOrTrimEmbedding(values), model, tokens: Math.ceil(text.length / 4) };
  }

  const model = input.model || 'text-embedding-3-small';
  const headers: Record<string, string> = {
    authorization: `Bearer ${input.apiKey}`,
    'content-type': 'application/json',
  };
  if (input.organizationId) headers['OpenAI-Organization'] = input.organizationId;
  if (input.projectId) headers['OpenAI-Project'] = input.projectId;
  const response = await fetchWithTimeout(fetchImpl, joinUrl(defaultBaseUrl(input.providerType, input.baseUrl, {}), '/embeddings'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, input: text }),
  }, input.timeoutMs || 60_000, input.providerType);
  const rawText = await response.text();
  if (!response.ok) {
    throw new LlmProviderError(`Embedding HTTP ${response.status}`, {
      status: response.status,
      details: redactSecrets(rawText, input.apiKey).slice(0, 200),
      provider: input.providerType,
    });
  }
  const data = parseJsonObject(rawText, {
    providerType: input.providerType, apiKey: input.apiKey, model, system: '', user: '',
  });
  const first = Array.isArray(data.data) ? asRecord(data.data[0]) : null;
  const values = (first?.embedding as number[]) || [];
  const usage = asRecord(data.usage);
  return {
    embedding: padOrTrimEmbedding(values),
    model,
    tokens: numberField(usage?.total_tokens) || Math.ceil(text.length / 4),
  };
}

export function decodeStoredSecret(encoded?: string | null): string {
  if (!encoded) return '';
  try {
    return atob(encoded);
  } catch {
    return '';
  }
}

export function redactSecrets(text: string, secret?: string | null): string {
  if (!secret || !text) return text;
  return text.split(secret).join('[redacted]');
}

export function parseModelJson(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) return null;
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const objectMatch = unfenced.match(/\{[\s\S]*\}/);
    const arrayMatch = unfenced.match(/\[[\s\S]*\]/);
    const candidate = objectMatch && arrayMatch
      ? ((objectMatch.index ?? 0) <= (arrayMatch.index ?? 0) ? objectMatch[0] : arrayMatch[0])
      : (objectMatch?.[0] || arrayMatch?.[0]);
    if (!candidate) return null;
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}

export function extractQuestions(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.questions)) return record.questions;
    if (typeof record.questionText === 'string') return [parsed];
  }
  return [];
}

export function resolveProviderConfig(input: {
  provider?: ProviderRow | null;
  env?: Record<string, string | undefined>;
  overrideKey?: string | null;
}): ResolvedLlmProvider {
  const env = input.env || {};
  const provider = input.provider ?? null;
  const rawType = String(provider?.provider_type || 'openai');

  if (!KNOWN_TYPES.has(rawType)) {
    return emptyResolved(rawType, `ไม่รองรับผู้ให้บริการประเภท ${rawType}`);
  }

  if (rawType === 'demo') {
    return {
      demo: true,
      providerId: provider?.id || 'prov-demo',
      providerType: 'demo',
      apiKey: '',
      model: provider?.generation_model || provider?.default_model || 'demo-model',
      baseUrl: null,
      temperature: null,
      maxTokens: 0,
      timeoutMs: 0,
      organizationId: null,
      projectId: null,
      secretName: '',
      reason: 'ผู้ให้บริการสาธิตไม่เรียกโมเดลภายนอก',
    };
  }

  const providerType = rawType as LlmProviderType;
  const secretName = (provider?.secret_ref || DEFAULT_SECRET_REF[providerType]).trim();
  const storedKey = decodeStoredSecret(provider?.encrypted_api_key);
  const apiKey = (input.overrideKey?.trim() || storedKey || env[secretName] || '').trim();
  const model = String(
    provider?.generation_model
    || provider?.default_model
    || env[MODEL_ENV[providerType]]
    || DEFAULT_MODEL[providerType],
  );
  const maxFromEnv = Number(env.AI_MAX_OUTPUT_TOKENS);
  const timeoutFromEnv = Number(env.AI_TIMEOUT_MS);

  return {
    demo: false,
    providerId: provider?.id || null,
    providerType,
    apiKey,
    model,
    baseUrl: defaultBaseUrl(providerType, provider?.base_url, env),
    temperature: provider?.temperature != null ? Number(provider.temperature) : null,
    maxTokens: positiveNumber(provider?.max_tokens, positiveNumber(maxFromEnv, DEFAULT_MAX_TOKENS)),
    timeoutMs: positiveNumber(provider?.timeout_ms, positiveNumber(timeoutFromEnv, DEFAULT_TIMEOUT_MS)),
    organizationId: providerType === 'openai' ? (env.OPENAI_ORGANIZATION_ID || null) : null,
    projectId: providerType === 'openai' ? (env.OPENAI_PROJECT_ID || null) : null,
    secretName,
  };
}

export function buildUsageLogRow(input: {
  id: string;
  userId: string;
  courseId?: string | null;
  usage: Pick<LlmUsage, 'provider' | 'model' | 'inputTokens' | 'outputTokens' | 'estimatedCostUsd' | 'latencyMs'>;
  requestType: string;
  status: 'success' | 'error';
  createdAt?: string;
}) {
  return {
    id: input.id,
    user_id: input.userId,
    course_id: input.courseId ?? null,
    provider: input.usage.provider,
    model: input.usage.model,
    request_type: input.requestType,
    input_tokens: input.usage.inputTokens,
    output_tokens: input.usage.outputTokens,
    estimated_cost_usd: input.usage.estimatedCostUsd,
    latency_ms: input.usage.latencyMs,
    status: input.status,
    created_at: input.createdAt || new Date().toISOString(),
  };
}

export async function completeJson(req: LlmRequest, fetchImpl: typeof fetch = fetch): Promise<LlmCompletion> {
  if (!req.apiKey.trim()) {
    throw new LlmProviderError(`ยังไม่ได้ตั้งค่า API key สำหรับ ${providerLabel(req.providerType)}`, {
      status: 401,
      provider: req.providerType,
    });
  }

  const started = Date.now();
  try {
    if (req.providerType === 'gemini') return await callGemini(req, fetchImpl, started);
    if (req.providerType === 'anthropic') return await callAnthropic(req, fetchImpl, started);
    return await callOpenAI(req, fetchImpl, started);
  } catch (err) {
    if (err instanceof LlmProviderError) {
      if (err.provider === 'llm') {
        throw new LlmProviderError(err.message, {
          status: err.status,
          details: err.details,
          timedOut: err.timedOut,
          provider: req.providerType,
        });
      }
      throw err;
    }
    const message = redactSecrets(err instanceof Error ? err.message : 'LLM request failed', req.apiKey);
    throw new LlmProviderError(message, { status: 502, provider: req.providerType, details: message });
  }
}

export async function probeProvider(config: ResolvedLlmProvider, fetchImpl: typeof fetch = fetch): Promise<ProbeResult> {
  if (config.demo) return { ok: true, message: 'Demo provider พร้อมใช้งาน', status: 'ok' };
  if (!config.apiKey) return { ok: false, message: 'ไม่พบ API key — กรุณาบันทึกในหน้าตั้งค่า', status: 'missing_key' };

  const timeoutMs = Math.min(config.timeoutMs || PROBE_TIMEOUT_MS, PROBE_TIMEOUT_MS);
  try {
    if (config.providerType === 'gemini') return await probeGemini(config, fetchImpl, timeoutMs);
    if (config.providerType === 'anthropic') return await probeAnthropic(config, fetchImpl, timeoutMs);
    return await probeOpenAI(config, fetchImpl, timeoutMs);
  } catch (err) {
    if (err instanceof LlmProviderError && err.timedOut) {
      return { ok: false, message: 'หมดเวลาเชื่อมต่อ', status: 'timeout' };
    }
    return { ok: false, message: err instanceof Error ? err.message : 'เชื่อมต่อไม่สำเร็จ', status: 'error' };
  }
}

export function missingKeyMessage(config: ResolvedLlmProvider): string {
  const secret = config.secretName || 'OPENAI_API_KEY';
  return `ยังไม่ได้ตั้งค่า API key สำหรับ ${providerLabel(config.providerType)} ตั้งค่าในหน้าผู้ให้บริการ AI หรือ secrets ชื่อ ${secret}`;
}

function emptyResolved(rawType: string, reason: string): ResolvedLlmProvider {
  return {
    demo: false,
    providerId: null,
    providerType: 'openai',
    apiKey: '',
    model: '',
    baseUrl: null,
    temperature: null,
    maxTokens: 0,
    timeoutMs: 0,
    organizationId: null,
    projectId: null,
    secretName: '',
    reason: reason || rawType,
  };
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultBaseUrl(type: LlmProviderType, configured: string | null | undefined, env: Record<string, string | undefined>): string {
  if (configured?.trim()) return configured.trim();
  if (type === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta';
  if (type === 'anthropic') return 'https://api.anthropic.com';
  if (type === 'openai_compatible') return env.COMPAT_BASE_URL || 'http://localhost:11434/v1';
  return 'https://api.openai.com/v1';
}

function providerLabel(type: string): string {
  if (type === 'gemini') return 'Gemini';
  if (type === 'anthropic') return 'Anthropic';
  if (type === 'openai_compatible') return 'OpenAI-compatible';
  if (type === 'demo') return 'Demo';
  return 'OpenAI';
}

function ensureJsonHint(system: string, jsonMode: boolean): string {
  if (!jsonMode) return system;
  if (/json/i.test(system)) return system;
  return `${system}\nReturn valid JSON.`;
}

function isReasoningModel(model: string): boolean {
  return /^o[134]/.test(model);
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function geminiRoot(baseUrl?: string | null): string {
  const base = (baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  if (/\/v1(beta)?$/.test(base)) return base;
  return `${base}/v1beta`;
}

function anthropicRoot(baseUrl?: string | null): string {
  const base = (baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
  return base.endsWith('/v1') ? base : `${base}/v1`;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  provider: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      throw new LlmProviderError('หมดเวลาเชื่อมต่อผู้ให้บริการ AI', {
        status: 504,
        timedOut: true,
        provider,
        details: err.message,
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAI(req: LlmRequest, fetchImpl: typeof fetch, started: number): Promise<LlmCompletion> {
  const compatible = req.providerType === 'openai_compatible';
  const base = (req.baseUrl || (compatible ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1')).replace(/\/$/, '');
  const reasoning = isReasoningModel(req.model);
  const jsonMode = req.jsonMode !== false;
  const system = ensureJsonHint(req.system, jsonMode);
  const messages = reasoning
    ? [{ role: 'user', content: `${system}\n\n${req.user}` }]
    : [{ role: 'system', content: system }, { role: 'user', content: req.user }];
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const buildBody = (includeJsonMode: boolean) => {
    const body: Record<string, unknown> = { model: req.model, messages };
    if (compatible) body.max_tokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
    else body.max_completion_tokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
    if (!reasoning && typeof req.temperature === 'number') body.temperature = req.temperature;
    if (includeJsonMode && jsonMode) body.response_format = { type: 'json_object' };
    return JSON.stringify(body);
  };

  const headers = (withOrg: boolean): Record<string, string> => {
    const next: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${req.apiKey}`,
    };
    if (withOrg && !compatible && req.organizationId) next['OpenAI-Organization'] = req.organizationId;
    if (withOrg && !compatible && req.projectId) next['OpenAI-Project'] = req.projectId;
    return next;
  };

  let response = await fetchWithTimeout(fetchImpl, joinUrl(base, '/chat/completions'), {
    method: 'POST',
    headers: headers(true),
    body: buildBody(true),
  }, timeoutMs, req.providerType);

  if (!response.ok && response.status === 401 && !compatible && (req.organizationId || req.projectId)) {
    await response.text().catch(() => '');
    response = await fetchWithTimeout(fetchImpl, joinUrl(base, '/chat/completions'), {
      method: 'POST',
      headers: headers(false),
      body: buildBody(true),
    }, timeoutMs, req.providerType);
  }

  if (!response.ok && response.status === 400 && compatible && jsonMode) {
    await response.text().catch(() => '');
    response = await fetchWithTimeout(fetchImpl, joinUrl(base, '/chat/completions'), {
      method: 'POST',
      headers: headers(false),
      body: buildBody(false),
    }, timeoutMs, req.providerType);
  }

  return parseChatCompletion(response, req, started);
}

async function parseChatCompletion(response: Response, req: LlmRequest, started: number): Promise<LlmCompletion> {
  const rawText = await response.text();
  if (!response.ok) {
    throw new LlmProviderError(`${providerLabel(req.providerType)} API error: ${response.status}`, {
      status: response.status,
      details: redactSecrets(rawText, req.apiKey).slice(0, 500),
      provider: req.providerType,
    });
  }

  const data = parseJsonObject(rawText, req);
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const choice = asRecord(choices[0]);
  const message = asRecord(choice?.message);
  const text = typeof message?.content === 'string' ? message.content : '';
  return { text, json: parseModelJson(text), usage: usageFromOpenAI(data, req, Date.now() - started) };
}

async function callGemini(req: LlmRequest, fetchImpl: typeof fetch, started: number): Promise<LlmCompletion> {
  const model = req.model.replace(/^models\//, '');
  const url = `${geminiRoot(req.baseUrl)}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(req.apiKey)}`;
  const jsonMode = req.jsonMode !== false;
  const response = await fetchWithTimeout(fetchImpl, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: ensureJsonHint(req.system, jsonMode) }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig: {
        temperature: req.temperature ?? 0.3,
        maxOutputTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  }, req.timeoutMs ?? DEFAULT_TIMEOUT_MS, req.providerType);

  const rawText = await response.text();
  if (!response.ok) {
    throw new LlmProviderError(`Gemini API error: ${response.status}`, {
      status: response.status,
      details: redactSecrets(rawText, req.apiKey).slice(0, 500),
      provider: 'gemini',
    });
  }

  const data = parseJsonObject(rawText, req);
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const candidate = asRecord(candidates[0]);
  const content = asRecord(candidate?.content);
  const parts = Array.isArray(content?.parts) ? content.parts as unknown[] : [];
  const text = parts.map(part => {
    const record = asRecord(part);
    return typeof record?.text === 'string' ? record.text : '';
  }).join('');
  if (!text) {
    const feedback = asRecord(data.promptFeedback);
    const block = typeof feedback?.blockReason === 'string' ? feedback.blockReason : 'empty response';
    throw new LlmProviderError(`Gemini ไม่ได้ส่งข้อความกลับ (${block})`, { status: 502, provider: 'gemini' });
  }
  return { text, json: parseModelJson(text), usage: usageFromGemini(data, req, Date.now() - started) };
}

async function callAnthropic(req: LlmRequest, fetchImpl: typeof fetch, started: number): Promise<LlmCompletion> {
  const jsonMode = req.jsonMode !== false;
  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: req.temperature ?? 0.3,
    system: ensureJsonHint(req.system, jsonMode),
    messages: [{ role: 'user', content: req.user }],
  };
  if (jsonMode) {
    body.tools = [{
      name: 'emit_result',
      description: 'Return the final answer as a JSON object',
      input_schema: {
        type: 'object',
        properties: {
          questions: { type: 'array', items: { type: 'object' } },
          status: { type: 'string' },
        },
      },
    }];
    body.tool_choice = { type: 'tool', name: 'emit_result' };
  }

  const response = await fetchWithTimeout(fetchImpl, joinUrl(anthropicRoot(req.baseUrl), '/messages'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': req.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  }, req.timeoutMs ?? DEFAULT_TIMEOUT_MS, req.providerType);

  const rawText = await response.text();
  if (!response.ok) {
    throw new LlmProviderError(`Anthropic API error: ${response.status}`, {
      status: response.status,
      details: redactSecrets(rawText, req.apiKey).slice(0, 500),
      provider: 'anthropic',
    });
  }

  const data = parseJsonObject(rawText, req);
  const blocks = Array.isArray(data.content) ? data.content : [];
  const tool = blocks
    .map(block => asRecord(block))
    .find(block => block?.type === 'tool_use' && block.name === 'emit_result');
  if (tool?.input && typeof tool.input === 'object') {
    return {
      text: JSON.stringify(tool.input),
      json: tool.input,
      usage: usageFromAnthropic(data, req, Date.now() - started),
    };
  }
  const text = blocks.map(block => {
    const record = asRecord(block);
    return record?.type === 'text' && typeof record.text === 'string' ? record.text : '';
  }).join('\n');
  return { text, json: parseModelJson(text), usage: usageFromAnthropic(data, req, Date.now() - started) };
}

async function probeOpenAI(config: ResolvedLlmProvider, fetchImpl: typeof fetch, timeoutMs: number): Promise<ProbeResult> {
  const base = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const response = await fetchWithTimeout(fetchImpl, joinUrl(base, '/models'), {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  }, timeoutMs, config.providerType);
  await response.text().catch(() => '');
  return {
    ok: response.ok,
    message: response.ok ? 'เชื่อมต่อสำเร็จ' : `HTTP ${response.status}`,
    status: response.ok ? 'ok' : `http_${response.status}`,
  };
}

async function probeGemini(config: ResolvedLlmProvider, fetchImpl: typeof fetch, timeoutMs: number): Promise<ProbeResult> {
  const model = (config.model || DEFAULT_MODEL.gemini).replace(/^models\//, '');
  const url = `${geminiRoot(config.baseUrl)}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const response = await fetchWithTimeout(fetchImpl, url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
  }, timeoutMs, 'gemini');
  await response.text().catch(() => '');
  return {
    ok: response.ok,
    message: response.ok ? 'เชื่อมต่อ Gemini สำเร็จ' : `HTTP ${response.status}`,
    status: response.ok ? 'ok' : `http_${response.status}`,
  };
}

async function probeAnthropic(config: ResolvedLlmProvider, fetchImpl: typeof fetch, timeoutMs: number): Promise<ProbeResult> {
  const response = await fetchWithTimeout(fetchImpl, joinUrl(anthropicRoot(config.baseUrl), '/messages'), {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_MODEL.anthropic,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'ping' }],
    }),
  }, timeoutMs, 'anthropic');
  await response.text().catch(() => '');
  const ok = response.ok || response.status === 400;
  return {
    ok,
    message: ok ? 'เชื่อมต่อ Anthropic สำเร็จ' : `HTTP ${response.status}`,
    status: ok ? 'ok' : `http_${response.status}`,
  };
}

function usageFromOpenAI(data: Record<string, unknown>, req: LlmRequest, latencyMs: number): LlmUsage {
  const usage = asRecord(data.usage) || {};
  const inputTokens = numberField(usage.prompt_tokens);
  const outputTokens = numberField(usage.completion_tokens);
  const totalTokens = numberField(usage.total_tokens) || inputTokens + outputTokens;
  return usageRow(req, inputTokens, outputTokens, totalTokens, latencyMs);
}

function usageFromGemini(data: Record<string, unknown>, req: LlmRequest, latencyMs: number): LlmUsage {
  const usage = asRecord(data.usageMetadata) || {};
  const inputTokens = numberField(usage.promptTokenCount);
  const outputTokens = numberField(usage.candidatesTokenCount);
  const totalTokens = numberField(usage.totalTokenCount) || inputTokens + outputTokens;
  return usageRow(req, inputTokens, outputTokens, totalTokens, latencyMs);
}

function usageFromAnthropic(data: Record<string, unknown>, req: LlmRequest, latencyMs: number): LlmUsage {
  const usage = asRecord(data.usage) || {};
  const inputTokens = numberField(usage.input_tokens);
  const outputTokens = numberField(usage.output_tokens);
  return usageRow(req, inputTokens, outputTokens, inputTokens + outputTokens, latencyMs);
}

function usageRow(req: LlmRequest, inputTokens: number, outputTokens: number, totalTokens: number, latencyMs: number): LlmUsage {
  return {
    provider: req.providerType,
    model: req.model,
    inputTokens,
    outputTokens,
    totalTokens,
    latencyMs,
    estimatedCostUsd: estimateCostUsd(inputTokens, outputTokens, req.rates),
  };
}

function parseJsonObject(rawText: string, req: LlmRequest): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawText) as unknown;
    return asRecord(parsed) || {};
  } catch {
    throw new LlmProviderError(`${providerLabel(req.providerType)} ส่งข้อมูลที่ไม่ใช่ JSON`, {
      status: 502,
      details: redactSecrets(rawText, req.apiKey).slice(0, 200),
      provider: req.providerType,
    });
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function numberField(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
