import { isDemoMode, supabase } from '../../lib/supabase';

export interface ModelPricing {
  id: string;
  provider_type: string;
  model: string;
  input_usd_per_1m: number;
  output_usd_per_1m: number;
  embedding_usd_per_1m?: number | null;
  is_active: boolean;
}

const DEMO_PRICING: ModelPricing[] = [
  { id: 'price-gpt4o', provider_type: 'openai', model: 'gpt-4o', input_usd_per_1m: 2.5, output_usd_per_1m: 10, embedding_usd_per_1m: null, is_active: true },
  { id: 'price-emb-3-small', provider_type: 'openai', model: 'text-embedding-3-small', input_usd_per_1m: 0, output_usd_per_1m: 0, embedding_usd_per_1m: 0.02, is_active: true },
  { id: 'price-gemini-15', provider_type: 'gemini', model: 'gemini-1.5-pro', input_usd_per_1m: 1.25, output_usd_per_1m: 5, embedding_usd_per_1m: null, is_active: true },
  { id: 'price-claude-sonnet', provider_type: 'anthropic', model: 'claude-3-5-sonnet-latest', input_usd_per_1m: 3, output_usd_per_1m: 15, embedding_usd_per_1m: null, is_active: true },
];

export const pricingService = {
  async list(opts?: { includeInactive?: boolean }): Promise<ModelPricing[]> {
    if (isDemoMode || !supabase) return [...DEMO_PRICING];
    let query = supabase.from('ai_model_pricing').select('*').order('provider_type');
    if (!opts?.includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as ModelPricing[];
  },

  async getRates(providerType: string, model: string): Promise<{ inputUsdPer1m: number; outputUsdPer1m: number; embeddingUsdPer1m?: number | null } | null> {
    const rows = await this.list().catch(() => DEMO_PRICING);
    const exact = rows.find(r => r.provider_type === providerType && r.model === model);
    if (exact) {
      return {
        inputUsdPer1m: Number(exact.input_usd_per_1m),
        outputUsdPer1m: Number(exact.output_usd_per_1m),
        embeddingUsdPer1m: exact.embedding_usd_per_1m != null ? Number(exact.embedding_usd_per_1m) : null,
      };
    }
    const byProvider = rows.find(r => r.provider_type === providerType);
    if (!byProvider) return null;
    return {
      inputUsdPer1m: Number(byProvider.input_usd_per_1m),
      outputUsdPer1m: Number(byProvider.output_usd_per_1m),
      embeddingUsdPer1m: byProvider.embedding_usd_per_1m != null ? Number(byProvider.embedding_usd_per_1m) : null,
    };
  },

  async upsert(row: Omit<ModelPricing, 'is_active'> & { is_active?: boolean }): Promise<ModelPricing> {
    if (isDemoMode || !supabase) {
      const idx = DEMO_PRICING.findIndex(r => r.id === row.id);
      const next = { ...row, is_active: row.is_active !== false };
      if (idx >= 0) DEMO_PRICING[idx] = next;
      else DEMO_PRICING.push(next);
      return next;
    }
    const { data, error } = await supabase.from('ai_model_pricing').upsert({
      ...row,
      is_active: row.is_active !== false,
      updated_at: new Date().toISOString(),
    }).select('*').single();
    if (error) throw error;
    return data as ModelPricing;
  },
};
