/**
 * zod-error-windows
 *
 * Beautiful, AI-friendly Zod error formatting with Rust-style diagnostics.
 */

import { z } from 'zod';
import { parseJsonWithSourceMap, type JsonSourceMap, type JsonPath, type SourceSpan } from './source-map.js';
import { zodErrorToDiagnostics, type Diagnostic, type DiagnosticSeverity } from './diagnostics.js';
import { renderDiagnostics, renderDiagnostic, type RenderOptions } from './renderer.js';

export {
  parseJsonWithSourceMap,
  zodErrorToDiagnostics,
  renderDiagnostics,
  renderDiagnostic,
};

export type {
  JsonSourceMap,
  JsonPath,
  SourceSpan,
  Diagnostic,
  DiagnosticSeverity,
  RenderOptions,
};

export interface FormatOptions extends RenderOptions {
  /** Whether to throw an error or return the formatted string */
  throw?: boolean;
}

export interface ValidationResult<T> {
  success: true;
  data: T;
}

export interface ValidationError {
  success: false;
  formatted: string;
  diagnostics: Diagnostic[];
}

/**
 * Parses and validates JSON against a Zod schema, returning beautifully
 * formatted errors if validation fails.
 */
export function parseJson<T extends z.ZodType>(
  jsonString: string,
  schema: T,
  options: FormatOptions = {}
): ValidationResult<z.infer<T>> | ValidationError {
  const { throw: shouldThrow = false, ...renderOptions } = options;

  // Parse JSON with source mapping
  const { data, sourceMap } = parseJsonWithSourceMap(jsonString);

  // Validate against schema
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Convert errors to diagnostics
  const diagnostics = zodErrorToDiagnostics(result.error, sourceMap, data);

  // Render the formatted output
  const formatted = renderDiagnostics(diagnostics, sourceMap, renderOptions);

  if (shouldThrow) {
    const error = new Error(formatted);
    error.name = 'ZodValidationError';
    (error as any).diagnostics = diagnostics;
    throw error;
  }

  return { success: false, formatted, diagnostics };
}

/**
 * Formats a ZodError with source context from the original JSON string.
 */
export function formatZodError(
  error: z.ZodError,
  jsonString: string,
  options: RenderOptions = {}
): string {
  const { data, sourceMap } = parseJsonWithSourceMap(jsonString);
  const diagnostics = zodErrorToDiagnostics(error, sourceMap, data);
  return renderDiagnostics(diagnostics, sourceMap, options);
}

/**
 * Creates a validator function for a given schema that returns
 * beautifully formatted errors.
 */
export function createValidator<T extends z.ZodType>(
  schema: T,
  defaultOptions: FormatOptions = {}
) {
  return (jsonString: string, options: FormatOptions = {}) => {
    return parseJson(jsonString, schema, { ...defaultOptions, ...options });
  };
}
