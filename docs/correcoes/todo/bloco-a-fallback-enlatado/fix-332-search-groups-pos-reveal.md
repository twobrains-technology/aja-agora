---
id: FIX-332
titulo: "Fallback enlatado em loop: search_groups pós-reveal vira tool-error e o servidor descarta a fala do modelo"
status: todo
bloco: bloco-a-fallback-enlatado
arquivos:
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/directives.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 1 (juiz Sonnet, web 4/10 + whatsapp 3/10)
---

# FIX-332 — o sintoma-mor sobreviveu: fallback enlatado em loop

## Palavras do operador (Kairo, 2026-07-13)

> "O agente ele tá muito bitolado, tentando responder sempre a mesma coisa, sabe? Muito travado."

A cirurgia de 2026-07-13 matou DOIS caminhos que respondiam por texto fixo sem chamar o
modelo (o "não entendi" e a pergunta de exatidão). **Sobrou um terceiro**, e é o que mais
dispara.

## Cenário exato (evidência real, 8 jornadas ao vivo)

Veredito do juiz (web): o fallback dispara **nos 4 dossiês**, sempre que o usuário nomeia
ou detalha uma oferta já mostrada. Pior caso — **imóvel: 5 vezes seguidas**; a cliente pede
a simulação com FGTS + lance e **nunca recebe**, e o funil segue como se nada tivesse
acontecido. O texto é sempre idêntico:

> "as opções que já apareceram aqui pra você continuam valendo. Me diz o nome da
> administradora ou o valor que você quer olhar de novo que eu detalho certinho pra você."

O mesmo texto aparece no WhatsApp (veredito do canal confirma).

## Root cause (PROVADO no log do container, não especulado)

```
tool-policy-violation] tool=search_groups fase=reveal   → 9 ocorrências
Model tried to call unavailable tool 'search_groups'. Available tools: simulate_quota, ...
tool-error-recovery                                     → 12 ocorrências
```

1. O usuário pede algo sobre uma oferta já na tela ("simula a ITAÚ com meu FGTS").
2. O modelo chama `search_groups` — que **não existe no toolset da fase `reveal`**
   (`tool-policy.ts`, correto: não se deve re-buscar na Bevi).
3. A AI SDK emite `tool-error` → o runner **descarta TODA a fala do modelo** e marca
   `toolErrorThisTurn`.
4. `orchestrator/index.ts:797` assume o turno com `buildToolErrorRecoveryFallback`
   (`directives.ts:450-457`) — **texto fixo, sempre igual**.

É exatamente o mesmo antipadrão dos outros dois: **o servidor responde no lugar do modelo.**
Só que aqui ele é disparado por um erro que o próprio desenho provoca.

## Correção proposta

| O quê | Onde |
|---|---|
| `search_groups` (e `recommend_groups`) passam a EXISTIR pós-reveal, mas **não re-chamam a Bevi**: retornam os grupos JÁ EXIBIDOS, lidos dos artifacts da conversa | `tool-policy.ts` (liberar na fase) + `tools/ai-sdk.ts` (implementação: se `meta.revealCompleted`, devolver os grupos do reveal em vez de buscar) |
| Já existe leitura pronta dos artifacts do reveal — **reutilize, não reinvente** | `orchestrator/choose-offer.ts:44-80` (lê `artifacts` + `messages` por conversa) |
| O retorno deve trazer uma nota explícita: *"estes são os grupos já mostrados; não é uma busca nova — use `simulate_quota` com o `groupId`"* | idem |
| **O fallback enlatado deixa de ser o caminho normal.** Ele só pode sobrar pra falha REAL de infra (Bevi fora do ar), nunca pra "o modelo pediu uma tool fora de fase" | `index.ts:797` |
| Quando ainda assim cair no fallback, **nunca repetir o texto idêntico** — hoje o guard só compara com o ÚLTIMO turno, então a mesma frase volta a cada 2 turnos | `index.ts` (guard de repetição olha os últimos N turnos do assistant, não só o anterior) |

⚠️ **Invariante que NÃO pode quebrar:** continua PROIBIDO re-buscar na Bevi depois do reveal
(custo + write conflict). A tool devolve o que já foi buscado — não busca de novo.

## Regressão exigida

- Integração: conversa pós-reveal em que o modelo chama `search_groups` → **não** gera
  tool-error, **não** emite o texto enlatado, e a fala do modelo **sobrevive** (não é
  descartada). Provar que a Bevi NÃO foi chamada de novo (spy no adapter).
- Integração: o texto de `buildToolErrorRecoveryFallback` **não aparece 2× na mesma conversa**.
