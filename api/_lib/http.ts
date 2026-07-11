import type { VercelRequest, VercelResponse } from '@vercel/node';

export type ErrorDetails = Record<string, unknown>;

const makeRequestId = (req: VercelRequest): string => {
  const vercelId = req.headers['x-vercel-id'];
  if (typeof vercelId === 'string' && vercelId.trim()) return vercelId.trim();
  return `req_${Date.now().toString(36)}`;
};

export const setCors = (res: VercelResponse, methods: string) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
};

export const sendError = (
  req: VercelRequest,
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  details: ErrorDetails = {}
) => {
  res.status(status).json({
    error: {
      code,
      message,
      details,
      request_id: makeRequestId(req),
    },
  });
};

export const sendValidationError = (
  req: VercelRequest,
  res: VercelResponse,
  fields: Array<{ path: string; issue: string }>
) =>
  sendError(req, res, 422, 'validation_error', 'Request failed validation.', {
    fields,
  });

export const first = (raw: string | string[] | undefined): string | undefined =>
  Array.isArray(raw) ? raw[0] : raw;

export const parseJsonBody = (req: VercelRequest): Record<string, any> | null => {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body as Record<string, any>;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, any>;
    } catch {
      return null;
    }
  }
  return null;
};
