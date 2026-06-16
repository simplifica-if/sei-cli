export const FUSO_HORARIO_PADRAO = "America/Sao_Paulo";

export type EntradaData = Date | number | string;

interface PartesDataHora {
  ano: string;
  mes: string;
  dia: string;
  hora: string;
  minuto: string;
  segundo: string;
  milissegundo?: string;
  offset: string;
}

function resolverData(valor?: EntradaData) {
  const data =
    valor === undefined ? new Date() : valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) {
    throw new Error("Data inválida fornecida para formatação.");
  }
  return data;
}

function obterParte(partes: Intl.DateTimeFormatPart[], tipo: Intl.DateTimeFormatPartTypes) {
  return partes.find((parte) => parte.type === tipo)?.value;
}

function normalizarOffset(rotulo?: string) {
  if (!rotulo || rotulo === "GMT") {
    return "+00:00";
  }
  return rotulo.startsWith("GMT") ? rotulo.slice(3) : rotulo;
}

function obterPartesDataHora(valor?: EntradaData): PartesDataHora {
  const data = resolverData(valor);
  const partesData = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_HORARIO_PADRAO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  }).formatToParts(data);
  const partesOffset = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO_HORARIO_PADRAO,
    timeZoneName: "longOffset",
    hour: "2-digit",
  }).formatToParts(data);

  return {
    ano: obterParte(partesData, "year") ?? "0000",
    mes: obterParte(partesData, "month") ?? "00",
    dia: obterParte(partesData, "day") ?? "00",
    hora: obterParte(partesData, "hour") ?? "00",
    minuto: obterParte(partesData, "minute") ?? "00",
    segundo: obterParte(partesData, "second") ?? "00",
    milissegundo: obterParte(partesData, "fractionalSecond"),
    offset: normalizarOffset(obterParte(partesOffset, "timeZoneName")),
  };
}

export function agoraIso() {
  return new Date().toISOString();
}

export function formatarDataHoraParaArquivo(valor?: EntradaData) {
  const partes = obterPartesDataHora(valor);
  const offsetSeguro = partes.offset.replaceAll(":", "-");
  return `${partes.ano}-${partes.mes}-${partes.dia}T${partes.hora}-${partes.minuto}-${partes.segundo}.${partes.milissegundo ?? "000"}${offsetSeguro}`;
}

export function formatarDataHoraParaHumano(valor?: string) {
  if (!valor) {
    return "sem data";
  }
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) {
    return valor;
  }
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_HORARIO_PADRAO,
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

export function formatarDataCurtaParaHumano(valor?: string) {
  if (!valor) {
    return "sem data";
  }
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) {
    return valor;
  }
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_HORARIO_PADRAO,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(data);
}

export function formatarDataIsoLocal(valor?: string) {
  if (!valor) {
    return undefined;
  }
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) {
    return undefined;
  }
  const partes = obterPartesDataHora(data);
  return `${partes.ano}-${partes.mes}-${partes.dia}`;
}
