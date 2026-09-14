/**
 * Fatos fonológicos que a camada 3 precisa consultar mas não pode saber.
 *
 * O grafo de junções raciocina sobre estrutura — ataque vazio, coda vazia,
 * núcleo com duas vogais. Três perguntas, porém, são de idioma: se um núcleo é
 * nasal, onde ele se parte, e se duas vogais soam igual. Ficam atrás desta
 * interface para que o motor de verso continue neutro e o espanhol caiba
 * depois sem tocar na camada 3.
 */

import type { NucleusSplit, Prosody } from '../types.js';
import { at, isGlideVowel, isNucleusVowel } from './chars.js';
import { rhymeSound, rhymeVowels } from './rhyme.js';

/** Vogais sem marca, para comparar timbre ignorando acento. */
const PLAIN: ReadonlyMap<string, string> = new Map([
  ['á', 'a'], ['â', 'a'], ['ã', 'a'], ['à', 'a'],
  ['é', 'e'], ['ê', 'e'],
  ['í', 'i'],
  ['ó', 'o'], ['ô', 'o'], ['õ', 'o'],
  ['ú', 'u'], ['ü', 'u'],
  ['y', 'i'], ['w', 'u'],
]);

function plain(c: string): string {
  return PLAIN.get(c) ?? c;
}

function firstVowel(nucleus: string): string {
  return at(nucleus, 0);
}

function lastVowel(nucleus: string): string {
  return at(nucleus, nucleus.length - 1);
}

export const ptProsody: Prosody = {
  /**
   * Ditongo nasal não se desfaz. "não" nunca vira "na-o", em nenhum verso —
   * a nasalidade é da sílaba inteira, e separá-la muda a palavra.
   */
  isNasalNucleus(nucleus: string): boolean {
    return nucleus.includes('ã') || nucleus.includes('õ');
  },

  /**
   * Onde um ditongo se parte, quando o poeta força diérese: "sau-da-de" lido
   * "sa-u-da-de", "his-tó-ria" lido "his-tó-ri-a".
   *
   * A tônica fica com a vogal que já era o núcleo silábico: a primeira num
   * ditongo decrescente ("sau" -> "sa"+"u"), a segunda num crescente
   * ("ria" -> "ri"+"a").
   */
  splitNucleus(nucleus: string): NucleusSplit | null {
    if (nucleus.length < 2) return null;
    if (ptProsody.isNasalNucleus(nucleus)) return null;
    const first = firstVowel(nucleus);
    const rest = nucleus.slice(1);
    const rising = isGlideVowel(first) && isNucleusVowel(at(rest, 0));
    return { first, second: rest, stressOn: rising ? 'second' : 'first' };
  },

  /**
   * Mesmo timbre, ignorando acento gráfico. Elisão de vogais iguais átonas é
   * quase obrigatória, então vale distinguir o caso.
   */
  sameVowelSound(leftNucleus: string, rightNucleus: string): boolean {
    const a = plain(lastVowel(leftNucleus));
    const b = plain(firstVowel(rightNucleus));
    return a !== '' && a === b;
  },

  rhymeSound,
  rhymeVowels,
};
