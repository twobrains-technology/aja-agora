# Away — revisar as conversas de produção dos últimos 2 dias, corrigir o que elas mostrarem, e fechar a dívida do prompt publicado ≠ prompt do código

- **Início:** 2026-08-15 23:42 · **Sessão:** aja-agora / `agent-conversation-review`
- **Critério de pronto:**
  1. Regra do prompt gerenciado escrita no `CLAUDE.md` do projeto;
  2. Verificação determinística de "prompt publicado ≠ código" existindo, com teste verde;
  3. Hook ativo que avisa/obriga ao editar os arquivos de prompt;
  4. Dossiê do especialista incorporado e seus P0 corrigidos com TDD (teste falhando primeiro);
  5. Feature de acolhida N1 pós-handoff criticada pelo especialista e implementada;
  6. `pnpm typecheck` e `pnpm test:unit` verdes no fim.
- **Status:** EM ANDAMENTO

## Decisões

### D1 · 23:20 — Ambiente do workspace consertado na FONTE, não só aqui
- **Contexto:** `pnpm test:unit` falhava com `ECONNREFUSED` em arquivos que tocam DB. Não era
  código: o `.env.local` nasce como cópia do `.env.example` e traz `DATABASE_URL` legado
  (`localhost:5433`, database canônico), enquanto o workspace usa `aja_agora_ws_basalt_starburst`
  no `aja-shared-pg`. A memória do projeto já registrava o sintoma (13/08), e ele voltou.
- **Decidi:** corrigir o `.env.local` **e** o `bootstrap-workspace.sh` da skill global `local-dev`,
  que nunca reescrevia `DATABASE_URL`/`REDIS_URL` — só gravava `WORKSPACE_DB_NAME`. Agora ele
  deriva as duas URLs das mesmas variáveis que o compose usa, e é idempotente (testado rodando 2×).
- **Alternativas:** só arrumar o `.env.local` daqui (deixaria o próximo workspace quebrado igual);
  documentar na memória e seguir (já estava documentado, e voltou mesmo assim).
- **Reversibilidade:** fácil (arquivo de skill, fora de repo do projeto).
- **Evidência:** suíte saiu de "807 testes com 1 arquivo abortando" para **389 arquivos / 2900
  testes verdes**. Também preenchi as 4 envs `BEVI_*` a partir de `tb/dev/aja-agora/env` — sem elas
  3 testes de descoberta falhavam por config ausente, não por defeito.

### D2 · 23:35 — O prompt de produção ESTÁ dessincronizado, mas não é a causa dos defeitos
- **Contexto:** hipótese de que os fixes não fazem efeito porque o runtime lê o prompt do Langfuse
  (label `production`) e só usa o código como fallback.
- **Verifiquei:** `aja-system-prompt` → v3 (13/08 15:50) **idêntica** ao código, caractere a
  caractere. `aja-turn-analyzer` → **v1, de 07/08**, 6.613 chars contra 7.054 do código. As 4
  linhas de exemplo que ensinam "200 respondendo sobre parcela ≠ bem de 200 mil" **não existem** na
  versão publicada; as strings `parcelaMensal`, `alvoDeBusca` e `INSTALLMENT` também não.
- **Decidi:** classificar como **dívida de deploy/observabilidade**, NÃO como causa-raiz. Motivo:
  o ensino essencial também vive no `.describe()` do schema Zod (`turn-analyzer.ts:75`), que vai ao
  modelo pelo código sempre; e há evidência empírica de que basta — na conversa `aebac770` (15/08
  12:09, com a v1 rodando) o cliente respondeu "2000" a uma pergunta de parcela e o estado gravou
  `alvoDeBusca: "parcela"`, `parcelaAlvo: 2000`, corretamente.
- **Reversibilidade:** n/a (é classificação).
- **Evidência:** comparação de texto via API do Langfuse de produção; caminho do dado em
  `src/lib/agent/orchestrator/analyze.ts:372-373`.

### ⚠️ PENDENTE-KAIRO · 23:38 — publicar o `aja-turn-analyzer` do código em produção
- **O que é:** rodar o sync para criar a v2 do `aja-turn-analyzer` com o texto do código (os 4
  exemplos de parcela × valor), label `production`. Efeito em ≤60s, sem deploy.
- **Por que não fiz:** muda o comportamento do agente em **produção** — blast radius alto, e o
  protocolo `to-saindo` proíbe deploy/prod sem ele. Ele perguntou "então podemos dizer que o prompt
  estava desatualizado?" e saiu antes de decidir.
- **Como destrava:** `pnpm sync-prompts` com `LANGFUSE_*` apontando para
  `https://langfuse.twobrainstechnology.com` (chaves em `tb/prod/aja-agora/env`). Reversível
  repondo a label `production` na v1. **Depois de publicar, `pnpm prompts:check` passa a ficar
  verde** — é a checagem que estou criando nesta sessão.

## Linha do tempo (resumida)
- 23:05 — túnel SSM aberto para o RDS de produção (leitura); 6 conversas de 14–15/08 extraídas
- 23:10 — especialista (`super-especialista-de-ia`) despachado para o dossiê de causa-raiz
- 23:20 — ambiente do workspace consertado (D1); suíte verde
- 23:35 — dessincronização do analyzer provada e classificada (D2); ressalva enviada ao especialista
- 23:42 — Kairo saiu; modo autônomo, foco em documentar a regra + hook obrigatório

## Relatório final (preencher ao encerrar)
