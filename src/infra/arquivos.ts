import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import type { ProcessoExtraido, ResultadoExtracao } from "../tipos";
import { formatarDataHoraParaArquivo } from "../dominio/tempo";
import { normalizarSegmentoDiretorio } from "../dominio/texto";

export async function calcularSha256Arquivo(caminhoArquivo: string) {
  const buffer = await readFile(caminhoArquivo);
  return createHash("sha256").update(buffer).digest("hex");
}

export async function listarArquivosRecursivos(diretorio: string): Promise<string[]> {
  const entradas = await readdir(diretorio, { withFileTypes: true });
  const resultados = await Promise.all(
    entradas.map(async (entrada) => {
      const caminho = path.join(diretorio, entrada.name);
      if (entrada.isDirectory()) {
        return listarArquivosRecursivos(caminho);
      }
      return [caminho];
    }),
  );
  return resultados.flat();
}

export async function copiarDiretorioRecursivo(origem: string, destino: string) {
  await mkdir(destino, { recursive: true });
  const arquivos = await listarArquivosRecursivos(origem);
  await Promise.all(
    arquivos.map(async (arquivo) => {
      const relativo = path.relative(origem, arquivo);
      const destinoArquivo = path.join(destino, relativo);
      await mkdir(path.dirname(destinoArquivo), { recursive: true });
      await copyFile(arquivo, destinoArquivo);
    }),
  );
}

function caminhoZipEhSeguro(relativo: string) {
  const normalizado = path.posix.normalize(relativo.replaceAll("\\", "/"));
  return normalizado && !normalizado.startsWith("../") && normalizado !== ".." && !path.isAbsolute(normalizado);
}

export async function extrairZipParaDiretorio(caminhoZip: string, destino: string) {
  await rm(destino, { recursive: true, force: true });
  await mkdir(destino, { recursive: true });
  const zip = unzipSync(new Uint8Array(await readFile(caminhoZip)));
  const arquivos: string[] = [];

  for (const [nome, conteudo] of Object.entries(zip)) {
    if (!caminhoZipEhSeguro(nome) || nome.endsWith("/")) {
      continue;
    }
    const caminhoDestino = path.join(destino, nome);
    await mkdir(path.dirname(caminhoDestino), { recursive: true });
    await writeFile(caminhoDestino, conteudo);
    arquivos.push(caminhoDestino);
  }

  return arquivos;
}

export async function prepararDiretorioExecucao(args: {
  numeroProcesso: string;
  saida?: string;
  cwd?: string;
  instante?: Date;
}) {
  const cwd = args.cwd ?? process.cwd();
  const diretorioExecucao = args.saida
    ? path.resolve(cwd, args.saida)
    : path.join(
        cwd,
        "dados",
        "sei",
        normalizarSegmentoDiretorio(args.numeroProcesso),
        formatarDataHoraParaArquivo(args.instante),
      );

  await mkdir(path.join(diretorioExecucao, "documentos"), { recursive: true });
  await mkdir(path.join(diretorioExecucao, "logs"), { recursive: true });
  await mkdir(path.join(diretorioExecucao, "diagnostico"), { recursive: true });

  return {
    diretorioExecucao,
    diretorioDocumentos: path.join(diretorioExecucao, "documentos"),
    caminhoProcessoJson: path.join(diretorioExecucao, "processo.json"),
    caminhoLog: path.join(diretorioExecucao, "logs", "execucao.log"),
    caminhoScreenshotFalha: path.join(diretorioExecucao, "diagnostico", "falha-playwright.png"),
    caminhoZipOriginal: path.join(diretorioExecucao, "processo.zip"),
  };
}

export function caminhoRelativoAoRun(diretorioExecucao: string, caminhoArquivo: string) {
  return path.relative(diretorioExecucao, caminhoArquivo).replaceAll(path.sep, "/");
}

export async function escreverProcessoJson(args: {
  processo: ProcessoExtraido;
  diretorioExecucao: string;
  caminhoProcessoJson: string;
}): Promise<ResultadoExtracao> {
  await writeFile(args.caminhoProcessoJson, `${JSON.stringify(args.processo, null, 2)}\n`, "utf-8");
  return {
    processo: args.processo,
    diretorio_execucao: args.diretorioExecucao,
    caminho_processo_json: args.caminhoProcessoJson,
  };
}

export async function lerProcessoJson(diretorioExecucao: string) {
  const caminho = path.join(diretorioExecucao, "processo.json");
  const conteudo = await readFile(caminho, "utf-8");
  return JSON.parse(conteudo) as ProcessoExtraido;
}

export async function tamanhoArquivo(caminhoArquivo: string) {
  return (await stat(caminhoArquivo)).size;
}

