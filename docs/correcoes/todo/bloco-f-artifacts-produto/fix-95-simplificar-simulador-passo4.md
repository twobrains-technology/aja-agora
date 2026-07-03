---
id: FIX-95
bloco: bloco-f-artifacts-produto
slug: simplificar-simulador-passo4-so-valor
titulo: "Trocar o simulador do passo 4 por um seletor simples só de valor (slider de valor, sem os demais campos)"
status: todo
severidade: media
projeto: aja-agora
rodada: 2026-06-28 — revisão visual do card "Planeje sua conquista" (passo 4)
evidencia:
  - _evidencia/simplificar-simulador-passo4-tela-atual.png
mexe_em:
  - src/components/chat/artifacts/plan-estimate-picker.tsx
  - src/components/chat/artifacts/plan-estimate-picker.test.tsx
  - src/lib/consorcio/plan-estimate.ts
  - src/lib/chat/ui-message.ts
---

## Palavras do operador
> "Aqui nós precisamos trocar esse componente por um componente simples de valor onde o usuário ainda com slider vai selecionar somente o valor não vai ter mais as outras coisas para ele preencher"

## Cenário
- **Rota/tela:** chat web — artifact "Planeje sua conquista" (simulador do passo 4 da jornada)
- **Componente atual:** `plan-estimate-picker.tsx`, hoje exibe:
  1. Slider "Quanto custa o que você quer?" (valor do bem — R$ 77.000)
  2. Segmented control "O que mais importa pra você agora?" (Menor parcela / Receber rápido / Tenho um lance)
  3. Slider "Em quantos meses quer pagar" (66 meses)
  4. Estimativa "Sua parcela fica em R$ 1.341,67/mês · taxa de 15% já inclusa"
  5. Botão "Buscar opções reais →"
- **Passos:** 1) usuário chega no passo 4 da jornada 2) o agente entrega o card do simulador 3) usuário interage com os controles

## Esperado × Atual
- **Esperado:** um componente **simples de valor** — usuário ainda usa **slider** mas seleciona **somente o valor do bem**; os demais campos (prioridade/objetivo, prazo em meses e a estimativa de parcela) NÃO aparecem mais pra ele preencher.
- **Atual:** card completo com slider de valor + segmented control de prioridade + slider de meses + estimativa de parcela calculada inline.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Reescrita do artifact `plan-estimate-picker.tsx` pra versão reduzida (só o slider de valor + CTA). Confirmar o que fazer com:
(a) o cálculo de estimativa de parcela em `plan-estimate.ts` (some da UI? continua em background pra próxima etapa?);
(b) o shape do artifact em `src/lib/chat/ui-message.ts` e os asserts em `plan-estimate-picker.test.tsx` (provavelmente quebram);
(c) o que o agente passa a coletar/inferir pros campos removidos (prazo/prioridade), já que deixam de ser input do usuário.

## ⚠️ Dependência de produto (não esquecer ao promover)
Pelo `CLAUDE.md`: **"Simulador do passo 4 = conceito do Bernardo (stakeholder), consolidado no passo 5 da `docs/jornada/jornada-canonica.md` — não implementar versão final sem o aval dele."** Esta simplificação muda o conceito do simulador → confirmar com o Bernardo / validar contra o passo 5 da jornada canônica antes de promover pra bloco e implementar. Não cravar sozinho.
