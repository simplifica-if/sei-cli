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

function montarAgentsMd(processo: ProcessoExtraido) {
  const comandos = [
    `bun run inspecionar ultima-atualizacao ${JSON.stringify(".")} --json`,
    `bun run inspecionar documentos ${JSON.stringify(".")} --ultimos 20 --json`,
    `bun run inspecionar historico ${JSON.stringify(".")} --ultimos 50 --json`,
  ];

  return `# Instruções para agentes de IA

Esta pasta é uma fotografia local completa do processo SEI ${processo.numero_processo}.

## Modelo mental

- Use \`processo.json\` como índice canônico da extração.
- Os documentos originais ou extraídos ficam em \`${processo.artefatos.diretorio_documentos}\`.
- Caminhos em \`processo.json\`, como \`documentos[].caminho_relativo\`, são relativos a esta pasta.
- Quando disponíveis, \`documentos[].unidade_sei\` e \`documentos[].caminho_hierarquico\` vêm da árvore do processo no SEI e ajudam a entender a posição do documento no processo.
- \`processo.zip\`, quando existir, é o arquivo bruto preservado da origem.
- \`logs/execucao.log\` registra eventos da extração.

## Fluxo recomendado

1. Leia \`processo.json\` antes de abrir documentos soltos.
2. Consulte \`ultima_movimentacao\` e \`historico\` para entender a movimentação administrativa do processo. No fluxo \`extrair\`, o CLI tenta capturar o histórico completo, incluindo páginas seguintes quando o SEI pagina a tela "Lista de Andamentos".
3. Use \`documentos[].numero_sei\`, \`titulo\`, \`tipo_documento\`, \`criado_em\`, \`modificado_em\` e \`caminho_relativo\` para escolher arquivos relevantes.
4. Use \`unidade_sei\` e \`caminho_hierarquico\` para priorizar documentos por setor, pasta ou agrupamento da árvore.
5. Para relacionar documentos ao histórico, procure o \`numero_sei\` nas descrições de \`historico[]\`, como "Gerado documento público" ou "Registro de documento externo".
6. Para HTML e textos simples, pesquise em \`${processo.artefatos.diretorio_documentos}\` com \`rg\`.
7. Para PDFs, use uma ferramenta própria de leitura de PDF; este snapshot preserva PDFs, mas não garante texto extraído ou OCR.
8. Ao responder, cite sempre o número SEI, o título e o caminho relativo do documento usado. Quando a resposta depender de andamento processual, cite também a data e a descrição do item de \`historico[]\`.

## Comandos úteis

\`\`\`bash
${comandos.join("\n")}
jq '.documentos[] | {numero_sei, titulo, unidade_sei, caminho_hierarquico, tipo_documento, criado_em, modificado_em, caminho_relativo}' processo.json
jq '.historico[] | select(.descricao | test("Gerado documento|Registro de documento"; "i"))' processo.json
jq '.ultima_movimentacao' processo.json
rg -n "termo de busca" ${processo.artefatos.diretorio_documentos}
\`\`\`

## Cuidados

- Não edite os arquivos extraídos; trate esta pasta como evidência.
- Não execute uma nova extração se esta fotografia já atende à pergunta.
- Se houver várias execuções do mesmo processo, prefira a pasta mais recente pelo timestamp, salvo instrução contrária.
- \`inspecionar\` é local e não acessa o SEI.
`;
}

export async function escreverProcessoJson(args: {
  processo: ProcessoExtraido;
  diretorioExecucao: string;
  caminhoProcessoJson: string;
}): Promise<ResultadoExtracao> {
  await writeFile(args.caminhoProcessoJson, `${JSON.stringify(args.processo, null, 2)}\n`, "utf-8");
  await writeFile(path.join(args.diretorioExecucao, "AGENTS.md"), montarAgentsMd(args.processo), "utf-8");
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
