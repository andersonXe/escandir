/**
 * Verso -> sequência de unidades silábicas.
 *
 * A unidade é a sílaba como a camada 2 a entrega, antes de qualquer decisão de
 * junção. É o substrato sobre o qual o grafo opera: toda leitura do verso é
 * esta sequência com fusões e separações aplicadas.
 */

import type { WordAnalyzer } from '../analyzer.js';
import type { StressStrength } from '../types.js';

export interface VerseWord {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface Unit {
  readonly text: string;
  /** Offsets no texto do verso, não na palavra. */
  readonly start: number;
  readonly end: number;
  readonly onset: string;
  readonly nucleus: string;
  readonly coda: string;
  readonly wordIndex: number;
  readonly isWordStart: boolean;
  readonly isWordEnd: boolean;
  readonly isStressed: boolean;
  readonly stressStrength: StressStrength;
}

/**
 * Palavra = letras, com hífen e apóstrofo internos ("dá-lo", "d'água").
 * Pontuação e espaço ficam de fora; os offsets preservam a posição original
 * para a UI não precisar remedir nada.
 */
const WORD_RE = /\p{L}+(?:['’\-]\p{L}+)*/gu;

export function tokenizeVerse(text: string): VerseWord[] {
  const words: VerseWord[] = [];
  for (const match of text.matchAll(WORD_RE)) {
    if (match.index === undefined) continue;
    words.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  return words;
}

export function buildUnits(text: string, analyzer: WordAnalyzer): Unit[] {
  const units: Unit[] = [];
  const words = tokenizeVerse(text);

  words.forEach((word, wordIndex) => {
    const scansion = analyzer.analyze(word.text);
    const total = scansion.syllables.length;
    scansion.syllables.forEach((syllable, index) => {
      units.push({
        text: syllable.text,
        start: word.start + syllable.start,
        end: word.start + syllable.end,
        onset: syllable.onset,
        nucleus: syllable.nucleus,
        coda: syllable.coda,
        wordIndex,
        isWordStart: index === 0,
        isWordEnd: index === total - 1,
        isStressed: syllable.isStressed,
        stressStrength: scansion.stressStrength,
      });
    });
  });

  return units;
}

/**
 * A sílaba termina em vogal? É a condição da esquerda para haver elisão.
 * Coda vazia basta: consoante final bloqueia o contato ("mar azul" não funde).
 */
export function endsInVowel(unit: Unit): boolean {
  return unit.coda === '' && unit.nucleus !== '';
}

/**
 * A sílaba começa em vogal? `h` não conta como ataque — é letra muda, e
 * "sobre o horizonte" elide como se o `h` não existisse.
 */
export function startsInVowel(unit: Unit): boolean {
  return (unit.onset === '' || unit.onset === 'h' || unit.onset === 'H') && unit.nucleus !== '';
}

/** Tônica que a régua desenha como tempo forte e onde a contagem pode parar. */
export function isStrongBeat(unit: Unit): boolean {
  return unit.isStressed && unit.stressStrength === 'strong';
}
