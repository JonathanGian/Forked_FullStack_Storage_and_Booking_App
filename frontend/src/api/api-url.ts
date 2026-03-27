import { getRuntimeConfig } from "@/types/runtime-config";

function normalizeApiUrl(apiUrl: string): string {
  if (!apiUrl) return "http://localhost:3000";
  return apiUrl.startsWith("/") || apiUrl.startsWith("http")
    ? apiUrl
    : `https://${apiUrl}`;
}

export function getApiBaseUrl(): string {
  return normalizeApiUrl(getRuntimeConfig().apiUrl || "");
}

let wakePromise: Promise<void> | null = null;
let lastWakeSuccessAt = 0;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pingHealth(healthUrl: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Health check returned ${response.status}`);
    }
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function ensureBackendAwake(options?: {
  totalTimeoutMs?: number;
  perRequestTimeoutMs?: number;
  retryDelayMs?: number;
}) {
  const now = Date.now();
  if (now - lastWakeSuccessAt < 60_000) return;
  if (wakePromise) return wakePromise;

  const {
    totalTimeoutMs = 70_000,
    perRequestTimeoutMs = 8_000,
    retryDelayMs = 2_500,
  } = options ?? {};

  const apiBaseUrl = getApiBaseUrl().replace(/\/$/, "");
  const healthUrl = `${apiBaseUrl}/health`;

  wakePromise = (async () => {
    const startedAt = Date.now();
    let lastError: unknown;

    while (Date.now() - startedAt < totalTimeoutMs) {
      try {
        await pingHealth(healthUrl, perRequestTimeoutMs);
        lastWakeSuccessAt = Date.now();
        return;
      } catch (error) {
        lastError = error;
        await delay(retryDelayMs);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Backend did not wake up in time");
  })();

  try {
    await wakePromise;
  } finally {
    wakePromise = null;
  }
}
