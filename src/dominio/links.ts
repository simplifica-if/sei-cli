export function montarLinkProcessoSei(baseUrl: string, idProcedimento: string) {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=${encodeURIComponent(idProcedimento)}`;
}

export function extrairIdProcedimentoSei(urlOuHref: string) {
  const url = new URL(urlOuHref, "https://sei.local");
  return (
    url.searchParams.get("id_procedimento") ??
    url.searchParams.get("id_protocolo") ??
    undefined
  );
}
