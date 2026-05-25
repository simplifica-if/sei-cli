import path from "node:path";
import { config as carregarDotenv } from "dotenv";

export function carregarEnvLocal(cwd = process.cwd()) {
  carregarDotenv({
    path: path.join(cwd, ".env.local"),
    override: false,
    quiet: true,
  });
}

