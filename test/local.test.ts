import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { lerDiretorioProcesso, lerZipProcesso } from "../src/infra/local";
import {
  carregarProcessoParaInspecao,
  compararAtualizacaoProcesso,
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
      numeroProcesso: "00000.000000/0000-00",
      diretorio: entrada,
      saida,
    });

    expect(resultado.diretorio_execucao).toBe(saida);
    expect(resultado.processo.origem).toBe("diretorio-local");
    expect(resultado.processo.documentos).toHaveLength(1);
    expect(resultado.processo.documentos[0]?.numero_sei).toBe("1234567");
    expect(resultado.processo.documentos[0]?.assinantes_html).toEqual(["Maria Silva"]);
    expect(resultado.processo.documentos[0]?.caminho_relativo).toBe(
      "documentos/[1]-1234567 despacho.html",
    );
    await expect(readFile(path.join(saida, "logs", "execucao.log"), "utf-8")).resolves.toContain(
      "copiado e analisado",
    );
    const instrucoesAgente = await readFile(path.join(saida, "AGENTS.md"), "utf-8");
    expect(instrucoesAgente).toContain("processo SEI 00000.000000/0000-00");
    expect(instrucoesAgente).toContain("processo.json");
    expect(instrucoesAgente).toContain("documentos[].caminho_relativo");
    expect(instrucoesAgente).toContain("documentos[].unidade_sei");
    expect(instrucoesAgente).toContain("documentos[].caminho_hierarquico");
    expect(instrucoesAgente).toContain("documentos[].assinantes_html");
    expect(instrucoesAgente).toContain("ultima_movimentacao");
    expect(instrucoesAgente).toContain("histórico completo");

    const processo = await carregarProcessoParaInspecao(saida);
    expect(listarUltimosDocumentos(processo, 1)[0]?.titulo).toContain("despacho");
    expect(inspecionarUltimaAtualizacao(processo).ultimo_documento?.numero_sei).toBe("1234567");
  });

  test("recusa saída já populada para não misturar snapshots", async () => {
    const base = await criarTempDir();
    const entradaInicial = path.join(base, "entrada-inicial");
    const entradaNova = path.join(base, "entrada-nova");
    const saida = path.join(base, "saida");
    await mkdir(entradaInicial, { recursive: true });
    await mkdir(entradaNova, { recursive: true });
    await writeFile(path.join(entradaInicial, "[1]-1111111 antigo.html"), "antigo", "utf-8");
    await writeFile(path.join(entradaNova, "[1]-2222222 novo.html"), "novo", "utf-8");

    await lerDiretorioProcesso({
      numeroProcesso: "00000.000000/0000-00",
      diretorio: entradaInicial,
      saida,
    });

    await expect(
      lerDiretorioProcesso({
        numeroProcesso: "00000.000000/0000-00",
        diretorio: entradaNova,
        saida,
      }),
    ).rejects.toThrow("Diretório de saída já contém arquivos");

    const processo = await carregarProcessoParaInspecao(saida);
    expect(processo.documentos.map((documento) => documento.numero_sei)).toEqual(["1111111"]);
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
      numeroProcesso: "00000.000000/0000-00",
      zip: zipPath,
      saida,
    });

    expect(resultado.processo.origem).toBe("zip-local");
    expect(resultado.processo.artefatos.zip_original).toBe("processo.zip");
    expect(resultado.processo.documentos[0]?.numero_sei).toBe("7654321");
    expect(resultado.processo.documentos[0]?.tipo_documento).toBe("PDF");
    await expect(readFile(path.join(saida, "AGENTS.md"), "utf-8")).resolves.toContain(
      "processo.zip",
    );
  });

  test("compara atualização entre snapshot local e histórico remoto", async () => {
    const movimentacao = {
      ocorrido_em: "2026-05-25T13:44:00-03:00",
      unidade: "PROENS",
      usuario: "1234567",
      descricao: "Gerado documento público 1234567 (Despacho)",
      ordem: 0,
    };
    const processoLocal = {
      versao_schema: 1 as const,
      numero_processo: "00000.000000/0000-00",
      extraido_em: "2026-05-25T16:44:00.000Z",
      origem: "playwright-sei" as const,
      ultima_movimentacao: movimentacao,
      historico: [movimentacao],
      documentos: [],
      eventos: [],
      artefatos: {
        diretorio_documentos: "documentos",
      },
    };

    expect(
      compararAtualizacaoProcesso({
        processoLocal,
        historicoRemoto: [movimentacao],
        snapshot: "/tmp/snapshot",
      }).atualizado,
    ).toBe(true);

    expect(
      compararAtualizacaoProcesso({
        processoLocal,
        historicoRemoto: [{ ...movimentacao, descricao: "Processo recebido na unidade" }],
      }).precisa_extrair,
    ).toBe(true);
  });
});
