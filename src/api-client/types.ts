export type ApiClientConfig = {
  baseUrl: string;
  getAccessToken?: () => string | null | Promise<string | null>;
};

export type ApiClientErrorShape = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  request_id?: string;
};

export type ApiClientError = {
  status: number;
  error: ApiClientErrorShape;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiClientError };

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: BodyInit | Record<string, unknown>;
  parseAs?: 'json' | 'text';
};
