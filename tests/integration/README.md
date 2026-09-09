# Native integration checks

These use real RabbitMQ and PostgreSQL services in the `native-integration` build job. They do not run in the fast mocked regression suites.

```sh
npm run tsc --workspace nodejs
node node_modules/typescript/bin/tsc -p plugins/nodejs/events-rabbitmq/tsconfig.json
node node_modules/typescript/bin/tsc -p plugins/nodejs/config-vault/tsconfig.json
python -m pip install -e ./python -e ./plugins/python/builtins
dotnet build dotnet/tests/RabbitPeer -c Release
BSB_RABBITMQ_URL=amqp://user:password@localhost:5672 python tests/integration/rabbit_languages.py
BSB_POSTGRES_URL=postgresql://user:password@localhost/testdb node tests/integration/vault-postgres.mjs
```

Rabbit checks every directed Node/.NET/Python pair for RPC payload/trace preservation and a 1 MiB binary stream. Requests are also sent before a Node listener exists, and both native peer processes are killed during a request to exercise broker redelivery. Use a disposable broker: queues have a unique test prefix and expire according to protocol TTLs, while the dead-letter exchange persists.

The PostgreSQL check creates and removes its own random schema, seeds the pre-language table layout, runs actual migrations twice/concurrently, and verifies independent same-version implementations, publisher rotation and published profile language locking. The test account needs schema creation privileges. Existing schemas are not modified.
