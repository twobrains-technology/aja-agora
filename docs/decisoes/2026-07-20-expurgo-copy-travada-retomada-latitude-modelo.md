# Decisão — Expurgo do cimento de copy e retomada da latitude do modelo (docs + eval)

> 2026-07-20 · Kairo (auditoria multi-agente) · Status: **aceita — parcialmente executada**
> Continua: [`2026-07-13-revoga-jornada-soberana-desamarra-agente.md`](./blocos/2026-07-13-revoga-jornada-soberana-desamarra-agente.md)
> (a ADR que revogou o `jornada.docx` como regra) ·
> Dossiê da auditoria: `docs/design/specs/2026-07-20-dossie-critico-agente-conversacional.md`
> (produzido em paralelo por outro agente da mesma onda — pode não existir ainda no disco no
> momento em que esta ADR foi escrita; referencie mesmo assim).

## Contexto

A ADR de 2026-07-13 já tinha revogado o `jornada.docx` como fonte de verdade e proibido copy
travada — mas revogar o documento não bastou. Uma auditoria multi-agente em 2026-07-20 (a mesma
onda desta ADR) encontrou **resíduo do dogma antigo espalhado em `docs/` e `tests/eval/`**, ainda
instruindo (ou tentando instruir) o agente/os avaliadores a tratar o docx revogado como autoridade:

1. **O juiz LLM da jornada** (`src/lib/eval/jornada-rubric.ts`, `JORNADA_RUBRIC_SYSTEM_PROMPT`)
   segue com a instrução explícita *"Avalie APENAS contra o docx acima — não contra o que 'parece
   razoável'"*, pontuando `ordemCorreta`/`fidelidade` a um documento que não existe mais como
   regra. Uma rubrica que premia recitar roteiro é exatamente o que produziu o agente robô descrito
   na ADR de 2026-07-13.
2. **`tests/eval/jornada-aja-agora.eval.test.ts`** (o cenário que alimenta esse juiz) tinha o
   cabeçalho inteiro escrito em torno do `jornada.docx` como fonte, citava um teste
   (`jornada-docx-copy.test.ts`) que já **não existe mais** no repo, e continha 3 asserts que
   forçavam **texto literal** no transcript (`toContain`/regex de frase exata) sob o rótulo de
   "fidelidade ao docx" — mesmo quando o texto testado era copy determinística do servidor
   (`closing-presentation.ts`, `gate-questions.ts`), a framing induzia o leitor a pensar que o
   MODELO precisava recitar aquilo.
3. **Um bloco de correção ATIVO e pendente** (`docs/correcoes/todo/bloco-f-artifacts-produto/`,
   status `SEGURADO — aguarda aval do Bernardo`) instruía o futuro executor a tratar
   `docs/jornada/jornada-canonica.md` como **"a REGRA do fluxo"** e citava uma "regra inviolável do
   `CLAUDE.md`: divergência código×docx = defeito" — **nenhuma das duas coisas existe mais** (o
   arquivo foi renomeado/rebaixado para `decisoes-do-cliente.md` em 2026-07-13, sem poder
   normativo; a regra do `CLAUDE.md` foi substituída pela seção "Não engesse o agente"). Se este
   bloco fosse liberado sem correção, o executor teria sido instruído a re-engessar o produto.
4. **`docs/qa/criterios-aceite-conversa.md`** (rubrica de QA ativa) tinha a ordem dos gates
   desatualizada em 2 pontos verificados contra o código (`nextGate`, `qualify-state.ts`): `credit`
   hoje vem ANTES de `identify` (a Rodada 10 de 2026-07-12 reverteu conscientemente o FIX-53), e o
   gate `reco-consent` nem aparecia na ordem documentada. Um coletor de QA seguindo a versão antiga
   reprovaria comportamento correto do produto atual.

## Decisão

1. **`tests/eval/jornada-aja-agora.eval.test.ts` reescrito** para julgar contra a referência viva
   (`docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/`) e o código (`nextGate`), não
   contra o docx: cabeçalho reformado, referência morta removida, os 3 asserts de texto literal
   renomeados/comentados para deixar claro que testam COPY DETERMINÍSTICA DE SERVIDOR (invariante
   de produto/compliance), nunca fala livre do modelo — e a seção do LLM-judge reformada para
   descrever o alvo como **qualidade de conversa** (conduz, reage, trata objeção, soa humano,
   explica consórcio com competência), não fidelidade a roteiro. Um aviso datado documenta que o
   `GATE_SEQUENCE` do harness pode estar dessincronizado da ordem real do código (verificado por
   leitura direta, não corrigido às cegas — reordenar exige rodar o eval real, fora do escopo deste
   expurgo em modo urgência).
2. **`docs/correcoes/todo/bloco-f-artifacts-produto/` corrigido** (`_bloco.md`, `_prompt.md`,
   `fix-96-*.md`): removida a referência ao arquivo morto e à regra inviolável revogada; o GATE
   HUMANO real (aval do Bernardo pro conceito de produto) permanece — não é sobre documento, é
   sobre stakeholder.
3. **`docs/qa/criterios-aceite-conversa.md` corrigido**: ordem de gates reverificada em 2026-07-20
   direto no código, DV-6 marcada como RESOLVIDA (deixou de ser divergência desde a Rodada 10), nota
   de topo deixa de chamar a ordem de "SOBERANA" (o termo evoca o dogma revogado) e passa a se
   descrever como **foto do código no dia da verificação**, a re-conferir.
4. **`docs/jornada/decisoes-do-cliente.md` auditado e mantido como está** — já é o documento correto
   (invariantes duros separados de histórico, sem copy travada disfarçada de regra); nenhuma
   decisão de negócio do cliente foi alterada ou removida.

## Pendência real (fora do escopo desta ADR — não é de `docs/`)

**O núcleo do problema segue vivo em `src/lib/eval/jornada-rubric.ts` e `jornada-judge.ts`.** O
`JORNADA_RUBRIC_SYSTEM_PROMPT` ainda instrui o juiz a avaliar "APENAS contra o docx" e pontua
`ordemCorreta`/reforços literais do documento revogado. Esta ADR **não tocou `src/`** (outros
agentes da mesma onda estavam editando ali em paralelo — risco de conflito). Quem pegar este
trabalho a seguir precisa dar à rubrica o MESMO tratamento dado aqui ao arquivo de teste: trocar a
fonte normativa para o mockup/handoff + qualidade de conversa (conduz, reage, trata objeção, soa
humano, competência técnica), e parar de premiar recitação. Sem esse passo, o teste reformado ainda
delega a nota final pra um juiz que julga pelo critério errado.

## Consequências

- Um futuro executor do bloco-f-artifacts-produto não é mais instruído a tratar um arquivo morto
  como lei nem a travar copy contra um documento revogado.
- QA que rodar `docs/qa/criterios-aceite-conversa.md` hoje não reprova mais comportamento correto
  (credit antes de identify, reco-consent presente) por comparação com uma ordem stale.
- O eval nightly da jornada deixa de reforçar, na sua própria documentação interna, o modelo mental
  de "recitar roteiro = nota alta" — mas **a nota que ele produz ainda depende da rubrica em
  `src/lib/eval/`, não corrigida aqui**. Não declarar esta frente encerrada até esse arquivo ser
  revisado.
