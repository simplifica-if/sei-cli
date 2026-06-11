import { describe, expect, test } from "bun:test";
import { normalizarDocumentoArvoreSei } from "../src/dominio/arvoreSei";
import {
  extrairNomesAssinaturaHtmlSei,
  extrairNumeroSeiDoEventoHistorico,
  resolverMetadadosDocumentoSei,
} from "../src/dominio/autoriaDocumentalSei";
import { extrairNumeroSeiDoNomeArquivo, inferirTipoDocumento } from "../src/dominio/documentos";
import {
  extrairHistoricoDasLinhasHistoricoSei,
  extrairHistoricoDasLinhasEstruturadasHistoricoSei,
  extrairResumoPaginacaoHistoricoSei,
  formatarResumoPaginacaoHistoricoSei,
  obterUltimaMovimentacao,
} from "../src/dominio/historico";
import { extrairTextoPlanoHtml } from "../src/dominio/html";
import { extrairIdProcedimentoSei, montarLinkProcessoSei } from "../src/dominio/links";

describe("domínio SEI", () => {
  test("extrai histórico de linhas copiadas do SEI", () => {
    const historico = extrairHistoricoDasLinhasHistoricoSei([
      "25/05/2026 13:44 PROENS fulano Gerado documento público 1234567 (Despacho)",
      "24/05/2026 08:10 GAB sicrano Processo remetido",
    ]);

    expect(historico).toHaveLength(2);
    expect(historico[0]?.ocorrido_em).toBe("2026-05-25T13:44:00-03:00");
    expect(historico[0]?.unidade).toBe("PROENS");
    expect(extrairNumeroSeiDoEventoHistorico(historico[0]!.descricao)).toBe("1234567");
    expect(obterUltimaMovimentacao(historico)?.descricao).toContain("Gerado documento");
  });

  test("preserva usuário com espaços ao extrair histórico estruturado", () => {
    const historico = extrairHistoricoDasLinhasEstruturadasHistoricoSei([
      {
        data_hora: "25/05/2026 13:44",
        unidade: "PROENS",
        usuario: "Maria Silva",
        descricao: "Gerado documento público 1234567 (Despacho)",
      },
    ]);

    expect(historico).toHaveLength(1);
    expect(historico[0]?.usuario).toBe("Maria Silva");
    expect(historico[0]?.descricao).toBe("Gerado documento público 1234567 (Despacho)");
    expect(extrairNumeroSeiDoEventoHistorico(historico[0]!.descricao)).toBe("1234567");
  });

  test("extrai resumo de paginação do histórico do SEI", () => {
    const resumo = extrairResumoPaginacaoHistoricoSei(
      "Lista de Andamentos (135 registros - 51 a 100)",
    );

    expect(resumo).toEqual({
      total_registros: 135,
      inicio: 51,
      fim: 100,
    });
    expect(formatarResumoPaginacaoHistoricoSei(resumo)).toBe("51 a 100 de 135");
    expect(extrairResumoPaginacaoHistoricoSei("sem paginação")).toBeUndefined();
  });

  test("normaliza documentos da árvore do processo SEI", () => {
    expect(
      normalizarDocumentoArvoreSei({
        texto: "Despacho de aprovação (1234567)",
        unidade_sei: "PROENS",
        caminho_hierarquico: ["00000.000000/0000-00", "Anexos", "Despacho de aprovação"],
      }),
    ).toEqual({
      numero_sei: "1234567",
      titulo: "Despacho de aprovação",
      unidade_sei: "PROENS",
      caminho_hierarquico: ["Anexos"],
    });

    expect(normalizarDocumentoArvoreSei({ texto: "Pasta sem número" })).toBeNull();
  });

  test("infere tipo e número SEI pelo arquivo", () => {
    expect(extrairNumeroSeiDoNomeArquivo("[1]-1234567 despacho.html")).toBe("1234567");
    expect(inferirTipoDocumento({ nome_arquivo: "parecer.pdf" })).toBe("PDF");
    expect(inferirTipoDocumento({ mime_type: "image/png" })).toBe("Imagem");
  });

  test("usa primeira assinatura HTML como data documental quando não há histórico", () => {
    const metadados = resolverMetadadosDocumentoSei({
      conteudoHtml:
        "Documento assinado eletronicamente por Maria Silva, Coordenadora, em 25/05/2026, às 13:44",
    });

    expect(metadados.criado_em).toBe("2026-05-25T13:44:00-03:00");
    expect(metadados.origem_criado_em).toBe("html_primeira_assinatura");
  });

  test("extrai nomes de assinantes de documentos HTML do SEI", () => {
    const nomes = extrairNomesAssinaturaHtmlSei(`
      <p>Documento assinado eletronicamente por Maria Silva, Coordenadora, em 25/05/2026, às 13:44.</p>
      <p>Documento assinado eletronicamente por João de Souza, em 26/05/2026, às 09:10.</p>
      <p>Documento assinado eletronicamente por Maria Silva, Coordenadora, em 27/05/2026, às 10:20.</p>
    `);

    expect(nomes).toEqual(["João de Souza", "Maria Silva"]);
  });

  test("mantém entidades HTML numéricas inválidas sem lançar erro", () => {
    const texto = extrairTextoPlanoHtml("Antes &#999999999999; &#x110000; depois");

    expect(texto).toContain("&#999999999999;");
    expect(texto).toContain("&#x110000;");
  });

  test("monta link estável para processo SEI", () => {
    expect(extrairIdProcedimentoSei("https://sei.ifpr.edu.br/sei/controlador.php?acao=procedimento_trabalhar&id_protocolo=1237868&infra_hash=abc")).toBe("1237868");
    expect(montarLinkProcessoSei("https://sei.ifpr.edu.br/", "1237868")).toBe(
      "https://sei.ifpr.edu.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=1237868",
    );
  });
});
