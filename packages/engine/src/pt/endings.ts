/**
 * Predicados sobre a terminação da palavra escrita.
 *
 * Ficam num módulo à parte porque a silabação e a tonicidade dependem dos
 * mesmos fatos: depois das reformas ortográficas, a grafia já diz onde cai a
 * tônica, e isso realimenta a decisão de ditongo vs. hiato.
 */

import { at, hasStressMark, hasTilde } from './chars.js';

/** A palavra traz acento agudo ou circunflexo? */
export function hasWrittenStressMark(w: string): boolean {
  for (let i = 0; i < w.length; i += 1) {
    if (hasStressMark(at(w, i))) return true;
  }
  return false;
}

export function hasWrittenTilde(w: string): boolean {
  for (let i = 0; i < w.length; i += 1) {
    if (hasTilde(at(w, i))) return true;
  }
  return false;
}

/**
 * Regra dos paroxítonos: sem acento gráfico, é paroxítona a palavra terminada
 * em -a, -e, -o, -as, -es, -os, -am, -em, -ens. Todo o resto é oxítono.
 */
export function isParoxytoneByEnding(w: string): boolean {
  if (w.endsWith('am') || w.endsWith('em') || w.endsWith('ens')) return true;
  const last = at(w, w.length - 1);
  if ('aeo'.includes(last)) return true;
  if (last === 's' && 'aeo'.includes(at(w, w.length - 2))) return true;
  return false;
}

const VOWEL_LETTERS = 'aeiouáéíóúâêôãõàüyw';

/**
 * A última vogal escrita é necessariamente a tônica?
 *
 * Vale para oxítonas sem acento terminadas em consoante que não seja `s`:
 * "ca-ir", "ju-iz", "ru-im", "pos-su-ir". Nesses casos o `i`/`u` final não pode
 * ser semivogal — é o núcleo tônico, e o ditongo se desfaz. O `s` fica de fora
 * porque ali ele é quase sempre marca de plural sobre um ditongo legítimo
 * ("a-zuis", "de-pois", "pais").
 */
export function finalVowelIsStressed(w: string): boolean {
  if (hasWrittenStressMark(w) || hasWrittenTilde(w)) return false;
  if (isParoxytoneByEnding(w)) return false;
  const last = at(w, w.length - 1);
  if (last === '' || last === 's') return false;
  return !VOWEL_LETTERS.includes(last);
}
