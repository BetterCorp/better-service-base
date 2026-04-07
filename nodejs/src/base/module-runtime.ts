import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function getModuleDir(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
}

export function isMainModule(importMetaUrl: string): boolean {
  if (!process.argv[1]) {
    return false;
  }

  return pathToFileURL(resolve(process.argv[1])).href === importMetaUrl;
}

export function toImportUrl(filePath: string): string {
  return pathToFileURL(resolve(filePath)).href;
}
