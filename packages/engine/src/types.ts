/**
 * Tipos públicos da camada 2 do motor: palavra -> sílabas + tônica.
 *
 * O formato de saída segue o modelo do `rantanplan` (escansão de espanhol):
 * cada sílaba carrega a informação prosódica que a camada 3 precisa para
 * montar o grafo de junções do verso. Nada aqui depende de DOM, I/O ou
 * de qualquer idioma específico.
 */

/**
 * Peso prosódico da tônica de uma palavra dentro do verso.
 *
 * `weak` marca palavras de classe fechada (artigos, preposições, clíticos,
 * conjunções) que têm tônica lexical mas não firmam posição métrica: a
 * camada 4 não deve aceitar uma sílaba `weak` como tônica obrigatória, nem
 * como a última tônica que encerra a contagem.
 */
export type StressStrength = 'strong' | 'weak';

/** Origem da análise, útil para diagnóstico e para auditar o léxico. */
export type ScansionSource = 'rules' | 'lexicon';

/**
 * Uma sílaba fonológica. `start`/`end` são índices de code unit na palavra
 * normalizada (`WordScansion.word`), para que a UI consiga alinhar a régua
 * sem remedir o texto.
 */
export interface Syllable {
  readonly text: string;
  readonly onset: string;
  /** Vogais do núcleo. Mais de uma = ditongo ou tritongo. */
  readonly nucleus: string;
  readonly coda: string;
  readonly start: number;
  readonly end: number;
  readonly isStressed: boolean;
}

/**
 * Escansão de uma palavra isolada, na leitura canônica (a que um falante
 * faria em prosa). Ditongos e hiatos alternativos não aparecem aqui: são
 * pontos de decisão, e a camada 3 os deriva desta estrutura.
 */
export interface WordScansion {
  /** A palavra normalizada (NFC). Os índices das sílabas se referem a ela. */
  readonly word: string;
  readonly syllables: readonly Syllable[];
  /** Índice da sílaba tônica em `syllables`. `-1` quando não há núcleo. */
  readonly stressIndex: number;
  readonly stressStrength: StressStrength;
  readonly source: ScansionSource;
}

/** Como um ditongo se parte quando o poeta força a diérese. */
export interface NucleusSplit {
  readonly first: string;
  readonly second: string;
  /** Qual das duas metades herda a tônica. */
  readonly stressOn: 'first' | 'second';
}

/**
 * Fatos fonológicos que a camada 3 consulta sem poder conhecer.
 *
 * O grafo de junções raciocina sobre estrutura — ataque vazio, coda vazia,
 * núcleo com duas vogais. Só estas três perguntas são de idioma.
 */
export interface Prosody {
  isNasalNucleus(nucleus: string): boolean;
  /** `null` quando o núcleo é indivisível (vogal única ou ditongo nasal). */
  splitNucleus(nucleus: string): NucleusSplit | null;
  /** Compara a última vogal do núcleo esquerdo com a primeira do direito. */
  sameVowelSound(leftNucleus: string, rightNucleus: string): boolean;
  /**
   * Chave de som da terminação, da vogal tônica ao fim. É por ela que se
   * decide rima: comparar grafia recusa "caça"/"massa" e "mal"/"mau".
   */
  rhymeSound(tail: string): string;
  /** Só as vogais da chave, para rima toante. */
  rhymeVowels(sound: string): string;
}

/**
 * Contrato que um idioma precisa cumprir. Português é a única implementação
 * do v1, mas espanhol tem a mesma família de problemas e deve caber aqui
 * sem mudar o motor.
 */
export interface LanguageRules {
  /** Tag BCP 47, ex.: `pt-BR`. */
  readonly code: string;
  analyzeWord(word: string): WordScansion;
  readonly prosody: Prosody;
}
