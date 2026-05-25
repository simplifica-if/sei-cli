import { writeFile } from "node:fs/promises";
import { chromium, type Dialog, type Frame, type Locator, type Page } from "playwright";
import type { EventoExtracao } from "../tipos";
import { mapearMetadadosDocumentosPorHistorico } from "../dominio/autoriaDocumentalSei";
import { obterUltimaMovimentacao } from "../dominio/historico";
import { agoraIso } from "../dominio/tempo";
import { textoCompacto, validarNumeroProcessoSei } from "../dominio/texto";
import { extrairHistoricoDasLinhasHistoricoSei } from "../dominio/historico";
import {
  caminhoRelativoAoRun,
  escreverProcessoJson,
  extrairZipParaDiretorio,
  prepararDiretorioExecucao,
} from "./arquivos";
import { montarProcessoDeDiretorio } from "./local";

interface CredenciaisSei {
  usuario: string;
  senha: string;
}

interface MetadadosProcessoSei {
  tipo_processo?: string;
  especificacao?: string;
}

const PADROES_MENSAGEM_FALHA_AUTENTICACAO_SEI = [
  /usuário ou senha inválida\.?/i,
  /usuario ou senha invalida\.?/i,
  /autenticação em dois fatores/i,
  /autenticacao em dois fatores/i,
  /sessão bloqueada/i,
  /sessao bloqueada/i,
  /usuário bloqueado/i,
  /usuario bloqueado/i,
  /acesso negado/i,
  /captcha/i,
  /verificação anti-bot/i,
  /verificacao anti-bot/i,
] as const;

function lerBooleano(valor: string | undefined, padrao: boolean) {
  if (!valor) {
    return padrao;
  }
  return ["1", "true", "sim", "yes"].includes(valor.toLowerCase());
}

function lerCredenciaisSei(): CredenciaisSei {
  const usuario = process.env.SEI_USUARIO?.trim();
  const senha = process.env.SEI_SENHA?.trim();
  if (usuario && senha) {
    return { usuario, senha };
  }
  throw new Error(
    "Credenciais do SEI não encontradas. Defina SEI_USUARIO e SEI_SENHA em .env.local ou no ambiente atual.",
  );
}

function esperar(ms: number) {
  return new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), ms);
  });
}

function localizarFramesRelevantes(page: Page) {
  return [
    page.mainFrame(),
    ...page
      .frames()
      .filter((frame) =>
        ["ifrArvore", "ifrVisualizacao"].includes(frame.name()) ||
        /arvore|visualizacao|controlador\.php/i.test(frame.url()),
      ),
  ];
}

async function localizarPrimeiroLocator(page: Page, tentativas: Array<(frame: Frame) => Locator>) {
  for (const frame of localizarFramesRelevantes(page)) {
    for (const tentativa of tentativas) {
      const locator = tentativa(frame).first();
      if ((await locator.count().catch(() => 0)) > 0) {
        return locator;
      }
    }
  }
  return null;
}

async function localizarPrimeiroLocatorNaPagina(page: Page, tentativas: Array<() => Locator>) {
  for (const tentativa of tentativas) {
    const locator = tentativa().first();
    if ((await locator.count().catch(() => 0)) > 0) {
      return locator;
    }
  }
  return null;
}

function extrairMensagemFalhaAutenticacaoSei(textos: string[]) {
  for (const texto of textos) {
    const normalizado = textoCompacto(texto);
    for (const padrao of PADROES_MENSAGEM_FALHA_AUTENTICACAO_SEI) {
      const correspondencia = normalizado.match(padrao);
      if (correspondencia?.[0]) {
        return /[.!?]$/.test(correspondencia[0]) ? correspondencia[0] : `${correspondencia[0]}.`;
      }
    }
  }
  return undefined;
}

async function coletarTextosVisiveis(page: Page) {
  const textos = new Set<string>();
  for (const frame of localizarFramesRelevantes(page)) {
    const texto = await frame.locator("body").innerText().catch(() => "");
    const normalizado = textoCompacto(texto);
    if (normalizado) {
      textos.add(normalizado);
    }
  }
  return [...textos];
}

async function campoContemValor(campo: Locator, valor: string) {
  return campo.evaluate((elemento, valorEsperado) => {
    const input = elemento as HTMLInputElement & { _realfield?: HTMLInputElement };
    const campoReal =
      input._realfield ??
      (input.previousElementSibling instanceof HTMLInputElement
        ? input.previousElementSibling
        : null);
    return input.value === valorEsperado || campoReal?.value === valorEsperado;
  }, valor);
}

async function preencherCampo(campo: Locator, valor: string) {
  await campo.waitFor({ state: "visible" });
  await campo.scrollIntoViewIfNeeded();
  await campo.click();
  await campo.fill("");
  await campo.fill(valor);

  if (await campoContemValor(campo, valor)) {
    return;
  }

  await campo.evaluate((elemento, novoValor) => {
    const input = elemento as HTMLInputElement & { _realfield?: HTMLInputElement };
    const campoReal =
      input._realfield ??
      (input.previousElementSibling instanceof HTMLInputElement ? input.previousElementSibling : null);
    const definirValor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    const destino = campoReal ?? input;
    destino.focus();
    definirValor?.call(destino, "");
    destino.dispatchEvent(new Event("input", { bubbles: true }));
    definirValor?.call(destino, novoValor);
    destino.dispatchEvent(new Event("input", { bubbles: true }));
    destino.dispatchEvent(new Event("change", { bubbles: true }));
    destino.blur();
  }, valor);

  if (!(await campoContemValor(campo, valor))) {
    throw new Error("Falha ao preencher um campo de login do SEI.");
  }
}

async function resolverUrlAcao(locator: Locator, origem: Page, mensagemErro: string) {
  const href = await locator.getAttribute("href").catch(() => null);
  if (!href) {
    throw new Error(mensagemErro);
  }
  return new URL(href, origem.url()).toString();
}

export async function extrairProcessoSei(args: {
  numeroProcesso: string;
  saida?: string;
}) {
  const numeroProcesso = validarNumeroProcessoSei(args.numeroProcesso);
  const baseUrl = process.env.SEI_BASE_URL?.trim() || "https://sei.ifpr.edu.br";
  const headless = lerBooleano(process.env.SEI_HEADLESS, true);
  const seletorPesquisa = "#txtPesquisaRapida";
  const paths = await prepararDiretorioExecucao({ numeroProcesso, saida: args.saida });
  const eventos: EventoExtracao[] = [];

  const registrar = async (etapa: string, mensagem: string, nivel: EventoExtracao["nivel"] = "info") => {
    const evento = { etapa, mensagem, nivel, criado_em: agoraIso() };
    eventos.push(evento);
    await writeFile(paths.caminhoLog, `[${evento.criado_em}] [${nivel}] [${etapa}] ${mensagem}\n`, {
      flag: "a",
    });
    console.error(mensagem);
  };

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    await registrar("login", "Abrindo página inicial do SEI.");
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

    const sessaoAtiva = async () => {
      for (const frame of localizarFramesRelevantes(page)) {
        if ((await frame.locator(seletorPesquisa).count().catch(() => 0)) > 0) {
          return true;
        }
      }
      return page.frames().some((frame) => ["ifrArvore", "ifrVisualizacao"].includes(frame.name()));
    };

    if (!(await sessaoAtiva())) {
      const credenciais = lerCredenciaisSei();
      const campoUsuario = await localizarPrimeiroLocatorNaPagina(page, [
        () => page.locator("#txtUsuario"),
        () => page.locator('input[name="txtUsuario"]'),
        () => page.locator('input[id*="usuario" i]'),
        () => page.getByLabel(/usuário|usuario/i),
      ]);
      const campoSenha = await localizarPrimeiroLocatorNaPagina(page, [
        () => page.locator("#pwdSenha"),
        () => page.locator("#txtSenha"),
        () => page.locator('input[type="password"]'),
        () => page.locator('input[id*="senha" i]'),
        () => page.getByLabel(/senha/i),
      ]);
      const botaoAcesso = await localizarPrimeiroLocatorNaPagina(page, [
        () => page.getByRole("button", { name: /acessar/i }),
        () => page.locator('input[type="submit"]'),
        () => page.locator('button[id*="acess" i]'),
      ]);

      if (!campoUsuario || !campoSenha || !botaoAcesso) {
        throw new Error(
          "Campos de login do SEI não localizados. A interface pode ter mudado; atualize o adaptador Playwright.",
        );
      }

      await registrar("login", "Preenchendo credenciais de acesso.");
      await preencherCampo(campoUsuario, credenciais.usuario);
      await preencherCampo(campoSenha, credenciais.senha);

      let mensagemDialogo: string | undefined;
      const aoAbrirDialogo = async (dialog: Dialog) => {
        mensagemDialogo = textoCompacto(dialog.message());
        await dialog.dismiss().catch(() => {});
      };
      page.on("dialog", aoAbrirDialogo);
      try {
        await botaoAcesso.click();
        const prazo = Date.now() + 12_000;
        while (Date.now() < prazo) {
          if (await sessaoAtiva()) {
            break;
          }
          const falha =
            mensagemDialogo ?? extrairMensagemFalhaAutenticacaoSei(await coletarTextosVisiveis(page));
          if (falha) {
            throw new Error(`Falha ao autenticar no SEI: ${falha}`);
          }
          await page.waitForLoadState("domcontentloaded", { timeout: 1_000 }).catch(() => {});
          await page.waitForTimeout(250);
        }
        if (!(await sessaoAtiva())) {
          throw new Error("Falha ao autenticar no SEI. Verifique credenciais, 2FA ou sessão bloqueada.");
        }
      } finally {
        page.off("dialog", aoAbrirDialogo);
      }
    }

    await registrar("pesquisa", `Pesquisando o processo ${numeroProcesso}.`);
    const campoPesquisa = page.locator(seletorPesquisa);
    await campoPesquisa.fill("");
    await campoPesquisa.fill(numeroProcesso);
    await Promise.all([
      page.waitForLoadState("domcontentloaded").catch(() => undefined),
      campoPesquisa.press("Enter"),
    ]);
    await page.waitForTimeout(2_000);

    const botaoZip = await localizarPrimeiroLocator(page, [
      (frame) => frame.getByRole("link", { name: /zip/i }),
      (frame) => frame.getByRole("button", { name: /zip/i }),
      (frame) => frame.locator('[title*="ZIP" i]'),
      (frame) => frame.locator('[aria-label*="ZIP" i]'),
      (frame) => frame.getByText(/^ZIP$/i),
    ]);
    if (!botaoZip) {
      throw new Error("Botão ou link de geração de ZIP não localizado no SEI.");
    }

    await registrar("download", "Solicitando ZIP completo do processo.");
    const primeiroDownload = page.waitForEvent("download", { timeout: 120_000 }).catch(() => null);
    await botaoZip.click();
    let download = await Promise.race([primeiroDownload, esperar(3_000)]);

    if (!download) {
      const gerarZip = await localizarPrimeiroLocator(page, [
        (frame) => frame.getByRole("button", { name: /gerar/i }),
        (frame) => frame.getByRole("link", { name: /gerar/i }),
        (frame) => frame.getByRole("button", { name: /confirmar|ok/i }),
        (frame) => frame.getByText(/gerar arquivo zip do processo/i),
      ]);
      if (gerarZip) {
        const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
        await gerarZip.click();
        download = await downloadPromise;
      } else {
        download = await primeiroDownload;
      }
    }

    if (!download) {
      throw new Error("O SEI não iniciou o download do ZIP dentro do tempo esperado.");
    }

    await download.saveAs(paths.caminhoZipOriginal);
    await registrar("download", `ZIP salvo em ${paths.caminhoZipOriginal}.`);
    await extrairZipParaDiretorio(paths.caminhoZipOriginal, paths.diretorioDocumentos);

    const metadados: MetadadosProcessoSei = await coletarMetadadosProcesso(page).catch(async (error) => {
      await registrar(
        "metadados",
        `Não foi possível coletar metadados do processo: ${error instanceof Error ? error.message : String(error)}`,
        "aviso",
      );
      return {} satisfies MetadadosProcessoSei;
    });
    const historico = await coletarHistoricoProcesso(page).catch(async (error) => {
      await registrar(
        "historico",
        `Não foi possível coletar histórico do processo: ${error instanceof Error ? error.message : String(error)}`,
        "aviso",
      );
      return [];
    });

    const processo = await montarProcessoDeDiretorio({
      numeroProcesso,
      origem: "playwright-sei",
      diretorioExecucao: paths.diretorioExecucao,
      diretorioDocumentos: paths.diretorioDocumentos,
      zipOriginalRelativo: caminhoRelativoAoRun(paths.diretorioExecucao, paths.caminhoZipOriginal),
      eventos,
    });
    processo.sei_base_url = baseUrl;
    processo.tipo_processo = metadados.tipo_processo;
    processo.especificacao = metadados.especificacao;
    processo.historico = historico;
    processo.ultima_movimentacao = obterUltimaMovimentacao(historico);
    const metadadosPorDocumento = mapearMetadadosDocumentosPorHistorico(historico);
    processo.documentos = processo.documentos.map((documento) => {
      const metadadosDocumento = documento.numero_sei
        ? metadadosPorDocumento[documento.numero_sei]
        : undefined;
      if (!metadadosDocumento) {
        return documento;
      }
      return {
        ...documento,
        criado_em: documento.criado_em ?? metadadosDocumento.criado_em,
        criado_por: documento.criado_por ?? metadadosDocumento.criado_por,
        modificado_em: documento.modificado_em ?? metadadosDocumento.modificado_em,
      };
    });

    return escreverProcessoJson({
      processo,
      diretorioExecucao: paths.diretorioExecucao,
      caminhoProcessoJson: paths.caminhoProcessoJson,
    });
  } catch (error) {
    await page.screenshot({ path: paths.caminhoScreenshotFalha, fullPage: true }).catch(() => {});
    await registrar("falha", error instanceof Error ? error.message : String(error), "erro").catch(
      () => {},
    );
    throw error;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function coletarMetadadosProcesso(page: Page): Promise<MetadadosProcessoSei> {
  const acao = await localizarPrimeiroLocator(page, [
    (frame) => frame.getByRole("link", { name: /consultar(?:\/alterar)? processo/i }),
    (frame) => frame.locator('a[href*="acao=procedimento_alterar"]'),
    (frame) => frame.locator('a[href*="acao=procedimento_consultar"]'),
    (frame) => frame.locator('[title*="Consultar/Alterar Processo" i]'),
    (frame) => frame.locator('[title*="Consultar Processo" i]'),
  ]);
  if (!acao) {
    return {};
  }

  const url = await resolverUrlAcao(acao, page, "Ação de consulta do processo sem URL.");
  const aba = await page.context().newPage();
  try {
    await aba.goto(url, { waitUntil: "domcontentloaded" });
    await aba.waitForTimeout(500);
    const texto = await aba.locator("body").innerText().catch(() => "");
    const tipo =
      texto.match(/Tipo do Processo\s*:?\s*([^\n\r]+)/i)?.[1]?.trim() ??
      (await aba.locator('select[name*="Tipo"], #selTipoProcedimento option:checked').innerText().catch(() => undefined));
    const especificacao =
      texto.match(/Especificação\s*:?\s*([^\n\r]+)/i)?.[1]?.trim() ??
      (await aba.locator('input[name*="Especificacao"], #txtDescricao').inputValue().catch(() => undefined));
    return {
      tipo_processo: tipo || undefined,
      especificacao: especificacao || undefined,
    };
  } finally {
    await aba.close().catch(() => {});
  }
}

async function coletarHistoricoProcesso(page: Page) {
  const acao = await localizarPrimeiroLocator(page, [
    (frame) => frame.getByRole("link", { name: /consultar andamento/i }),
    (frame) => frame.locator('[title*="Consultar Andamento" i]'),
    (frame) => frame.getByText(/consultar andamento/i),
  ]);
  if (!acao) {
    return [];
  }

  const url = await resolverUrlAcao(acao, page, "Ação de consultar andamento sem URL.");
  const aba = await page.context().newPage();
  try {
    await aba.goto(url, { waitUntil: "domcontentloaded" });
    await aba.waitForTimeout(500);
    const historicoCompleto = await localizarPrimeiroLocatorNaPagina(aba, [
      () => aba.getByRole("link", { name: /ver histórico completo/i }),
      () => aba.getByText(/ver histórico completo/i),
    ]);
    if (historicoCompleto) {
      await Promise.all([
        aba.waitForLoadState("domcontentloaded").catch(() => undefined),
        historicoCompleto.click(),
      ]);
      await aba.waitForTimeout(500);
    }
    const texto = await aba.locator("body").innerText().catch(() => "");
    return extrairHistoricoDasLinhasHistoricoSei(texto.split("\n"));
  } finally {
    await aba.close().catch(() => {});
  }
}
