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

## Variáveis de ambiente

`extrair` lê `.env.local` e o ambiente atual:

- `SEI_USUARIO`
- `SEI_SENHA`
- `SEI_BASE_URL` opcional, padrão `https://sei.ifpr.edu.br`
- `SEI_HEADLESS` opcional, padrão `true`
