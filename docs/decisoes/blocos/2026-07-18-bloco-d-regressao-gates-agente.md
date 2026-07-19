---
data: 2026-07-18
titulo: "Regressão dos gates pós-motivo (FIX-354) — 3 de 4 sintomas são comportamento intencional, não regressão"
status: aceita
decisor: executor (técnico, com evidência de código + diário do loop autônomo) — sem trade-off de produto em aberto
contexto: bloco-d-regressao-gates-agente, achado colateral do bloco-a-kv-topo-conversao (FIX-351)
---

# ADR — FIX-354: por que 3 dos 4 testes vermelhos NÃO são regressão

O card `fix-354-regressao-gates-fix53-212-275-296.md` listava 4 testes vermelhos e uma
"correção proposta" que revertia `qualify-state.ts`/`system-prompt.ts` pro comportamento do
FIX-296. Investigação (`git log -p` nos arquivos entre o commit do FIX-296 `6ac23ce1` e HEAD)
mostrou que **3 dos 4 sintomas são consequência de decisões de produto deliberadas e já
validadas ao vivo**, tomadas por Kairo em `2026-07-15` durante o loop autônomo registrado em
`docs/correcoes/2026-07-15-loop-autonomo-refino-agente.md` — não uma reintrodução acidental do
bug antigo. Reverter o código pra fazer os testes antigos passarem re-introduziria os dois bugs
reais que aquelas mudanças corrigiram. Só o 4º sintoma (emoji) é um bug real, corrigido em código.

## Item 1 e 2 — `qualify-state.fix-275`/`fix-296`: credit dispara JUNTO com o espelho (não mais 1 turno depois)

**O que os testes exigem:** `decideShowGate({ gate: "credit", intent: "expressing_doubt", ... })`
deve devolver `false` enquanto `motivationMirrored` não for `true` — i.e., o gate `credit` some
por 1 turno inteiro enquanto o agente só espelha o motivo.

**O que o código faz hoje:** devolve `true` nesse mesmo cenário (`qualify-state.ts:484`).

**Causa raiz confirmada:** commit `367c3846` (2026-07-15, mensagem: *"Beat espelho+objetivo
segurava o funil por um turno (return false), deixando o chat morto sem proxima pergunta. Agora
forca o gate seguinte a disparar junto com a fala (return true)"*). Isso NÃO é drift acidental —
é a correção documentada do **FIX-A** no diário do loop:

> Sintoma (Kairo, print): agente dá o espelho+objetivo... e PARA, sem próxima pergunta. Chat
> parece encerrado. [...] Fix (decisão do Kairo — Opção "emenda a próxima pergunta"): `return
> true` no beat do espelho (força o gate seguinte a disparar JUNTO com a fala) + prompt passo 3
> passa a instruir a emenda da ponte pro próximo passo.

E validado ao vivo na rodada seguinte do mesmo diário: *"FIX-A validado ao vivo: no motivo, o
agente deu o espelho E emendou a próxima pergunta no mesmo fôlego [...] Não morreu seco."*

**Por que os testes antigos codificam exatamente o bug que o FIX-A corrigiu:** o `return false`
que os testes exigem é literalmente o comportamento que produzia o "chat morto" — o motivo pelo
qual o FIX-296 segurava o funil por 1 turno extra (só pro espelho, sem card) era evitar 2
perguntas no mesmo balão (anti-CK-1), mas na prática deixava o usuário sem próximo passo visível
até o beat seguinte. O FIX-A resolve isso fazendo o modelo **emendar** a pergunta do próximo gate
na MESMA fala do espelho (system-prompt.ts:322 já instrui isso), em vez de segurar o card.
Reverter pra `return false` reintroduziria o bug relatado por Kairo em produção.

**Decisão:** os testes `qualify-state.fix-275-motivo-nao-trava.test.ts` e
`qualify-state.fix-296-reordena-funil.test.ts` estão desatualizados — atualizados nesta correção
pra refletir o invariante VIGENTE (credit dispara junto do espelho, independente de intent,
enquanto `motivationMirrored` ainda não rodou). O histórico do FIX-275/296 permanece documentado
no cabeçalho do arquivo (não apagado — só marcado como superado pelo FIX-A/367c3846).

## Item 3 — `system-prompt.fix53`: a frase literal "CPF e celular" foi removida DE PROPÓSITO

**O que o teste exige:** `SPECIALIST_BASE_PROMPT` contém a substring `/cpf e celular/` (regra
dura da linha 341, versão do FIX-296: a moldura do pedido de identidade era citada literal no
prompt — *"pra trazer as ofertas reais das administradoras, preciso do seu CPF e celular"*).

**O que o código faz hoje:** a frase literal foi removida (mantém só "CPF + celular" como
referência ao DADO, nunca como a locução exata que o card de identidade usa).

**Causa raiz confirmada:** commit `e16895c7` (2026-07-15, *"fix: remover cópia vazada do pedido
de CPF do prompt (pedido saía duplicado)"*) — é o **FIX-C** do mesmo diário:

> Sintoma (coletor, LITERAL): "Boa, 120 mil então. Agora preciso do seu CPF e celular pra trazer
> as ofertas reais das administradoras. Pra eu trazer as ofertas reais das administradoras,
> preciso do seu CPF e celular." — a mesma coisa duas vezes. Causa: o pedido de identidade é
> DETERMINÍSTICO (`gateQuestion('identify','web')`). Mas o system-prompt VAZAVA ao LLM a frase
> exata do sistema — o LLM papagaiava e o sistema repetia.

Validado ao vivo nas rodadas seguintes (*"FIX-C confirmado (o LLM só confirmou o valor e
parou)"*). Este é exatamente o padrão que o `CLAUDE.md` do projeto chama de "regra que separa o
que é código do que é conversa": o pedido de CPF é um invariante do SERVIDOR (card determinístico)
— citar a locução exata no prompt fazia o modelo reproduzi-la, duplicando a pergunta. A remoção
foi a correção certa, não drift.

**Decisão:** `system-prompt.fix53.test.ts` estava testando a citação literal removida
deliberadamente. Atualizado pra testar o invariante VIGENTE: o prompt instrui a NÃO reproduzir o
pedido de identidade (deixa pro sistema), mantendo as outras 3 asserções do arquivo (anti-
repetição de valor, reforço do servidor, referência ao bug da revisão 2) intactas — elas já
passavam e continuam válidas.

## Item 4 — `no-emoji-fix212`: bug real, corrigido em código (não é divergência)

**Causa raiz confirmada:** commit `524c620c` (2026-07-15, FIX-E — trava o tipo do bem no
espelho) adicionou um único caractere `⚠️` como marcador de ênfase em
`motivationMirrorSection` (system-prompt.ts:1023), sem notar que a varredura anti-emoji do
FIX-212 (`no-emoji-fix212.test.ts`) sinaliza qualquer emoji que caia entre duas aspas na MESMA
linha — e como o parágrafo inteiro vive numa única linha de template literal com várias frases
de exemplo entre aspas, o `⚠️` acabou fisicamente entre duas aspas de exemplos DIFERENTES,
disparando o falso-positivo da regra "emoji dentro de aspas = copy que o LLM ecoa". Não é copy
de exemplo (não está dentro de nenhuma fala de exemplo real) — é um marcador solto de instrução,
igual aos `❌`/`✅` já usados em outros pontos do mesmo arquivo (que o teste explicitamente
tolera). Ainda assim, por este ser justamente o arquivo-alvo da regra "zero emoji" do FIX-212 e
o único emoji do tipo `⚠️` no arquivo, a correção mais simples e segura é remover o caractere
(a ênfase textual "SEMPRE"/"NUNCA troque" já em maiúsculas carrega o mesmo peso). Corrigido em
código nesta correção — não é uma divergência de produto.

## Resumo da decisão

| Item | Card dizia | Confirmado | Ação nesta correção |
|---|---|---|---|
| 1-2 (credit segura pós-motivo) | regressão a corrigir em `qualify-state.ts` | comportamento intencional (FIX-A, `367c3846`, validado ao vivo 2026-07-15) | atualiza os 2 testes pro invariante vigente |
| 3 (CPF e celular no prompt) | regressão a corrigir em `system-prompt.ts` | remoção intencional (FIX-C, `e16895c7`, validado ao vivo 2026-07-15) | atualiza o teste pro invariante vigente |
| 4 (emoji na copy) | regressão a corrigir em `system-prompt.ts` | bug real (falso-positivo do FIX-E, `524c620c`) | remove o emoji em código |
