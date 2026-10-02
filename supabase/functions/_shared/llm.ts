import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  buildUsageLogRow,
  completeJson,
  extractQuestions,
  LlmProviderError,
  missingKeyMessage,
  probeProvider,
  resolveProviderConfig,
  type LlmCompletion,
  type LlmUsage,
  type ProviderRow,
  type ResolvedLlmProvider,
} from "../../../src/services/ai-providers/llm-client.ts";

type SupabaseAdmin = ReturnType<typeof createClient>;

const AI_ENV_NAMES = [
  "OPENAI_API_KEY",
  "OPENAI_QUESTION_MODEL",
  "OPENAI_ORGANIZATION_ID",
  "OPENAI_PROJECT_ID",
  "GEMINI_API_KEY",
  "GEMINI_QUESTION_MODEL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_QUESTION_MODEL",
  "COMPAT_API_KEY",
  "COMPAT_QUESTION_MODEL",
  "COMPAT_BASE_URL",
  "AI_MAX_OUTPUT_TOKENS",
  "AI_TIMEOUT_MS",
];

export function readAiEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const name of AI_ENV_NAMES) env[name] = Deno.env.get(name) || undefined;
  return env;
}

export async function fetchProviderRow(
  supabase: SupabaseAdmin,
  providerId?: string | null,
): Promise<ProviderRow | null> {
  if (providerId === "prov-demo") return { id: "prov-demo", provider_type: "demo" };
  if (providerId) {
    const { data } = await supabase.from("ai_providers").select("*").eq("id", providerId).maybeSingle();
    return (data as ProviderRow | null) ?? null;
  }
  const { data } = await supabase
    .from("ai_providers")
    .select("*")
    .eq("is_enabled", true)
    .neq("provider_type", "demo")
    .order("updated_at", { ascending: false })
    .limit(1);
  const row = Array.isArray(data) ? data[0] : null;
  return (row as ProviderRow | null) ?? null;
}

export async function resolveRequestProvider(
  supabase: SupabaseAdmin,
  providerId?: string | null,
  overrideKey?: string | null,
): Promise<ResolvedLlmProvider> {
  const row = await fetchProviderRow(supabase, providerId);
  return resolveProviderConfig({ provider: row, env: readAiEnv(), overrideKey });
}

export async function probeRequestProvider(config: ResolvedLlmProvider) {
  return probeProvider(config);
}

export interface CompletedGeneration {
  ok: true;
  questions: unknown[];
  parsed: unknown;
  usage: LlmUsage;
  providerType: string;
  model: string;
}

export interface FailedGeneration {
  ok: false;
  demo: boolean;
  error: string;
  details?: string;
  status: number;
}

export async function completeAndLog(
  supabase: SupabaseAdmin,
  config: ResolvedLlmProvider,
  input: { system: string; user: string; userId: string; courseId?: string | null; requestType: string },
): Promise<CompletedGeneration | FailedGeneration> {
  if (config.demo || config.providerType === "demo" || !config.apiKey) {
    return { ok: false, demo: true, status: 503, error: config.reason || missingKeyMessage(config) };
  }
  const providerType = config.providerType;

  try {
    const completion = await completeJson({
      providerType,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      system: input.system,
      user: input.user,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      timeoutMs: config.timeoutMs,
      jsonMode: true,
      organizationId: config.organizationId,
      projectId: config.projectId,
    });
    await writeUsage(supabase, input, completion.usage, "success");
    return {
      ok: true,
      questions: extractQuestions(completion.json),
      parsed: completion.json,
      usage: completion.usage,
      providerType: config.providerType,
      model: config.model,
    };
  } catch (err) {
    const failure = err instanceof LlmProviderError
      ? err
      : new LlmProviderError(err instanceof Error ? err.message : "LLM request failed", {
        status: 502,
        provider: providerType,
      });
    const usage: LlmUsage = {
      provider: providerType,
      model: config.model,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
      estimatedCostUsd: 0,
    };
    await writeUsage(supabase, input, usage, "error");
    return {
      ok: false,
      demo: false,
      status: failure.status >= 400 && failure.status < 600 ? failure.status : 502,
      error: failure.message,
      details: failure.details,
    };
  }
}

async function writeUsage(
  supabase: SupabaseAdmin,
  input: { userId: string; courseId?: string | null; requestType: string },
  usage: LlmUsage,
  status: "success" | "error",
) {
  try {
    const row = buildUsageLogRow({
      id: `usage-${crypto.randomUUID()}`,
      userId: input.userId,
      courseId: input.courseId,
      usage,
      requestType: input.requestType,
      status,
    });
    await supabase.from("ai_usage_logs").insert(row);
  } catch {
    // Usage logging must not hide a successful generation.
  }
}

export { missingKeyMessage };
export type { LlmCompletion, ResolvedLlmProvider };
