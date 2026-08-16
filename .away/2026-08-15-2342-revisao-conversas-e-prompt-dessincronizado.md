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

### D3 · 23:54 — o conserto é o SINAL, não o texto (commit `85b5b325`)
- **Contexto:** o Kairo pediu, ao sair: documentar no CLAUDE.md que mexer no prompt exige atualizar
  no Langfuse, e "se der, faz algum tipo de hook obrigando".
- **Decidi** três camadas, em vez de só a documentação:
  1. `src/lib/observability/langfuse/prompt-drift.ts` — comparação pura, sem rede, com 8 testes
     (escritos ANTES, vistos falhar). Acusa o que falta em produção **e** o que só existe lá
     (texto editado na UI, sem review — o caminho inverso é tão perigoso quanto).
  2. `pnpm prompts:check` — busca a label `production` e falha com exit 1. Rodado contra produção,
     reproduziu o achado e listou as 4 linhas ausentes.
  3. Hook de projeto (`.claude/hooks/prompt-sync-guard.py` + `.claude/settings.json`): avisa no
     `PostToolUse` ao editar os arquivos de prompt, e barra o `Stop` **uma vez** se ficaram
     modificados.
- **Alternativas:** só escrever a regra no CLAUDE.md (já havia memória sobre isso e o defeito
  voltou mesmo assim — documento não é guarda); bloquear o Stop indefinidamente (travaria a sessão
  em laço, já que publicar em prod depende de decisão dele, que nem sempre está disponível);
  bloquear no pre-commit (o sync acontece no deploy, não no commit — barraria commit legítimo).
- **Reversibilidade:** fácil (git revert; hook desligável em `/hooks`).
- **Evidência:** 8 testes verdes; `pnpm prompts:check` contra produção sai 1 e imprime as 4 linhas;
  hook testado por pipe nos 5 cenários (arquivo de prompt, arquivo qualquer, stop limpo, stop
  sujo, stop repetido). O teste do hook achou um bug real: em worktree do Superset `.git` é
  ARQUIVO, e `.git/<subdir>` estourava `NotADirectoryError` — agora resolve por
  `git rev-parse --absolute-git-dir`.

### D4 · 23:52 — 28 envs de dev preenchidas para destravar o gate
- **Contexto:** o pre-commit barrou com 5 testes falhando (`IDENTITY_ENC_KEY ausente`,
  `ECONNREFUSED :3000`). Mesma classe do D1: config ausente parecendo defeito de código.
- **Decidi:** preencher no `.env.local` todas as envs de `tb/dev/aja-agora/env` que estavam
  ausentes/vazias (28), exceto `CLAUDE_CODE_OAUTH_TOKEN` (token de ferramenta, não é env de app) e
  as de infra local do workspace (essas o bootstrap já resolve, ver D1). **Não** usei `--no-verify`.
- **Reversibilidade:** fácil (arquivo gitignored).
- **Evidência:** `pnpm test:pre-commit` de 5 falhas → **66 arquivos / 333 testes verdes**.
- **A fazer (não fiz):** o `bootstrap-workspace.sh` poderia puxar essas envs do Secrets Manager —
  `local-dev.conf` já declara `AWS_SECRET_NAME`. Ficaria fora do escopo desta sessão; anotado aqui
  para não se perder.

### D5 · 00:05 — o P0-1 do dossiê, corrigido apagando a segunda cópia (commit `c9dc5b70`)
- **Contexto:** o especialista provou a causa da venda perdida: o `FIX-386` (28/07) passou a exigir
  um "sim" para contratar (`nextGate` pede `escolha` ou `decisionAccepted`) e **só a web foi
  ajustada**. No WhatsApp o clique gravava apenas `decisionDispatched`, o funil voltava a
  `decision` em todo turno, `contract_form` nunca era emitido e nenhuma proposta chegava à Bevi —
  daí o agente anunciar um pré-cadastro inexistente na `9b9f9aab`.
- **Decidi:** não "ensinar o WhatsApp a gravar", e sim criar `lib/agent/aceite.ts` como escritor
  ÚNICO, usado pelos dois canais, com a mesma precondição (groupId conferido contra as ofertas
  exibidas). O teste que fecha a classe é o de **paridade de canal**, não os casos individuais.
- **Alternativas:** replicar a escrita no handler do WhatsApp (mantinha duas cópias e a próxima
  mudança no contrato reabriria o buraco — foi o que aconteceu no FIX-400 e no FIX-406).
- **Reversibilidade:** fácil (git revert).
- **Evidência:** TDD — 4 testes falhando primeiro (`expected undefined to match object`,
  `expected 'decision' to be 'contract'`), verdes depois. Suíte inteira: **391 arquivos / 2914
  testes**. O guard `FIX-411` (allowlist de quem cria `escolha`) acusou o arquivo novo, como
  projetado; declarei com o porquê.

### D6 · 00:12 — a feature N1, com o desenho que a crítica corrigiu (commit `d8a3fad7`)
- **Contexto:** o Kairo pediu a acolhida N1 pós-handoff. O especialista criticou antes de eu
  implementar, e mudou três coisas.
- **Decidi seguir a crítica na íntegra:**
  1. **A premissa estava errada.** A mesa não ignorou a cliente: a notificação levou 42 min para
     ser `delivered` e **17h24 para ser `read`**, com o painel sem nenhum listener. O N1 é
     cobertor; a campainha quebrada é P0 separado (ainda **não** feito — ver pendências).
  2. **Não é caminho novo:** é o watchdog `retomada` com outro gatilho e outro directive. Recusei
     inventar `n1AckAt` (seria uma terceira convenção de anti-repetição) e reusei a forma
     `{attempts, lastAt}`.
  3. **Não pode ser inline no inbound:** a geração leva 3–8 s e a mesa respondeu em <1 min em três
     casos reais. A decisão virou função pura, re-lida imediatamente antes de emitir, com teste
     de corrida. Se a mesa falar nesse intervalo, a acolhida é descartada — e o contador NÃO é
     revertido, de propósito.
- **Também recusei, por recomendação dele:** citar tempo de fila (havia handoff aberto há 129 h) e
  prometer prazo (não existe expediente cadastrado no código).
- **Reversibilidade:** fácil — a feature roda por worker, desligável removendo a chamada no ciclo.
- **Evidência:** 25 testes novos verdes; suíte **393 arquivos / 2939 testes**.

## Linha do tempo (resumida)
- 23:05 — túnel SSM aberto para o RDS de produção (leitura); 6 conversas de 14–15/08 extraídas
- 23:10 — especialista (`super-especialista-de-ia`) despachado para o dossiê de causa-raiz
- 23:20 — ambiente do workspace consertado (D1); suíte verde
- 23:35 — dessincronização do analyzer provada e classificada (D2); ressalva enviada ao especialista
- 23:42 — Kairo saiu; modo autônomo, foco em documentar a regra + hook obrigatório

## Relatório final (preencher ao encerrar)
