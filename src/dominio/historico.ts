import type { HistoricoProcessoItem } from "../tipos";
import { textoCompacto } from "./texto";

function converterDataHoraSeiParaIso(dataHora: string) {
  const partes = dataHora.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
  if (!partes) {
    return undefined;
  }
  const [, dia, mes, ano, hora, minuto] = partes;
  return `${ano}-${mes}-${dia}T${hora}:${minuto}:00-03:00`;
}

function extrairLinhasUteisHistoricoSei(linhas: string[]) {
  return linhas
    .map((linha) => textoCompacto(linha))
    .filter((linha) => Boolean(linha) && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\b/.test(linha));
}

export function extrairHistoricoDasLinhasHistoricoSei(linhas: string[]): HistoricoProcessoItem[] {
  return extrairLinhasUteisHistoricoSei(linhas)
    .map((linha, indice): HistoricoProcessoItem | null => {
      const completa = linha.match(
        /^(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})\s+(\S+)\s+(\S+)\s+(.+)$/,
      );
      if (completa) {
        const ocorridoEm = converterDataHoraSeiParaIso(completa[1] ?? "");
        if (!ocorridoEm) {
          return null;
        }
        return {
          ocorrido_em: ocorridoEm,
          unidade: completa[2] ?? undefined,
          usuario: completa[3] ?? undefined,
          descricao: (completa[4] ?? "").trim(),
          ordem: indice,
        } satisfies HistoricoProcessoItem;
      }

      const minima = linha.match(/^(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})\s+(.+)$/);
      if (!minima) {
        return null;
      }
      const ocorridoEm = converterDataHoraSeiParaIso(minima[1] ?? "");
      if (!ocorridoEm) {
        return null;
      }
      return {
        ocorrido_em: ocorridoEm,
        descricao: (minima[2] ?? "").trim(),
        ordem: indice,
      } satisfies HistoricoProcessoItem;
    })
    .filter((item): item is HistoricoProcessoItem => item !== null);
}

export function ordenarHistoricoPorDataDesc(historico: HistoricoProcessoItem[]) {
  return [...historico].sort((a, b) => {
    if (a.ocorrido_em !== b.ocorrido_em) {
      return b.ocorrido_em.localeCompare(a.ocorrido_em);
    }
    return a.ordem - b.ordem;
  });
}

export function obterUltimaMovimentacao(historico: HistoricoProcessoItem[]) {
  return ordenarHistoricoPorDataDesc(historico)[0];
}
