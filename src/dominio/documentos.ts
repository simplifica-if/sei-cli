import type { DocumentoProcesso, TipoDocumento } from "../tipos";

export function inferirTipoDocumento(args: {
  mime_type?: string;
  nome_arquivo?: string;
  conteudo_html?: string;
}): TipoDocumento {
  const mimeType = args.mime_type?.trim().toLowerCase();
  if (mimeType === "application/pdf") {
    return "PDF";
  }
  if (mimeType === "text/html" || mimeType === "application/xhtml+xml") {
    return "HTML";
  }
  if (mimeType?.startsWith("image/")) {
    return "Imagem";
  }

  const nomeArquivo = args.nome_arquivo?.trim().toLowerCase() ?? "";
  if (nomeArquivo.endsWith(".pdf")) {
    return "PDF";
  }
  if (nomeArquivo.endsWith(".html") || nomeArquivo.endsWith(".htm")) {
    return "HTML";
  }
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(nomeArquivo)) {
    return "Imagem";
  }
  if (args.conteudo_html?.trim()) {
    return "HTML";
  }
  return "Arquivo binário";
}

export function extrairNumeroSeiDoNomeArquivo(nomeArquivo: string) {
  const correspondencia =
    nomeArquivo.match(/^\[\d+\]-(\d+)(?:[_ .-]|$)/) ??
    nomeArquivo.match(/\((\d+)\)(?=\.[^.]+$)/) ??
    nomeArquivo.match(/\b(\d{6,})\b/);

  return correspondencia?.[1];
}

export function obterDataReferenciaDocumento(documento: Pick<DocumentoProcesso, "modificado_em" | "criado_em">) {
  return documento.modificado_em?.trim() || documento.criado_em?.trim() || undefined;
}

export function ordenarDocumentosPorDataDesc(documentos: DocumentoProcesso[]) {
  return [...documentos].sort((a, b) => {
    const dataA = obterDataReferenciaDocumento(a);
    const dataB = obterDataReferenciaDocumento(b);
    if (dataA && dataB && dataA !== dataB) {
      return dataB.localeCompare(dataA);
    }
    if (dataA && !dataB) {
      return -1;
    }
    if (!dataA && dataB) {
      return 1;
    }
    return b.ordem_no_processo - a.ordem_no_processo;
  });
}

