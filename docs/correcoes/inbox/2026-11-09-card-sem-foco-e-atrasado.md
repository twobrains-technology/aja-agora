---
slug: card-sem-foco-e-atrasado
titulo: "Card de preenchimento não recebe foco e só habilita depois do stream fechar; tem que estar pronto e focado quando o texto termina"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-11-09
evidencia:
  - _evidencia/card-sem-foco-e-atrasado-print.png
mexe_em:
  - src/components/chat/artifacts/contract-form.tsx (isStreaming linha 24; disabled linhas 88/106/124; autoFocus linha 108)
  - src/components/chat/artifacts/name-prompt.tsx (isStreaming 20; focus no effect 30; disabled 80/97)
  - src/components/chat/artifacts/telefone-do-desbloqueio.tsx (inerte = isStreaming ... linha 95)
  - src/components/chat/artifacts/value-picker.tsx (disabled={submitted || isStreaming}, linha ~295)
  - src/components/chat/artifacts/whatsapp-optin.tsx
---

## Palavras do operador
> "sempre que mostrar o card de preenchimento, tem que focar nele imediatamente, de forma rápida. Além de não focar, está dando um delay para habilitar o card, tem que mostrar já quando tiver habilitado. A dinâmica da mensagem ali, quando começa a cuspir a mensagem ('ótimo, vamos seguir então...') quando terminar de plotar a mensagem o card já tem que estar pronto, para não ficar carregando esse card. Está ficando ruim a experiência do tempo da demora de liberar o card. E o outro ponto é que não tem o foco no card. Trata essas duas com uma correção única."

## Cenário
- **Rota/tela:** chat web, card "Vamos confirmar seu plano" (CPF + Celular, contract-form) logo após "Tenho interesse"; vale para todos os cards de preenchimento (nome, celular, valor).
- **Passos:** 1) o agente escreve o texto aos poucos 2) o card aparece embaixo 3) o card fica desabilitado (botão apagado) por alguns segundos depois do fim do texto 4) quando libera, nenhum campo está focado.
- **Print:** `_evidencia/card-sem-foco-e-atrasado-print.png`.

## Esperado × Atual
- **Esperado:** quando o texto termina de aparecer, o card já está habilitado e o primeiro campo já está focado (cursor piscando), sem espera.
- **Atual:** card desabilitado até o stream inteiro fechar e sem foco.

## Causa provável (forte, a confirmar com o worker)
Os campos usam `disabled={isStreaming}`, com `isStreaming = status === "submitted" || "streaming"` do chat INTEIRO. O card monta enquanto o stream ainda corre (o texto termina antes de o stream fechar: ferramentas, persistência, rastro) e fica desabilitado. O `autoFocus` do React dispara na montagem; em campo `disabled` o navegador não foca, e depois que habilita ninguém refoca. Uma correção só: (a) liberar os campos do card assim que ele monta (o card só existe depois do texto) e deixar a guarda de `isStreaming` apenas no ENVIO; (b) focar o primeiro campo por efeito/ref quando o card monta e quando fica ativo, não só por `autoFocus`.

## Ligação
Mesma família e mesmos arquivos do bug 13 (card de preenchimento fica velho depois de respondido): tratar os dois no mesmo worker, para ter um escritor só nesses componentes.
