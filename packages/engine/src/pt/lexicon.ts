/**
 * Léxico do português: exceções às regras, não um dicionário.
 *
 * A silabação e a tonicidade são resolvidas por regra. Este arquivo existe só
 * para o que a regra erra, e deve continuar pequeno. Cada entrada aqui é uma
 * dívida: quando o padrão ficar claro, vira regra e sai daqui.
 */

/**
 * Sílabas separadas por `|`, com a tônica em caixa alta: `'re|u|NIR'`.
 * O separador não é `-` porque hífen ocorre dentro de palavra ("dá-lo").
 */
export type SyllablePattern = string;

/**
 * Exceções de silabação.
 *
 * Os grupos presentes hoje:
 *
 * - Prefixo antes de vogal, onde o ditongo é só aparente: "re-u-nir" contra
 *   "reu-ma-tis-mo", "pro-i-bir" contra "proa". A diferença é morfológica e a
 *   grafia não a registra, então nenhuma regra sobre a palavra escrita alcança.
 *   É a maior lacuna conhecida do motor, e o que a fecha é a camada 1 com o
 *   léxico pré-computado — não esta lista, que só cobre alta frequência.
 * - Ditongo crescente com `o` átono ("má-goa", "nó-doa"), raro o bastante para
 *   não valer uma regra que arriscaria quebrar "co-ro-a" e "la-go-a".
 */
export const SYLLABLE_EXCEPTIONS: ReadonlyMap<string, SyllablePattern> = new Map([
  // Contração de preposição + artigo: grafa-se como hiato, lê-se ditongo.
  ['ao', 'AO'],
  ['aos', 'AOS'],
  // Prefixo + radical iniciado por vogal. A grafia não registra a fronteira
  // morfológica, e é ela que desfaz o ditongo. Esta é a classe que o motor
  // não resolve por regra, e a razão de a camada 1 precisar do léxico
  // pré-computado: enumerar à mão não escala.
  ['reunir', 're|u|NIR'],
  ['reuniu', 're|u|NIU'],
  ['reunia', 're|u|NI|a'],
  ['reunido', 're|u|NI|do'],
  ['reunida', 're|u|NI|da'],
  ['reunião', 're|u|ni|ÃO'],
  ['reuniões', 're|u|ni|ÕES'],
  ['proibir', 'pro|i|BIR'],
  ['proibido', 'pro|i|BI|do'],
  ['proibida', 'pro|i|BI|da'],
  ['proibia', 'pro|i|BI|a'],
  ['proibição', 'pro|i|bi|ÇÃO'],
  ['coincidir', 'co|in|ci|DIR'],
  ['coincide', 'co|in|CI|de'],
  ['coincidência', 'co|in|ci|DÊN|cia'],
  ['mágoa', 'MÁ|goa'],
  ['mágoas', 'MÁ|goas'],
  ['nódoa', 'NÓ|doa'],
  ['nódoas', 'NÓ|doas'],
  ['arguir', 'ar|gu|IR'],
]);

/**
 * Palavras átonas: têm tônica lexical, mas não firmam posição métrica.
 *
 * Classe fechada — artigos, preposições, pronomes clíticos, conjunções e as
 * contrações, mais as preposições e conjunções polissilábicas que não firmam
 * ictus ("sobre", "entre", "quando").
 *
 * `weak` não quer dizer "sem tônica": quer dizer que a régua não desenha um
 * tempo forte ali e que a contagem não para nessa sílaba. Se uma posição
 * obrigatória aceita ou não uma átona é decisão da camada 4, não desta lista —
 * separar as duas coisas é o que deixa a régua fiel ao desenho sem tornar o
 * diagnóstico permissivo.
 */
export const ATONIC_WORDS: ReadonlySet<string> = new Set([
  // Artigos e contrações com artigo
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
  'ao', 'aos', 'à', 'às',
  'do', 'da', 'dos', 'das', 'dum', 'duma', 'duns', 'dumas',
  'no', 'na', 'nos', 'nas', 'num', 'numa', 'nuns', 'numas',
  'pelo', 'pela', 'pelos', 'pelas',
  'dele', 'dela', 'deles', 'delas',
  'neste', 'nesta', 'nisso', 'nisto', 'disso', 'disto',
  // Preposições
  'de', 'em', 'por', 'com', 'sem', 'sob', 'para', 'pra', 'pro', 'pras', 'pros',
  // Clíticos
  'me', 'te', 'se', 'lhe', 'lhes', 'vos', 'mo', 'ma', 'to', 'ta', 'lo', 'la',
  'los', 'las',
  // Conjunções e relativos átonos
  'e', 'ou', 'que', 'nem', 'mas', 'pois',
  // Polissilábicas de classe fechada: têm tônica lexical, mas não firmam ictus.
  'sobre', 'entre', 'contra', 'desde', 'quando', 'enquanto', 'como', 'onde',
  'porque', 'ainda', 'depois', 'antes',
]);

interface ParsedException {
  readonly syllables: readonly string[];
  readonly stressIndex: number;
}

/** Interpreta um `SyllablePattern`. Devolve `null` se a entrada for malformada. */
export function parsePattern(pattern: SyllablePattern): ParsedException | null {
  const parts = pattern.split('|');
  if (parts.length === 0) return null;
  let stressIndex = -1;
  const syllables: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (part === undefined || part === '') return null;
    const lower = part.toLowerCase();
    if (part !== lower) {
      if (stressIndex >= 0) return null;
      stressIndex = i;
    }
    syllables.push(lower);
  }
  if (stressIndex < 0) return null;
  return { syllables, stressIndex };
}
