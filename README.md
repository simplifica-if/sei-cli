# sei-cli

CLI em Bun/TypeScript para extrair, ler e inspecionar fotografias locais de processos do SEI.

O projeto automatiza acesso ao SEI com Playwright, baixa ou lê documentos locais, organiza os artefatos em uma pasta de execução e produz um `processo.json` estruturado para consulta posterior por pessoas, scripts ou agentes de IA.

## O que é o SEI

O [Sistema Eletrônico de Informações (SEI)](https://www.gov.br/servicoscompartilhados/pt-br/assuntos/gestao-documental/sistema-eletronico-de-informacoes-sei) é uma solução oficial do Governo Federal para produção e gestão de documentos e processos administrativos eletrônicos. Foi desenvolvido pelo Tribunal Regional Federal da 4ª Região (TRF-4) e é cedido gratuitamente a instituições públicas desde 2013, com foco em eficiência administrativa.

Este CLI não substitui o SEI nem altera processos: ele apenas ajuda a criar snapshots locais pesquisáveis de processos aos quais o usuário já tem acesso.

## Recursos

- Extrai processos diretamente do SEI usando `SEI_USUARIO` e `SEI_SENHA`.
- Lê exportações locais a partir de um `.zip` ou de um diretório de documentos.
- Gera uma fotografia local com documentos, logs, metadados, histórico e instruções de pesquisa.
- Lista últimos documentos, últimos eventos de histórico e última atualização do snapshot.
- Compara um snapshot local com o histórico remoto para indicar se uma nova extração é recomendada.
- Imprime resumos humanos em português ou JSON estruturado com `--json`.

## Requisitos

- [Bun](https://bun.sh/)
- Navegadores do Playwright instalados para comandos que acessam o SEI remoto

```bash
bun install
bunx playwright install
```

## Configuração

Os comandos que acessam o SEI remoto leem variáveis do ambiente atual e de `.env.local`:

```bash
SEI_USUARIO=seu_usuario
SEI_SENHA=sua_senha
SEI_BASE_URL=https://sei.ifpr.edu.br
SEI_HEADLESS=true
```

`SEI_BASE_URL` é opcional e usa `https://sei.ifpr.edu.br` por padrão. `SEI_HEADLESS` também é opcional e usa `true` por padrão.

Nunca versionar `.env.local`, snapshots do diretório `dados/`, documentos baixados, ZIPs de processo, screenshots de erro ou logs que possam conter informações internas. O `.gitignore` já cobre esses caminhos.

## Uso

Use um número de processo no formato `00000.000000/0000-00`.

```bash
bun run sei extrair processo 00000.000000/0000-00
bun run sei ler processo 00000.000000/0000-00 --zip processo.zip
bun run sei ler processo 00000.000000/0000-00 --diretorio documentos/
bun run sei localizar link 00000.000000/0000-00
```

Por padrão, cada comando imprime um resumo para leitura humana. Adicione `--json` para saída estruturada:

```bash
bun run sei extrair processo 00000.000000/0000-00 --json
```

Use `--saida <dir>` para escolher explicitamente a pasta de saída:

```bash
bun run sei ler processo 00000.000000/0000-00 --diretorio documentos/ --saida dados/sei/exemplo
```

## Inspecionar um snapshot

Depois de uma extração, use a pasta de execução como `<runDir>`:

```bash
bun run sei inspecionar ultima-atualizacao <runDir>
bun run sei inspecionar documentos <runDir> --ultimos 5
bun run sei inspecionar historico <runDir> --ultimos 10
```

Todos os comandos de inspeção aceitam `--json`:

```bash
bun run sei inspecionar historico <runDir> --ultimos 50 --json
```

## Verificar atualização

Use `verificar atualizacao` quando já existe uma fotografia local e você precisa saber se ela ainda corresponde ao histórico remoto do SEI:

```bash
bun run sei verificar atualizacao processo 00000.000000/0000-00 --snapshot <runDir> --json
```

O comando acessa o SEI, consulta o histórico remoto completo e compara com o `historico` salvo em `<runDir>/processo.json`. Ele não baixa documentos nem altera o snapshot local.

A saída informa:

- `atualizado`: `true` quando o histórico remoto coincide com o snapshot.
- `precisa_extrair`: `true` quando há diferença e uma nova extração é recomendada.
- `ultima_movimentacao_local` e `ultima_movimentacao_remota`.
- totais de eventos de histórico local e remoto.

Quando `precisa_extrair` for `true`, gere uma nova fotografia:

```bash
bun run sei extrair processo 00000.000000/0000-00
```

## Estrutura gerada

Cada execução cria uma pasta parecida com:

```text
dados/sei/<numero-processo>/<execucao>/
  AGENTS.md
  processo.json
  processo.zip
  documentos/
  logs/execucao.log
```

`processo.json` é o índice canônico do snapshot. Campos úteis:

- `numero_processo`, `tipo_processo`, `especificacao` e dados de origem.
- `ultima_movimentacao` e `historico` para movimentação administrativa.
- `documentos[].caminho_relativo` para abrir arquivos extraídos.
- `documentos[].assinantes_html` para nomes identificados em assinaturas HTML.
- `documentos[].unidade_sei` e `documentos[].caminho_hierarquico` quando a árvore do processo estiver disponível.

O `AGENTS.md` dentro da pasta de execução contém instruções específicas para pesquisar e citar aquele snapshot.

## Para agentes de IA

Este repositório foi pensado para produzir pastas que agentes de IA possam pesquisar depois. Cada snapshot é autocontido: ele inclui documentos, metadados, histórico, logs e um `AGENTS.md` próprio com instruções específicas para análise daquele processo.

Ao trabalhar com um snapshot gerado, comece por `<runDir>/processo.json` em vez de abrir documentos soltos. Use `ultima_movimentacao` e `historico` para entender o andamento administrativo, `documentos[].caminho_relativo` para localizar arquivos, `documentos[].assinantes_html` para nomes extraídos de assinaturas HTML e `documentos[].unidade_sei`/`documentos[].caminho_hierarquico` quando a árvore do processo estiver disponível.

Comandos úteis para orientar uma análise:

```bash
bun run sei inspecionar ultima-atualizacao <runDir> --json
bun run sei inspecionar documentos <runDir> --ultimos 20 --json
bun run sei inspecionar historico <runDir> --ultimos 50 --json
bun run sei verificar atualizacao processo 00000.000000/0000-00 --snapshot <runDir> --json
```

Para respostas baseadas em documentos do snapshot, cite o número SEI, o título e o caminho relativo do documento. Para respostas baseadas no andamento processual, cite também a data e a descrição do item em `historico[]`.

## Desenvolvimento

```bash
bun run typecheck
bun test
```

## Cuidados antes de publicar

Antes de abrir o repositório, confira:

- `git status --short` não mostra arquivos inesperados.
- `.env.local` existe apenas localmente e não está rastreado.
- `dados/`, `tmp/`, ZIPs, PDFs, documentos exportados e logs não estão rastreados.
- O histórico Git não contém credenciais, tokens, chaves privadas ou documentos reais.
- Exemplos públicos usam placeholders, não números de processos sensíveis.
