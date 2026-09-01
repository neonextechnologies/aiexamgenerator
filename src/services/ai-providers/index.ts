import type { AIProviderConfig, ProviderType } from '../../types/v2';
import { isDemoMode, supabase } from '../../lib/supabase';
import { invokeEdgeFunction } from '../../lib/edge';
import { PROVIDER_CATALOG, getCatalogEntry } from '../../lib/ai-provider-catalog';

const STORAGE_KEY = 'aiexam.ai_providers';

export interface AIProviderDetails extends AIProviderConfig {
  has_api_key: boolean;
  api_key_hint?: string | null;
}

export interface SaveAIProviderInput {
  id: string;
  name: string;
  provider_type: ProviderType;
  is_enabled: boolean;
  base_url?: string | null;
  default_model?: string | null;
  generation_model?: string | null;
  analysis_model?: string | null;
  verification_model?: string | null;
  embedding_model?: string | null;
  temperature?: number | null;
  max_tokens?: number | null;
  timeout_ms?: number | null;
  daily_limit?: number | null;
  monthly_budget_usd?: number | null;
  api_key?: string;
  config_json?: Record<string, unknown>;
}

function encodeApiKey(key: string): string {
  return btoa(key);
}

function decodeApiKey(encoded?: string | null): string {
  if (!encoded) return '';
  try {
    return atob(encoded);
  } catch {
    return '';
  }
}

function hintFromKey(key?: string | null): string | null {
  if (!key || key.length < 4) return null;
  return `••••${key.slice(-4)}`;
}

function rowToDetails(row: Record<string, unknown>): AIProviderDetails {
  const encoded = row.encrypted_api_key as string | null | undefined;
  const decoded = decodeApiKey(encoded);
  return {
    id: String(row.id),
    name: String(row.name),
    provider_type: row.provider_type as ProviderType,
    is_enabled: Boolean(row.is_enabled),
    base_url: (row.base_url as string | null) ?? null,
    default_model: (row.default_model as string | null) ?? null,
    analysis_model: (row.analysis_model as string | null) ?? null,
    generation_model: (row.generation_model as string | null) ?? null,
    verification_model: (row.verification_model as string | null) ?? null,
    embedding_model: (row.embedding_model as string | null) ?? null,
    temperature: row.temperature != null ? Number(row.temperature) : null,
    max_tokens: row.max_tokens != null ? Number(row.max_tokens) : null,
    timeout_ms: row.timeout_ms != null ? Number(row.timeout_ms) : null,
    daily_limit: row.daily_limit != null ? Number(row.daily_limit) : null,
    monthly_budget_usd: row.monthly_budget_usd != null ? Number(row.monthly_budget_usd) : null,
    secret_ref: (row.secret_ref as string | null) ?? null,
    last_tested_at: (row.last_tested_at as string | null) ?? null,
    last_test_status: (row.last_test_status as string | null) ?? null,
    config_json: (row.config_json as Record<string, unknown>) || {},
    has_api_key: Boolean(encoded),
    api_key_hint: hintFromKey(decoded),
  };
}

function catalogToDetails(entry: typeof PROVIDER_CATALOG[number], stored?: Partial<AIProviderDetails>): AIProviderDetails {
  return {
    id: entry.id,
    name: stored?.name || entry.name,
    provider_type: entry.provider_type,
    is_enabled: stored?.is_enabled ?? entry.id === 'prov-demo',
    base_url: stored?.base_url ?? entry.base_url,
    default_model: stored?.default_model ?? entry.default_model,
    generation_model: stored?.generation_model ?? entry.generation_model,
    analysis_model: stored?.analysis_model ?? entry.analysis_model,
    verification_model: stored?.verification_model ?? entry.verification_model,
    embedding_model: stored?.embedding_model ?? entry.embedding_model,
    temperature: stored?.temperature ?? entry.temperature,
    max_tokens: stored?.max_tokens ?? entry.max_tokens,
    timeout_ms: stored?.timeout_ms ?? entry.timeout_ms,
    daily_limit: stored?.daily_limit ?? null,
    monthly_budget_usd: stored?.monthly_budget_usd ?? null,
    secret_ref: stored?.secret_ref ?? null,
    last_tested_at: stored?.last_tested_at ?? null,
    last_test_status: stored?.last_test_status ?? null,
    config_json: stored?.config_json ?? {},
    has_api_key: stored?.has_api_key ?? false,
    api_key_hint: stored?.api_key_hint ?? null,
  };
}

function readDemoStore(): Record<string, AIProviderDetails> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Record<string, AIProviderDetails> : {};
  } catch {
    return {};
  }
}

function writeDemoStore(data: Record<string, AIProviderDetails>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export const aiProviderService = {
  async listProviders(): Promise<AIProviderDetails[]> {
    if (isDemoMode || !supabase) {
      const stored = readDemoStore();
      return PROVIDER_CATALOG.map(entry => catalogToDetails(entry, stored[entry.id]));
    }

    const { data, error } = await supabase
      .from('ai_providers')
      .select('id,name,provider_type,is_enabled,base_url,default_model,analysis_model,generation_model,verification_model,embedding_model,temperature,max_tokens,timeout_ms,daily_limit,monthly_budget_usd,secret_ref,last_tested_at,last_test_status,config_json,encrypted_api_key')
      .order('name');

    if (error || !data?.length) {
      return PROVIDER_CATALOG.map(entry => catalogToDetails(entry));
    }

    const byId = new Map(data.map(row => [String(row.id), rowToDetails(row as Record<string, unknown>)]));
    return PROVIDER_CATALOG.map(entry => byId.get(entry.id) || catalogToDetails(entry));
  },

  async getProvider(id: string): Promise<AIProviderDetails | null> {
    const providers = await this.listProviders();
    return providers.find(provider => provider.id === id) || null;
  },

  async saveProvider(input: SaveAIProviderInput): Promise<AIProviderDetails> {
    const catalog = getCatalogEntry(input.id);
    const payload: Record<string, unknown> = {
      id: input.id,
      name: input.name,
      provider_type: input.provider_type,
      is_enabled: input.is_enabled,
      base_url: input.base_url || null,
      default_model: input.default_model || null,
      generation_model: input.generation_model || null,
      analysis_model: input.analysis_model || null,
      verification_model: input.verification_model || null,
      embedding_model: input.embedding_model || null,
      temperature: input.temperature ?? catalog?.temperature ?? 0.3,
      max_tokens: input.max_tokens ?? catalog?.max_tokens ?? 8000,
      timeout_ms: input.timeout_ms ?? catalog?.timeout_ms ?? 120000,
      daily_limit: input.daily_limit ?? null,
      monthly_budget_usd: input.monthly_budget_usd ?? null,
      config_json: input.config_json || {},
      updated_at: new Date().toISOString(),
    };

    if (input.api_key?.trim()) {
      payload.encrypted_api_key = encodeApiKey(input.api_key.trim());
    }

    if (isDemoMode || !supabase) {
      const stored = readDemoStore();
      const current = stored[input.id] || catalogToDetails(catalog || PROVIDER_CATALOG[0]);
      const next: AIProviderDetails = {
        ...current,
        ...payload,
        has_api_key: input.api_key?.trim() ? true : current.has_api_key,
        api_key_hint: input.api_key?.trim() ? hintFromKey(input.api_key.trim()) : current.api_key_hint,
      } as AIProviderDetails;
      stored[input.id] = next;
      writeDemoStore(stored);
      return next;
    }

    const { data, error } = await supabase
      .from('ai_providers')
      .upsert(payload, { onConflict: 'id' })
      .select('id,name,provider_type,is_enabled,base_url,default_model,analysis_model,generation_model,verification_model,embedding_model,temperature,max_tokens,timeout_ms,daily_limit,monthly_budget_usd,secret_ref,last_tested_at,last_test_status,config_json,encrypted_api_key')
      .single();

    if (error) throw new Error(error.message);
    return rowToDetails(data as Record<string, unknown>);
  },

  async setDefaultProvider(id: string): Promise<void> {
    const providers = await this.listProviders();
    await Promise.all(providers.map(provider => this.saveProvider({
      id: provider.id,
      name: provider.name,
      provider_type: provider.provider_type,
      is_enabled: provider.id === id,
      base_url: provider.base_url,
      default_model: provider.default_model,
      generation_model: provider.generation_model,
      analysis_model: provider.analysis_model,
      verification_model: provider.verification_model,
      embedding_model: provider.embedding_model,
      temperature: provider.temperature,
      max_tokens: provider.max_tokens,
      timeout_ms: provider.timeout_ms,
      daily_limit: provider.daily_limit,
      monthly_budget_usd: provider.monthly_budget_usd,
      config_json: provider.config_json,
    })));
  },

  async testProvider(providerId: string, apiKey?: string): Promise<{ ok: boolean; message: string }> {
    if (providerId === 'prov-demo') return { ok: true, message: 'Demo provider พร้อมใช้งาน' };

    if (isDemoMode) {
      if (!apiKey?.trim()) return { ok: false, message: 'กรุณาใส่ API key ก่อนทดสอบ (Demo mode บันทึกในเครื่องเท่านั้น)' };
      return { ok: true, message: 'บันทึก API key ในเครื่องแล้ว — ทดสอบการเชื่อมต่อจริงต้องเชื่อมต่อ Supabase' };
    }

    try {
      const { ok, data } = await invokeEdgeFunction<{ ok: boolean; message: string }>('exam-engine', {
        action: 'provider_test',
        providerId,
        apiKey: apiKey?.trim() || undefined,
      });
      return { ok: ok && !!data.ok, message: data.message || (ok ? 'เชื่อมต่อสำเร็จ' : 'ทดสอบไม่สำเร็จ') };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'ทดสอบไม่สำเร็จ' };
    }
  },
};
