# sei-cli

CLI em Bun para extrair e inspecionar dados de processos do SEI.

## Comandos principais

```bash
bun run sei extrair processo 23411.018179/2025-81
bun run sei ler processo 23411.018179/2025-81 --zip processo.zip
bun run sei ler processo 23411.018179/2025-81 --diretorio documentos/
bun run sei inspecionar ultima-atualizacao dados/sei/23411.018179_2025-81/<execucao>
bun run sei inspecionar documentos dados/sei/23411.018179_2025-81/<execucao> --ultimos 5
bun run sei inspecionar historico dados/sei/23411.018179_2025-81/<execucao> --ultimos 10
```

Por padrão, os comandos imprimem um resumo humano em português. Use `--json` para saída estruturada.

## Para agentes de IA

Este repositório foi pensado para gerar pastas que agentes de IA possam pesquisar depois. Cada execução cria uma fotografia local de um processo e inclui um `AGENTS.md` específico para aquele snapshot:

```text
dados/sei/<numero-processo>/<execucao>/
  AGENTS.md
  processo.json
  processo.zip
  documentos/
  logs/execucao.log
```

Em geral, use `processo.json` como índice canônico, `ultima_movimentacao` e `historico` para entender a movimentação administrativa, `documentos[].caminho_relativo` para abrir arquivos, e `documentos[].unidade_sei`/`documentos[].caminho_hierarquico` para aproveitar a árvore do processo quando ela estiver disponível. Para instruções completas de pesquisa e citação, leia o `AGENTS.md` dentro da pasta de execução.

Comandos úteis para começar:

```bash
bun run inspecionar ultima-atualizacao <runDir> --json
bun run inspecionar documentos <runDir> --ultimos 20 --json
bun run inspecionar historico <runDir> --ultimos 50 --json
```

## Variáveis de ambiente

`extrair` lê `.env.local` e o ambiente atual:

- `SEI_USUARIO`
- `SEI_SENHA`
- `SEI_BASE_URL` opcional, padrão `https://sei.ifpr.edu.br`
- `SEI_HEADLESS` opcional, padrão `true`
