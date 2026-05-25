import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const temporarios: string[] = [];

async function criarTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sei-cli-test-cli-"));
  temporarios.push(dir);
  return dir;
}

async function rodarCli(args: string[]) {
  const processo = Bun.spawn(["bun", "run", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      SEI_USUARIO: "",
      SEI_SENHA: "",
    },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(processo.stdout).text(),
    new Response(processo.stderr).text(),
    processo.exited,
  ]);
  return { stdout, stderr, code };
}

afterEach(async () => {
  await Promise.all(temporarios.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("CLI", () => {
  test("imprime ajuda em português", async () => {
    const resultado = await rodarCli(["ajuda"]);

    expect(resultado.code).toBe(0);
    expect(resultado.stdout).toContain("sei extrair processo");
    expect(resultado.stdout).toContain("Variáveis para extrair do SEI");
  });

  test("falha quando leitura local não recebe origem", async () => {
    const resultado = await rodarCli(["ler", "processo", "23411.018179/2025-81"]);

    expect(resultado.code).toBe(1);
    expect(resultado.stderr).toContain("Informe --zip");
  });

  test("executa leitura local com saída JSON", async () => {
    const base = await criarTempDir();
    const entrada = path.join(base, "entrada");
    const saida = path.join(base, "run");
    await mkdir(entrada, { recursive: true });
    await writeFile(
      path.join(entrada, "[1]-1234567 despacho.html"),
      "Documento assinado eletronicamente por Maria Silva, Coordenadora, em 25/05/2026, às 13:44",
      "utf-8",
    );

    const resultado = await rodarCli([
      "ler",
      "processo",
      "23411.018179/2025-81",
      "--diretorio",
      entrada,
      "--saida",
      saida,
      "--json",
    ]);

    expect(resultado.code).toBe(0);
    const json = JSON.parse(resultado.stdout);
    expect(json.processo.origem).toBe("diretorio-local");
    expect(json.processo.documentos[0].numero_sei).toBe("1234567");
  });
});

