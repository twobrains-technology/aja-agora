# Ata — Rodada de correções jornada2_revisão.docx (2026-06-19)

Origem: `jornada2_revisão.docx` (revisão 2 da jornada; teste manual do stakeholder
Bernardo rodando o produto em ajaagora.com.br). 8 screenshots + comentários gerais.

## Itens levantados → FIX-52..60 (9 itens, 3 blocos)

| FIX | Item | Bloco |
|---|---|---|
| 52 | Card de dados não dispara com CPF+telefone juntos; agente cai em fallback proibido ("atualiza a página") + meta-narrativa | A |
| 53 | Ordem: dados antes do valor; parar de re-pedir o valor | A |
| 58 | Reposicionar simulador de contemplação para antes da indicação + confirmar premissas (decisão Bernardo) | A |
| 54 | Teto de carro em 300k (CREDIT_BOUNDS) | B |
| 55 | Simulador não aceita números quebrados (step 10k) | B |
| 56 | 2 grupos da mesma administradora (rankGroups sem dedup) | B |
| 57 | Fim inconclusivo (falta CTA próximo passo) + clareza meses×lance | B |
| 59 | Lote de copy da landing (comentários gerais) | C |
| 60 | Figura do hero "mais brasileira" + ícone WhatsApp mobile | C |

## Achado importante
"Meses × lance" (feedback "deveria aumentar meses e reduzir lance") **NÃO é bug** —
`contemplation-dial.ts` implementa a mecânica inversa correta. Virou item de **clareza
de copy** dentro do FIX-57, não mudança de cálculo.

## Particionamento (3 blocos, onda 1, paralelos)
- **Bloco A — funil/coleta/ordem** (FIX-52, 53, 58): system-prompt, qualify-state,
  ai-sdk tools, artifact-guard, contact-capture, jornada docs.
- **Bloco B — simulador/recomendação** (FIX-54, 55, 56, 57): qualify-config, pickers,
  recommendation, simulation-result. NÃO toca system-prompt/ai-sdk.
- **Bloco C — landing copy/ui** (FIX-59, 60): componentes landing + whatsapp-optin +
  asset hero. Disjunto.

Relações: A×B = nível 2 (overlap em `ai-sdk.ts` regiões diferentes + cassettes
append-only) → mergear A antes de B. A×C e B×C = nível 1 (disjuntos).

## Pendências de produto (decisão Kairo/Bernardo)
- FIX-58: reposicionar tem aval do Bernardo (docx); REDESENHO do simulador continua
  precisando de aval (regra CLAUDE.md) → fora de escopo.
- FIX-60: figura "mais brasileira" e interpretação de "ícone WA móvel" têm escolha
  visual final do Kairo/Bernardo — executor gera candidata como proposta.
