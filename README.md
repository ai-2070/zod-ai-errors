# Zod AI Errors

Beautiful, AI-friendly Zod error formatting with Rust-style diagnostics.

```
error[ZOD001]: invalid value for field `user.name`
  --> input.json:3:13
  |
1 | {
2 |   "user": {
3 |     "name": "",
  |             ^^ expected a non-empty string (min 2 chars), found string ""
4 |     "age": "sixteen",
5 |     "email": "not-an-email",
  |
   = help: provide a string with at least 2 characters

error[ZOD002]: type mismatch for field `user.age`
  --> input.json:4:12
  |
1 | {
2 |   "user": {
3 |     "name": "",
4 |     "age": "sixteen",
  |            ^^^^^^^^^ expected number, found string "sixteen"
5 |     "email": "not-an-email",
  |
   = help: convert the string "sixteen" to a number
```

## Features

- **Source location tracking** — Parses JSON while tracking line/column positions for each value
- **Rich diagnostics** — Converts Zod validation errors to structured diagnostics with full context
- **Rust-style output** — Beautiful error formatting inspired by the Rust compiler:
  - Error codes (`ZOD001`, `ZOD002`, etc.)
  - File location pointers (`--> input.json:3:12`)
  - Surrounding context lines with line numbers
  - Underlined error locations with `^^^`
  - Actionable help suggestions (`= help: ...`)
- **ANSI color support** — Colorized output for terminal display (can be disabled)
- **AI-friendly** — Structured output that's easy for LLMs to parse and act on

## Installation

```bash
npm install @ai2070/zod-ai-errors zod
```

Requires Zod v4.

## Usage

### Basic Usage

```typescript
import { z } from 'zod';
import { parseJson } from '@ai2070/zod-ai-errors';

const UserSchema = z.object({
  name: z.string().min(2),
  age: z.number().min(18),
  email: z.email(),
});

const jsonInput = `{
  "name": "",
  "age": "sixteen",
  "email": "not-valid"
}`;

const result = parseJson(jsonInput, UserSchema, {
  filename: 'user.json', // label (optional)
});

if (!result.success) {
  console.log(result.formatted);
  // Also available: result.diagnostics for programmatic access
}
```

### Format Existing ZodError

If you already have a `ZodError` from a previous validation:

```typescript
import { z } from 'zod';
import { formatZodError } from '@ai2070/zod-ai-errors';

const schema = z.object({ name: z.string().min(1) });
const result = schema.safeParse(JSON.parse(jsonString));

if (!result.success) {
  const formatted = formatZodError(result.error, jsonString, {
    filename: 'config.json', // label (optional)
    colors: true,
  });
  console.log(formatted);
}
```

### Create a Reusable Validator

```typescript
import { z } from 'zod';
import { createValidator } from '@ai2070/zod-ai-errors';

const ConfigSchema = z.object({
  port: z.number().min(1).max(65535),
  host: z.string(),
});

const validateConfig = createValidator(ConfigSchema, {
  filename: 'config.json', // label (optional)
  colors: true,
});

const result = validateConfig(jsonString);
if (!result.success) {
  console.error(result.formatted);
  process.exit(1);
}

// result.data is typed as { port: number; host: string }
```

## API

### `parseJson(jsonString, schema, options?)`

Parses and validates JSON against a Zod schema.

**Parameters:**
- `jsonString: string` — The JSON string to parse and validate
- `schema: z.ZodType` — The Zod schema to validate against
- `options?: FormatOptions` — Formatting options

**Returns:** `ValidationResult<T> | ValidationError`

```typescript
// Success
{ success: true, data: T }

// Failure
{ success: false, formatted: string, diagnostics: Diagnostic[] }
```

### `formatZodError(error, jsonString, options?)`

Formats an existing `ZodError` with source context.

**Parameters:**
- `error: z.ZodError` — The Zod error to format
- `jsonString: string` — The original JSON string (for source locations)
- `options?: RenderOptions` — Rendering options

**Returns:** `string`

### `createValidator(schema, defaultOptions?)`

Creates a reusable validator function.

**Parameters:**
- `schema: z.ZodType` — The Zod schema to validate against
- `defaultOptions?: FormatOptions` — Default formatting options

**Returns:** `(jsonString: string, options?: FormatOptions) => ValidationResult<T> | ValidationError`

### Options

```typescript
interface FormatOptions {
  // Filename to display in error locations (default: 'input.json')
  filename?: string;
  
  // Enable ANSI colors (default: true)
  colors?: boolean;
  
  // Number of context lines to show before/after error (default: 4)
  contextLines?: number;
  
  // Throw an error instead of returning ValidationError (default: false)
  throw?: boolean;
}
```

### Diagnostic Type

For programmatic access to error details:

```typescript
interface Diagnostic {
  code: string;           // e.g., 'ZOD001'
  severity: 'error' | 'warning' | 'info';
  message: string;        // e.g., 'type mismatch for field `user.age`'
  path: (string | number)[];  // e.g., ['user', 'age']
  span?: SourceSpan;      // Source location info
  help?: string;          // Actionable suggestion
  expected?: string;      // Expected type/value
  received?: string;      // Actual type/value
}
```

## Examples

Run the included example:

```bash
npm run example
```

See the [examples](./examples) directory for more usage patterns.

## License

Apache-2.0
