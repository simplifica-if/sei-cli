import { describe, expect, test } from "bun:test";
import { extrairNumeroSeiDoEventoHistorico, resolverMetadadosDocumentoSei } from "../src/dominio/autoriaDocumentalSei";
import { extrairNumeroSeiDoNomeArquivo, inferirTipoDocumento } from "../src/dominio/documentos";
import { extrairHistoricoDasLinhasHistoricoSei, obterUltimaMovimentacao } from "../src/dominio/historico";

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
});

