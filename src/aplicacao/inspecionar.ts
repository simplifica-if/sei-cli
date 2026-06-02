import type {
  DocumentoProcesso,
  HistoricoProcessoItem,
  ProcessoExtraido,
  ResultadoVerificacaoAtualizacao,
} from "../tipos";
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

function chaveMovimentacao(item?: HistoricoProcessoItem) {
  if (!item) {
    return undefined;
  }
  return [item.ocorrido_em, item.unidade ?? "", item.usuario ?? "", item.descricao].join("\u001f");
}

export function compararAtualizacaoProcesso(args: {
  processoLocal: ProcessoExtraido;
  historicoRemoto: HistoricoProcessoItem[];
  snapshot?: string;
}): ResultadoVerificacaoAtualizacao {
  const ultimaLocal = args.processoLocal.ultima_movimentacao ?? obterUltimaMovimentacao(args.processoLocal.historico);
  const ultimaRemota = obterUltimaMovimentacao(args.historicoRemoto);
  const historicoLocal = ordenarHistoricoPorDataDesc(args.processoLocal.historico).map(chaveMovimentacao);
  const historicoRemoto = ordenarHistoricoPorDataDesc(args.historicoRemoto).map(chaveMovimentacao);
  const atualizado =
    historicoLocal.length === historicoRemoto.length &&
    historicoLocal.every((chave, indice) => chave === historicoRemoto[indice]);

  return {
    numero_processo: args.processoLocal.numero_processo,
    atualizado,
    precisa_extrair: !atualizado,
    motivo: atualizado
      ? "O histórico remoto coincide com o histórico do snapshot local."
      : "O histórico remoto difere do histórico do snapshot local.",
    snapshot: args.snapshot,
    historico_local_total: args.processoLocal.historico.length,
    historico_remoto_total: args.historicoRemoto.length,
    ultima_movimentacao_local: ultimaLocal,
    ultima_movimentacao_remota: ultimaRemota,
  };
}
