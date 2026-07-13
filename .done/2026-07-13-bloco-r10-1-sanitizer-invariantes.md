# Bloco r10-1 sanitizer-invariantes — FIX-298 + FIX-299

## Resumo

Os 2 itens deste bloco são invariantes de "casca" (formato/estrutura do texto que chega
ao usuário) que só existiam como regra-no-prompt e quebraram com Qwen 3.5 Fast (modelo mais
fraco que o de prod) na rodada de teste do estudo `docs/design/specs/2026-07-12-jornada-humanizada-estudo-e-correcao-design.md`
(P4, P9, P10). Ambos migram pra invariante em CÓDIGO no `sanitizer.ts` (Lei 4:
instruction-following degrada sob carga/modelo fraco).

## FIX-298 — no máximo 1 sentença interrogativa por balão

Transcrição real do bug: "Quer ajustar o valor do bem ou seguir com essa opção da ITAÚ mesmo?
Você já fez consórcio antes?" — duas perguntas no mesmo balão, usuário só respondia uma.

`EphemeralTextFilter`/`stripProcessPreamble` (`sanitizer.ts`) agora seguram toda sentença
interrogativa (delimitada por `. ! ? : \n`, os mesmos limites do splitter) e liberam só a
ÚLTIMA — as anteriores são dropadas. No stream ao vivo, a pergunta corrente nunca é emitida
na hora (só no próximo `flush()`), garantindo que uma pergunta seguinte sempre substitui a
anterior antes de qualquer uma chegar ao usuário. O corte é por SENTENÇA, não por "pedido":
a frase composta do mockup ("Que carro você tem em mente, e quanto custa mais ou menos?") é
UMA sentença com um único `?` e sobrevive intacta (teste positivo obrigatório).

`runner.ts` não precisou de mudança — já consumia `EphemeralTextFilter` via `push`/`flush`.

**Escopo consciente deixado de fora:** a correção proposta no card também previa dropar
TODAS as perguntas do LLM no turno em que o servidor vai emitir um gate/card (mais estrito
que "manter só a última"). Não implementei essa parte: no `runner.ts` atual, `nextGateToFire`
só é decidido APÓS o loop inteiro de streaming terminar (`fullResponse` já construído, meta
recarregada) — o texto já foi emitido ao vivo via `yield` dentro do loop, então não há hoje
um sinal confiável de "este turno vai mostrar gate" disponível ANTES/DURANTE o streaming sem
um refactor maior (calcular `nextGate`/`decideShowGate` preliminarmente sobre o meta
pré-turno arrisca over-trigger em turnos onde o gate não chega a ser mostrado de fato). Como
"manter só a última pergunta" já garante o invariante pedido no Esperado do card ("ZERO
turnos com 2+ sentenças interrogativas, em qualquer modelo"), não arrisquei mexer na lógica
de gate sem verificação mais profunda. PENDENTE-KAIRO se quiser esse refinamento adicional
(evitar pergunta redundante quando o gate já vai perguntar algo).

## FIX-299 — casca determinística: emoji + capitalização do nome

Mesma transcrição: "Show, kairo!" (nome ecoado em minúscula) e "Perfeito, kairo! ✅" (emoji).

- **Capitalização:** o card apontava `turn-analyzer.ts` como possível ponto de save, mas o
  ponto de persistência REAL do `contactName` (usado tanto pela tool `save_contact_name`
  quanto pelo card focado de nome) é `saveContactName` em `src/lib/leads/contact-capture.ts`.
  Adicionei `capitalizeName` (Title Case, respeita partículas pt-BR "de"/"da"/"do"/"das"/"dos"
  quando não são a 1ª palavra, capitaliza cada lado de nome hifenizado) e apliquei antes de
  gravar em `conversations.contactName` e `leads.name`.
- **Emoji:** strip determinístico via regex Unicode (emoticons, símbolos/pictogramas,
  transporte, dingbats, bandeiras, seletor de variação, ZWJ) dentro de
  `stripProcessPreamble`/`EphemeralTextFilter` no `sanitizer.ts` — nunca toca acentuação
  pt-BR, nunca toca emoji de metadata de categoria (`categories.ts`, fora desse pipeline).

## Testes

- **FIX-298:** cassette real do bug (2 perguntas → só a última sobrevive, RED confirmado via
  `git stash` do código de produção mantendo só o teste → GREEN depois) + teste positivo
  obrigatório (frase composta do mockup não é cortada) + teste de streaming (push/flush) +
  teste de sanidade (1 pergunta comum sobrevive normal).
- **FIX-299:** unitário puro de `capitalizeName` + teste via `saveContactName` batendo no
  Postgres real do workspace (nome minúsculo/maiúsculo vira Title Case ao persistir) + testes
  de `stripEmoji`/`stripProcessPreamble`/`EphemeralTextFilter` (emoji isolado, múltiplos
  emoji, acentuação preservada, string vazia). RED confirmado da mesma forma antes do fix.

## Gate

- `pnpm test:unit` completo: **363 arquivos / 3353 testes, 100% verde** — rodado em
  container transitório (host sem `node_modules`, ver memória
  `project_aja_gate_onda_container` / `project-worktree-node-modules-symlink`), com o
  Postgres real do workspace (`aja_agora_ws_r10_1_sanitizer_invariantes`, bootstrap via
  skill `local-dev` v2).
- 2 commits Conventional (1 por item): `372a946c` (FIX-298), `c9eef4a3` (FIX-299) + 1 commit
  de docs (`3a5af802`, arquiva os 2 fix-cards em `done/`).

## Gaps honestos

- FIX-298: o refinamento "dropar TODA pergunta do LLM quando o servidor vai mostrar
  gate/card" não foi implementado — ver justificativa na seção FIX-298 acima. O invariante
  principal (zero turnos com 2+ perguntas) está garantido de qualquer forma.
- Não validei E2E ao vivo com Qwen 3.5 Fast (fora do escopo deste bloco — a régua de
  admissão de modelo/bakeoff roda separado, per o design spec S7). A prova aqui é
  unitária/streaming determinística, não depende do modelo obedecer.
