import { ServiceBase } from "./serviceBase/serviceBase";

const runApp = async () => {
  const CWD = process.env.APP_DIR || process.cwd();
  const SB = new ServiceBase(true, false, CWD);
  await SB.init();
  await SB.run();
};
runApp();
