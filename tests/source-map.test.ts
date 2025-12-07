import { describe, it, expect } from 'vitest';
import { parseJsonWithSourceMap } from '../src/source-map.js';

describe('parseJsonWithSourceMap', () => {
  it('parses simple object and tracks locations', () => {
    const json = `{"name": "test"}`;
    const { data, sourceMap } = parseJsonWithSourceMap(json);

    expect(data).toEqual({ name: 'test' });

    const nameSpan = sourceMap.get(['name']);
    expect(nameSpan).toBeDefined();
    expect(nameSpan?.valueStart.column).toBe(10);
  });

  it('parses nested objects', () => {
    const json = `{
  "user": {
    "name": "alice"
  }
}`;
    const { data, sourceMap } = parseJsonWithSourceMap(json);

    expect(data).toEqual({ user: { name: 'alice' } });

    const userSpan = sourceMap.get(['user']);
    expect(userSpan).toBeDefined();
    expect(userSpan?.valueStart.line).toBe(2);

    const nameSpan = sourceMap.get(['user', 'name']);
    expect(nameSpan).toBeDefined();
    expect(nameSpan?.valueStart.line).toBe(3);
  });

  it('parses arrays', () => {
    const json = `{"items": [1, 2, 3]}`;
    const { data, sourceMap } = parseJsonWithSourceMap(json);

    expect(data).toEqual({ items: [1, 2, 3] });

    const item0Span = sourceMap.get(['items', 0]);
    expect(item0Span).toBeDefined();

    const item2Span = sourceMap.get(['items', 2]);
    expect(item2Span).toBeDefined();
  });

  it('parses all primitive types', () => {
    const json = `{
  "string": "hello",
  "number": 42,
  "float": 3.14,
  "bool": true,
  "null": null
}`;
    const { data } = parseJsonWithSourceMap(json);

    expect(data).toEqual({
      string: 'hello',
      number: 42,
      float: 3.14,
      bool: true,
      null: null,
    });
  });

  it('handles escape sequences in strings', () => {
    const json = `{"text": "line1\\nline2\\ttab"}`;
    const { data } = parseJsonWithSourceMap(json);

    expect(data).toEqual({ text: 'line1\nline2\ttab' });
  });

  it('tracks correct line numbers', () => {
    const json = `{
  "a": 1,
  "b": 2,
  "c": 3
}`;
    const { sourceMap } = parseJsonWithSourceMap(json);

    expect(sourceMap.get(['a'])?.valueStart.line).toBe(2);
    expect(sourceMap.get(['b'])?.valueStart.line).toBe(3);
    expect(sourceMap.get(['c'])?.valueStart.line).toBe(4);
  });

  it('provides context lines', () => {
    const json = `{
  "a": 1,
  "b": 2,
  "c": 3,
  "d": 4
}`;
    const { sourceMap } = parseJsonWithSourceMap(json);

    const context = sourceMap.getContextLines(3, 1, 1);
    expect(context).toHaveLength(3);
    expect(context[0]?.lineNumber).toBe(2);
    expect(context[1]?.lineNumber).toBe(3);
    expect(context[2]?.lineNumber).toBe(4);
  });
});
