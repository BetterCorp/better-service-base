const http = require("node:http");

const req = http.get("http://127.0.0.1:80/health", (res) => {
  res.resume();
  process.exit(res.statusCode && res.statusCode >= 200 && res.statusCode < 300 ? 0 : 1);
});

req.setTimeout(5000, () => {
  req.destroy();
  process.exit(1);
});

req.on("error", () => process.exit(1));
