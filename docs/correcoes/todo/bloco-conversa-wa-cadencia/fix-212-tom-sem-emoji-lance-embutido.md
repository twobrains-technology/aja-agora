---
id: FIX-212
titulo: "Tom curto e ZERO emoji na copy de qualificação + split do card de lance-embutido"
status: todo
severidade: media
projeto: aja-agora
arquivos:
  - src/lib/whatsapp/formatter.ts
  - src/lib/agent/orchestrator/gate-questions.ts
  - src/lib/whatsapp/identify-capture.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/orchestrator/directives.ts
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-07-02 — reforma de conversa WhatsApp (Fase 1), spec docs/design/specs/2026-07-02-conversa-whatsapp-cadencia-design.md
---
## Palavras do operador
> "sem emoticons por favor" (regra pra toda a copy)
> "garantir que a ia fale mais naturalmente quanto a qtd de itens no whatsapp"
> "tom curto e humano"

## Cenário exato
- **Canal:** WhatsApp. Toda a qualificação.
- **Exemplos de excesso:** chips de categoria com emoji (formatter.ts ~764); LGPD com cadeado;
  lance-embutido = **3 parágrafos de aula + a pergunta no MESMO card** (gate-questions.ts:34-40);
  reações de experiência com 4-5 frases; hedge corporativo ("e isso não é compromisso nenhum, tá?").

## Esperado × Atual
- **Esperado (C3 do spec):** **zero emoji** em toda a copy do WhatsApp (fixa e gerada); frases curtas;
  sem hedge. Lance-embutido em 2 tempos: contexto curto (texto) → card com pergunta curta + botões.
- **Atual:** emoji em quase todo card; mensagens longas; lance-embutido num bloco único denso.

## Root cause (INVESTIGADO)
Copy fixa com emoji espalhada em `formatter.ts`, `gate-questions.ts`, `identify-capture.ts`; regras de
persona no `system-prompt.ts`/`directives.ts` não proíbem emoji nem exigem brevidade. O card de
lance-embutido carrega explicação + pergunta juntas porque body+botões de um card são uma unidade.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Reescrever a copy fixa da qualificação: curta, humana, **sem emoji**, sem hedge (tabela antes→depois do spec, seção "Revisão geral das mensagens grandes") | `formatter.ts`, `gate-questions.ts`, `identify-capture.ts` |
| Regra DURA no prompt: "no WhatsApp, NUNCA use emoji" + brevidade | `system-prompt.ts` + `directives.ts` (reações de experiência etc.) |
| Lance-embutido em 2 tempos: balão de texto curto de contexto ANTES do card, e o card só com pergunta curta + botões | `formatter.ts` (lanceEmbutidoQuestionToWhatsApp) + `adapter.ts` se precisar do beat de texto |
| Naturalidade de balões (C4): não disparar balão-fragmento mecânico; nº de balões segue a lógica | regra no `system-prompt.ts` |

**Channel-aware (C5):** `system-prompt.ts`/`directives.ts`/`gate-questions.ts` são compartilhados —
a regra "sem emoji" e o tom valem também pra web (desejado), MAS a cadência de balões é do WhatsApp.
Rodar os testes da web antes de pushar; não alterar `artifact-renderer.tsx`.

## Regressão exigida
- **Camada 1 (estrutural):** varredura anti-emoji — um teste que percorre a copy do WhatsApp
  (`formatter.ts`, `gate-questions.ts`, `identify-capture.ts`) e FALHA se achar qualquer codepoint de
  emoji. Assert de que a regra "sem emoji" está no system-prompt.
- **Camada 2 (cassette):** cassette do lance-embutido saindo em 2 tempos (contexto + card curto).
