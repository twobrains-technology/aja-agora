---
slug: regua-carimba-toque-e-a-meta-recusa
titulo: "A régua carimba o toque, a Meta recusa a entrega (131047/131049) e o cliente não recebe"
status: done
severidade: alta
projeto: aja-agora
rodada: 2026-10-02 14:00 — reentrada autorizada pelo dono ("manda a msg real")
evidencia:
  - (log CloudWatch /ecs/tb/prod — trecho literal abaixo)
mexe_em:
  - src/lib/remarketing/motor.ts
  - src/lib/whatsapp/ (template-dispatch, FIX-201)
  - src/lib/workers/remarketing-cycle.ts
---

## Palavras do operador
> "manda a msg real" (Kairo, 02/10)
> "Devia ter rolado, porque isso foi meia-noite, já são 11 da manhã. Eu tinha que ter feito já o primeiro contato dos 90 minutos" (Bruna, 01/10 11:57:29)

## Cenário
- **Rota/tela:** `POST /api/admin/remarketing/reentrada` em produção, 02/10 ~13:5x
- **Passos:** 1) preview: 32 avaliadas / **15 entram**; 2) POST → 15 entraram; 3) o ciclo das 14:00 carimbou **10 toques** (`step=1`); 4) conferir entrega
- **Dados usados:** conversas reais de produção (números não expostos aqui)

## Esperado × Atual
- **Esperado:** fora da janela de 24 h da Meta sai **template aprovado** e a mensagem chega ao cliente; o carimbo do toque só vale para envio que saiu (ou é compensado quando falha).
- **Atual:** os 10 toques foram carimbados (`remarketing_touches.ultimo_toque_em = 02/10 14:00`) e **NENHUMA mensagem entrou em `messages`** nos 30 min seguintes. O log de produção mostra as falhas:
```
[whatsapp] Status: failed | wamid.HBgMNTU2NTgxMTY2MjQ2FQIAERgSOEMxMUYxOUJDRUMxODIwMUIxAA== | to: 556581166246 | error: 131049 This message was not delivered to maintain healthy ecosystem engagement.
[whatsapp] Status: failed | wamid.HBgNNTUxMTk5OTAwMTAwMhUCABEYEjU0NUM0OTdBMTU3MjM5MERDOAA= | to: 5511999001002 | error: 131047 Re-engagement message
```
Ou seja: **a cota de 30 dias foi consumida sem o cliente receber** — e é isso que produz o sintoma "a régua não dispara" que a Bruna viu na call.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
`131047 Re-engagement message` é o erro clássico de **texto livre fora da janela de 24 h** (o motor diz que fora da janela
vai template aprovado, via `template-dispatch` FIX-201) — provar qual caminho foi usado no disparo das 14:00 e se o
template `remarketing_inicio_generico` foi realmente chamado. Segundo ponto, **de desenho**: `motor.ts` grava
`ultimo_toque_em` no mesmo UPDATE e **antes** do envio — sem rollback/compensação, uma falha consome a cota e o toque
não volta. Falta provar: (a) template × texto no disparo; (b) por que só 2 falhas aparecem no log para 10 carimbos;
(c) se `131049` é limite de qualidade/engajamento do número.
