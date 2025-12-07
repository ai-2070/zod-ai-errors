/**
 * Example: Compact mode - all errors in a single window
 */

import { z } from "zod";
import { parseJson } from "../src/index";

// Define a schema with various validations
const UserSchema = z.object({
  user: z.object({
    name: z.string().min(2),
    age: z.number().min(18),
    email: z.email(),
    address: z.object({
      street: z.string().min(5),
      zipcode: z.string().length(5),
    }),
  }),
});

// Invalid JSON input
const jsonInput = `{
  "user": {
    "name": "",
    "age": "sixteen",
    "email": "not-an-email",
    "address": {
      "street": "123",
      "zipcode": "12"
    }
  }
}`;

console.log("Validating JSON input...\n");
console.log("Input:");
console.log(jsonInput);
console.log("\n" + "=".repeat(60) + "\n");

console.log("Default mode (separate windows):\n");

const result1 = parseJson(jsonInput, UserSchema, {
  filename: "input.json",
  contextLines: 2,
  colors: true,
});

if (!result1.success) {
  console.log(result1.formatted);
}

console.log("\n" + "=".repeat(60) + "\n");

console.log("Compact mode (single window):\n");

const result2 = parseJson(jsonInput, UserSchema, {
  filename: "input.json",
  compact: true,
  colors: true,
});

if (!result2.success) {
  console.log(result2.formatted);
}
