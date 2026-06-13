---
id: FIX-7
titulo: "Reveal com 1 opção: carrossel de card único + repetição do mesmo grupo logo abaixo"
status: done
rodada: 2026-06-05 manhã (teste manual em tela)
commit: 88f69b6
executado_em: 2026-06-05
---

# FIX-7 — Reveal com 1 opção: carrossel de card único + repetição do mesmo grupo logo abaixo

**Onde acontece:** Passo 3/4, reveal das opções. Busca retornou **só 1
opção** (CANOPUS) e a tela ficou:

1. Texto: "Encontrei boas opções na sua faixa, Kairo. Agora vou te mostrar
   a mais adequada pro seu perfil:" (plural "boas opções" + promessa de
   curadoria — mas só existe 1)
2. Card **Recomendação** CANOPUS (43% compatível, R$ 475,93/mês, R$ 35.000,
   96 meses, "Tenho interesse")
3. Logo abaixo, card **Simulação · CANOPUS** — o MESMO grupo repetido com
   detalhamento (custo total, taxa efetiva, cenário com lance, lance
   embutido 30%...)

**Palavras do Kairo:** "Quando só tem uma opção, obviamente essa única
opção vai ser a preferencial. Essa dinâmica ficou ruim porque ficam os
cards ali em cima que seria o carrossel — só que só tem um — e aí embaixo
repete ele de novo. Ajustar essa experiência quando tiver dois."

**Direção da correção:**
- O layout "carrossel em cima + recomendação destacada embaixo" só faz
  sentido com **≥2 opções**.
- Com **1 opção**: consolidar num card único (recomendação + detalhamento
  juntos), sem narrativa de comparação/curadoria ("a mais adequada" implica
  escolha entre várias).
- Ajustar também o texto do agente pra não prometer "boas opçõeS" no plural
  quando só há 1.

**Observação minha (validar na execução, mesma área):** CTAs duplicados no
card de simulação — botão "Tenho interesse" dentro do card + chips "Tenho
interesse!" / "Ajustar valor" / "Ver outras opções" logo abaixo. Redundante.

**Possível bug de produto por trás:** a regra de ≥3 opções
(`recommendWithFallback`, expansão ±20%/±50%, flag `insufficientOptions`)
deveria ter buscado alternativas — por que só veio 1 opção pra moto R$ 20k?
Investigar se o fallback rodou e se o agente comunicou a escassez como
manda o contrato (`insufficientOptions=true` → comunicar).

**Regressão:** teste de render condicional (1 opção = card único; ≥2 =
carrossel + destaque) + cassette do texto do reveal com 1 opção (sem
plural enganoso) + verificação do caminho insufficientOptions.
