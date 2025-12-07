import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseJsonWithSourceMap } from "../src/source-map.js";
import { zodErrorToDiagnostics } from "../src/diagnostics.js";

describe("zodErrorToDiagnostics", () => {
  it("converts type mismatch errors", () => {
    const schema = z.object({ age: z.number() });
    const json = `{"age": "twenty"}`;
    const { data, sourceMap } = parseJsonWithSourceMap(json);
    const result = schema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const diagnostics = zodErrorToDiagnostics(result.error, sourceMap, data);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.code).toBe("ZOD001");
      expect(diagnostics[0]?.message).toContain("type mismatch");
      expect(diagnostics[0]?.path).toEqual(["age"]);
      expect(diagnostics[0]?.expected).toBe("number");
      expect(diagnostics[0]?.received).toContain("string");
    }
  });

  it("converts too_small errors for strings", () => {
    const schema = z.object({ name: z.string().min(3) });
    const json = `{"name": "ab"}`;
    const { data, sourceMap } = parseJsonWithSourceMap(json);
    const result = schema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const diagnostics = zodErrorToDiagnostics(result.error, sourceMap, data);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.message).toContain("invalid value");
      expect(diagnostics[0]?.help).toContain("at least 3 characters");
    }
  });

  it("converts too_small errors for numbers", () => {
    const schema = z.object({ age: z.number().min(18) });
    const json = `{"age": 16}`;
    const { data, sourceMap } = parseJsonWithSourceMap(json);
    const result = schema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const diagnostics = zodErrorToDiagnostics(result.error, sourceMap, data);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.expected).toContain("≥ 18");
    }
  });

  it("converts email format errors", () => {
    const schema = z.object({ email: z.email() });
    const json = `{"email": "not-an-email"}`;
    const { data, sourceMap } = parseJsonWithSourceMap(json);
    const result = schema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const diagnostics = zodErrorToDiagnostics(result.error, sourceMap, data);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.message).toContain("email");
      expect(diagnostics[0]?.help).toContain("valid email address");
    }
  });

  it("handles nested paths", () => {
    const schema = z.object({
      user: z.object({
        profile: z.object({
          age: z.number(),
        }),
      }),
    });
    const json = `{"user": {"profile": {"age": "old"}}}`;
    const { data, sourceMap } = parseJsonWithSourceMap(json);
    const result = schema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const diagnostics = zodErrorToDiagnostics(result.error, sourceMap, data);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.path).toEqual(["user", "profile", "age"]);
      expect(diagnostics[0]?.message).toContain("user.profile.age");
    }
  });

  it("handles multiple errors", () => {
    const schema = z.object({
      name: z.string().min(1),
      age: z.number(),
    });
    const json = `{"name": "", "age": "old"}`;
    const { data, sourceMap } = parseJsonWithSourceMap(json);
    const result = schema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const diagnostics = zodErrorToDiagnostics(result.error, sourceMap, data);

      expect(diagnostics.length).toBeGreaterThanOrEqual(2);
      expect(diagnostics[0]?.code).toBe("ZOD001");
      expect(diagnostics[1]?.code).toBe("ZOD002");
    }
  });

  it("includes source spans", () => {
    const schema = z.object({ value: z.number() });
    const json = `{
  "value": "text"
}`;
    const { data, sourceMap } = parseJsonWithSourceMap(json);
    const result = schema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const diagnostics = zodErrorToDiagnostics(result.error, sourceMap, data);

      expect(diagnostics[0]?.span).toBeDefined();
      expect(diagnostics[0]?.span?.valueStart.line).toBe(2);
    }
  });

  it("uses custom error messages as help text", () => {
    const schema = z.object({
      name: z
        .string()
        .min(2, { message: "Name must be at least 2 characters!" }),
    });
    const json = `{"name": "X"}`;
    const { data, sourceMap } = parseJsonWithSourceMap(json);
    const result = schema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const diagnostics = zodErrorToDiagnostics(result.error, sourceMap, data);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.help).toBe("Name must be at least 2 characters!");
    }
  });

  it("uses custom type error messages as help text", () => {
    const schema = z.object({
      age: z.number({ message: "Please provide a valid age as a number" }),
    });
    const json = `{"age": "old"}`;
    const { data, sourceMap } = parseJsonWithSourceMap(json);
    const result = schema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const diagnostics = zodErrorToDiagnostics(result.error, sourceMap, data);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.help).toBe(
        "Please provide a valid age as a number",
      );
    }
  });

  it("uses generated help for default Zod messages", () => {
    const schema = z.object({
      email: z.email(), // no custom message
    });
    const json = `{"email": "bad"}`;
    const { data, sourceMap } = parseJsonWithSourceMap(json);
    const result = schema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const diagnostics = zodErrorToDiagnostics(result.error, sourceMap, data);

      expect(diagnostics).toHaveLength(1);
      // Should use our generated help, not Zod's "Invalid email address"
      expect(diagnostics[0]?.help).toContain("provide a valid email address");
    }
  });

  it("handles mix of custom and default messages", () => {
    const schema = z.object({
      name: z.string().min(2, { message: "Custom name error" }),
      age: z.number(), // default message
    });
    const json = `{"name": "X", "age": "old"}`;
    const { data, sourceMap } = parseJsonWithSourceMap(json);
    const result = schema.safeParse(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      const diagnostics = zodErrorToDiagnostics(result.error, sourceMap, data);

      expect(diagnostics).toHaveLength(2);
      // First error has custom message
      expect(diagnostics[0]?.help).toBe("Custom name error");
      // Second error uses generated help
      expect(diagnostics[1]?.help).toContain("convert the string");
    }
  });
});
