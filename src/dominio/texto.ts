export function normalizarNumeroProcesso(numeroProcesso: string) {
  return numeroProcesso.replace(/\s+/g, "").trim();
}

export function normalizarSegmentoDiretorio(valor: string) {
  const normalizado = valor
    .trim()
    .replaceAll("/", "_")
    .replaceAll("\\", "_")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");

  return normalizado || "execucao";
}

export function validarNumeroProcessoSei(numeroProcesso: string) {
  const normalizado = normalizarNumeroProcesso(numeroProcesso);
  if (!/^\d{5}\.\d{6}\/\d{4}-\d{2}$/.test(normalizado)) {
    throw new Error(
      `Número de processo inválido: ${numeroProcesso}. Use o formato 00000.000000/0000-00.`,
    );
  }
  return normalizado;
}

export function textoCompacto(valor?: string) {
  return valor?.replace(/\s+/g, " ").trim() ?? "";
}

