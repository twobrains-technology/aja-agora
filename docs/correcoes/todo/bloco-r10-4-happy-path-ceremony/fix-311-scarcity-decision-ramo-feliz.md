---
id: FIX-311
titulo: "Liga scarcity + decision_prompt ao ramo FELIZ do funil (hoje só existem no ramo de recusa)"
status: todo
bloco: bloco-r10-4-happy-path-ceremony
severidade: alta
projeto: aja-agora
arquivos: [src/app/api/chat/route.ts]
rodada: 2026-07-13 (loop-de-goal r10, onda 4, bloco r10-4-happy-path-ceremony — investigação de causa-raiz da Etapa A)
---
## Palavras do operador
> Investigação de causa-raiz: em ambos os dossiês limpos (Madalena aceita o hero, Mario segue o
> caminho de aceite direto), `scarcity` e `decision_prompt` NUNCA aparecem — o funil pula direto
> pro fecho (`contract_form`/`whatsapp_optin`) assim que o usuário demonstra interesse claro.

## Cenário exato
- **Rota/tela:** `POST /api/chat`, ação `interest` (usuário claramente interessado/pronto pra
  avançar) e o branch de aceite do simulador.
- **Dados usados:** `madalena-junta-v2/dossie.json` + `mario-sem-lance-v2/dossie.json` — grep por
  `scarcity`/`decision_prompt` em ambos retorna zero ocorrências.

## Esperado × Atual
- **Esperado:** a cerimônia de fechamento (criar urgência com `scarcity`, confirmar decisão com
  `decision_prompt`) acontece SEMPRE antes do fecho, seja qual for o caminho que o usuário tomou
  pra chegar ali — aceitar de cara também merece a cerimônia completa, não só quem hesitou.
- **Atual:** `route.ts:508-522` (ação `interest`) tem um atalho de "caminho feliz" que pula direto
  de reveal/hero pra `contract_form`, sem passar por `scarcity`/`decision_prompt`. Mesma coisa em
  `route.ts:1125-1145` (branch de aceite do simulador). A cerimônia completa (`scarcity` →
  `decision_prompt`) só existe hoje no branch de recusa/ambiguidade do simulador
  (`route.ts:1147-1189`) — ou seja, o usuário que hesita recebe MAIS cuidado no fecho do que o
  usuário que aceita direto, o que é o inverso do que o produto quer (todo fecho merece a mesma
  cerimônia, ela existe pra dar segurança/urgência genuína, não pra "recuperar" hesitantes).

## Root cause (INVESTIGADO)
- `route.ts:508-522`: fast-path da ação `interest` pula `scarcity`/`decision_prompt` direto pro
  fecho.
- `route.ts:1125-1145`: branch de aceite do simulador tem o mesmo atalho.
- `route.ts:1147-1189`: única região que hoje executa a cerimônia completa — mas só é alcançada
  pelo ramo de recusa/ambiguidade.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Extrair a cerimônia `scarcity`→`decision_prompt` (hoje só em `1147-1189`) pra uma função/passo comum do funil | `route.ts` |
| Fazer os dois fast-paths do ramo feliz (`508-522` ação `interest`, `1125-1145` aceite do simulador) passarem por essa mesma cerimônia ANTES do fecho, em vez de pular direto | `route.ts:508-522`, `route.ts:1125-1145` |

## Regressão exigida
- Teste de integração: usuário aceita a oferta de cara (ação `interest`) → `scarcity` e
  `decision_prompt` aparecem ANTES de `contract_form`/`whatsapp_optin`.
- Teste de integração: usuário aceita o simulador → mesma cerimônia, mesma ordem.
- Teste de regressão: ramo de recusa/ambiguidade (já cobria a cerimônia) continua funcionando.
