# Spec — Jornada de entrada conversacional + simulador no chat

> 2026-06-28 · Kairo (decisões) + Claude (avaliação/desenho) · Status: **draft** (decisões travadas, implementação bloqueada pela onda rev)

## Contexto e problema

O Kairo pediu para revisar a jornada do **WhatsApp** com criticidade nos **componentes de escolha** — "deixar mais pro chat, não robótico, mas com UX legal". A avaliação do canal inteiro (processor, formatter, 17 artifacts, gates, testes) achou os pontos onde a jornada **robotiza ou perde função** no WhatsApp:

- **`value_picker`** (3 sliders interligados na web) vira **lista de faixas fixas** no WhatsApp — engessa e perde precisão.
- **Qualificação** = ~8 gates viram botões/listas em sequência (menu atrás de menu) — o que mais robotiza.
- **Simulador (`contemplation_dial`)** — agulha arrastável na web — vira **texto estático** no WhatsApp (`contemplationDialToWhatsApp`). A interação central ("e se eu for contemplado no mês X?") **desaparece**.

## Norte (objetivo + critérios de sucesso)

- Entrada do cliente **conversacional** (menos menu), botão só onde acelera de fato.
- Simulador que **de fato simula** no WhatsApp (loop conversacional, recálculo ao vivo).
- Web e WhatsApp **coerentes** (jornada canônica é única — regra de produto).
- Critério verificável: persona web e WhatsApp completam a entrada **sem pedir prazo** e **sem o componente complexo de valor**, e iteram o simulador no chat.

## Decisões do Kairo (2026-06-28) → `docs/decisoes/`

1. **Valor = valor do BEM, por conversa.** Usuário diz quanto custa o que quer ("um carro de uns 80 mil"); a parcela vem das ofertas reais da Bevi.
2. **Componente de valor:**
   - **WhatsApp:** conversa — sem componente (usuário fala o valor).
   - **Web:** trocar o `value_picker` complexo por uma **agulha/slider simples, step de R$ 1.000** ("acho que até já temos" → candidato: `plan-estimate-picker.tsx` / shadcn `slider.tsx`).
3. **Prazo: removido da entrada** (os dois canais). Não se pergunta mais o prazo desejado de contemplação na qualificação.
4. **Qualificação híbrida:** binárias (já conhece consórcio? tem reserva pra lance?) = **botão**; abertas (valor) = **conversa**.
5. **Escolha do grupo:** **card da recomendada em destaque + "ver outras opções"** (não lista plana).
6. **Simulador de contemplação (WhatsApp): loop conversacional** — usuário escolhe/pergunta um mês-alvo, o bot recalcula parcela/lance/crédito ao vivo e pode iterar. **Web mantém a agulha arrastável.**

## Design

### O que muda, por área

| Área | Hoje | Alvo |
|---|---|---|
| Valor (web) | `value_picker` (3 sliders interligados) | agulha/slider simples 1k em 1k (valor do bem) |
| Valor (WhatsApp) | `value_picker` → lista de faixas fixas | conversa: usuário fala o valor |
| Prazo desejado | gate `timeframe` (menu/lista) | **removido** (não pergunta) |
| Qualificação binária | botões/listas | botões (mantém) |
| Apresentação das opções (WhatsApp) | `comparison_table` (lista plana) | card recomendada + "ver outras" |
| Simulador (WhatsApp) | `contemplationDialToWhatsApp` (texto estático) | **loop conversacional** (escolhe mês → recalcula → itera) |
| Simulador (web) | `contemplation_dial` (agulha) | mantém |

### Arquivos afetados (⚠️ território da onda rev — ver gate)

- **Qualificação:** `src/lib/agent/qualify-state.ts`, `qualify-config.ts`
- **Prompt/regras:** `src/lib/agent/system-prompt.ts`, `agents/builder.ts`, `HARD_RULES.md`
- **Tools:** `src/lib/agent/tools/ai-sdk.ts` (`present_value_picker`, gates)
- **Web:** `src/components/chat/artifacts/value-picker.tsx`, `plan-estimate-picker.tsx`, `gate-renderer.tsx`, `contemplation-dial.tsx`
- **WhatsApp:** `src/lib/whatsapp/formatter.ts`, `adapter.ts`, `interactive-handlers.ts`
- **Tipos:** `src/lib/chat/types.ts`
- **Jornada canônica:** `docs/jornada/jornada-canonica.md` (atualizar passos 1-2 e 4 ao implementar)

### Testes (regra do projeto — 3 camadas)

- **Camada 1 (structural):** prompt não pede prazo; gate `timeframe` removido de `qualify-config`; `value_picker` não emitido na entrada; agulha web com `step=1000`.
- **Camada 2 (cassette `tests/regression/agent-trajectory.test.ts`):** WhatsApp — usuário fala o valor em texto → busca dispara sem `value_picker`; simulador conversacional (escolhe mês → recalcula). Web — agulha simples.
- **Camada 3 (eval):** persona web/WhatsApp completa sem o gate de prazo, com simulador conversacional.

## Desenho dos blocos todo-blocks (LANÇAR DEPOIS da onda rev)

> ⚠️ **GATE DE DEPENDÊNCIA (nível 4 — estrutural dura):** estes blocos tocam **exatamente** os arquivos que a onda `revisao-modelo-errado` (`rev-a-agente-nucleo`, `rev-d-whatsapp-chat`) está reescrevendo **agora**. Lançar antes da onda rev integrar na develop = conflito garantido + retrabalho. **Só lançar após a orquestradora levar a onda rev pra develop** (diário D11). A base própria forka da develop **pós-rev**.

Proposta (afinidade por camada, ~3 sessões):

- **bloco-jornada-entrada** — `qualify-state` + `qualify-config` + `system-prompt` + `builder` + `tools/ai-sdk`: remover prazo, valor por conversa, qualificação híbrida. É o coração da mudança e fixa o contrato de entrada.
- **bloco-web-valor-agulha** — componentes web: `value-picker` → agulha simples 1k, `gate-renderer`. Depende do contrato do bloco-jornada (nível 3 — stub do shape).
- **bloco-whatsapp-simulador** — `formatter` + `adapter` + `interactive-handlers`: simulador loop conversacional + card recomendada + "ver outras". Depende das tools/estado (nível 3).

(ordem interna e numeração `FIX-NN` definidas na hora do lançamento, para não colidir com a numeração global em uso pela onda rev.)

## Riscos e gaps honestos

- **Valor por conversa** exige o agente interpretar texto livre ("uns 80 mil", "oitenta mil", "80k") — robusto no Opus, mas precisa de normalização + cassettes cobrindo variações.
- **Remover o prazo** muda a lógica de `recommend_groups`/score (hoje usa `desiredTermMonths`). Investigar o impacto na recomendação/pontuação **dentro do bloco** antes de remover.
- **Simulador conversacional** deve **reusar `computeContemplationDial()`** (cálculo puro) e só trocar a camada de interação — não duplicar lógica.
- **"Já temos a agulha simples":** `plan-estimate-picker.tsx` é o candidato; confirmar no bloco se serve ou se ajusta o `value-picker`.

## Fora de escopo (YAGNI)

- Jornada de fechamento (passo 5) / contrato.
- A própria onda `revisao-modelo-errado` (revisão por modelo errado) — já em curso, outra sessão.
