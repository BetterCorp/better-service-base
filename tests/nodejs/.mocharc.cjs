module.exports = {
  extension: ["ts"],
  spec: ["src/**/*.spec.ts", "src/**/*.test.ts", "src/**/plugin.ts"],
  require: ["ts-node/register", "./src/runner/setup.ts"],
  timeout: 120000,
  color: true,
};
