# Home — medidas lidas do Figma

Referência de espaçamento e coluna da landing (`/`), extraída do frame por API e
conferida contra o DOM renderizado. **Existe para não precisar bater na API do
Figma toda vez.**

- **Arquivo**: `KORSVsutxrH4f1W5Osc6sn` · **nó**: `1-167` · frame `Home Page AJA`
- **Canvas**: 1440 × 8845 px (só desktop; o comp não tem mobile)
- **Dump bruto**: `.figma-cache/home-KORSVsutxrH4f1W5Osc6sn-1-167.json` (fora do
  git). Para regerar:
  ```
  curl -H "X-Figma-Token: $FIGMA_API_KEY" \
    "https://api.figma.com/v1/files/KORSVsutxrH4f1W5Osc6sn/nodes?ids=1-167"
  ```
  O rate limit é por token e o endpoint de arquivos estoura fácil — daí o cache.

> As coordenadas abaixo são relativas ao topo do frame (o `y` absoluto da API
> começa em −4422).

## Fronteiras das seções

| Seção | topo | base | altura |
|---|---|---|---|
| Menu | 0 | 96 | 96 |
| Hero | 96 | 993 | 897 |
| Jornada | 993 | 1999 | 1006 |
| Tipos | 1999 | 2991 | 992 |
| Contemplação | 2991 | 4032 | 1041 |
| FAQ | 4032 | 4847 | 815 |
| Números | 4847 | 5611 | 764 |
| Depoimentos | 5611 | 6584 | 973 |
| Confiança | 6584 | 7600 | 1016 |
| Comparação | 7600 | 8296 | 696 |
| CTA + Rodapé | 8296 | 8889 | 593 |

As caixas **se encostam** (0–24px entre elas). O respiro é interno a cada seção,
não um vão entre elas.

## Ritmo vertical

Vão de conteúdo a conteúdo entre seções vizinhas. **Não é uniforme** — cada seção
tem o seu. Implementado em `KV_RITMO`, em `src/components/kv/ui/kv-section.tsx`.

| Transição | comp |
|---|---|
| Menu → Hero | 183 |
| Hero → Jornada | 213 |
| Jornada → Tipos | 200 |
| Tipos → Contemplação | 180 |
| Contemplação → FAQ | 147 |
| FAQ → Números | 281 |
| Números → Depoimentos | 236 (55 + marquee 66 + 115) |
| Depoimentos → Confiança | 122 |
| Confiança → Comparação | 78 (base do painel navy, em 7484 → eyebrow, em 7562) |
| Comparação → Rodapé | 61 |

> **Armadilha das fronteiras.** A caixa do grupo `Confiança` vai até 7600, mas só
> por causa de um blob decorativo posicionado fora da tela (x = −301). O conteúdo
> real acaba em 7484. Medir "último texto da seção" por faixa de `y` também
> engana: o eyebrow da Comparação (7562) cai dentro da faixa do Confiança. Sempre
> confira o nó, não só a coordenada.

Respiro interno por seção (borda da caixa → primeiro/último texto):

| Seção | topo | base |
|---|---|---|
| Hero | 144 | 151 |
| Jornada | 62 | 92 |
| Tipos | 108 | 119 |
| Contemplação | 61 | 67 |
| FAQ | 80 | 180 |
| Números | 101 | 20 |
| Depoimentos | 115 | 85 |
| Confiança | 37 | 22 |
| Comparação | 36 | 61 |
| Rodapé | 0 | 88 |

**Cuidado**: onde a seção já tem painel interno com respiro próprio (o navy do
Confiança, o marquee entre Números e Depoimentos), o valor aplicado no
`<section>` é o do comp **menos** o que o painel já dá. Somar os dois dobra a
conta. Ver os comentários em `kv-section.tsx`.

## Coluna de conteúdo

| Bloco | largura | recuo esquerdo |
|---|---|---|
| Seções de conteúdo | 1240 | 100 |
| Menu e faixa navy do rodapé | ~1316 | 64 |

O `KvContainer` resolve isso com `max-w-[1304px] px-6 md:px-8` — 1240 de conteúdo
mais os 2×32 do gutter. Menu e rodapé usam `md:px-16`.

## Eyebrow → título

Distância do **topo da caixa** do eyebrow ao **topo da caixa** do `h2`. As caixas
se sobrepõem: o `line-height` de 62px num tipo de 44 deixa ~9px de folga interna,
e o comp usa essa folga.

| Seção | comp |
|---|---|
| Comparação | 12 |
| Tipos | 14 |
| Jornada | 16 |
| FAQ | 22 |
| Contemplação · Números · Depoimentos | 32 |

## Card de busca do hero (nó `1:189`)

- Card 514 × 148, `r=12`, `#FFFFFF`, padding 12 / 21 / 12 / 24, gap vertical 19
- Avatar 31 × 31, `#021628`
- "Consultor independente": Poppins 400 18/18, `ls −0.36`
- Placeholder: Poppins 300 18/18, `#6B6B66`
- Chips: **96 × 27, pílula com stroke `#052440` 0,84px**, fundo `#FBFBF9`,
  texto Poppins 600 10/14, ícone 14px com traço 1,27px, gap 13
- Botão enviar: 37 × 37, `r=6`, fundo `#FFE0E3`, ícone `#F2404F`

## Divergências deliberadas do comp

Registradas para ninguém "corrigir" de volta numa próxima passada de fidelidade:

- **Sem botão "Entrar"** no menu — não existe jornada de login de cliente.
- **"Comparar opções"** no card Carro; o comp escreve "Compara opções".
- **"QUAL O SEU PROPÓSITO"** no Tipos e nos Números — o comp escreve "QUAL A SUA
  PROPÓSITO", sem concordância.
- **Resumos do FAQ** são os do código; os do comp se repetem dois a dois
  (placeholder não atualizado).
- **Redes sociais**: só Instagram e Facebook, como o comp.
- Acentuação corrigida onde o comp escreve "consorcio" sem acento.
