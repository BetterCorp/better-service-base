// import * as fs from "fs";
// import { cwd } from 'process';
// import * as path from 'path';

// (async () => {
//   const SBBaseDir = path.join(cwd(), "./node_modules/@bettercorp/service-base");
//   const secConfigFile = path.join(path.join(cwd(), './sec.config.json'));
//   if (!fs.existsSync(secConfigFile)) {
//     console.log("INIT: Copy new sec.config.json");
//     fs.copyFileSync(path.join(SBBaseDir, 'templates', 'sec.config.json'), secConfigFile);
//     console.log("INIT: Copy new sec.config.json - Completed");

//     await (new Promise((r) => setTimeout(r, 1000)));

//     const installer = path.join(SBBaseDir, "./lib/ServiceBase.js");
//     console.log("INSTALL FINAL : AUTOLOAD: " + installer);
//     const ServiceBase = require(installer); // eslint-disable-line @typescript-eslint/no-var-requires
//     const SB = new ServiceBase.default(cwd());
//     SB.config().then(() => console.log("INSTALL COMPLETE FOR @bettercorp/service-base")).catch(() => process.exit(1));

//     console.log(`sec.config.json ready to go`);
//   } else {
//     console.warn('sec.config.json already found... we`re not going to do anything');
//   }
// })();