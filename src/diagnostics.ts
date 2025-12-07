/**
 * Converts Zod errors into structured diagnostics.
 */

import type { z } from "zod";
import type { JsonSourceMap, SourceSpan, JsonPath } from "./source-map.js";

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  path: JsonPath;
  span: SourceSpan | undefined;
  help: string | undefined;
  expected: string | undefined;
  received: string | undefined;
}

function formatPath(path: JsonPath): string {
  if (path.length === 0) return "root";
  return path
    .map((p, i) => {
      if (typeof p === "number") return `[${p}]`;
      if (i === 0) return p;
      return `.${p}`;
    })
    .join("");
}

function generateErrorCode(index: number): string {
  return `ZOD${String(index + 1).padStart(3, "0")}`;
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `string "${value}"`;
  if (typeof value === "number") return `number ${value}`;
  if (typeof value === "boolean") return `boolean ${value}`;
  if (Array.isArray(value)) return `array with ${value.length} elements`;
  if (typeof value === "object") return "object";
  return String(value);
}

type ZodIssue = z.core.$ZodIssue;

/**
 * Checks if the issue message is a custom user-provided message
 * rather than a Zod default message.
 */
function isCustomMessage(issue: ZodIssue): boolean {
  const msg = issue.message;
  if (!msg) return false;

  // Zod v4 default message patterns (from en.ts locale)
  const defaultPatterns = [
    // Core error patterns
    /^Invalid input/,
    /^Invalid option:/,
    /^Too small:/,
    /^Too big:/,
    /^Unrecognized key/,

    // String format patterns (invalid_format with starts_with/ends_with/includes/regex)
    /^Invalid string: must start with/,
    /^Invalid string: must end with/,
    /^Invalid string: must include/,
    /^Invalid string: must match pattern/,

    // Number format pattern (not_multiple_of)
    /^Invalid number: must be a multiple of/,

    // Key/element errors
    /^Invalid key in /,
    /^Invalid value in /,

    // Format validations (Nouns from en.ts)
    /^Invalid input$/, // regex format
    /^Invalid email address$/,
    /^Invalid URL$/,
    /^Invalid emoji$/,
    /^Invalid UUID$/,
    /^Invalid UUIDv4$/,
    /^Invalid UUIDv6$/,
    /^Invalid nanoid$/,
    /^Invalid GUID$/,
    /^Invalid cuid$/,
    /^Invalid cuid2$/,
    /^Invalid ULID$/,
    /^Invalid XID$/,
    /^Invalid KSUID$/,
    /^Invalid ISO datetime$/,
    /^Invalid ISO date$/,
    /^Invalid ISO time$/,
    /^Invalid ISO duration$/,
    /^Invalid IPv4 address$/,
    /^Invalid IPv6 address$/,
    /^Invalid MAC address$/,
    /^Invalid IPv4 range$/,
    /^Invalid IPv6 range$/,
    /^Invalid base64-encoded string$/,
    /^Invalid base64url-encoded string$/,
    /^Invalid JSON string$/,
    /^Invalid E\.164 number$/,
    /^Invalid JWT$/,
  ];

  return !defaultPatterns.some((pattern) => pattern.test(msg));
}

function generateHelp(
  issue: ZodIssue,
  receivedValue: unknown,
): string | undefined {
  // If there's a custom message, use it as the help text
  if (isCustomMessage(issue)) {
    return issue.message;
  }

  const code = issue.code;

  switch (code) {
    case "invalid_type":
      if (issue.expected === "number" && typeof receivedValue === "string") {
        const parsed = parseFloat(receivedValue);
        if (!isNaN(parsed)) {
          return `convert the string "${receivedValue}" to a number (${parsed})`;
        }
        return `convert the string "${receivedValue}" to a number`;
      }
      if (issue.expected === "string" && typeof receivedValue === "number") {
        return `convert the number ${receivedValue} to a string`;
      }
      return `provide a value of type ${issue.expected}`;

    case "too_small": {
      const origin = issue.origin;
      if (origin === "string") {
        const min = issue.minimum as number;
        return `provide a string with at least ${min} character${min === 1 ? "" : "s"}`;
      }
      if (origin === "number" || origin === "int") {
        return `provide a number ${issue.inclusive ? ">=" : ">"} ${issue.minimum}`;
      }
      if (origin === "array") {
        return `provide an array with at least ${issue.minimum} element${issue.minimum === 1 ? "" : "s"}`;
      }
      return undefined;
    }

    case "too_big": {
      const origin = issue.origin;
      if (origin === "string") {
        const max = issue.maximum as number;
        return `provide a string with at most ${max} character${max === 1 ? "" : "s"}`;
      }
      if (origin === "number" || origin === "int") {
        return `provide a number ${issue.inclusive ? "<=" : "<"} ${issue.maximum}`;
      }
      if (origin === "array") {
        return `provide an array with at most ${issue.maximum} element${issue.maximum === 1 ? "" : "s"}`;
      }
      return undefined;
    }

    case "invalid_value": {
      const values = issue.values;
      if (values.length <= 5) {
        return `use one of the allowed values: ${values.map((o) => `"${String(o)}"`).join(", ")}`;
      }
      return `use one of the ${values.length} allowed values`;
    }

    case "invalid_format": {
      const format = issue.format;
      if (format === "email") {
        return "provide a valid email address (e.g., user@example.com)";
      }
      if (format === "url") {
        return "provide a valid URL (e.g., https://example.com)";
      }
      if (format === "uuid") {
        return "provide a valid UUID (e.g., 123e4567-e89b-12d3-a456-426614174000)";
      }
      return `provide a valid ${format}`;
    }

    case "unrecognized_keys": {
      const keys = issue.keys;
      return `remove unrecognized key${keys.length > 1 ? "s" : ""}: ${keys.map((k) => `"${k}"`).join(", ")}`;
    }

    default:
      return undefined;
  }
}

function formatExpected(issue: ZodIssue): string | undefined {
  const code = issue.code;

  switch (code) {
    case "invalid_type":
      return issue.expected as string;

    case "too_small": {
      const origin = issue.origin;
      if (origin === "string") {
        const min = issue.minimum as number;
        return `a non-empty string (min ${min} char${min === 1 ? "" : "s"})`;
      }
      if (origin === "number" || origin === "int") {
        return `a number ${issue.inclusive ? "≥" : ">"} ${issue.minimum}`;
      }
      if (origin === "array") {
        return `an array with ≥ ${issue.minimum} element${(issue.minimum as number) === 1 ? "" : "s"}`;
      }
      return undefined;
    }

    case "too_big": {
      const origin = issue.origin;
      if (origin === "string") {
        return `a string (max ${issue.maximum} char${(issue.maximum as number) === 1 ? "" : "s"})`;
      }
      if (origin === "number" || origin === "int") {
        return `a number ${issue.inclusive ? "≤" : "<"} ${issue.maximum}`;
      }
      return undefined;
    }

    case "invalid_value": {
      const values = issue.values;
      const displayValues = values
        .slice(0, 3)
        .map((o) => `"${String(o)}"`)
        .join(", ");
      return `one of: ${displayValues}${values.length > 3 ? "..." : ""}`;
    }

    case "invalid_format":
      return `a valid ${issue.format}`;

    default:
      return undefined;
  }
}

function generateMessage(issue: ZodIssue, path: JsonPath): string {
  const pathStr = formatPath(path);
  const code = issue.code;

  switch (code) {
    case "invalid_type":
      return `type mismatch for field \`${pathStr}\``;

    case "too_small":
    case "too_big":
      return `invalid value for field \`${pathStr}\``;

    case "invalid_value":
      return `invalid enum value for field \`${pathStr}\``;

    case "invalid_format":
      return `invalid ${issue.format} for field \`${pathStr}\``;

    case "unrecognized_keys":
      return `unrecognized keys in \`${pathStr}\``;

    case "invalid_union":
      return `no valid union variant for field \`${pathStr}\``;

    default:
      return `validation error for field \`${pathStr}\``;
  }
}

export function zodErrorToDiagnostics(
  error: z.ZodError,
  sourceMap: JsonSourceMap,
  inputData: unknown,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const issues = error.issues;

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    if (!issue) continue;

    const path = issue.path as JsonPath;
    const span = sourceMap.get(path);

    // Get the actual value at this path
    let receivedValue: unknown = inputData;
    for (const segment of path) {
      if (receivedValue && typeof receivedValue === "object") {
        receivedValue = (receivedValue as Record<string | number, unknown>)[
          segment
        ];
      } else {
        receivedValue = undefined;
        break;
      }
    }

    diagnostics.push({
      code: generateErrorCode(i),
      severity: "error",
      message: generateMessage(issue, path),
      path,
      span,
      help: generateHelp(issue, receivedValue),
      expected: formatExpected(issue),
      received: describeValue(receivedValue),
    });
  }

  return diagnostics;
}
