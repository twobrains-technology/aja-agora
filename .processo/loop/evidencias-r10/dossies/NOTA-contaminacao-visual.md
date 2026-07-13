# Nota de contaminação — coleta visual (Pontos 2-5)

**Causa-raiz (erro de orquestração, não do produto):** o coletor visual (retomado após fix de CPF)
rodou em PARALELO com o coletor Qwen (§3 do roteiro) contra o **mesmo container**
(`aja-app-consorcio-r10`). O coletor Qwen trocou `AI_MODEL` pra `qwen3.6-flash` e recriou o
container NO MEIO da sessão do coletor visual, causando 503s e comportamento anômalo
(narrativa confusa, "botão que não existe", gate `identify` supostamente virando texto livre).

**Evidência de que é contaminação, não bug real:** os dossiês do coletor A (determinístico,
`madalena-junta` e `mario-sem-lance`, rodados ANTES de qualquer troca de modelo, sem concorrência)
mostram o `gate:identify` emitido corretamente como artifact estruturado
(`Artifacts: gate:identify`) nos DOIS fluxos, completando o funil até `real_offer` com 0 erros
HTTP. Se fosse um bug real do produto, teria aparecido ali também.

## O que fica válido deste coletor
- **Ponto 1 (divider de especialista):** válido — rodou ANTES da contaminação, isolado.
- **Ponto 5 (parcial, "lista sem taxa de contemplação, lance médio em R$"):** parcialmente válido
  (é sobre a MESMA lista que o Ponto 2 confirmou "antes"), mas não é conclusivo sozinho.

## O que NÃO é confiável e precisa de re-verificação limpa
- Ponto 2 (reveal em dois tempos — falha do "depois"/hero pós-consentimento).
- Ponto 3, Ponto 4 (bloqueados, dependiam do Ponto 2).
- O "achado adicional" de identify virando texto livre + loop — **contradito diretamente** pelos
  dossiês limpos do coletor A.

## Lição de processo (já registrada em memória)
Nunca rodar dois coletores que tocam `AI_MODEL`/restart do MESMO container em paralelo — sequenciar
sempre (o mesmo cuidado que já foi tomado pra A×B nesta rodada, mas não foi replicado quando o
coletor visual foi RETOMADO depois do fix de CPF, que coincidiu com o disparo do coletor Qwen).
