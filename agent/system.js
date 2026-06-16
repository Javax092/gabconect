import os from "os";

export function getSystemProfile() {
  const totalRAM = os.totalmem() / (1024 ** 3);
  const freeRAM = os.freemem() / (1024 ** 3);

  return {
    cpuCores: os.cpus().length,
    totalRAM: totalRAM.toFixed(2),
    freeRAM: freeRAM.toFixed(2),
  };
}
