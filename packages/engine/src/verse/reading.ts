/**
 * Materialização de uma leitura: dado um conjunto de decisões, quais sílabas
 * o verso tem.
 */

import type { Prosody, StressStrength } from '../types.js';
import { isMerge, type Junction } from './junctions.js';
import type { Unit } from './units.js';

export interface ReadingSyllable {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /**
   * Onde começa a vogal do núcleo, em offset de texto. É por aqui que a rima
   * se recorta: rima em português vai da vogal tônica até o fim.
   */
  readonly nucleusStart: number;
  readonly isStressed: boolean;
  readonly stressStrength: StressStrength;
  /** Nasceu da fusão de duas palavras. É onde a UI desenha o laço. */
  readonly hasSynalepha: boolean;
  /** Nasceu da quebra de um ditongo. */
  readonly hasDiaeresis: boolean;
  readonly isWordEnd: boolean;
  /** Vem depois da última tônica forte: existe, aparece, não conta. */
  readonly isExtrametrical: boolean;
}

export interface Reading {
  readonly syllables: readonly ReadingSyllable[];
  /** Sílabas ao todo, extramétricas incluídas. */
  readonly total: number;
  /**
   * Contagem métrica. Para na última tônica forte — é a regra que separa
   * este motor de um contador de sílabas.
   */
  readonly count: number;
  readonly cost: number;
  /** Ids das junções aplicadas nesta leitura. */
  readonly applied: readonly string[];
}

interface Draft {
  text: string;
  start: number;
  end: number;
  nucleusStart: number;
  isStressed: boolean;
  strong: boolean;
  hasSynalepha: boolean;
  hasDiaeresis: boolean;
  isWordEnd: boolean;
}

function strongBeat(unit: Unit): boolean {
  return unit.isStressed && unit.stressStrength === 'strong';
}

export function materialize(
  units: readonly Unit[],
  junctions: readonly Junction[],
  applied: ReadonlySet<string>,
  prosody: Prosody,
  cost: number,
): Reading {
  const mergeAfter = new Set<number>();
  const splitAt = new Set<number>();
  for (const junction of junctions) {
    if (!applied.has(junction.id)) continue;
    if (isMerge(junction)) mergeAfter.add(junction.unitIndex);
    else splitAt.add(junction.unitIndex);
  }

  const drafts: Draft[] = [];
  let i = 0;
  while (i < units.length) {
    const head = units[i];
    if (head === undefined) break;

    let last = i;
    while (last + 1 < units.length && mergeAfter.has(last)) last += 1;

    if (last === i) {
      const split = splitAt.has(i) ? prosody.splitNucleus(head.nucleus) : null;
      if (split !== null) {
        const firstEnd = head.start + head.onset.length + split.first.length;
        drafts.push({
          text: head.onset + split.first,
          start: head.start,
          end: firstEnd,
          nucleusStart: head.start + head.onset.length,
          isStressed: head.isStressed && split.stressOn === 'first',
          strong: strongBeat(head) && split.stressOn === 'first',
          hasSynalepha: false,
          hasDiaeresis: true,
          isWordEnd: false,
        });
        drafts.push({
          text: split.second + head.coda,
          start: firstEnd,
          end: head.end,
          nucleusStart: firstEnd,
          isStressed: head.isStressed && split.stressOn === 'second',
          strong: strongBeat(head) && split.stressOn === 'second',
          hasSynalepha: false,
          hasDiaeresis: true,
          isWordEnd: head.isWordEnd,
        });
        i += 1;
        continue;
      }
    }

    const group = units.slice(i, last + 1);
    const words = new Set(group.map((unit) => unit.wordIndex));
    const tail = group[group.length - 1] ?? head;
    drafts.push({
      text: group.map((unit) => unit.text).join(''),
      start: head.start,
      end: tail.end,
      // O núcleo da sílaba é o da primeira unidade do grupo: numa elisão, a
      // vogal que abre a sílaba fundida é a da palavra da esquerda.
      nucleusStart: head.start + head.onset.length,
      isStressed: group.some((unit) => unit.isStressed),
      strong: group.some(strongBeat),
      hasSynalepha: words.size > 1,
      hasDiaeresis: false,
      isWordEnd: tail.isWordEnd,
    });
    i = last + 1;
  }

  // A contagem para na última tônica forte. Sem tônica forte no verso — uma
  // linha só de átonas, ou ainda pela metade — não há onde parar, e a
  // contagem é o total.
  let lastStrong = -1;
  for (let k = drafts.length - 1; k >= 0; k -= 1) {
    if (drafts[k]?.strong === true) {
      lastStrong = k;
      break;
    }
  }
  const count = lastStrong >= 0 ? lastStrong + 1 : drafts.length;

  const syllables: ReadingSyllable[] = drafts.map((draft, index) => ({
    text: draft.text,
    start: draft.start,
    end: draft.end,
    nucleusStart: draft.nucleusStart,
    isStressed: draft.isStressed,
    stressStrength: draft.strong ? 'strong' : 'weak',
    hasSynalepha: draft.hasSynalepha,
    hasDiaeresis: draft.hasDiaeresis,
    isWordEnd: draft.isWordEnd,
    isExtrametrical: lastStrong >= 0 && index > lastStrong,
  }));

  return {
    syllables,
    total: syllables.length,
    count,
    cost,
    applied: [...applied],
  };
}
