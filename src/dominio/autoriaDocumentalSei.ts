import type { HistoricoProcessoItem } from "../tipos";
import { extrairTextoPlanoHtml } from "./html";

export interface MetadadosDocumentoSei {
  criado_em?: string;
  criado_por?: string;
  modificado_em?: string;
}

export interface AssinaturaHtmlSei {
  nome?: string;
  assinado_em: string;
}

export interface ResolucaoMetadadosDocumentoSei {
  criado_em?: string;
  criado_por?: string;
  modificado_em?: string;
  origem_criado_em: "historico" | "html_primeira_assinatura" | "indefinida";
}

const PADROES_EVENTO_DOCUMENTO_SEI = [
  /^Gerado documento público (\d+) \(/i,
  /^Registro de documento externo(?: público)? (\d+) \(/i,
] as const;

const PADROES_REFERENCIA_DOCUMENTO_SEI = [
  ...PADROES_EVENTO_DOCUMENTO_SEI,
  /\bDocumento\s+(\d+)\b/i,
] as const;

const PADROES_ASSINATURA_HTML_SEI = [
  /Documento assinado eletronicamente por\s+(.+?)\s*,\s*.+?\s*,\s*em\s+(\d{2}\/\d{2}\/\d{4}),?\s+às\s+(\d{2}:\d{2})/gi,
  /Documento assinado eletronicamente por\s+(.+?)\s*,\s*em\s+(\d{2}\/\d{2}\/\d{4}),?\s+às\s+(\d{2}:\d{2})/gi,
] as const;

function normalizarNomeAssinatura(valor: string) {
  return valor
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/g, "")
    .replace(/\s+,\s+/g, ", ");
}

function nomeAssinaturaEhValido(valor: string) {
  const nome = normalizarNomeAssinatura(valor);
  return nome.length >= 5 && nome.split(" ").length >= 2;
}

function converterDataHoraAssinaturaSeiParaIso(data: string, hora: string) {
  const correspondencia = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!correspondencia || !/^\d{2}:\d{2}$/.test(hora)) {
    return undefined;
  }

  const [, dia, mes, ano] = correspondencia;
  const iso = `${ano}-${mes}-${dia}T${hora}:00-03:00`;
  return Number.isNaN(Date.parse(iso)) ? undefined : iso;
}

function compararInstantesIso(a?: string, b?: string) {
  if (!a && !b) {
    return 0;
  }
  if (!a) {
    return -1;
  }
  if (!b) {
    return 1;
  }

  const instanteA = Date.parse(a);
  const instanteB = Date.parse(b);
  if (Number.isFinite(instanteA) && Number.isFinite(instanteB) && instanteA !== instanteB) {
    return instanteA < instanteB ? -1 : 1;
  }
  return a.localeCompare(b);
}

export function extrairNumeroSeiDoEventoHistorico(descricao: string) {
  for (const padrao of PADROES_REFERENCIA_DOCUMENTO_SEI) {
    const correspondencia = descricao.match(padrao);
    if (correspondencia?.[1]) {
      return correspondencia[1];
    }
  }
  return undefined;
}

export function mapearMetadadosDocumentosPorHistorico(historico: HistoricoProcessoItem[]) {
  const metadados: Record<string, MetadadosDocumentoSei> = {};

  for (const item of historico) {
    const numeroSei = extrairNumeroSeiDoEventoHistorico(item.descricao);
    if (!numeroSei) {
      continue;
    }

    const criadoPor = item.usuario?.trim() || undefined;
    const ehEventoCriacao = PADROES_EVENTO_DOCUMENTO_SEI.some((padrao) =>
      padrao.test(item.descricao),
    );
    const registroAtual = metadados[numeroSei];

    if (!registroAtual) {
      metadados[numeroSei] = {
        criado_em: ehEventoCriacao ? item.ocorrido_em : undefined,
        criado_por: criadoPor,
        modificado_em: item.ocorrido_em,
      };
      continue;
    }

    if (
      ehEventoCriacao &&
      (!registroAtual.criado_em || compararInstantesIso(item.ocorrido_em, registroAtual.criado_em) < 0)
    ) {
      registroAtual.criado_em = item.ocorrido_em;
      registroAtual.criado_por = criadoPor ?? registroAtual.criado_por;
    }
    if (!registroAtual.criado_por && criadoPor) {
      registroAtual.criado_por = criadoPor;
    }
    if (compararInstantesIso(item.ocorrido_em, registroAtual.modificado_em) > 0) {
      registroAtual.modificado_em = item.ocorrido_em;
    }
  }

  return metadados;
}

export function extrairAssinaturasHtmlSei(html: string) {
  if (!html.trim()) {
    return [];
  }

  const texto = extrairTextoPlanoHtml(html, {
    preservarQuebrasBloco: true,
    removerComentarios: true,
    removerElementosOcultos: true,
    removerHead: true,
    removerImagens: true,
    removerSvg: true,
  }).replace(/\s+/g, " ").trim();

  if (!texto) {
    return [];
  }

  const assinaturas: AssinaturaHtmlSei[] = [];
  for (const padrao of PADROES_ASSINATURA_HTML_SEI) {
    let correspondencia: RegExpExecArray | null;
    while ((correspondencia = padrao.exec(texto)) !== null) {
      const nome = normalizarNomeAssinatura(correspondencia[1] ?? "");
      const assinadoEm = converterDataHoraAssinaturaSeiParaIso(
        correspondencia[2] ?? "",
        correspondencia[3] ?? "",
      );
      if (!assinadoEm) {
        continue;
      }
      assinaturas.push({
        nome: nomeAssinaturaEhValido(nome) ? nome : undefined,
        assinado_em: assinadoEm,
      });
    }
    padrao.lastIndex = 0;
  }

  const porData = new Map<string, AssinaturaHtmlSei>();
  for (const assinatura of assinaturas) {
    const atual = porData.get(assinatura.assinado_em);
    if (
      !atual ||
      ((assinatura.nome?.length ?? Number.POSITIVE_INFINITY) <
        (atual.nome?.length ?? Number.POSITIVE_INFINITY))
    ) {
      porData.set(assinatura.assinado_em, assinatura);
    }
  }

  return [...porData.values()].sort((a, b) => a.assinado_em.localeCompare(b.assinado_em));
}

export function extrairNomesAssinaturaHtmlSei(html: string) {
  if (!html.trim()) {
    return [];
  }

  const texto = extrairTextoPlanoHtml(html, {
    preservarQuebrasBloco: true,
    removerComentarios: true,
    removerElementosOcultos: true,
    removerHead: true,
    removerImagens: true,
    removerSvg: true,
  });

  const linhas = texto
    .split("\n")
    .map((linha) => linha.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const nomes = new Set<string>();
  const padroes = [
    /Documento assinado eletronicamente por\s+([^,]+?),\s+[^,]+?,\s+em\b/gi,
    /Documento assinado eletronicamente por\s+([^,.]+?)(?:[.,]|$)/gi,
  ] as const;

  for (const linha of linhas) {
    for (const padrao of padroes) {
      let correspondencia: RegExpExecArray | null;
      while ((correspondencia = padrao.exec(linha)) !== null) {
        const nome = normalizarNomeAssinatura(correspondencia[1] ?? "");
        if (nomeAssinaturaEhValido(nome)) {
          nomes.add(nome);
        }
      }
      padrao.lastIndex = 0;
    }
  }

  return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function resolverMetadadosDocumentoSei(args: {
  conteudoHtml?: string;
  metadadosHistorico?: MetadadosDocumentoSei;
}): ResolucaoMetadadosDocumentoSei {
  if (args.metadadosHistorico?.criado_em) {
    return {
      criado_em: args.metadadosHistorico.criado_em,
      criado_por: args.metadadosHistorico.criado_por,
      modificado_em: args.metadadosHistorico.modificado_em ?? args.metadadosHistorico.criado_em,
      origem_criado_em: "historico",
    };
  }

  const primeiraAssinatura = args.conteudoHtml
    ? extrairAssinaturasHtmlSei(args.conteudoHtml)[0]
    : undefined;
  if (primeiraAssinatura?.assinado_em) {
    return {
      criado_em: primeiraAssinatura.assinado_em,
      criado_por: args.metadadosHistorico?.criado_por,
      modificado_em: args.metadadosHistorico?.modificado_em,
      origem_criado_em: "html_primeira_assinatura",
    };
  }

  return {
    criado_em: undefined,
    criado_por: args.metadadosHistorico?.criado_por,
    modificado_em: args.metadadosHistorico?.modificado_em,
    origem_criado_em: "indefinida",
  };
}
