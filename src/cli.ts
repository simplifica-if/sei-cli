#!/usr/bin/env bun
import path from "node:path";
import { formatarDataHoraParaHumano } from "./dominio/tempo";
import { carregarEnvLocal } from "./infra/env";
import { lerDiretorioProcesso, lerZipProcesso } from "./infra/local";
import { extrairProcessoSei, localizarLinkProcessoSei } from "./infra/playwrightSei";
import {
  carregarProcessoParaInspecao,
  inspecionarUltimaAtualizacao,
  listarUltimosDocumentos,
  listarUltimosEventosHistorico,
} from "./aplicacao/inspecionar";
import type { DocumentoProcesso, HistoricoProcessoItem, ResultadoExtracao } from "./tipos";

interface OpcoesCli {
  json: boolean;
  saida?: string;
  zip?: string;
  diretorio?: string;
  ultimos?: number;
}

function obterValorFlag(args: string[], nome: string) {
  const indice = args.indexOf(nome);
  if (indice === -1) {
    return undefined;
  }
  return args[indice + 1];
}

function possuiFlag(args: string[], nome: string) {
  return args.includes(nome);
}

function lerOpcoes(args: string[]): OpcoesCli {
  const ultimos = obterValorFlag(args, "--ultimos");
  return {
    json: possuiFlag(args, "--json"),
    saida: obterValorFlag(args, "--saida"),
    zip: obterValorFlag(args, "--zip"),
    diretorio: obterValorFlag(args, "--diretorio"),
    ultimos: ultimos ? Number.parseInt(ultimos, 10) : undefined,
  };
}

function validarQuantidade(valor: number | undefined, padrao: number) {
  const quantidade = valor ?? padrao;
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error("Informe --ultimos com um número inteiro positivo.");
  }
  return quantidade;
}

function imprimirJson(valor: unknown) {
  console.log(JSON.stringify(valor, null, 2));
}

function imprimirResumoExtracao(resultado: ResultadoExtracao) {
  console.log(`Processo ${resultado.processo.numero_processo} extraído com sucesso.`);
  console.log(`Origem: ${resultado.processo.origem}`);
  console.log(`Documentos: ${resultado.processo.documentos.length}`);
  console.log(`Histórico: ${resultado.processo.historico.length} evento(s)`);
  console.log(`Pasta: ${resultado.diretorio_execucao}`);
  console.log(`JSON: ${resultado.caminho_processo_json}`);
}

function imprimirDocumento(documento: DocumentoProcesso, indice: number) {
  const numero = documento.numero_sei ? `SEI ${documento.numero_sei}` : "sem número SEI";
  const data = formatarDataHoraParaHumano(documento.modificado_em ?? documento.criado_em);
  console.log(`${indice + 1}. ${documento.titulo} (${numero}, ${documento.tipo_documento}, ${data})`);
  if (documento.caminho_relativo) {
    console.log(`   arquivo: ${documento.caminho_relativo}`);
  }
}

function imprimirEventoHistorico(evento: HistoricoProcessoItem, indice: number) {
  const data = formatarDataHoraParaHumano(evento.ocorrido_em);
  const origem = [evento.unidade, evento.usuario].filter(Boolean).join(" / ");
  console.log(`${indice + 1}. ${data}${origem ? ` - ${origem}` : ""}`);
  console.log(`   ${evento.descricao}`);
}

function imprimirAjuda() {
  console.log(`Uso:
  sei extrair processo <numero> [--saida <dir>] [--json]
  sei ler processo <numero> --zip <arquivo.zip> [--saida <dir>] [--json]
  sei ler processo <numero> --diretorio <dir> [--saida <dir>] [--json]
  sei inspecionar ultima-atualizacao <runDir> [--json]
  sei inspecionar documentos <runDir> [--ultimos 5] [--json]
  sei inspecionar historico <runDir> [--ultimos 10] [--json]
  sei localizar link <numero> [--json]

Variáveis para extrair do SEI:
  SEI_USUARIO
  SEI_SENHA
  SEI_BASE_URL=https://sei.ifpr.edu.br
  SEI_HEADLESS=true|false`);
}

async function executar(args: string[]) {
  carregarEnvLocal();

  const [comando, alvo, valor] = args;
  const opcoes = lerOpcoes(args);

  if (!comando || comando === "ajuda" || comando === "help" || comando === "--help" || comando === "-h") {
    imprimirAjuda();
    return;
  }

  if (comando === "extrair") {
    if (alvo !== "processo" || !valor) {
      throw new Error("Uso esperado: sei extrair processo <numero>.");
    }
    const resultado = await extrairProcessoSei({
      numeroProcesso: valor,
      saida: opcoes.saida,
    });
    opcoes.json ? imprimirJson(resultado) : imprimirResumoExtracao(resultado);
    return;
  }

  if (comando === "localizar") {
    if (alvo !== "link" || !valor) {
      throw new Error("Uso esperado: sei localizar link <numero>.");
    }
    const resultado = await localizarLinkProcessoSei({ numeroProcesso: valor });
    if (opcoes.json) {
      imprimirJson(resultado);
      return;
    }
    console.log(`Processo ${resultado.numero_processo}`);
    console.log(`ID procedimento: ${resultado.sei_id_procedimento}`);
    console.log(`Link SEI: ${resultado.sei_link_processo}`);
    return;
  }

  if (comando === "ler") {
    if (alvo !== "processo" || !valor) {
      throw new Error("Uso esperado: sei ler processo <numero> --zip <arquivo> ou --diretorio <dir>.");
    }
    if (opcoes.zip && opcoes.diretorio) {
      throw new Error("Use apenas uma origem local: --zip ou --diretorio.");
    }
    if (!opcoes.zip && !opcoes.diretorio) {
      throw new Error("Informe --zip <arquivo> ou --diretorio <dir>.");
    }
    const resultado = opcoes.zip
      ? await lerZipProcesso({ numeroProcesso: valor, zip: opcoes.zip, saida: opcoes.saida })
      : await lerDiretorioProcesso({
          numeroProcesso: valor,
          diretorio: opcoes.diretorio!,
          saida: opcoes.saida,
        });
    opcoes.json ? imprimirJson(resultado) : imprimirResumoExtracao(resultado);
    return;
  }

  if (comando === "inspecionar") {
    if (!alvo || !valor) {
      throw new Error("Uso esperado: sei inspecionar <consulta> <runDir>.");
    }
    const processo = await carregarProcessoParaInspecao(path.resolve(valor));

    if (alvo === "ultima-atualizacao") {
      const resultado = inspecionarUltimaAtualizacao(processo);
      if (opcoes.json) {
        imprimirJson(resultado);
        return;
      }
      console.log(`Processo ${resultado.numero_processo}`);
      if (resultado.ultima_movimentacao) {
        console.log("Última movimentação:");
        imprimirEventoHistorico(resultado.ultima_movimentacao, 0);
      } else {
        console.log("Última movimentação: histórico indisponível.");
      }
      if (resultado.ultimo_documento) {
        console.log("Último documento:");
        imprimirDocumento(resultado.ultimo_documento, 0);
      }
      return;
    }

    if (alvo === "documentos") {
      const documentos = listarUltimosDocumentos(processo, validarQuantidade(opcoes.ultimos, 5));
      if (opcoes.json) {
        imprimirJson(documentos);
        return;
      }
      console.log(`Últimos ${documentos.length} documento(s) do processo ${processo.numero_processo}:`);
      documentos.forEach(imprimirDocumento);
      return;
    }

    if (alvo === "historico") {
      const historico = listarUltimosEventosHistorico(processo, validarQuantidade(opcoes.ultimos, 10));
      if (opcoes.json) {
        imprimirJson(historico);
        return;
      }
      console.log(`Últimos ${historico.length} evento(s) do processo ${processo.numero_processo}:`);
      historico.forEach(imprimirEventoHistorico);
      return;
    }

    throw new Error(`Consulta desconhecida: ${alvo}.`);
  }

  throw new Error(`Comando desconhecido: ${comando}.`);
}

void executar(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
