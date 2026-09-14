/**
 * Implementação de `LanguageRules` para o português brasileiro.
 *
 * Camada 2 do motor: palavra -> sílabas + tônica. Função pura, sem estado.
 * A memoização fica em `createAnalyzer`, um nível acima.
 */

import type { LanguageRules, ScansionSource, Syllable, WordScansion } from '../types.js';
import { foldCase, isVowelChar, normalizeWord } from './chars.js';
import { ATONIC_WORDS, parsePattern, SYLLABLE_EXCEPTIONS } from './lexicon.js';
import { ptProsody } from './prosody.js';
import { findStressIndex } from './stress.js';
import { syllabify, type SyllableSpan } from './syllabify.js';

/** Deriva as fronteiras de um padrão do léxico ("re-u-NIR"). */
function spansFromSyllableTexts(syllables: readonly string[]): SyllableSpan[] {
  const spans: SyllableSpan[] = [];
  let offset = 0;
  for (const syllable of syllables) {
    let first = -1;
    let last = -1;
    for (let i = 0; i < syllable.length; i += 1) {
      if (isVowelChar(syllable[i] ?? '')) {
        if (first < 0) first = i;
        last = i;
      }
    }
    // Dentro de uma sílaba as vogais são contíguas, então o núcleo vai da
    // primeira à última. Padrões com `qu`/`gu` no ataque não cabem aqui.
    const nucleusStart = first < 0 ? offset : offset + first;
    const nucleusEnd = last < 0 ? offset + syllable.length : offset + last + 1;
    spans.push({ start: offset, end: offset + syllable.length, nucleusStart, nucleusEnd });
    offset += syllable.length;
  }
  return spans;
}

function build(
  word: string,
  spans: readonly SyllableSpan[],
  stressIndex: number,
  source: ScansionSource,
): WordScansion {
  const syllables: Syllable[] = spans.map((span, index) => ({
    text: word.slice(span.start, span.end),
    onset: word.slice(span.start, span.nucleusStart),
    nucleus: word.slice(span.nucleusStart, span.nucleusEnd),
    coda: word.slice(span.nucleusEnd, span.end),
    start: span.start,
    end: span.end,
    isStressed: index === stressIndex,
  }));

  return {
    word,
    syllables,
    stressIndex,
    stressStrength: ATONIC_WORDS.has(foldCase(word)) ? 'weak' : 'strong',
    source,
  };
}

/**
 * Escande uma palavra isolada na leitura canônica.
 *
 * Aceita hífen de ênclise e de composto ("dá-lo", "guarda-chuva") e apóstrofo
 * ("d'água") sem tratamento especial: nenhum dos dois é vogal, então ambos
 * atravessam a silabação como material consonantal.
 */
export function analyzeWord(raw: string): WordScansion {
  const word = normalizeWord(raw);
  const lower = foldCase(word);

  const pattern = SYLLABLE_EXCEPTIONS.get(lower);
  if (pattern !== undefined) {
    const parsed = parsePattern(pattern);
    // Se o padrão não reconstrói a palavra, ele está errado: cai na regra em
    // vez de produzir índices que não batem com o texto.
    if (parsed !== null && parsed.syllables.join('') === lower) {
      return build(word, spansFromSyllableTexts(parsed.syllables), parsed.stressIndex, 'lexicon');
    }
  }

  const spans = syllabify(lower);
  return build(word, spans, findStressIndex(lower, spans), 'rules');
}

export const ptBR: LanguageRules = {
  code: 'pt-BR',
  analyzeWord,
  prosody: ptProsody,
};
