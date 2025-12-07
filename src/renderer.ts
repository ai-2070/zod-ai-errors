/**
 * Renders diagnostics in a beautiful Rust-style format.
 */

import type { Diagnostic } from "./diagnostics.js";
import type { JsonSourceMap } from "./source-map.js";

export interface RenderOptions {
  colors?: boolean;
  filename?: string;
  contextLines?: number;
  /** When true, all errors are displayed in a single combined window */
  compact?: boolean;
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
  const { compact = false } = options;

  if (!compact) {
    return diagnostics
      .map((d) => renderDiagnostic(d, sourceMap, options))
      .join("\n\n");
  }

  // Compact mode: render all errors in a single window
  return renderDiagnosticsCompact(diagnostics, sourceMap, options);
}

function renderDiagnosticsCompact(
  diagnostics: Diagnostic[],
  sourceMap: JsonSourceMap,
  options: RenderOptions = {},
): string {
  const { colors = true, filename = "", contextLines = 1 } = options;
  const c = colors ? ansiColors : noColors;

  if (diagnostics.length === 0) return "";

  const lines: string[] = [];

  // Header: error: N validation errors
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.filter(
    (d) => d.severity === "warning",
  ).length;

  let headerParts: string[] = [];
  if (errorCount > 0) {
    headerParts.push(`${errorCount} error${errorCount === 1 ? "" : "s"}`);
  }
  if (warningCount > 0) {
    headerParts.push(`${warningCount} warning${warningCount === 1 ? "" : "s"}`);
  }

  lines.push(
    `${c.red(c.bold("error"))}: ${c.bold(`found ${headerParts.join(" and ")}`)}`,
  );

  // Collect all lines that need annotations
  const annotationsByLine = new Map<
    number,
    Array<{
      diagnostic: Diagnostic;
      startCol: number;
      endCol: number;
    }>
  >();

  for (const diagnostic of diagnostics) {
    if (!diagnostic.span) continue;
    const lineNum = diagnostic.span.valueStart.line;
    if (!annotationsByLine.has(lineNum)) {
      annotationsByLine.set(lineNum, []);
    }
    annotationsByLine.get(lineNum)!.push({
      diagnostic,
      startCol: diagnostic.span.valueStart.column - 1,
      endCol:
        diagnostic.span.valueStart.line === diagnostic.span.valueEnd.line
          ? diagnostic.span.valueEnd.column - 1
          : (sourceMap.lines[lineNum - 1]?.length ??
            diagnostic.span.valueStart.column),
    });
  }

  // Sort annotations by line number
  const sortedLines = Array.from(annotationsByLine.keys()).sort(
    (a, b) => a - b,
  );

  if (sortedLines.length === 0) {
    // No spans, just list errors
    for (const diagnostic of diagnostics) {
      lines.push(`  ${c.red("-")} ${diagnostic.message}`);
      if (diagnostic.help) {
        lines.push(`    ${c.cyan("help")}: ${diagnostic.help}`);
      }
    }
    return lines.join("\n");
  }

  // Calculate gutter width
  const maxLineNum = Math.max(...sortedLines);
  const gutterWidth = String(maxLineNum + contextLines).length;

  // Location pointer
  const firstLine = sortedLines[0]!;
  const firstAnnotation = annotationsByLine.get(firstLine)![0]!;
  lines.push(
    `  ${c.blue("-->")} ${filename}:${firstLine}:${firstAnnotation.startCol + 1}`,
  );

  // Empty gutter line
  lines.push(`${" ".repeat(gutterWidth + 1)}${c.blue("|")}`);

  // Render lines with annotations
  let lastRenderedLine = 0;

  for (const lineNum of sortedLines) {
    // Add context lines before if there's a gap
    const startContext = Math.max(lastRenderedLine + 1, lineNum - contextLines);

    // Add ellipsis if there's a gap
    if (lastRenderedLine > 0 && startContext > lastRenderedLine + 1) {
      lines.push(`${c.blue("...".padStart(gutterWidth, " "))} ${c.blue("|")}`);
    }

    // Render context lines before
    for (let i = startContext; i < lineNum; i++) {
      const content = sourceMap.lines[i - 1] ?? "";
      const lineNumStr = String(i).padStart(gutterWidth, " ");
      lines.push(`${c.blue(lineNumStr)} ${c.blue("|")} ${content}`);
    }

    // Render the error line
    const content = sourceMap.lines[lineNum - 1] ?? "";
    const lineNumStr = String(lineNum).padStart(gutterWidth, " ");
    lines.push(`${c.blue(lineNumStr)} ${c.blue("|")} ${content}`);

    // Render annotations for this line
    const annotations = annotationsByLine.get(lineNum)!;
    // Sort by column position
    annotations.sort((a, b) => a.startCol - b.startCol);

    for (const annotation of annotations) {
      const { diagnostic, startCol, endCol } = annotation;
      const underlineLength = Math.max(1, endCol - startCol);
      const padding = " ".repeat(startCol);
      const underline = "^".repeat(underlineLength);

      let annotationMsg = "";
      if (diagnostic.expected && diagnostic.received) {
        annotationMsg = `expected ${diagnostic.expected}, found ${diagnostic.received}`;
      } else if (diagnostic.expected) {
        annotationMsg = `expected ${diagnostic.expected}`;
      } else {
        annotationMsg = diagnostic.message;
      }

      lines.push(
        `${" ".repeat(gutterWidth + 1)}${c.blue("|")} ${padding}${c.red(underline)} ${c.red(annotationMsg)}`,
      );
    }

    // Render context lines after
    const endContext = Math.min(sourceMap.lines.length, lineNum + contextLines);
    for (let i = lineNum + 1; i <= endContext; i++) {
      // Don't render if it's an error line (will be rendered later)
      if (annotationsByLine.has(i)) break;
      const ctxContent = sourceMap.lines[i - 1] ?? "";
      const ctxLineNumStr = String(i).padStart(gutterWidth, " ");
      lines.push(`${c.blue(ctxLineNumStr)} ${c.blue("|")} ${ctxContent}`);
      lastRenderedLine = i;
    }

    lastRenderedLine = Math.max(lastRenderedLine, lineNum);
  }

  // Closing gutter
  lines.push(`${" ".repeat(gutterWidth + 1)}${c.blue("|")}`);

  // Help messages
  const helps = diagnostics.filter((d) => d.help);
  if (helps.length > 0) {
    for (const diagnostic of helps) {
      lines.push(
        `${" ".repeat(gutterWidth + 1)}${c.blue("=")} ${c.cyan("help")}: ${diagnostic.help}`,
      );
    }
  }

  return lines.join("\n");
}
