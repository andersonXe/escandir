/**
 * Semente do corpus da camada 3: junções entre palavras.
 *
 * A camada 3 ainda não existe. Este arquivo é a especificação dela em forma de
 * dado — o que o grafo de junções precisa devolver como leitura canônica.
 * Nada aqui é executado hoje; o teste entra junto com a implementação.
 *
 * Notação: sílabas separadas por `|`, tônicas em caixa alta, `_` no ponto em
 * que duas palavras se fundem numa sílaba só.
 *
 * Cuidado ao estender: estes são sintagmas curtos, escolhidos para isolar *um*
 * fenômeno cada. O corpus de verso de verdade — versos inteiros, escandidos
 * contra fonte verificada — é outro arquivo, e ainda não foi montado. Ele é
 * que vai decidir os custos; estes aqui só decidem o que é possível.
 */

export interface GoldenJuncao {
  readonly texto: string;
  /** Leitura canônica, a que o motor deve ranquear em primeiro lugar. */
  readonly canonica: string;
  /** Número de sílabas da leitura canônica, contando tudo. */
  readonly silabas: number;
  readonly nota: string;
}

export const JUNCOES: readonly GoldenJuncao[] = [
  // --- Elisão: a regra, não a exceção --------------------------------------
  {
    texto: 'sobre o mar',
    canonica: 'SO|bre_o|MAR',
    silabas: 3,
    nota: 'Átona final + átona inicial: elisão quase obrigatória.',
  },
  {
    texto: 'minha alma',
    canonica: 'MI|nha_AL|ma',
    silabas: 3,
    nota: 'Elisão de vogais iguais átona + tônica.',
  },
  {
    texto: 'noite escura',
    canonica: 'NOI|te_es|CU|ra',
    silabas: 4,
    nota: 'Elisão diante de vogal átona diferente.',
  },
  {
    texto: 'e o vento',
    canonica: 'e_o|VEN|to',
    silabas: 3,
    nota: 'Duas monossilábicas átonas se fundem.',
  },
  {
    texto: 'que arde',
    canonica: 'que_AR|de',
    silabas: 2,
    nota: 'Clítico + tônica: o clítico desaparece na sílaba seguinte.',
  },
  {
    texto: 'para o mar',
    canonica: 'PA|ra_o|MAR',
    silabas: 3,
    nota: 'Preposição átona diante de artigo.',
  },
  {
    texto: 'de água',
    canonica: 'de_Á|gua',
    silabas: 2,
    nota: 'Equivale à forma apostrofada "d\'água", que já conta 2.',
  },

  // --- Elisão que o poeta pode recusar --------------------------------------
  {
    texto: 'já é',
    canonica: 'JÁ|É',
    silabas: 2,
    nota: 'Duas tônicas: a fusão existe, mas é cara. Hiato é o padrão.',
  },
  {
    texto: 'palavra única',
    canonica: 'pa|LA|vra_Ú|ni|ca',
    silabas: 5,
    nota: 'Átona + tônica funde; a alternativa em hiato deve continuar válida.',
  },

  // --- Onde não há junção ---------------------------------------------------
  {
    texto: 'um amor',
    canonica: 'um|a|MOR',
    silabas: 3,
    nota: 'Coda nasal bloqueia a elisão: não há vogal em contato.',
  },
  {
    texto: 'mar azul',
    canonica: 'MAR|a|ZUL',
    silabas: 3,
    nota: 'Coda consonantal: o "r" reencadeia na fala, mas não funde sílaba.',
  },
  {
    texto: 'casa branca',
    canonica: 'CA|sa|BRAN|ca',
    silabas: 4,
    nota: 'Consoante inicial: nenhuma decisão a tomar.',
  },
];

/**
 * Alvos métricos usados pelos testes da camada 4. A contagem para na última
 * tônica: o que vem depois dela é extramétrico e não conta.
 */
export const TERMINACOES: readonly { readonly tipo: string; readonly nota: string }[] = [
  { tipo: 'aguda', nota: 'Última tônica é a última sílaba: contagem bate com o total.' },
  { tipo: 'grave', nota: 'Sobra uma sílaba depois da tônica; ela não conta.' },
  { tipo: 'esdrúxula', nota: 'Sobram duas; nenhuma conta.' },
];
