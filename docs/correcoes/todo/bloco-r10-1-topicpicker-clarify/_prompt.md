Você é o executor do bloco `bloco-r10-1-topicpicker-clarify` no worktree isolado deste branch
(`fix/r10-1-topicpicker-clarify`), projeto aja-agora.

1. Leia `docs/correcoes/README.md` e `docs/correcoes/todo/bloco-r10-1-topicpicker-clarify/`
   inteiro (`_bloco.md` + `fix-300-*.md` + `fix-301-*.md`).

2. DESIGN: FIX-301 exige uma decisão real de implementação (como mapear/adicionar a intent
   `confused` e como implementar a transição `clarify` sem reestruturar `Gate`). Use
   `AskUserQuestion` se houver trade-off genuíno; sem resposta em tempo razoável, siga o caminho
   mais simples que minimize edição em `orchestrator/index.ts` (comportamento condicional, não
   novo estado). Registre em `docs/decisoes/blocos/2026-07-12-bloco-r10-1-topicpicker-clarify.md`.

3. Execute NA ORDEM: **FIX-300 primeiro** (schema/tool-policy/artifact-guard, isolado), **FIX-301
   depois** (transição clarify). TDD strict pros dois — são invariantes de segurança/robustez:
   - **FIX-300:** teste que o schema de `present_topic_picker` REJEITA string fora do catálogo
     canônico; teste de integração que a tool é bloqueada/suprimida no gate `decision`; sonda
     adversarial simulando um tool-call com labels arbitrários ("a", "b") e confirmando que não
     vira card.
   - **FIX-301:** teste de integração reproduzindo "não entendi" num gate ativo → agente
     reapresenta o MESMO gate com copy simplificada, sem menu genérico.
   Rode só os testes dos arquivos tocados. 🚫 Sem smoke de browser neste bloco.

4. 1 commit Conventional (PT-BR) por item.

5. Mova cada fix-NN concluído pra `docs/correcoes/done/`.

6. Push da branch (`git push origin fix/r10-1-topicpicker-clarify`) +
   `.done/{data}-bloco-r10-1-topicpicker-clarify.md`. NÃO abra PR, NÃO faça merge, NÃO rode
   deploy/restart.

7. RESUMO FINAL: decisão de como implementou `confused`/`clarify`, linha a linha, com o porquê.
