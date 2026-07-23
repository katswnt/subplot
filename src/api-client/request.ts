import type { ApiClientConfig, ApiClientErrorShape, ApiRequestOptions, ApiResult } from './types.js';

const buildUrl = (baseUrl: string, path: string, query?: ApiRequestOptions['query']) => {
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

const isBodyInit = (value: unknown): value is BodyInit => {
  if (!value) return false;
  if (typeof value === 'string' || value instanceof URLSearchParams || value instanceof FormData) return true;
  if (value instanceof Blob || value instanceof ArrayBuffer) return true;
  return false;
};

const normalizeError = (status: number, parsed: Record<string, unknown> | null, rawText: string): ApiClientErrorShape => {
  const maybeError = parsed?.error;
  if (maybeError && typeof maybeError === 'object') {
    const err = maybeError as Record<string, unknown>;
    return {
      code: typeof err.code === 'string' ? err.code : `http_${status}`,
      message: typeof err.message === 'string' ? err.message : `Request failed (${status}).`,
      details: (err.details as Record<string, unknown> | undefined) || undefined,
      request_id: typeof err.request_id === 'string' ? err.request_id : undefined,
    };
  }

  if (typeof maybeError === 'string') {
    return { code: `http_${status}`, message: maybeError };
  }

  if (typeof parsed?.message === 'string') {
    return { code: `http_${status}`, message: parsed.message };
  }

  if (rawText.trim()) {
    return { code: `http_${status}`, message: rawText.trim() };
  }

  return {
    code: `http_${status}`,
    message: `Request failed (${status}).`,
  };
};

export const apiRequest = async <T>(
  config: ApiClientConfig,
  path: string,
  options: ApiRequestOptions = {}
): Promise<ApiResult<T>> => {
  try {
    const token = await config.getAccessToken?.();
    const headers: Record<string, string> = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };
    const body =
      options.body && !isBodyInit(options.body) ? JSON.stringify(options.body) : (options.body as BodyInit | undefined);
    if (body && !('Content-Type' in headers) && !isBodyInit(options.body)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(buildUrl(config.baseUrl, path, options.query), {
      method: options.method || 'GET',
      headers,
      ...(body ? { body } : {}),
    });

    const text = await response.text();
    let parsed: Record<string, unknown> | null = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }
    if (response.ok) {
      if (options.parseAs === 'text') {
        return { ok: true, data: text as T };
      }
      return { ok: true, data: ((parsed ?? {}) as unknown) as T };
    }

    return { ok: false, failure: { status: response.status, error: normalizeError(response.status, parsed, text) } };
  } catch (error) {
    return {
      ok: false,
      failure: {
        status: 0,
        error: {
          code: 'network_error',
          message: error instanceof Error ? error.message : 'Network request failed.',
        },
      },
    };
  }
};
