/**
 * Tracks source locations in JSON for error reporting.
 * Maps JSON paths to their line/column positions in the source.
 */

export interface SourceLocation {
  line: number;
  column: number;
  offset: number;
  length: number;
}

export interface SourceSpan {
  start: SourceLocation;
  end: SourceLocation;
  valueStart: SourceLocation;
  valueEnd: SourceLocation;
}

export type JsonPath = (string | number)[];

export class JsonSourceMap {
  private locations: Map<string, SourceSpan> = new Map();
  public readonly source: string;
  public readonly lines: string[];

  constructor(source: string) {
    this.source = source;
    this.lines = source.split("\n");
  }

  private pathToKey(path: JsonPath): string {
    return path.map((p) => (typeof p === "number" ? `[${p}]` : p)).join(".");
  }

  set(path: JsonPath, span: SourceSpan): void {
    this.locations.set(this.pathToKey(path), span);
  }

  get(path: JsonPath): SourceSpan | undefined {
    return this.locations.get(this.pathToKey(path));
  }

  getLineContent(lineNumber: number): string {
    return this.lines[lineNumber - 1] ?? "";
  }

  getContextLines(
    lineNumber: number,
    before: number,
    after: number,
  ): { lineNumber: number; content: string }[] {
    const result: { lineNumber: number; content: string }[] = [];
    const startLine = Math.max(1, lineNumber - before);
    const endLine = Math.min(this.lines.length, lineNumber + after);

    for (let i = startLine; i <= endLine; i++) {
      const content = this.lines[i - 1];
      if (content !== undefined) {
        result.push({ lineNumber: i, content });
      }
    }

    return result;
  }
}

interface ParserState {
  pos: number;
  line: number;
  column: number;
}

function charAt(source: string, pos: number): string {
  return source[pos] ?? "";
}

export function parseJsonWithSourceMap(source: string): {
  data: unknown;
  sourceMap: JsonSourceMap;
} {
  const sourceMap = new JsonSourceMap(source);
  const state: ParserState = { pos: 0, line: 1, column: 1 };

  function currentLocation(): SourceLocation {
    return {
      line: state.line,
      column: state.column,
      offset: state.pos,
      length: 0,
    };
  }

  function advance(count: number = 1): void {
    for (let i = 0; i < count; i++) {
      if (charAt(source, state.pos) === "\n") {
        state.line++;
        state.column = 1;
      } else {
        state.column++;
      }
      state.pos++;
    }
  }

  function skipWhitespace(): void {
    while (state.pos < source.length && /\s/.test(charAt(source, state.pos))) {
      advance();
    }
  }

  function parseString(): string {
    if (charAt(source, state.pos) !== '"') {
      throw new Error(`Expected " at position ${state.pos}`);
    }
    advance(); // skip opening quote

    let result = "";
    while (state.pos < source.length && charAt(source, state.pos) !== '"') {
      if (charAt(source, state.pos) === "\\") {
        advance();
        const escapeChar = charAt(source, state.pos);
        switch (escapeChar) {
          case "n":
            result += "\n";
            break;
          case "r":
            result += "\r";
            break;
          case "t":
            result += "\t";
            break;
          case "\\":
            result += "\\";
            break;
          case '"':
            result += '"';
            break;
          case "u": {
            advance();
            const hex = source.slice(state.pos, state.pos + 4);
            result += String.fromCharCode(parseInt(hex, 16));
            advance(3);
            break;
          }
          default:
            result += escapeChar;
        }
      } else {
        result += charAt(source, state.pos);
      }
      advance();
    }
    advance(); // skip closing quote
    return result;
  }

  function parseNumber(): number {
    const start = state.pos;
    if (charAt(source, state.pos) === "-") advance();

    while (state.pos < source.length && /\d/.test(charAt(source, state.pos))) {
      advance();
    }

    if (charAt(source, state.pos) === ".") {
      advance();
      while (
        state.pos < source.length &&
        /\d/.test(charAt(source, state.pos))
      ) {
        advance();
      }
    }

    if (
      charAt(source, state.pos) === "e" ||
      charAt(source, state.pos) === "E"
    ) {
      advance();
      const sign = charAt(source, state.pos);
      if (sign === "+" || sign === "-") advance();
      while (
        state.pos < source.length &&
        /\d/.test(charAt(source, state.pos))
      ) {
        advance();
      }
    }

    return parseFloat(source.slice(start, state.pos));
  }

  function parseValue(path: JsonPath): unknown {
    skipWhitespace();

    const start = currentLocation();
    const valueStart = currentLocation();
    let value: unknown;
    let valueEnd: SourceLocation;

    const char = charAt(source, state.pos);

    if (char === '"') {
      value = parseString();
      valueEnd = currentLocation();
    } else if (char === "-" || /\d/.test(char)) {
      value = parseNumber();
      valueEnd = currentLocation();
    } else if (char === "{") {
      value = parseObject(path);
      valueEnd = currentLocation();
    } else if (char === "[") {
      value = parseArray(path);
      valueEnd = currentLocation();
    } else if (source.slice(state.pos, state.pos + 4) === "true") {
      value = true;
      advance(4);
      valueEnd = currentLocation();
    } else if (source.slice(state.pos, state.pos + 5) === "false") {
      value = false;
      advance(5);
      valueEnd = currentLocation();
    } else if (source.slice(state.pos, state.pos + 4) === "null") {
      value = null;
      advance(4);
      valueEnd = currentLocation();
    } else {
      throw new Error(
        `Unexpected character '${char}' at line ${state.line}, column ${state.column}`,
      );
    }

    const end = currentLocation();

    sourceMap.set(path, {
      start,
      end,
      valueStart,
      valueEnd,
    });

    return value;
  }

  function parseObject(path: JsonPath): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    advance(); // skip {
    skipWhitespace();

    if (charAt(source, state.pos) === "}") {
      advance();
      return obj;
    }

    while (true) {
      skipWhitespace();

      const key = parseString();
      skipWhitespace();

      if (charAt(source, state.pos) !== ":") {
        throw new Error(`Expected : at position ${state.pos}`);
      }
      advance(); // skip :

      obj[key] = parseValue([...path, key]);

      skipWhitespace();
      if (charAt(source, state.pos) === "}") {
        advance();
        break;
      }
      if (charAt(source, state.pos) !== ",") {
        throw new Error(`Expected , or } at position ${state.pos}`);
      }
      advance(); // skip ,
    }

    return obj;
  }

  function parseArray(path: JsonPath): unknown[] {
    const arr: unknown[] = [];
    advance(); // skip [
    skipWhitespace();

    if (charAt(source, state.pos) === "]") {
      advance();
      return arr;
    }

    let index = 0;
    while (true) {
      arr.push(parseValue([...path, index]));
      index++;

      skipWhitespace();
      if (charAt(source, state.pos) === "]") {
        advance();
        break;
      }
      if (charAt(source, state.pos) !== ",") {
        throw new Error(`Expected , or ] at position ${state.pos}`);
      }
      advance(); // skip ,
    }

    return arr;
  }

  const data = parseValue([]);

  return { data, sourceMap };
}
