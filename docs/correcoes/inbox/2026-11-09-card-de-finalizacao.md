---
slug: card-de-finalizacao
titulo: "Fecho vira UM card de finalização: parabéns com confete, aviso de que um atendente vai chamar, e 'Ver minha proposta' como ação pequena e discreta"
status: inbox
severidade: media
tipo: feature (refina o bug fechamento-robotico)
projeto: aja-agora
rodada: 2026-11-09
evidencia:
  - _evidencia/card-de-finalizacao-print.png
mexe_em:
  - src/lib/bevi/closing-presentation.ts (monta a sequência; commit 5c76a3de já enxugou)
  - src/components/chat/artifacts/atendimento-handoff.tsx (vira o card de finalização, ou um novo)
  - src/components/chat/artifacts/signature-handoff.tsx (deixa de ser card próprio; vira a ação secundária)
  - src/lib/chat/types.ts (payload do card) e src/components/chat/artifact-renderer.tsx
---

## Palavras do operador
> "aqui eu acho que ainda dá para a gente melhorar: no lugar de ter essas três informações desse jeito aí, vamos pensar num card de finalização onde a gente dá um parabéns, talvez falte até um motionzinho no browser, de confetezinho, sabe, tem vários aí na web, legal, um efeitozinho de uma explosão. E esse parabéns já vem nesse card de finalização. A gente deixa exatamente como está aqui: 'um atendente vai te chamar', deixa isso bem claro de que alguém vai chamar ela para finalizar, para ela já, por favor, mandar mensagem no WhatsApp. E ter um outro action menorzinho, mais simples, tipo branquinho, sem muito foco nele, que é esse de ver a proposta, que ele pode clicar e visualizar a proposta lá."

## Cenário
- **Rota/tela:** chat web, logo depois de "Confirmo essa carta" (fecho).
- **Print:** `_evidencia/card-de-finalizacao-print.png`: hoje são três peças soltas (card "Sua proposta está pronta" em vermelho, a bolha "Parabéns!…", o card "O próximo passo é com a gente").

## Esperado × Atual
- **Esperado (UM card):**
  1. Cabeçalho de comemoração com o "Parabéns! Agora você está oficialmente mais perto da sua conquista!" e um efeito de confete/explosão ao aparecer (uma vez).
  2. O conteúdo do card do WhatsApp **exatamente como está hoje**: "Um atendente da Aja Agora vai te chamar pra fazer a adesão na X — é ele quem cuida dos documentos e do cadastro, você não precisa enviar nada agora", com o número oficial, o botão "Falar no WhatsApp" e a nota do "oi". Deixar bem claro que ALGUÉM VAI CHAMAR e que ela pode já mandar a mensagem.
  3. "Ver minha proposta" como ação secundária: pequena, branca/ghost, sem destaque (não é o botão vermelho principal).
- **Atual:** card da proposta vermelho e grande, bolha de texto, card do WhatsApp: três blocos competindo.

## Limites e cuidados
- **Sem promessa de prazo** na copy (P8, D-0004): "vai te chamar" sim, "em X minutos" não. Nada de "reservada".
- **Confete:** respeitar `prefers-reduced-motion` (sem animação nesse caso); é enfeite, o sentido vive no texto (o usuário é daltônico: nada só por cor). Preferir o que o projeto já usa (`motion`/framer) ou uma lib pequena; se for adicionar dependência, dizer qual e o peso.
- **Os dois canais:** o card é do web. No WhatsApp o fecho continua em texto (parabéns + aviso do atendente + link da proposta), sem card; manter a paridade de conteúdo.
- **Se não houver URL de proposta,** o card sai sem a ação secundária (como hoje o card da proposta só sai com URL).
- **Dependência de fila:** mexe em `types.ts` e `artifact-renderer.tsx`, hoje no stage do worker f0d1626a. Despachar depois do commit dele.
