import fs from "fs-extra";

export function readFile(filePath) {
  return fs.readFileSync(filePath, "utf-8");
}

export function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, "utf-8");
}

export function backupFile(filePath) {
  const backup = `${filePath}.backup-${Date.now()}`;
  fs.copySync(filePath, backup);
  return backup;
}
