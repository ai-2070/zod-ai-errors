import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseJson, formatZodError, createValidator } from "../src/index.js";

describe("parseJson", () => {
  it("returns success for valid input", () => {
    const schema = z.object({ name: z.string() });
    const result = parseJson(`{"name": "alice"}`, schema);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "alice" });
    }
  });

  it("returns formatted error for invalid input", () => {
    const schema = z.object({ age: z.number() });
    const result = parseJson(`{"age": "old"}`, schema);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.formatted).toContain("error[ZOD001]");
      expect(result.formatted).toContain("type mismatch");
      expect(result.diagnostics).toHaveLength(1);
    }
  });

  it("respects filename option", () => {
    const schema = z.object({ x: z.number() });
    const result = parseJson(`{"x": "y"}`, schema, { filename: "config.json" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.formatted).toContain("config.json");
    }
  });

  it("can disable colors", () => {
    const schema = z.object({ x: z.number() });
    const result = parseJson(`{"x": "y"}`, schema, { colors: false });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.formatted).not.toContain("\x1b[");
    }
  });

  it("throws when throw option is true", () => {
    const schema = z.object({ x: z.number() });

    expect(() => {
      parseJson(`{"x": "y"}`, schema, { throw: true });
    }).toThrow("error[ZOD001]");
  });
});

describe("formatZodError", () => {
  it("formats an existing ZodError", () => {
    const schema = z.object({ value: z.number() });
    const json = `{"value": "text"}`;
    const parsed = JSON.parse(json);
    const result = schema.safeParse(parsed);

    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = formatZodError(result.error, json, { colors: false });

      expect(formatted).toContain("error[ZOD001]");
      expect(formatted).toContain("value");
    }
  });
});

describe("createValidator", () => {
  it("creates a reusable validator", () => {
    const schema = z.object({ port: z.number() });
    const validate = createValidator(schema, { filename: "config.json" });

    const valid = validate(`{"port": 3000}`);
    expect(valid.success).toBe(true);

    const invalid = validate(`{"port": "three thousand"}`);
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.formatted).toContain("config.json");
    }
  });

  it("allows overriding options per call", () => {
    const schema = z.object({ x: z.number() });
    const validate = createValidator(schema, { filename: "default.json" });

    const result = validate(`{"x": "y"}`, { filename: "override.json" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.formatted).toContain("override.json");
    }
  });
});
