# Roteiro de QA — Aja Agora (fonte da verdade do QA manual)

> Oráculo do QA dono-de-produto. A jornada de negócio é a [`jornada-canonica.md`](../jornada/jornada-canonica.md) (REGRA); este roteiro traduz ela em critérios verificáveis + especificidades de canal + não-bugs. Contexto/decisões: [`../jornada/CONTEXT.md`](../jornada/CONTEXT.md).
>
> **Estado (2026-07-02):** primeira semente do roteiro, criada na rodada `qa/auto-whatsapp`. A jornada WhatsApp **não pôde ser dirigida** nesta rodada (bloqueio de ambiente — ver Não-Bugs #1). Os critérios do canal WhatsApp abaixo são derivados do `docx` + código (`src/lib/whatsapp/`), **ainda não validados em tela**. Marcar como `⚠️ TELA-NÃO-VALIDADA` até rodar num ambiente com simulador habilitado.

## Escopo padrão da rodada

- **Tipo de bem:** auto (carro/moto). **Canal:** WhatsApp (paridade com web).
- **Fluxo:** do sonho à proposta, passos 1–5 da jornada canônica.
- **Ferramenta:** simulador interno `/admin/simulator/whatsapp` (waId sintético `SIM-<uuid>`), que roteia pelo MESMO `processTextMessage` do webhook Meta real, interceptando só a saída pra Meta API.

## Ambiente e pré-requisitos

- **Simulador é DEV-only.** `isSimulatorEnabled()` (`src/lib/utils/env.ts`) bloqueia quando `TB_ENV in {production, prod}`. Rodar em **DEV AWS / local** (`local-dev`), NÃO em prod (ver Não-Bugs #1).
- **Override de emergência (2026-07-02):** `SIMULATOR_FORCE_ENABLE=true|1` habilita o simulador ignorando o gate de `TB_ENV`, sem degradar OTP/rate-limit (afeta só `isSimulatorEnabled()`). Usar com cautela — em prod cria propostas Bevi/leads REAIS.
- **Contas de teste (nunca inventar CPF):** `secrets.sh decrypt contas-teste` → CONTA1 (Kairo): CPF/celular reais de homologação Bevi/Conexia. Fechar/simular é seguro (homologação). Apagar o `.env` ao fim.
- **Admin:** login em `/admin/login`.
- **Gate de merge do projeto:** `pnpm test:unit` (NÃO typecheck — `tsc` whole-repo já vermelho por dívida em test files).

## Jornada canônica → critérios verificáveis (passos 1–5)

| Passo | Comportamento esperado (docx) | Critério de aceite |
|---|---|---|
| 1. Necessidade | Botões Imóvel/Carro/Moto; "Como posso te chamar?" | Artefato de escolha de bem aparece; nome coletado; sem re-perguntar. |
| 2. Cliente | Já participou? → educação consórcio; valor do bem (slider); prazo; lance (Sim/Não/Talvez) + **valor do lance** se sim; educação de lance embutido pra QUALQUER resposta (FIX-4). Coleta CPF+celular+LGPD ao fim (D1). | Cada gate dispara na ordem; lance embutido educado sempre; identify pede CPF/celular antes de simular. |
| 3. Buscar | Anúncio com o número REAL de opções encontradas (FIX-7/D13). | Nº anunciado = nº de grupos reais; sem "3 opções" fixo. |
| 4. Avaliar | Recomendado PRIMEIRO + carrossel de TODAS as opções (D15); simulador 3/6/12 com números 100% da oferta ativa (coagidos server-side); card de decisão (contratar / outras opções / especialista). Cards SEM taxa adm/seguro/fundo (D14). | recommendation_card + comparison_table + simulation_result; números batem com a oferta Bevi; sem fees no card. |
| 5. Contratar | Confirmação de identidade (CPF mascarado, não re-pede — FIX-9); upload docs; proposta pronta ("Ver minha proposta" = PDF, NÃO "assinatura" — DES-1); resumo por WhatsApp (D5). | signature_handoff apresenta proposta (não promete assinatura); resumo enviado ou `contractSummaryPending`. |

## Especificidades do canal WhatsApp (validar bolhas / botões / fatiamento)

Fonte: `src/lib/whatsapp/formatter.ts`, `interactive-handlers.ts`, `processor.ts`, simulador `src/components/admin/simulator/whatsapp/`.

- **Bolhas:** user = enviado (verde/direita); assistant = recebido (cinza/esquerda). Cada mensagem persistida vira uma bolha (`toStageItems`).
- **Formatação texto (`formatTextForWhatsApp`):**
  - Markdown `**bold**`/`## heading` → `*bold*` do WhatsApp. **Não** deve vazar `**` cru nem `#`.
  - **Nunca** vazar instruções de sistema (`[sistema:...]`, `[contexto:...]`, `[fluxo:...]`) — são strippadas; se aparecerem na bolha = defeito.
  - Não repetir template de "Show! Já tenho seu perfil pronto" (alucinação strippada).
- **Fatiamento (`splitMessage`, maxLen 4096):** mensagens longas quebram em parágrafo → frase → hard split. Cada chunk vira uma bolha separada. Validar que não corta no meio de palavra quando há fronteira e que a ordem é preservada.
- **Botões/interativo:** gates com opções (bem, lance Sim/Não/Talvez, card de decisão) devem virar botões interativos no WhatsApp, não texto solto pedindo pra digitar. Handlers em `interactive-handlers.ts`.
- **Artefatos ricos (cards/carrossel/simulador):** no WhatsApp degradam pra texto formatado (a UI não tem os cards React). Validar que a degradação é graciosa e os números aparecem (paridade de conteúdo, não de forma).
- **Voz do agente:** sem meta-narrativa do mecanismo ("vou usar a ferramenta", "buscar no sistema"), sem fórmulas de robô, PT-BR correto com acentos.

## Não-Bugs conhecidos (não gritar)

1. **Simulador `/admin/simulator/*` dá 404 em PROD — por design.** `TB_ENV=production` bloqueia (`env.ts`). QA de canal WhatsApp roda em DEV/local. (Memória `project_aja_simulador_404_prod`.) — *Nuance/defeito à parte:* a **página** do simulador em prod não bloqueia como as APIs (prerender estático serve a UI + "HTTP 404" cru) → card `docs/correcoes/inbox/2026-07-02-simulador-page-guard-estatico-prod.md`.
2. **Cards não exibem taxa adm/seguro/fundo/custo total** (D14, decisão Bernardo). Campos seguem no payload, só não são exibidos. Disclosure legal vive no PDF da proposta.
3. **Assinatura digital self-service não existe** (DES-1). Fechamento entrega PDF de proposta + coleta de docs; assinatura/efetivação é da mesa (back office).
4. **Fluxo de caixa mês a mês** (docx passo 4) ainda não implementado — aguarda desenho com Bernardo.
5. **E2E automatizado contra Bevi real** bloqueado por D3 (create-proposal cria proposta real; falta hash/loja de homologação ou CPF de teste autorizado).

## Regressão exigida (bug de comportamento de agent/LLM)

3 camadas obrigatórias (CLAUDE.md): (1) structural `src/**/*.test.ts`; (2) cassette determinístico em `tests/regression/agent-trajectory.test.ts`; (3) eval LLM nightly. Não aceitar fix de comportamento de agent sem cassette na Camada 2.
