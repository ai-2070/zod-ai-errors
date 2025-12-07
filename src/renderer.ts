/**
 * Renders diagnostics in a beautiful Rust-style format.
 */

import type { Diagnostic } from "./diagnostics.js";
import type { JsonSourceMap } from "./source-map.js";

export interface RenderOptions {
  colors?: boolean;
  filename?: string;
  contextLines?: number;
}

interface Colors {
  red: (s: string) => string;
  cyan: (s: string) => string;
  yellow: (s: string) => string;
  blue: (s: string) => string;
  bold: (s: string) => string;
  dim: (s: string) => string;
  reset: string;
}

const noColors: Colors = {
  red: (s) => s,
  cyan: (s) => s,
  yellow: (s) => s,
  blue: (s) => s,
  bold: (s) => s,
  dim: (s) => s,
  reset: "",
};

const ansiColors: Colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  reset: "\x1b[0m",
};

export function renderDiagnostic(
  diagnostic: Diagnostic,
  sourceMap: JsonSourceMap,
  options: RenderOptions = {},
): string {
  const { colors = true, filename = "", contextLines = 4 } = options;
  const c = colors ? ansiColors : noColors;

  const lines: string[] = [];

  // Header: error[ZOD001]: message
  const severityColor = diagnostic.severity === "error" ? c.red : c.yellow;
  lines.push(
    `${severityColor(c.bold(`${diagnostic.severity}[${diagnostic.code}]`))}: ${c.bold(diagnostic.message)}`,
  );

  if (diagnostic.span) {
    const { valueStart, valueEnd } = diagnostic.span;

    // Location pointer: --> filename:line:column
    lines.push(
      `  ${c.blue("-->")} ${filename}:${valueStart.line}:${valueStart.column}`,
    );

    // Get context lines
    const errorLine = valueStart.line;
    const allLines = sourceMap.getContextLines(
      errorLine,
      contextLines,
      contextLines,
    );

    // Calculate the gutter width (for line numbers)
    const lastLine = allLines[allLines.length - 1];
    const maxLineNum = lastLine ? lastLine.lineNumber : errorLine;
    const gutterWidth = String(maxLineNum).length;

    // Empty gutter line
    lines.push(`${" ".repeat(gutterWidth + 1)}${c.blue("|")}`);

    // Render each context line
    for (const { lineNumber, content } of allLines) {
      const lineNumStr = String(lineNumber).padStart(gutterWidth, " ");
      lines.push(`${c.blue(lineNumStr)} ${c.blue("|")} ${content}`);

      // If this is the error line, add the underline
      if (lineNumber === errorLine) {
        // Calculate underline position and length
        const startCol = valueStart.column - 1;
        let underlineLength: number;

        if (valueStart.line === valueEnd.line) {
          underlineLength = Math.max(1, valueEnd.column - valueStart.column);
        } else {
          underlineLength = Math.max(1, content.length - startCol);
        }

        // Build the annotation message
        let annotationMsg = "";
        if (diagnostic.expected && diagnostic.received) {
          annotationMsg = `expected ${diagnostic.expected}, found ${diagnostic.received}`;
        } else if (diagnostic.expected) {
          annotationMsg = `expected ${diagnostic.expected}`;
        }

        const padding = " ".repeat(startCol);
        const underline = "^".repeat(underlineLength);
        lines.push(
          `${" ".repeat(gutterWidth + 1)}${c.blue("|")} ${padding}${c.red(underline)} ${c.red(annotationMsg)}`,
        );
      }
    }

    // Closing gutter
    lines.push(`${" ".repeat(gutterWidth + 1)}${c.blue("|")}`);
  }

  // Help message
  if (diagnostic.help) {
    const gutterWidth = diagnostic.span
      ? String(sourceMap.lines.length).length
      : 1;
    lines.push(
      `${" ".repeat(gutterWidth + 1)}${c.blue("=")} ${c.cyan("help")}: ${diagnostic.help}`,
    );
  }

  return lines.join("\n");
}

export function renderDiagnostics(
  diagnostics: Diagnostic[],
  sourceMap: JsonSourceMap,
  options: RenderOptions = {},
): string {
  return diagnostics
    .map((d) => renderDiagnostic(d, sourceMap, options))
    .join("\n\n");
}
