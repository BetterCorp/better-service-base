import path from "path";
import Module from "module";

const localBaseEntry = process.env.BSB_TEST_LOCAL_BASE_ENTRY;

if (localBaseEntry) {
  const resolved = path.resolve(localBaseEntry);
  const originalResolve = (Module as any)._resolveFilename as (
    request: string,
    parent: NodeModule | undefined,
    isMain: boolean,
    options?: any,
  ) => string;

  (Module as any)._resolveFilename = function (
    request: string,
    parent: NodeModule | undefined,
    isMain: boolean,
    options?: any,
  ) {
    if (request === "@bsb/base") {
      return resolved;
    }
    return originalResolve.call(this, request, parent, isMain, options);
  };
}
