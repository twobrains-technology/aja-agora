---
data: 2026-07-04
bloco: bloco-jornada-conversa
escopo: FIX-215 — onde a conversa de lance re-entra no funil pós-reveal
autor: executor do bloco — pergunta feita via AskUserQuestion, respondida com a opção recomendada
---

# ADR — Onde a conversa de lance re-entra pós-reveal (FIX-215)

## Contexto

A Ata de 2026-07-04 (item 1, P0) tirou a pergunta de lance ("Pretende dar um
lance?") do início da jornada — ela intercalava 3 gates (`lance`,
`lance-value`, `lance-embutido`) entre o valor do bem e a busca, o que
Bernardo apontou como confuso ("todo consórcio tem lance; perguntar na
largada não faz sentido"). O novo fluxo é: valor → busca/reveal direto →
**só depois** a conversa de lance. Isto **move** (não apaga) o conceito —
reverte a *colocação* de FIX-92/118/212, não a existência da educação de
lance embutido.

Faltava decidir o **gatilho exato** de re-entrada no pós-reveal. O funil
pós-reveal já existente (Passo 5 da jornada canônica) segue esta sequência:
reveal (recomendação + comparativo) → `simulator-offer` (simulador de
contemplação 3/6/12 meses, incluindo o cenário "com lance embutido, a parcela
CAI pós-contemplação" — regra P5) → `decision` (card "Esse plano faz
sentido?"). O simulador **já** precisa do dado de lance pra desenhar esse
cenário diferencial.

## Opções consideradas

- **(a) Automático, logo após o reveal, antes do `simulator-offer`
  (RECOMENDADA).** Reinsere os gates `lance`/`lance-value`/`lance-embutido`
  (já existentes, só reposicionados) imediatamente após `search`/reveal,
  antes do simulador. Reaproveita 100% da UI e dos testes que já existem
  pros 3 gates — só muda a ORDEM na sequência do `nextGate()`. O simulador
  passa a rodar COM o dado de lance disponível, habilitando o cenário "parcela
  caindo" desde a primeira oferta do dial.
- **(b) Só quando o usuário demonstra interesse numa cota específica.** O LLM
  decide contextualmente que o usuário "parece interessado" numa oferta e
  abre a conversa de lance ali. Mais orgânico na superfície, mas depende de
  julgamento do modelo (não determinístico) e pode disparar 0×, 1× ou 3× na
  mesma conversa (o reveal mostra até 3 cartas) — contraria a Lei 4 do
  projeto (invariante crítico vira código, não regra-no-prompt) e arrisca
  repetir a pergunta ou nunca fazê-la.
- **(c) Via botão explícito "quero acelerar minha contemplação".** Opt-in
  manual — só pergunta lance se o usuário clicar. Reduz risco de pergunta
  indesejada, mas reintroduz fricção logo após o reveal e contraria o
  espírito da própria mudança da Ata (menos perguntas, mais fluidez); parte
  dos usuários nunca clicaria e nunca ficaria sabendo do lance embutido.

## Escolhida: (a) — automático, logo após o reveal, antes do `simulator-offer`

**Por quê:**
1. **Reuso determinístico.** Os 3 gates de lance já existem, com UI, copy e
   testes prontos (cassetes de `qualify-state`, FIX-92/118/212) — a mudança é
   só de POSIÇÃO na sequência de `nextGate()` (pré-`search` → pós-`search`,
   condicionado a `meta.revealCompleted`), não uma feature nova. Menor risco,
   menor superfície de bug.
2. **Alimenta o simulador.** O dial de contemplação (P5 da jornada) promete
   mostrar a parcela caindo com lance embutido — sem o dado coletado ANTES do
   `simulator-offer`, o dial só teria o cenário "sem lance" na primeira
   passada, obrigando um re-cálculo depois. Coletar antes elimina esse
   retrabalho e entrega a experiência completa já na primeira oferta.
3. **Fluxo linear, sem heurística de intenção.** Dispara sempre 1× por
   conversa, no mesmo ponto, nos dois canais (Web e WhatsApp) — paridade
   trivial de garantir e testar. Evita o problema de "quantas vezes
   perguntar" da opção (b) e a fricção/opt-in perdido da opção (c).

**Implementação:** `qualify-state.ts` — os gates `lance`/`lance-value`/
`lance-embutido` saem da sequência pré-`search` (entre `credit` e `search`) e
entram na sequência PÓS-reveal, condicionados a `meta.revealCompleted===true`
e antes de `simulator-offer`. `COLLECTION_GATES` e o handler-de-conclusão de
cada gate (web `route.ts`, WhatsApp `interactive-handlers.ts`/`adapter.ts`)
são ajustados para disparar `simulator-offer` ao fim de `lance-embutido`, em
vez de disparar `search`. Detalhe de execução no card `fix-215-remover-lance-do-inicio.md`.
