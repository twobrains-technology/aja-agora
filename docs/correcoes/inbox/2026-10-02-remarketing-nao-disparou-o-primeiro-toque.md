---
slug: remarketing-nao-disparou-o-primeiro-toque
titulo: "Régua não disparou o primeiro toque (90 min) de um lead real da meia-noite"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-10-02 — call com a Bruna (01/10 11:38-12:01)
mexe_em:
  - src/lib/remarketing/motor.ts
  - src/lib/remarketing/regua.ts
  - src/lib/workers/remarketing-cycle.ts
---

## Palavras do operador
> "Devia ter rolado, porque isso foi meia-noite, já são 11 da manhã. Eu tinha que ter feito já o primeiro contato dos 90 minutos, barra ou hoje de manhã." (Bruna, 11:57:29)
> "esse daí é um caso bom pra mim testar aqui o porquê que o remarketing com ele não rolou, entendeu? Deveria ter rolado já. Tipo, isso foi meia-noite." (Kairo, 11:57:18)
> "Esse, ele está dizendo que está fora da régua, né?" (Kairo, 11:56:48)

## Cenário
- **Rota/tela:** /admin/conversas → conversa web do lead (telefone final **774**; havia também um final **6550** sem campanha)
- **Passos:** 1) lead entra pela web por volta da meia-noite de 01/10; 2) passam 11 h; 3) conferir na conversa se saiu o toque
- **Dados usados:** conversa real de produção (telefone mascarado no painel)

## Esperado × Atual
- **Esperado:** primeiro toque da régua 90 min depois de o lead esfriar.
- **Atual:** nenhum toque às 11 h; a tela mostra o lead como **"fora da régua"** e há registro de WhatsApp para ele.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Precisa provar por que o lead saiu como "fora da régua" (sem telefone válido? conversa não identificada? cadência?
`max_toques`? fora da janela?). Caso concreto e datado — é o melhor ponto de partida do motor.
