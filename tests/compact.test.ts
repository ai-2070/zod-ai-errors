import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseJson } from "../src/index.js";

describe("compact mode", () => {
  const UserSchema = z.object({
    name: z.string().min(2),
    age: z.number(),
    email: z.email(),
  });

  const jsonInput = `{
  "name": "",
  "age": "sixteen",
  "email": "not-an-email"
}`;

  it("renders errors in separate windows by default", () => {
    const result = parseJson(jsonInput, UserSchema, {
      filename: "test.json",
      colors: false,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // Each error should have its own header
      const errorHeaders = result.formatted.match(/^error\[ZOD\d+\]:/gm);
      expect(errorHeaders).toHaveLength(3);

      // Should have multiple separate windows (each with its own --> pointer)
      const locationPointers = result.formatted.match(/^\s+-->/gm);
      expect(locationPointers).toHaveLength(3);
    }
  });

  it("renders all errors in a single window with compact: true", () => {
    const result = parseJson(jsonInput, UserSchema, {
      filename: "test.json",
      colors: false,
      compact: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // Should have a summary header instead of individual error headers
      expect(result.formatted).toMatch(/^error: found 3 errors/);

      // Should only have one location pointer
      const locationPointers = result.formatted.match(/^\s+-->/gm);
      expect(locationPointers).toHaveLength(1);

      // All underlines should be present
      const underlines = result.formatted.match(/\^+/g);
      expect(underlines).toHaveLength(3);
    }
  });

  it("includes all help messages at the bottom in compact mode", () => {
    const result = parseJson(jsonInput, UserSchema, {
      filename: "test.json",
      colors: false,
      compact: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const helpMatches = result.formatted.match(/= help:/g);
      expect(helpMatches).toHaveLength(3);
    }
  });

  it("handles single error in compact mode", () => {
    const singleErrorJson = `{ "name": "Jo", "age": "bad", "email": "test@example.com" }`;

    const result = parseJson(singleErrorJson, UserSchema, {
      filename: "test.json",
      colors: false,
      compact: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.formatted).toMatch(/^error: found 1 error/);
    }
  });

  it("handles errors on adjacent lines", () => {
    const adjacentJson = `{
  "name": "",
  "age": 10,
  "email": "bad"
}`;

    const result = parseJson(adjacentJson, UserSchema, {
      filename: "test.json",
      colors: false,
      compact: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // Should have annotations for both errors
      expect(result.formatted).toContain("^^");
      expect(result.formatted).toContain('"name"');
      expect(result.formatted).toContain('"email"');
    }
  });

  it("uses ellipsis for gaps between errors", () => {
    const Schema = z.object({
      first: z.string().min(5),
      a: z.string(),
      b: z.string(),
      c: z.string(),
      d: z.string(),
      last: z.string().min(5),
    });

    const gappedJson = `{
  "first": "x",
  "a": "ok",
  "b": "ok",
  "c": "ok",
  "d": "ok",
  "last": "y"
}`;

    const result = parseJson(gappedJson, Schema, {
      filename: "test.json",
      colors: false,
      compact: true,
      contextLines: 1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // Should have ellipsis between the two errors
      expect(result.formatted).toContain("...");
    }
  });

  it("respects contextLines option in compact mode", () => {
    const result = parseJson(jsonInput, UserSchema, {
      filename: "test.json",
      colors: false,
      compact: true,
      contextLines: 0,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // With contextLines: 0, should only show error lines
      // The opening brace line should not be shown as context
      const lines = result.formatted.split("\n");
      const contentLines = lines.filter((l) => /^\s*\d+\s*\|/.test(l));
      // Should only have the 3 error lines
      expect(contentLines.length).toBe(3);
    }
  });
});
