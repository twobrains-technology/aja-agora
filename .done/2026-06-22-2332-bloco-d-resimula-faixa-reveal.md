# Bloco D — Re-simulação por troca de faixa pós-reveal (FIX-68)

**Data:** 2026-06-22 · **Branch:** `fix/resimula-faixa-reveal` · **Commit:** `914c7b4`

## O problema (na voz do operador)

> "ele começou mostrando uma cota, mas depois que pedi para mostrar outra ele não consegue buscar."

Na conversa real `a8b0a80d` ("Maria", auto, web): o usuário viu opções de **R$ 256 mil**,
depois pediu **R$ 130 mil / 60 meses**. O agente travou — repetiu "esse grupo não está
disponível", "instabilidade na busca", e chegou a **alucinar** ("sua última simulação:
308k/96m"). O mesmo erro se repetiu **6×** na mesma conversa. A jornada morria no passo 4
toda vez que alguém queria comparar duas faixas de valor — exatamente o que um comprador de
consórcio faz o tempo todo ("e se eu pegar um carro mais barato?").

## A causa

Depois do primeiro reveal, a plataforma **tirava do agente a ferramenta de buscar grupos**.
Isso tinha sido feito de propósito, pra impedir um bug antigo em que o agente ficava
re-mostrando os mesmos cards em loop a cada "tá ótimo". O efeito colateral: o agente perdeu
a única forma de descobrir uma faixa de valor **nova**. Sem poder buscar e sem um identificador
real para a faixa de 130 mil, o modelo **inventava** um código (`auto-130k-60m`) que não existe
em lugar nenhum — e a plataforma, corretamente, recusava. Daí o loop de "instabilidade".

## A correção

A plataforma agora **distingue dois gestos que pareciam iguais**:

- **"Tá ótimo" / "fecha"** sobre a faixa que já está na tela → continua bloqueando a re-busca
  (o loop antigo segue morto).
- **"Quero ver de 130 mil"** (uma faixa de valor diferente) → a busca **volta**, o agente
  descobre os grupos reais dessa faixa e simula com o identificador verdadeiro — **nunca um
  inventado**.

Tecnicamente: a plataforma guarda qual valor foi usado na última descoberta e compara com o
valor que o usuário pede agora. Mudou o valor-alvo → re-descobre. Mesmo valor → segura. O
agente também foi instruído a **re-buscar ao trocar de faixa** e a **jamais fabricar um código
de grupo** — usar só o que a busca devolve.

## Qualidade entregue (anti-regressão de 3 camadas — padrão do projeto)

- **Camada 1 (estrutural):** `tool-policy.test.ts` — matriz que prova que a troca de faixa
  reabilita a busca e que o afirmativo curto **não** reabilita (anti-regressão do loop antigo).
- **Camada 2 (cassette determinístico):** `agent-trajectory.test.ts` — reproduz a troca
  256k→130k, detecta o **código fabricado** (`auto-130k-60m`) como assinatura do bug e prova
  que, corrigido, a busca vem **antes** da simulação com identificador real.
- **Camada 3 (eval com IA real):** os 2 cenários cirúrgicos do pre-commit passaram com chamada
  Anthropic real.
- **Suíte inteira:** 1883 testes verdes, **zero regressão**. O bug original (BUG-REVEAL-LOOP)
  continua coberto e verde.

TDD strict: os testes foram escritos primeiro, **vistos falhar** com a assinatura exata do bug,
e só então o código foi corrigido — 1 commit `test+fix:`.

## Arquivos tocados (8)

| Arquivo | Papel |
|---|---|
| `personas.ts` | Campo `discoveredCreditTarget` (memória do valor descoberto) |
| `tool-policy.ts` | `revealValueTargetChanged` + reabilita busca na troca de faixa |
| `analyze.ts` | Atualiza o valor-alvo pós-reveal quando o usuário pede faixa nova |
| `runner.ts` | Snapshota o valor descoberto (fecha o ciclo do anti-loop) |
| `artifact-guard.ts` | Libera os cards da faixa nova na troca |
| `system-prompt.ts` | Regra: re-buscar ao trocar de faixa, nunca inventar id |
| `tool-policy.test.ts` | Camada 1 |
| `agent-trajectory.test.ts` | Camada 2 (cassette) |

## Gaps honestos

- O escopo real (8 arquivos) ficou maior que os 4 da proposta original do card — porque a
  proposta não tinha mapeado que o valor-alvo **não era atualizado** pós-reveal (`analyze.ts`).
  Sem essa peça, o guard nunca veria a troca. Está documentado no card movido pra `done/`.
- A re-descoberta dá certo end-to-end nos testes determinísticos e na suíte; **uma passada E2E
  no browser real** (Playwright na UI) reforçaria a confiança visual nos cards da faixa nova,
  mas não foi executada nesta sessão autônoma (ambiente isolado subiu só o Postgres pra rodar
  a suíte; a app não foi levantada). O comportamento está coberto pelas 3 camadas.
- O ajuste em `analyze.ts` reage a `userIntent === "providing_info"` + valor diferente. Um
  número solto que o classificador interprete como "novo valor" pode disparar uma re-busca
  extra — mas é **degradação graciosa** (re-descobre a mesma faixa uma vez e para), nunca um
  loop.
