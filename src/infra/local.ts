import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { lookup as lookupMime } from "mime-types";
import type { DocumentoProcesso, EventoExtracao, OrigemExtracao, ProcessoExtraido } from "../tipos";
import { resolverMetadadosDocumentoSei } from "../dominio/autoriaDocumentalSei";
import { extrairNumeroSeiDoNomeArquivo, inferirTipoDocumento } from "../dominio/documentos";
import { obterUltimaMovimentacao } from "../dominio/historico";
import { agoraIso } from "../dominio/tempo";
import { validarNumeroProcessoSei } from "../dominio/texto";
import {
  calcularSha256Arquivo,
  caminhoRelativoAoRun,
  copiarDiretorioRecursivo,
  escreverProcessoJson,
  extrairZipParaDiretorio,
  listarArquivosRecursivos,
  prepararDiretorioExecucao,
  tamanhoArquivo,
} from "./arquivos";

async function carregarHtmlSeForDocumento(args: {
  caminhoArquivo: string;
  mimeType?: string;
}) {
  const tipo = inferirTipoDocumento({
    mime_type: args.mimeType,
    nome_arquivo: args.caminhoArquivo,
  });
  if (tipo !== "HTML") {
    return undefined;
  }
  return readFile(args.caminhoArquivo, "utf-8");
}

async function montarDocumento(args: {
  caminhoArquivo: string;
  diretorioDocumentos: string;
  diretorioExecucao: string;
  indice: number;
}): Promise<DocumentoProcesso> {
  const relativoDocumentos = path
    .relative(args.diretorioDocumentos, args.caminhoArquivo)
    .replaceAll(path.sep, "/");
  const nomeArquivo = path.basename(args.caminhoArquivo);
  const mimeType = lookupMime(args.caminhoArquivo) || undefined;
  const conteudoHtml = await carregarHtmlSeForDocumento({
    caminhoArquivo: args.caminhoArquivo,
    mimeType,
  });
  const metadados = resolverMetadadosDocumentoSei({ conteudoHtml });

  return {
    numero_sei: extrairNumeroSeiDoNomeArquivo(nomeArquivo),
    titulo: nomeArquivo,
    nome_arquivo: nomeArquivo,
    tipo_documento: inferirTipoDocumento({
      mime_type: mimeType,
      nome_arquivo: nomeArquivo,
      conteudo_html: conteudoHtml,
    }),
    mime_type: mimeType,
    tamanho_bytes: await tamanhoArquivo(args.caminhoArquivo),
    sha256: await calcularSha256Arquivo(args.caminhoArquivo),
    ordem_no_processo: args.indice + 1,
    criado_em: metadados.criado_em,
    criado_por: metadados.criado_por,
    modificado_em: metadados.modificado_em,
    resumo_textual: relativoDocumentos,
    caminho_relativo: caminhoRelativoAoRun(args.diretorioExecucao, args.caminhoArquivo),
  };
}

async function montarProcessoDeDiretorio(args: {
  numeroProcesso: string;
  origem: OrigemExtracao;
  diretorioExecucao: string;
  diretorioDocumentos: string;
  zipOriginalRelativo?: string;
  eventos: EventoExtracao[];
}) {
  const arquivos = (await listarArquivosRecursivos(args.diretorioDocumentos)).sort();
  if (!arquivos.length) {
    throw new Error("Nenhum documento foi encontrado para montar o processo.");
  }

  const documentos = await Promise.all(
    arquivos.map((arquivo, indice) =>
      montarDocumento({
        caminhoArquivo: arquivo,
        diretorioDocumentos: args.diretorioDocumentos,
        diretorioExecucao: args.diretorioExecucao,
        indice,
      }),
    ),
  );

  const processo: ProcessoExtraido = {
    versao_schema: 1,
    numero_processo: args.numeroProcesso,
    extraido_em: agoraIso(),
    origem: args.origem,
    tipo_processo: args.origem === "playwright-sei" ? undefined : "Processo lido localmente",
    especificacao:
      args.origem === "zip-local"
        ? "Carga local a partir de ZIP do processo"
        : args.origem === "diretorio-local"
          ? "Carga local a partir de diretório de documentos"
          : undefined,
    historico: [],
    ultima_movimentacao: obterUltimaMovimentacao([]),
    documentos,
    eventos: args.eventos,
    artefatos: {
      zip_original: args.zipOriginalRelativo,
      diretorio_documentos: caminhoRelativoAoRun(args.diretorioExecucao, args.diretorioDocumentos),
      log: "logs/execucao.log",
    },
  };

  return processo;
}

async function escreverLogEventos(caminhoLog: string, eventos: EventoExtracao[]) {
  const conteudo = eventos
    .map((evento) => `[${evento.criado_em}] [${evento.nivel}] [${evento.etapa}] ${evento.mensagem}`)
    .join("\n");
  await writeFile(caminhoLog, conteudo ? `${conteudo}\n` : "", "utf-8");
}

export async function lerDiretorioProcesso(args: {
  numeroProcesso: string;
  diretorio: string;
  saida?: string;
}) {
  const numeroProcesso = validarNumeroProcessoSei(args.numeroProcesso);
  const paths = await prepararDiretorioExecucao({ numeroProcesso, saida: args.saida });
  await copiarDiretorioRecursivo(path.resolve(args.diretorio), paths.diretorioDocumentos);
  const eventos: EventoExtracao[] = [
    {
      etapa: "filesystem",
      mensagem: `Diretório ${path.resolve(args.diretorio)} copiado e analisado.`,
      nivel: "info",
      criado_em: agoraIso(),
    },
  ];
  await escreverLogEventos(paths.caminhoLog, eventos);
  const processo = await montarProcessoDeDiretorio({
    numeroProcesso,
    origem: "diretorio-local",
    diretorioExecucao: paths.diretorioExecucao,
    diretorioDocumentos: paths.diretorioDocumentos,
    eventos,
  });
  return escreverProcessoJson({
    processo,
    diretorioExecucao: paths.diretorioExecucao,
    caminhoProcessoJson: paths.caminhoProcessoJson,
  });
}

export async function lerZipProcesso(args: {
  numeroProcesso: string;
  zip: string;
  saida?: string;
}) {
  const numeroProcesso = validarNumeroProcessoSei(args.numeroProcesso);
  const paths = await prepararDiretorioExecucao({ numeroProcesso, saida: args.saida });
  await mkdir(path.dirname(paths.caminhoZipOriginal), { recursive: true });
  await copyFile(path.resolve(args.zip), paths.caminhoZipOriginal);
  await extrairZipParaDiretorio(paths.caminhoZipOriginal, paths.diretorioDocumentos);
  const eventos: EventoExtracao[] = [
    {
      etapa: "zip",
      mensagem: `ZIP ${path.resolve(args.zip)} copiado, extraído e analisado.`,
      nivel: "info",
      criado_em: agoraIso(),
    },
  ];
  await escreverLogEventos(paths.caminhoLog, eventos);
  const processo = await montarProcessoDeDiretorio({
    numeroProcesso,
    origem: "zip-local",
    diretorioExecucao: paths.diretorioExecucao,
    diretorioDocumentos: paths.diretorioDocumentos,
    zipOriginalRelativo: caminhoRelativoAoRun(paths.diretorioExecucao, paths.caminhoZipOriginal),
    eventos,
  });
  return escreverProcessoJson({
    processo,
    diretorioExecucao: paths.diretorioExecucao,
    caminhoProcessoJson: paths.caminhoProcessoJson,
  });
}

export { montarProcessoDeDiretorio };
