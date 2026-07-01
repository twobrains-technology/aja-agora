---
slug: texto-colado-multi-tool-turn
titulo: "Narrações de passos internos se colam numa mensagem só sem separador em turnos multi-tool (irmão do FIX-102)"
status: inbox
severidade: media
projeto: aja-agora
rodada: 2026-07-01 — conversa real da Mirella (automóvel, produção), reportada pelo Kairo
evidencia:
  - conversationId 69a38af1-567f-4f33-adbc-e8a9ce5ef83e, message id b408ddf4-e176-49e8-ad2e-af9dfb5dfc2e
mexe_em:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/collapseEchoedSegments (mesma função do FIX-102)
  - docs/correcoes/done/fix-102-assistant-texto-duplicado-eco.md (seção "padrão IRMÃO", já documentada como pendente hoje mais cedo)
---

## Palavras do operador
> "veja essa dinamica, ja temos varios probelmas, a saudacao ficou duplicada... em seguida eu pedi
> para ver todos e deu erro." (a mensagem colada é parte da evidência do "deu erro")

## Cenário
- **Rota/tela:** chat web, mesma conversa da Mirella (ver card `analyzer-intent-ver-mais-opcoes.md`
  — os dois bugs aconteceram no MESMO turno, mas são causas distintas).
- **Mensagem exata persistida no banco** (`messages.content`, um único registro, um único
  `created_at`):
  ```
  Bora ver o que a gente consegue na sua faixa:Deixa eu buscar as opções reais na sua faixa:Preciso
  buscar os grupos disponíveis pra você. Um segundo:Mirella, tive um problema aqui ao carregar as
  opções. Pode me confirmar se o valor de R$ 106.000 está certo pra eu refazer a busca certinho?
  ```
  4 frases de "transição pré-tool" (regra FIX-36 do system-prompt: nunca afirmar achado antes do
  tool result) se colaram, zero espaço/quebra entre elas.

## Esperado × Atual
- **Esperado:** cada narração de passo interno (uma por tentativa de tool-call dentro do mesmo
  turno multi-step) deveria ter alguma separação visual — quebra de linha, ponto final visível — ou
  o sistema deveria evitar emitir MÚLTIPLAS narrações de transição soltas dentro do mesmo turno.
- **Atual:** tudo vira uma sopa de frases grudadas, ilegível e confusa (parece um bug/erro de
  verdade pro usuário, mesmo quando o conteúdo em si faz sentido isoladamente).

## Pista de causa (parcialmente confirmada — já era conhecida ANTES deste incidente)

Já documentado em `docs/correcoes/done/fix-102-assistant-texto-duplicado-eco.md`, seção
"⚠️ Achado da mesma rodada — padrão IRMÃO" (escrita nesta mesma sessão, ANTES deste bug aparecer ao
vivo): `collapseEchoedSegments()` (a guarda do FIX-102) só colapsa segmentos **idênticos**
consecutivos — nunca pega frases **diferentes** coladas sem separador, porque isso é uma heurística
estreita de propósito (evita falso-positivo em nomes/siglas).

Este caso é EXATAMENTE esse padrão irmão, mas com uma variável nova: aconteceu porque o turno teve
**múltiplas etapas de tool-call** (recomendação → tentativa de re-busca → erro → decisão), cada uma
gerando seu próprio texto de transição, e o acúmulo em `fullResponse += part.text` (`runner.ts`) não
insere nenhuma quebra entre as etapas. Precisa confirmar exatamente onde no loop de steps do runner
isso concatena sem separador, e desenhar uma correção que não invente heurística arriscada (falso
positivo em texto legítimo) — provavelmente inserir `\n\n` entre textos de steps DIFERENTES do
multi-tool-call, não entre chars/deltas do MESMO step (que precisam ficar colados pro streaming).
