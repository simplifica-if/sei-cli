export interface DocumentoArvoreSei {
  numero_sei: string;
  titulo: string;
  unidade_sei?: string;
  caminho_hierarquico?: string[];
}

export interface DocumentoArvoreSeiBruto {
  texto: string;
  unidade_sei?: string;
  caminho_hierarquico?: string[];
}

const REGEX_NUMERO_PROCESSO_SEI = /\d{5}\.\d{6}\/\d{4}-\d{2}/;

function normalizarTextoControleSei(valor?: string) {
  return valor?.replace(/\s+/g, " ").trim() ?? "";
}

function limparRotuloArvoreSei(valor?: string) {
  return normalizarTextoControleSei(valor).replace(/\s*\(\d{6,}\)\s*$/u, "").trim();
}

function normalizarCaminhoHierarquicoArvoreSei(caminho?: string[]) {
  const segmentos = (caminho ?? [])
    .map((segmento) => limparRotuloArvoreSei(segmento))
    .filter((segmento) => Boolean(segmento) && !REGEX_NUMERO_PROCESSO_SEI.test(segmento));

  return segmentos.length ? segmentos : undefined;
}

export function normalizarDocumentoArvoreSei(
  item: DocumentoArvoreSeiBruto,
): DocumentoArvoreSei | null {
  const texto = normalizarTextoControleSei(item.texto);
  const correspondencia = texto.match(/^(.*?)\s*(?:\((\d{6,})\)|(\d{6,}))\s*$/u);
  const numeroSei = correspondencia?.[2] ?? correspondencia?.[3];
  if (!correspondencia?.[1] || !numeroSei) {
    return null;
  }

  const titulo = limparRotuloArvoreSei(correspondencia[1]);
  if (!titulo) {
    return null;
  }

  const caminhoHierarquico = normalizarCaminhoHierarquicoArvoreSei(
    item.caminho_hierarquico,
  )?.filter((segmento) => segmento !== titulo);

  return {
    numero_sei: numeroSei,
    titulo,
    unidade_sei: normalizarTextoControleSei(item.unidade_sei) || undefined,
    caminho_hierarquico: caminhoHierarquico?.length ? caminhoHierarquico : undefined,
  };
}

export function combinarDocumentosArvoreSei(documentos: DocumentoArvoreSei[]) {
  return Object.fromEntries(documentos.map((documento) => [documento.numero_sei, documento]));
}

