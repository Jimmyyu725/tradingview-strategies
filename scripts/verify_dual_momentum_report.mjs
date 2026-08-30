import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyReport } from "../src/dual-momentum/verify.mjs";

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2];
  if (!directory) {
    process.stderr.write("Usage: node scripts/verify_dual_momentum_report.mjs <report-directory>\n");
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(JSON.stringify(verifyReport(path.resolve(directory))) + "\n");
    } catch (error) {
      process.stderr.write(error.stack + "\n");
      process.exitCode = 1;
    }
  }
}
