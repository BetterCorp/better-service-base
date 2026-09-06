// Run after building Node core and demo-todo-app. These portable contracts are shared by native examples.
import { mkdir, writeFile } from 'node:fs/promises';
import { exportEventSchemas } from '../nodejs/lib/interfaces/schema-events.js';
import { exportSchema } from 'anyvali';

const names = [...Array.from({ length: 5 }, (_, i) => `service-default${i}`), 'service-benchmarkify', 'service-demo-todo'];
const root = new URL('../dotnet/examples/ExamplePlugins/.bsb/schemas/', import.meta.url);
await mkdir(root, { recursive: true });
for (const name of names) {
  const source = name === 'service-demo-todo' ? '../plugins/nodejs/demo-todo-app/lib/plugins/service-demo-todo/index.js' : `../nodejs/lib/plugins/${name}/index.js`;
  const plugin = await import(new URL(source, import.meta.url));
  const schema = { ...exportEventSchemas(name, plugin.EventSchemas), version: '1.0.0' };
  if (plugin.TodoConfigSchema) schema.configSchema = exportSchema(plugin.TodoConfigSchema);
  await writeFile(new URL(`${name}.json`, root), JSON.stringify(schema, null, 2) + '\n');
}
