/**
 * Terminação de rima.
 *
 * Em português a rima vai **da vogal tônica até o fim do verso** — não das
 * últimas letras. "lugar" e "pomar" rimam em `ar`; "trazia" e "sabia" rimam em
 * `ia`, arrastando a sílaba extramétrica junto, que é o que faz a rima ser
 * grave. Recortar por número fixo de letras erraria os dois casos.
 *
 * E a comparação é por **som**, não por grafia: "ca-ça"/"mas-sa", "giz"/"quis"
 * e "mal"/"mau" rimam, e nenhuma delas casa letra a letra. Por isso a
 * terminação carrega duas formas — a escrita, para mostrar ao autor, e a
 * fonêmica, para decidir.
 */

import type { Prosody } from './types.js';
import type { Reading } from './verse/reading.js';

/** Pontuação e espaço no fim não fazem parte do som. */
const TRAILING = /[^\p{L}]+$/u;

export interface Rhyme {
  /** Como se escreve, para a interface dizer "rima em -ar". */
  readonly tail: string;
  /** Como soa. É esta que decide se duas rimam. */
  readonly sound: string;
  /** Só as vogais do som, para rima toante. */
  readonly vowels: string;
}

export const NO_RHYME: Rhyme = { tail: '', sound: '', vowels: '' };

/**
 * A terminação rimável do verso. Vazia quando não há tônica forte — verso
 * ainda em curso, ou linha só de átonas.
 */
export function rhymeOf(reading: Reading, text: string, prosody: Prosody): Rhyme {
  let last = -1;
  for (let i = reading.syllables.length - 1; i >= 0; i -= 1) {
    if (reading.syllables[i]?.stressStrength === 'strong') {
      last = i;
      break;
    }
  }
  const syllable = reading.syllables[last];
  if (syllable === undefined) return NO_RHYME;

  /*
   * Quando a tônica nasceu de elisão, ela ocupa duas palavras: em "a asa", a
   * sílaba forte é o "a a" fundido, e recortar do núcleo dela arrastaria o
   * artigo para dentro da rima. O que rima é o som que sobra, do lado direito
   * da fusão — "asa". Rima não atravessa fronteira de palavra para trás.
   */
  let from = syllable.nucleusStart;
  if (syllable.hasSynalepha) {
    const space = text.indexOf(' ', from);
    if (space >= 0 && space < syllable.end) from = space + 1;
  }

  const tail = text.slice(from).toLowerCase().replace(TRAILING, '').normalize('NFC');
  if (tail === '') return NO_RHYME;

  const sound = prosody.rhymeSound(tail);
  return { tail, sound, vowels: prosody.rhymeVowels(sound) };
}

/** Só a grafia da terminação. Atalho para quem só vai mostrar na tela. */
export function rhymeKey(reading: Reading, text: string, prosody: Prosody): string {
  return rhymeOf(reading, text, prosody).tail;
}

export type RhymeGrade =
  /** Som igual da tônica ao fim. É o que se chama de rima, sem adjetivo. */
  | 'consoante'
  /** Só as vogais coincidem: "terra"/"vela". Tradição a aceita; nem todo poeta. */
  | 'toante';

export function rhymes(a: Rhyme, b: Rhyme, grade: RhymeGrade = 'consoante'): boolean {
  if (a.sound === '' || b.sound === '') return false;
  if (grade === 'toante') return a.vowels === b.vowels;
  return a.sound === b.sound;
}

/**
 * Rima pobre é a que cai sozinha: mesma terminação, mesma classe gramatical,
 * previsível. Aqui só o caso mais óbvio — terminação idêntica à palavra
 * inteira, isto é, a palavra rimando consigo mesma.
 */
export function isSameWord(a: Rhyme, b: Rhyme): boolean {
  return a.tail !== '' && a.tail === b.tail && a.sound === b.sound;
}
