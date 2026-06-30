# Diário — Onda jornada-entrada (revisão da jornada de entrada + simulador conversacional)

- **Início:** 2026-06-28/29 · **Sessão:** aja-agora/feat-jornada-whatsapp (orquestrador desta onda)
- **Base:** `integ/jornada-entrada` (forka da develop `f433d3e7`, pós-onda-rev) · workspace Superset `349c0817`
- **Decisão do Kairo (ATUALIZADA 2026-06-29):** quando a onda terminar, **LEVAR pra develop** (`finish-wave --to-develop`) e **rodar qa-autonomo na develop** logo após. (Revogou a decisão anterior de não levar.)

## Origem
Kairo pediu (sessão WhatsApp) revisão da jornada com criticidade nos componentes de escolha
("mais pro chat, não robótico, UX legal"). Avaliação completa do canal + 2 rodadas de decisão.
Spec: `docs/specs/2026-06-28-jornada-entrada-simulador-conversacional-design.md`.

A onda só foi disparada DEPOIS da onda `revisao-modelo-errado` integrar na develop (era conflito
nível 4 — mesmos arquivos). Terreno livre confirmado (develop em `f433d3e7`, QA validado).

## Decisões do Kairo (2026-06-28)
1. Valor = valor do BEM, por conversa (WhatsApp); web = agulha simples 1k em 1k.
2. Componente complexo de valor (value_picker) sai.
3. Prazo removido da entrada (os 2 canais).
4. Qualificação híbrida (binárias=botão, valor=conversa).
5. Escolha do grupo = card recomendada + "ver outras".
6. Simulador de contemplação no WhatsApp = loop conversacional (web mantém a agulha).

## Onda disparada (onda 1, 3 blocos — FIX-103..109)
- **bloco-jornada-entrada** (`feat/jornada-entrada-conversacional`) → `e543139a-1198-4969-a33b-5926e00cb73f` — FIX-103..106 (agente: remove prazo, valor conversa, qualificação híbrida, simulador loop). **Coração — define o contrato.**
- **bloco-web-valor-agulha** (`feat/web-valor-agulha-simples`) → `02eb892e-be9b-4924-b3a1-849537cc691b` — FIX-107 (slider simples 1k na web).
- **bloco-whatsapp-apresentacao** (`feat/whatsapp-entrada-simulador`) → `6ad69f02-bc04-4b08-b47d-9de6be3aa382` — FIX-108/109 (card recomendada+ver outras, apresentação do simulador).

Web e whatsapp são nível 3 (dependem do contrato do bloco-jornada via stub). Arquivos disjuntos
(`src/lib/agent/**` × `src/components/chat/**` × `src/lib/whatsapp/**`) → merge limpo esperado.

## Próximo passo (orquestrador — notch re-invoca; escopar SEMPRE aos 3)
```
cd /Users/kairo/.superset/worktrees/ac2f26b2-a2ba-4148-96b8-47b55f0dd5ad/integ/jornada-entrada
merge-wave.sh poll  --wave 1 --block bloco-jornada-entrada --block bloco-web-valor-agulha --block bloco-whatsapp-apresentacao   # repetir até all_terminal
merge-wave.sh merge --wave 1 --target integ/jornada-entrada   # gate test:unit por bloco; quarentena o que reprovar
finish-wave.sh jornada-entrada --to-develop   # leva integ/jornada-entrada → develop (gate test:unit) + apaga base e workspaces
# DEPOIS do merge na develop: rodar qa-autonomo na develop (skill qa-autonomo). Decisão Kairo 2026-06-29.
```
⚠️ Escopar poll/merge aos 3 (`--block`) — o `todo/` da base herdou blocos antigos (a/b/c/e/f/g/h) que NÃO são desta onda; sem filtro o `all_terminal` nunca vira true.
⚠️ Gate é `pnpm test:unit` (NÃO typecheck — develop já tem dívida de tsc). Estes 3 blocos NÃO tocam schema/DB.
⚠️ Bloco em quarentena (reprovou no gate) NÃO segura os bons nem vai pra develop — marca PENDENTE-KAIRO e leva só os aprovados.
