import {ServiceBase} from "./serviceBase/serviceBase";
const runApp = async () => {
  const CWD = process.env.APP_DIR || process.cwd();
  const SB = new ServiceBase(false);
  await SB.setupSelf();
  await SB.findPlugins(CWD);
  await SB.setupConfig();
  await SB.setupLogger();
  //await SB.config();
  //await SB.construct();
  //await SB.init();
  await SB.run();
};
runApp();