# config-default

`config-default` is the built-in configuration plugin used by BSB to read deployment profiles, plugin mappings, and runtime options from `sec-config.yaml`.

## Responsibilities

- Resolves the active profile (`BSB_PROFILE`)
- Loads plugin mappings for `services`, `events`, and `observable`
- Exposes per-plugin configuration values to the runtime

## Notes

This is a core plugin maintained in the main `@bsb/base` project.
