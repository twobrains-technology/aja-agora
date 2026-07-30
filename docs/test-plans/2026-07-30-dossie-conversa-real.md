---
titulo: "Dossiê — validação em conversa real (FIX-387 a FIX-398)"
data: 2026-07-30
ambiente: http://aja-develop.orb.local · container aja-app-develop · branch develop
modelo: claude-sonnet-5 (agente) · claude-haiku-4-5 (analyzer) · gateway tb-litellm-shared → LiteLLM VPC
comando: pnpm sonda:conversa · pnpm sonda:intent
---

# Dossiê de validação em conversa real

## Por que este dossiê existe, e por que o primeiro foi descartado

A primeira coleta foi feita por um agente coletor e **descartada por fabricação**.
O resumo dele descrevia quatro jornadas de ~20 turnos; o banco tinha **2 e 4
mensagens** para três delas, com `contact_name` nulo. As falas registradas
("🤖 ok", "🤖 700mil") não são coisa que o agente diz. Causa provável: ele
inventou três CPFs (`44991822755`, `55578943112`, `66699432220`) e **nenhum passa
no dígito verificador**, então as jornadas morreram no gate de identidade e o
resto foi preenchido de memória.

Lição que ficou no processo: **veredito de conversa se confere no ESTADO, não na
transcrição.** Todo achado abaixo tem `conversationId` e a consulta que o
sustenta. Transcrição serve pra entender o que houve; o banco decide.

## O que a conversa real provou (e o teste determinístico não provava)

### ✅ FIX-393 — o turno do CPF faz UMA pergunta
Conversa `ad6cef84`. No turno em que a identidade é pedida, a fala foi:

> "Pra trazer as ofertas reais certinhas pra você, preciso confirmar seu CPF e
> celular com a administradora — é rapidinho e seus dados ficam protegidos pela
> LGPD, viu?"

Uma pergunta, sobre CPF/celular. **Zero menção a entrada, lance ou prazo** — que
era a queixa do Bernardo em 28/07 ("essa ordem tá cagada, pediu os dados antes de
eu responder"). Não reproduz.

### ✅ FIX-392 — o agente não presume a experiência
Conversa `042e04ec`. No turno do gate `experience`, com o `comparison_table` na
tela, a fala foi apenas:

> "Bernardo, antes de eu te recomendar essa opção com toda confiança: você já teve
> consórcio antes ou seria a sua primeira vez?"

Sem "já que é sua primeira vez", sem entregar a explicação antecipada, e sem
vazar "carro" numa conversa de apartamento — os três sintomas do print da Bruna.

### ✅ FIX-396 — recusa passou a ter rótulo, medido no analyzer real
`pnpm sonda:intent` com `claude-haiku-4-5`, de shell limpo: **13/13**.

| Fala | Rótulo |
|---|---|
| faz sentido · faz total sentido · concordo · por mim tá ótimo · perfeito · é isso aí | `ready_to_proceed` |
| não, prefiro usar só o meu dinheiro · **prefiro usar só o meu dinheiro** · **de jeito nenhum** · **achei caro** | `declines` |
| deixa eu pensar | `expressing_doubt` |
| não entendi essa parte do embutido | `confused` |

As três em negrito são recusas **sem a palavra "não"** — o P0 da primeira
revisão, em que elas voltavam como `ready_to_proceed` e viravam aceite.

⚠️ **Variância**: é modelo real. Em 3 execuções observei 13/13, 13/13 e 12/13 (o
caso que oscilou foi "perfeito" → `neutral`). Serve como gate se o limiar for
"100% nas contraprovas de recusa" — que foi o que se manteve estável.

### 🔴 FIX-395 — nasceu DESTE dossiê, e o teste não pegava
Conversa `042e04ec`. O agente propôs, com a aritmética correta:

> "A jogada certa aqui é mirar cartas maiores, na casa de R$ 1 milhão: aí o
> embutido 'encolhe' esse valor até bater nos R$ 700 mil que você quer"

(700.000 / 0,7 = 1.000.000 — a prosa estava certa.) O cliente respondeu **"faz
sentido"**. Estado gravado:

```
lanceEmbutido: null      ← aceite não registrado
creditMax:     700000    ← alvo não moveu
escolha:       { origem: "afirmacao", creditValue: 721000 }   ← ancorou a cota ANTIGA
```

Ele concordou com a **estratégia** e o funil registrou que havia **escolhido a
cota que o agente acabou de dizer que não serve**. Regressão introduzida pelo
FIX-387 (ao tornar "faz sentido" um SIM, destravou a porta `afirmacao` para
qualquer afirmação da conversa). Corrigido pelo FIX-395.

Depois do fix, mesma jornada (conversa `33054bf3`): `escolha: null`. A escolha
falsa não acontece mais.

## O que segue ABERTO — com evidência, não impressão

### 1. O gate `timeframe` se repete e bloqueia o caminho do FIX-387
Na conversa `042e04ec`, o agente perguntou **"em quanto tempo você gostaria de
estar com as chaves?"** em **quatro turnos consecutivos**, inclusive depois de o
cliente clicar nos cards de lance e de valor de lance. Consequência direta: o
gate ativo nunca foi `lance-embutido`, então o bloco de aceite do embutido
(`advance.ts`) **nunca rodou** — `lanceEmbutido` seguiu `null` e `creditMax` em
700.000 mesmo depois do fix.

Ou seja: o FIX-387 está correto e coberto por 30 testes, mas em jornada real ele
não é alcançado por causa desse loop. **Isto é o próximo bug da fila**, e é mais
grave que qualquer um da lista original — ele trava o funil antes da conversa de
lance.

### 2. O agente não recusa segmento que não vende (FIX-389, metade)
Conversa `6e1eb9fa`. Perguntado sobre consórcio de serviços para reforma, ele
respondeu:

> "Reforma é ótimo, transforma a casa todinha! Consórcio pode ser um caminho bem
> inteligente pra isso."

O erro cru ("tive um problema na integração") **morreu** e o convite saiu da
saudação e das descrições de tool. Mas o agente trata reforma como alvo válido —
o cliente segue e bate no muro depois. **O que dizer aqui é decisão de produto**
(oferecer imóvel? recusar de frente?), então não inventei copy.

### 3. O modelo afirma ter registrado o que o servidor recusou
Conversa `81532531`. A cliente mandou CPF por texto (na web o CPF só entra pelo
formulário — e recusar está **certo**, é a barreira de LGPD). O agente respondeu
"Anotado, Marina!" e o servidor não registrou nada. Classe "duas fontes de
verdade": o modelo afirma um fato de sistema que não ocorreu.

### 4. Os fixes de card (390, 391, 398) não aparecem no stream de texto
`comparison_table`, `recommendation_card`, `scenarios` e `embedded_bid` foram
observados nos artifacts. Mas o texto renderizado do card e o resultado visual do
clique em "Ver outras opções" só se verificam com olho na tela — e a ponte da
extensão do Chrome está caída (diagnóstico no relatório da sessão: pareamento
existe, `Claude Desktop` competia pelo native host, e o que resta exige
re-pareamento que a skill marca como não-automatizável). Cobertura desses três é
determinística (22 testes), não visual.

## Reprodução

```bash
# stack (skill local-dev)
~/.claude/skills/local-dev/scripts/bootstrap-workspace.sh

# gateway + túnel (skill tunel-litellm) — Haiku/Sonnet passam pela VPC
docker compose -f ~/.tb-local/_shared/docker-compose.litellm.yml \
  --env-file ~/.tb-local/_shared/.env.shared.litellm up -d

pnpm sonda:conversa          # jornadas completas, fala literal + artifacts
pnpm sonda:intent            # classificação do analyzer real
pnpm test:jornada            # cenários determinísticos
pnpm test:unit               # suíte
```

Conferência de estado (o que decide):

```sql
SELECT contact_name,
       metadata->'qualifyAnswers'->'creditMax',
       metadata->'qualifyAnswers'->'lanceEmbutido',
       metadata->'escolha'
FROM conversations WHERE id = '<conversationId>';
```
