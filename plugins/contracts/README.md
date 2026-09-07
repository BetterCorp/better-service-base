# Shared example contracts

`examples/*.json` are versioned portable contract inputs shared by the native example plugins. Each language generates its own clients before compilation or packaging. Generated clients and `.bsb` installation caches are not source files.

After changing a Node example contract, build the Node framework and todo plugin, then run `node scripts/export-example-contracts.mjs` from the repository root to refresh these inputs. Review the contract changes with the implementation changes. Normal native builds consume these checked-in inputs offline and do not require Node or a live Registry.
