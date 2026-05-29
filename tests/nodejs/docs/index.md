# @bsb/tests

Shared test runner for BSB plugins.

## Usage

```bash
npx @bsb/tests
npx @bsb/tests --plugin events-rabbitmq
npx @bsb/tests --no-coverage
```

## bsb-tests.json

Place `bsb-tests.json` next to `bsb-plugin.json`.

Format:

```json
{
  "nodejs": [
    {
      "id": "events-rabbitmq",
      "skip": false,
      "default": {
        "config": {
          "endpoints": ["amqp://127.0.0.1:5670"]
        },
        "setup": "scripts/test-setup.sh",
        "dispose": "scripts/test-dispose.sh"
      },
      "tests": [
        {
          "name": "primary",
          "skip": false,
          "config": {
            "prefetch": 10
          },
          "setup": {
            "beforeAll": "scripts/test-setup.js",
            "afterAll": "scripts/test-teardown.js"
          },
          "dispose": {
            "afterAll": "scripts/test-dispose.js"
          }
        }
      ]
    }
  ]
}
```

Notes:

- `skip: true` skips plugin tests or specific test cases.
- `setup` can be a single script path or `{ "beforeAll": "...", "afterAll": "..." }`.
- `dispose` is an optional cleanup hook (run after tests).
- If `tests` is empty, the `default` config is used once.
- Script paths are relative to the plugin root.

## Custom Tests

Add custom tests under `tests/{plugin-id}` in the repo root.

Layout:

```
tests/
  events-rabbitmq/
    _before.ts
    _after.ts
    connection.ts
    streaming/
      _before.ts
      _after.ts
      roundtrip.ts
```

Rules:

- Each `*.ts/js` file (not starting with `_`) exports a single test function.
- Files starting with `_` are ignored as tests and can be used for helpers.
- `_before` and `_after` run before/after all tests in the same folder.
- If `_before` returns a value, it is passed to each test in that folder.

Test function signature:

```ts
export default async function test(ctx: any, data?: any) {
  // ctx: { pluginId, pluginName, pluginRoot, config, group }
  // data: value returned by _before (optional)
}
```

## Built-in Suites

- `events-*` plugins
- `observable-*` plugins
- `events-default` additional suite
- `observable-default` additional suite
- `config-default`
