import type { DocumentoProcesso, HistoricoProcessoItem, ProcessoExtraido } from "../tipos";
import { ordenarDocumentosPorDataDesc } from "../dominio/documentos";
import { obterUltimaMovimentacao, ordenarHistoricoPorDataDesc } from "../dominio/historico";
import { lerProcessoJson } from "../infra/arquivos";

export interface ResultadoUltimaAtualizacao {
  numero_processo: string;
  ultima_movimentacao?: HistoricoProcessoItem;
  ultimo_documento?: DocumentoProcesso;
}

export async function carregarProcessoParaInspecao(diretorioExecucao: string) {
  return lerProcessoJson(diretorioExecucao);
}

export function inspecionarUltimaAtualizacao(processo: ProcessoExtraido): ResultadoUltimaAtualizacao {
  return {
    numero_processo: processo.numero_processo,
    ultima_movimentacao: processo.ultima_movimentacao ?? obterUltimaMovimentacao(processo.historico),
    ultimo_documento: ordenarDocumentosPorDataDesc(processo.documentos)[0],
  };
}

export function listarUltimosDocumentos(processo: ProcessoExtraido, quantidade: number) {
  return ordenarDocumentosPorDataDesc(processo.documentos).slice(0, quantidade);
}

export function listarUltimosEventosHistorico(processo: ProcessoExtraido, quantidade: number) {
  return ordenarHistoricoPorDataDesc(processo.historico).slice(0, quantidade);
}

