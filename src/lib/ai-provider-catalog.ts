import type { ProviderType } from '../types/v2';

export interface ProviderCatalogEntry {
  id: string;
  name: string;
  provider_type: ProviderType;
  description: string;
  base_url: string;
  default_model: string;
  generation_model: string;
  analysis_model: string;
  verification_model: string;
  embedding_model: string;
  temperature: number;
  max_tokens: number;
  timeout_ms: number;
  requires_api_key: boolean;
  requires_base_url: boolean;
  model_suggestions: {
    generation: string[];
    analysis: string[];
    verification: string[];
    embedding: string[];
  };
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'prov-demo',
    name: 'Demo (ไม่เรียก AI จริง)',
    provider_type: 'demo',
    description: 'ใช้ข้อมูลจำลองในหน่วยความจำ ไม่ต้องใส่ API key',
    base_url: '',
    default_model: 'demo-model',
    generation_model: 'demo-model',
    analysis_model: 'demo-model',
    verification_model: 'demo-model',
    embedding_model: 'demo-embed',
    temperature: 0.3,
    max_tokens: 8000,
    timeout_ms: 120000,
    requires_api_key: false,
    requires_base_url: false,
    model_suggestions: {
      generation: ['demo-model'],
      analysis: ['demo-model'],
      verification: ['demo-model'],
      embedding: ['demo-embed'],
    },
  },
  {
    id: 'prov-openai',
    name: 'OpenAI (ChatGPT)',
    provider_type: 'openai',
    description: 'GPT-4o, GPT-4o mini และ embedding models',
    base_url: 'https://api.openai.com/v1',
    default_model: 'gpt-4o',
    generation_model: 'gpt-4o',
    analysis_model: 'gpt-4o',
    verification_model: 'gpt-4o-mini',
    embedding_model: 'text-embedding-3-small',
    temperature: 0.3,
    max_tokens: 8000,
    timeout_ms: 120000,
    requires_api_key: true,
    requires_base_url: false,
    model_suggestions: {
      generation: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o3-mini'],
      analysis: ['gpt-4o', 'gpt-4o-mini'],
      verification: ['gpt-4o-mini'],
      embedding: ['text-embedding-3-small', 'text-embedding-3-large'],
    },
  },
  {
    id: 'prov-anthropic',
    name: 'Anthropic (Claude)',
    provider_type: 'anthropic',
    description: 'Claude 3.5 Sonnet / Haiku',
    base_url: 'https://api.anthropic.com',
    default_model: 'claude-3-5-sonnet-latest',
    generation_model: 'claude-3-5-sonnet-latest',
    analysis_model: 'claude-3-5-haiku-latest',
    verification_model: 'claude-3-5-haiku-latest',
    embedding_model: '',
    temperature: 0.3,
    max_tokens: 8000,
    timeout_ms: 120000,
    requires_api_key: true,
    requires_base_url: false,
    model_suggestions: {
      generation: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'],
      analysis: ['claude-3-5-haiku-latest'],
      verification: ['claude-3-5-haiku-latest'],
      embedding: [],
    },
  },
  {
    id: 'prov-gemini',
    name: 'Google Gemini',
    provider_type: 'gemini',
    description: 'Gemini 1.5 Pro / Flash',
    base_url: 'https://generativelanguage.googleapis.com/v1beta',
    default_model: 'gemini-1.5-pro',
    generation_model: 'gemini-1.5-pro',
    analysis_model: 'gemini-1.5-flash',
    verification_model: 'gemini-1.5-flash',
    embedding_model: 'text-embedding-004',
    temperature: 0.3,
    max_tokens: 8000,
    timeout_ms: 120000,
    requires_api_key: true,
    requires_base_url: false,
    model_suggestions: {
      generation: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'],
      analysis: ['gemini-1.5-flash'],
      verification: ['gemini-1.5-flash'],
      embedding: ['text-embedding-004'],
    },
  },
  {
    id: 'prov-compat',
    name: 'OpenAI-Compatible',
    provider_type: 'openai_compatible',
    description: 'LM Studio, Ollama, vLLM หรือ endpoint ที่รองรับ OpenAI API',
    base_url: 'http://localhost:11434/v1',
    default_model: 'gpt-4o',
    generation_model: 'gpt-4o',
    analysis_model: 'gpt-4o',
    verification_model: 'gpt-4o',
    embedding_model: 'text-embedding-3-small',
    temperature: 0.3,
    max_tokens: 8000,
    timeout_ms: 120000,
    requires_api_key: true,
    requires_base_url: true,
    model_suggestions: {
      generation: ['gpt-4o', 'llama3', 'qwen2.5', 'mistral'],
      analysis: ['gpt-4o', 'llama3'],
      verification: ['gpt-4o-mini', 'llama3'],
      embedding: ['text-embedding-3-small', 'nomic-embed-text'],
    },
  },
];

export function getCatalogEntry(id: string): ProviderCatalogEntry | undefined {
  return PROVIDER_CATALOG.find(entry => entry.id === id);
}

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  demo: 'Demo',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  anthropic: 'Anthropic',
  openai_compatible: 'OpenAI-Compatible',
};
