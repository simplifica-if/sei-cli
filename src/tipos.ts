export type TipoDocumento = "PDF" | "HTML" | "Imagem" | "Arquivo binário";

export type OrigemExtracao = "playwright-sei" | "zip-local" | "diretorio-local";

export interface HistoricoProcessoItem {
  ocorrido_em: string;
  unidade?: string;
  usuario?: string;
  descricao: string;
  ordem: number;
}

export interface DocumentoProcesso {
  numero_sei?: string;
  titulo: string;
  nome_arquivo?: string;
  tipo_documento: TipoDocumento;
  mime_type?: string;
  tamanho_bytes?: number;
  sha256?: string;
  ordem_no_processo: number;
  criado_em?: string;
  criado_por?: string;
  modificado_em?: string;
  resumo_textual?: string;
  unidade_sei?: string;
  caminho_hierarquico?: string[];
  caminho_relativo?: string;
}

export interface EventoExtracao {
  etapa: string;
  mensagem: string;
  nivel: "info" | "aviso" | "erro";
  criado_em: string;
}

export interface ProcessoExtraido {
  versao_schema: 1;
  numero_processo: string;
  extraido_em: string;
  origem: OrigemExtracao;
  sei_base_url?: string;
  tipo_processo?: string;
  especificacao?: string;
  ultima_movimentacao?: HistoricoProcessoItem;
  historico: HistoricoProcessoItem[];
  documentos: DocumentoProcesso[];
  eventos: EventoExtracao[];
  artefatos: {
    zip_original?: string;
    diretorio_documentos: string;
    log?: string;
    screenshot_falha?: string;
  };
}

export interface ResultadoExtracao {
  processo: ProcessoExtraido;
  diretorio_execucao: string;
  caminho_processo_json: string;
}
