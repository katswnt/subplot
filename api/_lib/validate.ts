/**
 * Tiny hand-rolled request validator. Built so each endpoint can
 * declare a schema once and get either a fully-typed value or a
 * canonical 422 with field-level issues — no per-endpoint
 * `if (!body.foo) return sendError(...)` chains.
 *
 * Intentionally minimal: no zod / yup dep, no schema-composition DSL.
 * Letterbddy's request shapes are flat ({ field, field, field }) so
 * the field-level builder API below is enough.
 *
 * Pattern:
 *
 *   const result = validate(req.body, {
 *     films: array(filmRowSchema),
 *     export_type: oneOf(['diary', 'watchlist', 'reviews']),
 *     source: optional(string()),
 *   });
 *   if (!result.ok) return sendValidationError(req, res, result.issues);
 *   const { films, export_type, source } = result.value;
 */

export type ValidationIssue = {
  path: string;
  issue: string;
};

export type ValidatorResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

/** Internal: a Validator takes a raw value + a path, returns either a
 *  parsed value or a list of issues. */
type Validator<T> = (value: unknown, path: string) => ValidatorResult<T>;

const issue = (path: string, issue: string): ValidatorResult<never> => ({
  ok: false,
  issues: [{ path, issue }],
});

const ok = <T>(value: T): ValidatorResult<T> => ({ ok: true, value });

/* ─── Primitive validators ──────────────────────────────────────── */

export const string = (opts?: { minLength?: number; maxLength?: number; pattern?: RegExp }): Validator<string> =>
  (value, path) => {
    if (typeof value !== 'string') return issue(path, 'must be a string');
    if (opts?.minLength !== undefined && value.length < opts.minLength) {
      return issue(path, `must be at least ${opts.minLength} characters`);
    }
    if (opts?.maxLength !== undefined && value.length > opts.maxLength) {
      return issue(path, `must be at most ${opts.maxLength} characters`);
    }
    if (opts?.pattern && !opts.pattern.test(value)) {
      return issue(path, 'has an invalid format');
    }
    return ok(value);
  };

export const number = (opts?: { min?: number; max?: number; integer?: boolean }): Validator<number> =>
  (value, path) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return issue(path, 'must be a finite number');
    if (opts?.integer && !Number.isInteger(value)) return issue(path, 'must be an integer');
    if (opts?.min !== undefined && value < opts.min) return issue(path, `must be ≥ ${opts.min}`);
    if (opts?.max !== undefined && value > opts.max) return issue(path, `must be ≤ ${opts.max}`);
    return ok(value);
  };

export const boolean = (): Validator<boolean> =>
  (value, path) =>
    typeof value === 'boolean' ? ok(value) : issue(path, 'must be a boolean');

export const oneOf = <T extends string>(values: readonly T[]): Validator<T> =>
  (value, path) => {
    if (typeof value !== 'string') return issue(path, 'must be a string');
    if (!values.includes(value as T)) {
      return issue(path, `must be one of: ${values.join(', ')}`);
    }
    return ok(value as T);
  };

export const nullable = <T>(inner: Validator<T>): Validator<T | null> =>
  (value, path) => (value === null ? ok(null as T | null) : inner(value, path));

export const optional = <T>(inner: Validator<T>): Validator<T | undefined> =>
  (value, path) => (value === undefined ? ok(undefined as T | undefined) : inner(value, path));

export const array = <T>(item: Validator<T>, opts?: { maxLength?: number }): Validator<T[]> =>
  (value, path) => {
    if (!Array.isArray(value)) return issue(path, 'must be an array');
    if (opts?.maxLength !== undefined && value.length > opts.maxLength) {
      return issue(path, `must have at most ${opts.maxLength} entries`);
    }
    const out: T[] = [];
    const issues: ValidationIssue[] = [];
    for (let i = 0; i < value.length; i++) {
      const itemResult = item(value[i], `${path}[${i}]`);
      if (itemResult.ok) out.push(itemResult.value);
      else issues.push(...itemResult.issues);
    }
    if (issues.length > 0) return { ok: false, issues };
    return ok(out);
  };

/* ─── Object validator ─────────────────────────────────────────── */

export type Schema<T> = {
  [K in keyof T]: Validator<T[K]>;
};

/**
 * Validate an object against a flat schema. Returns the typed value
 * on success, or every failing field's issue path + reason on
 * failure (collected — not short-circuited on the first miss, so the
 * client sees the full set in one round-trip).
 */
export const validate = <T>(value: unknown, schema: Schema<T>): ValidatorResult<T> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return issue('body', 'must be a JSON object');
  }
  const obj = value as Record<string, unknown>;
  const out: Partial<T> = {};
  const issues: ValidationIssue[] = [];

  for (const key of Object.keys(schema) as Array<keyof T>) {
    const validator = schema[key];
    const result = validator(obj[key as string], key as string);
    if (result.ok) {
      out[key] = result.value;
    } else {
      issues.push(...result.issues);
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return ok(out as T);
};

/**
 * Validate a query string. Vercel parses query as Record<string,
 * string|string[]>; this picks the first value for each key and
 * coerces undefined to "missing".
 */
export const validateQuery = <T>(
  query: Record<string, string | string[] | undefined>,
  schema: Schema<T>,
): ValidatorResult<T> => {
  const flat: Record<string, unknown> = {};
  for (const key of Object.keys(query)) {
    const raw = query[key];
    flat[key] = Array.isArray(raw) ? raw[0] : raw;
  }
  return validate(flat, schema);
};
