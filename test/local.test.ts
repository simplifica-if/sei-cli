import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { lerDiretorioProcesso, lerZipProcesso } from "../src/infra/local";
import {
  carregarProcessoParaInspecao,
  inspecionarUltimaAtualizacao,
  listarUltimosDocumentos,
} from "../src/aplicacao/inspecionar";

const temporarios: string[] = [];

async function criarTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sei-cli-test-"));
  temporarios.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(temporarios.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("extração local", () => {
  test("lê diretório e escreve processo.json com documentos copiados", async () => {
    const base = await criarTempDir();
    const entrada = path.join(base, "entrada");
    const saida = path.join(base, "saida");
    await mkdir(entrada, { recursive: true });
    await writeFile(
      path.join(entrada, "[1]-1234567 despacho.html"),
      "Documento assinado eletronicamente por Maria Silva, Coordenadora, em 25/05/2026, às 13:44",
      { encoding: "utf-8" },
    );

    const resultado = await lerDiretorioProcesso({
      numeroProcesso: "23411.018179/2025-81",
      diretorio: entrada,
      saida,
    });

    expect(resultado.diretorio_execucao).toBe(saida);
    expect(resultado.processo.origem).toBe("diretorio-local");
    expect(resultado.processo.documentos).toHaveLength(1);
    expect(resultado.processo.documentos[0]?.numero_sei).toBe("1234567");
    expect(resultado.processo.documentos[0]?.caminho_relativo).toBe(
      "documentos/[1]-1234567 despacho.html",
    );
    await expect(readFile(path.join(saida, "logs", "execucao.log"), "utf-8")).resolves.toContain(
      "copiado e analisado",
    );

    const processo = await carregarProcessoParaInspecao(saida);
    expect(listarUltimosDocumentos(processo, 1)[0]?.titulo).toContain("despacho");
    expect(inspecionarUltimaAtualizacao(processo).ultimo_documento?.numero_sei).toBe("1234567");
  });

  test("lê ZIP e preserva arquivo original", async () => {
    const base = await criarTempDir();
    const zipPath = path.join(base, "processo.zip");
    const saida = path.join(base, "saida-zip");
    const zip = zipSync({
      "docs/[2]-7654321 parecer.pdf": strToU8("conteúdo"),
    });
    await writeFile(zipPath, zip);

    const resultado = await lerZipProcesso({
      numeroProcesso: "23411.018179/2025-81",
      zip: zipPath,
      saida,
    });

    expect(resultado.processo.origem).toBe("zip-local");
    expect(resultado.processo.artefatos.zip_original).toBe("processo.zip");
    expect(resultado.processo.documentos[0]?.numero_sei).toBe("7654321");
    expect(resultado.processo.documentos[0]?.tipo_documento).toBe("PDF");
  });
});
