---
id: FIX-278
titulo: "Fechamento usa 'contratando um consórcio' — viola terminologia RESERVA DE COTA (Ata 2026-07-04)"
status: done
severidade: alta
projeto: aja-agora
bloco: bloco-r9-compliance-copy
arquivos:
  - src/lib/bevi/closing-presentation.ts
  - src/lib/bevi/closing-presentation.test.ts
  - src/lib/whatsapp/interactive-handlers.contract.test.ts
  - src/lib/whatsapp/interactive-handlers.template-routing.test.ts
  - src/lib/eval/jornada-rubric.ts
rodada: "2026-07-12 loop r9 onda 1 (baseline Sonnet 3/10)"
commit: PENDING
executado_em: "2026-07-12"
---
## Palavras do juiz (veredito r9, Sonnet 5 — G2, UI/Compliance 3/10)
> "fechamento sempre diz 'Você está contratando um consórcio' (3/3 cenários que fecham) —
> contradiz a terminologia P0 da Ata 2026-07-04 ('reserva de cota', não 'contratado')."
>
> **Trecho de evidência:** `madalena/dossie.md:223`, `mario-sem-lance/dossie.md:199`,
> `probe-i3-fabricacao/dossie.md:191` — texto idêntico e determinístico nos 3 fechamentos:
> *"Perfeito! Você está **contratando um consórcio** da ITAÚ, escolhida pela Aja Agora para o
> seu perfil."*

## Cenário exato
- **Rota/tela:** chat web/WhatsApp, passo 5.2 (confirmação final, após assinatura/documentos).
- **Passos:** fluxo completo até "Parabéns!" (madalena turno 17, mario-sem-lance turno 14,
  probe-i3 turno 15).
- **Dados:** os 3 fechamentos ao vivo do baseline r9 (dossiês em
  `.processo/loop/evidencias-r9/dossies/`).

## Esperado × Atual
- **Esperado** (`docs/jornada/jornada-canonica.md:31-32`, refino Ata 2026-07-04 item 2/P0;
  `docs/jornada/atas/2026-07-04-mudancas-cliente.md:78` e checklist `:157`): terminologia
  **RESERVA DE COTA** — nunca "consórcio fechado/contratado"; botão "confirmar e contratar" →
  "confirmar e reservar"; comunicar "você não paga nada agora — tipo booking, só quando chegar
  o boleto".
- **Atual:** texto hardcoded "Você está **contratando um consórcio** da {admin}..." em TODOS
  os fechamentos, sem menção a reserva/booking.

## Root cause (INVESTIGADO — provado no código)
`src/lib/bevi/closing-presentation.ts:129-132` (função `closingPresentation`, item
`kind:"text"` do passo 5.2):
```ts
`Perfeito! Você está contratando um consórcio da ${administradora}, ` +
"escolhida pela Aja Agora para o seu perfil. " +
"E a Aja Agora segue com você até a contemplação — e depois dela.",
```
Hardcoded — o comentário da função (linha 106) o rotula de "reforço literal do docx", mas o
docx foi **SUPERSEDIDO** pela Ata 2026-07-04 (`jornada-canonica.md:8-15`: "Onde conflitar com
os Passos abaixo, esta seção vence — regra 'palavra nova vence'"). O texto errado está
**PINADO por teste**: `closing-presentation.test.ts:230-231` —
```ts
expect(allText).toContain("Você está contratando um consórcio da ÂNCORA");
```
— ou seja, o teste hoje **PROVA o comportamento ERRADO**. Corrigir só o código sem tocar o
teste quebra a suíte; corrigir só o teste sem o código deixa o texto errado em produção. É
preciso atualizar os dois juntos.

## Correção proposta (o quê × onde)
| O quê | Onde |
|---|---|
| Trocar "Você está contratando um consórcio da {admin}" por copy de RESERVA DE COTA (ex.: "Perfeito! Sua cota da {admin} está reservada — escolhida pela Aja Agora para o seu perfil.") | `closing-presentation.ts:129-132` |
| Atualizar a assertion que hoje pina o texto errado pro texto novo | `closing-presentation.test.ts:230-231` ("reforço 1 literal") |
| Avaliar se "Você não paga nada agora — tipo booking, só quando chegar o boleto" (Ata item 2) já aparece em algum ponto do fechamento; se não, considerar incluir nesta mesma copy (não bloqueia o fix se não houver espaço óbvio — anotar como achado) | `closing-presentation.ts` (mesmo bloco) |

## Regressão exigida
- `closing-presentation.test.ts`: novo assert garantindo AUSÊNCIA de
  "contratando"/"contratado"/"fechado" e PRESENÇA de "reserv" (reserva/reservada) no texto de
  fechamento — TDD strict: o teste falha com o texto atual, passa com o novo.
- Rodar a suíte completa (`pnpm test:unit`) pra confirmar que nenhum outro teste depende do
  texto antigo (`grep -rn "contratando um consórcio" src/` antes de fechar).
