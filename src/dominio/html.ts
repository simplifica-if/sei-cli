const ENTIDADES_HTML_NOMEADAS: Record<string, string> = {
  amp: "&",
  apos: "'",
  aacute: "á",
  acirc: "â",
  agrave: "à",
  atilde: "ã",
  Aacute: "Á",
  Atilde: "Ã",
  ccedil: "ç",
  Ccedil: "Ç",
  eacute: "é",
  ecirc: "ê",
  Eacute: "É",
  Ecirc: "Ê",
  gt: ">",
  iacute: "í",
  Iacute: "Í",
  nbsp: " ",
  ntilde: "ñ",
  Ntilde: "Ñ",
  oacute: "ó",
  ocirc: "ô",
  otilde: "õ",
  Oacute: "Ó",
  Otilde: "Õ",
  quot: "\"",
  uacute: "ú",
  Uacute: "Ú",
};

export interface OpcoesTextoPlanoHtml {
  preservarQuebrasBloco?: boolean;
  removerComentarios?: boolean;
  removerElementosOcultos?: boolean;
  removerHead?: boolean;
  removerImagens?: boolean;
  removerSvg?: boolean;
}

function decodificarPontoCodigoHtml(match: string, pontoCodigo: number) {
  if (!Number.isInteger(pontoCodigo) || pontoCodigo < 0 || pontoCodigo > 0x10ffff) {
    return match;
  }

  try {
    return String.fromCodePoint(pontoCodigo);
  } catch {
    return match;
  }
}

export function decodificarEntidadesHtml(texto: string) {
  return texto
    .replace(/&#(\d+);/g, (match, codigo) =>
      decodificarPontoCodigoHtml(match, Number.parseInt(codigo, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (match, codigo) =>
      decodificarPontoCodigoHtml(match, Number.parseInt(codigo, 16)),
    )
    .replace(/&([a-zA-Z]+);/g, (match, nome) => ENTIDADES_HTML_NOMEADAS[nome] ?? match);
}

export function extrairTextoPlanoHtml(html: string, opcoes: OpcoesTextoPlanoHtml = {}) {
  let texto = html.replace(/<!doctype[^>]*>/gi, " ");

  if (opcoes.removerHead) {
    texto = texto.replace(/<head[\s\S]*?<\/head>/gi, " ");
  }
  if (opcoes.removerComentarios) {
    texto = texto.replace(/<!--[\s\S]*?-->/g, " ");
  }

  texto = texto
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ");

  if (opcoes.removerSvg) {
    texto = texto.replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  }
  if (opcoes.removerImagens) {
    texto = texto.replace(/<img\b[^>]*>/gi, " ");
  }
  if (opcoes.removerElementosOcultos) {
    texto = texto.replace(
      /<([a-z0-9]+)\b[^>]*style="[^"]*display\s*:\s*none[^"]*"[^>]*>[\s\S]*?<\/\1>/gi,
      " ",
    );
  }
  if (opcoes.preservarQuebrasBloco) {
    texto = texto
      .replace(/<(?:br|hr)\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|tr|table|section|article|h[1-6]|li|ul|ol)>/gi, "\n");
  }

  return decodificarEntidadesHtml(texto)
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ");
}
