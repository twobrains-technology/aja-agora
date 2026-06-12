# Away — Construir o "contexto perfeito" da jornada Aja Agora (assessor de negócio)

- **Início:** 2026-06-12 09:10 · **Sessão:** aja-agora/develop
- **Critério de pronto:** estrutura de docs commitada contendo (a) primer de consórcio educativo, (b) visão macro da jornada perfeita ponta-a-ponta, (c) gap analysis atual×perfeito por etapa, (d) spec de comportamento pós-envio-de-documento por canal (web/WhatsApp) com MVP e futuro, (e) índice/convenção de manutenção do contexto vivo, (f) perguntas abertas pro Kairo/Bernardo/Bevi — tudo validado contra `docs/jornada/jornada-canonica.md` (que continua sendo a REGRA).
- **Status:** COMPLETO

## Decisões
<!-- adicionar NA HORA, numeradas, mais recente por último -->

### D1 · 09:25 — Estrutura vive em `docs/visao/`, separada da jornada canônica
- **Contexto:** o Kairo pediu uma estrutura pro "contexto perfeito da aplicação". `docs/jornada/jornada-canonica.md` tem status especial (REGRA do cliente, origem docx) — a visão de assessoria não pode se misturar com ela nem parecer que a sobrepõe.
- **Decidi:** criar `docs/visao/` com 7 docs (README + primer + jornada-perfeita + gap-analysis + pos-contratacao-canais + roadmap-mvp + perguntas-abertas), com hierarquia de autoridade explícita no README: docx/canônica = regra; visao/ = camada de produto que PROPÕE; divergência com o docx vira recalibração com o cliente (padrão DES-1), nunca "defeito do docx".
- **Alternativas:** dentro de `docs/jornada/` (descartado: misturaria regra do cliente com proposta nossa); `docs/negocio/` (descartado: "visão" comunica melhor o north star pedido).
- **Reversibilidade:** fácil (git revert / mv).
- **Evidência:** commit a seguir.

### D2 · 09:25 — Achado crítico promovido a tese central: "retorno web pós-contratação é o elo quebrado"
- **Contexto:** verifiquei no código que `conversationId` web nasce de `generateId()` a cada mount sem persistência (`src/lib/chat/provider.tsx:80`) e que TODO o estado terminal pós-fechamento (`contractClosed`, FIX-11) vive no meta da CONVERSA. WhatsApp retoma (chave = telefone); web não — quem contratou e volta pela web é tratado como lead novo, com risco do agente re-vender. Agravante: o copy pós-docs promete "te aviso de cada passo" sem existir NENHUM mecanismo proativo (sem polling agendado, sem webhook — só `check_proposal_status` on-demand).
- **Decidi:** estruturar o gap-analysis e o roadmap com esse achado como P0 pré-campanha (campanha → tráfego pago → retorno web frequente). É recomendação de assessoria, não implementação — nada de código mudado.
- **Alternativas:** tratar só o pós-boleto como tema central (descartado: o doc `jornada-ate-boleto.md` já cobre bem; o elo web era invisível).
- **Reversibilidade:** n/a (recomendação em doc).
- **Evidência:** `src/lib/chat/provider.tsx:80-82`, `src/lib/agent/system-prompt.ts:841-865`, `src/lib/agent/orchestrator/tool-policy.ts:32`, `docs/jornada/CONTEXT.md` (D17 — "conversa anterior fica órfã").

## Linha do tempo (resumida)
- 09:10 — Ativação. Kairo saiu. Começando estudo: docs/jornada/ + varredura de código (fechamento Bevi, canais web/WhatsApp, funil).
- 09:15 — Lidos: jornada-canonica.md, CONTEXT.md (D1-D18, DES-1), jornada-ate-boleto.md (G1-G5, POC de status). 2 agents Explore mapearam fechamento Bevi + canais web/WhatsApp.
- 09:22 — Verificações diretas no código: `check_proposal_status` em runtime ✅; `contractClosedSection` (estado terminal) ✅; web `conversationId` efêmero ❌ (achado D2); landing existe ✅; UTM/atribuição ❌.
- 09:25 — D1/D2 logadas. Escrevendo os 7 docs de `docs/visao/`.
- 09:45 — 7 docs escritos (README, consorcio-primer, jornada-perfeita, gap-analysis, pos-contratacao-canais, roadmap-mvp, perguntas-abertas). Commit + push + vault.

## Relatório final (preencher ao encerrar)
- **Resultado vs critério de pronto:** PASSOU em todos os itens — (a) primer ✅
  `docs/visao/consorcio-primer.md`; (b) jornada perfeita ponta-a-ponta (camadas 0-8) ✅
  `jornada-perfeita.md`; (c) gap analysis por camada com evidência `arquivo:linha` ✅
  `gap-analysis.md`; (d) spec pós-documento por canal (cenários C1-C6, hoje×MVP×futuro,
  critérios binários) ✅ `pos-contratacao-canais.md`; (e) índice + hierarquia de
  autoridade + convenção de manutenção ✅ `README.md`; (f) perguntas abertas por dono
  (Kairo/Bevi/Bernardo) com IDs rastreáveis ✅ `perguntas-abertas.md`. Tudo referencia a
  jornada canônica como REGRA (hierarquia explícita no README — visão propõe, não sobrepõe).
- **O que NÃO fiz e por quê:** (1) nenhum código tocado — o pedido era assessoria de
  negócio, não implementação; (2) sem done-report — o entregável JÁ É documentação de
  stakeholder, seria redundante; (3) não disparei perguntas à Bevi/Bernardo — comunicação
  externa é PENDENTE-KAIRO por natureza (estão todas em `perguntas-abertas.md` prontas
  pra ele encaminhar); (4) WebSearch de domínio foi leve (1 consulta) — a mecânica de
  consórcio é estável e o que é incerto (comissão, SLA, boleto) está marcado A CONFIRMAR
  em vez de chutado.
- **Revisar primeiro:** D2 (tese central: retorno web pós-contratação como gap nº 1
  pré-campanha — dirige o P0 do roadmap); o corte do P0 em `roadmap-mvp.md` (P0.1-P0.3
  como mínimo absoluto pra ligar mídia); e a recomendação P0.2 de mudar o copy "te aviso
  de cada passo" caso o acompanhamento proativo não entre junto (mexe em promessa que o
  cliente já vê hoje).
- **Próximos passos sugeridos:** (1) Kairo responde/encaminha Q-K1..K4 e Q-B1..B8 de
  `perguntas-abertas.md`; (2) decidir a janela do P0 vs data da campanha (Q-K3);
  (3) P0.1 (retorno web) é candidato natural ao primeiro bloco de implementação —
  quando aprovado, segue o Feature Development Workflow do projeto (plano → PO Lead →
  TDD → QA crítico).
