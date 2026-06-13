---
id: FIX-4
titulo: "Pergunta 'Você sabe o que é lance embutido?' + explicação não apareceram"
status: done
rodada: 2026-06-05 manhã (teste manual em tela)
commit: eb3f84a
executado_em: 2026-06-05
---

# FIX-4 — Pergunta "Você sabe o que é lance embutido?" + explicação não apareceram

**Onde acontece:** Passo 2, gate `lance-embutido`.

**O que o docx exige (print do docx anexado pelo Kairo):**

1. **Pergunta de checagem de conhecimento:**
   > "Você sabe o que é lance embutido? Fique tranquilo, a gente te ajuda!"
   — dá ao usuário a chance de dizer se sabe ou não o que é.
2. **Explicação (pra quem não sabe):**
   > "O lance embutido permite usar parte da própria carta de crédito como
   > lance, por exemplo: em uma carta de R$ 100 mil, você pode usar parte
   > desse valor para aumentar suas chances de contemplação. Isso pode
   > ajudar quem não possui todo o valor do lance disponível hoje."

**O que aconteceu no teste manual:** NENHUM dos dois apareceu — nem a
pergunta, nem a explicação. O gate atual provavelmente vai direto ao
"quer considerar?" sem o ramo educativo.

**Ação na execução:**
1. Verificar `gate-questions`/diretivas do gate `lance-embutido`: existe o
   ramo "sabe o que é?" → explicação → só então o opt-in?
2. Conferir o trecho contra `jornada-canonica.md` (se o ramo não estiver
   transcrito lá, atualizar a partir do docx).
3. **Interação com FIX-2:** a explicação do docx usa "carta de crédito" —
   aplicar o padrão de linguagem amigável (explicação acoplada na 1ª menção).
4. **Interação com FIX-3:** se o lance embutido virar indicador do
   componente dinâmico, o ramo educativo continua necessário ANTES/JUNTO
   do componente.

**Regressão:** Camada 1 (âncoras da pergunta + explicação) + Camada 2
(cassette do gate) + rubric cobrando o ramo educativo do lance embutido.

**🔄 ATUALIZAÇÃO (mesma sessão de teste):** em rodada seguinte o ramo
**apareceu corretamente** — print mostra:

> "Você sabe o que é lance embutido? Fica tranquilo, a gente te ajuda!
>
> Ele permite usar parte da própria carta de crédito como lance — numa
> carta de R$ 100 mil, por exemplo, você usa uma fatia desse valor pra
> aumentar suas chances de contemplação, sem precisar ter todo o lance em
> dinheiro hoje.
>
> Quer considerar esse tipo de lance nas suas simulações?"
> [Sim, considerar lance embutido] [Não, lance com recursos próprios]

→ Reclassificar: o problema é **intermitência** (na primeira jornada do
Kairo o ramo não apareceu; nesta apareceu). Investigar em qual condição o
gate pula a explicação (ordem dos gates? resposta anterior? variação do
modelo?). O fix deve tornar o ramo educativo DETERMINÍSTICO, não
probabilístico. Atenção FIX-2: "carta de crédito" na explicação.
