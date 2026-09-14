/**
 * O grafo de junções.
 *
 * Cada ponto onde a leitura do verso pode divergir vira uma junção com duas
 * opções e um custo para cada. Não há "a" escansão: há um conjunto de
 * decisões, e uma leitura é uma escolha em cada uma delas.
 */

import type { Prosody } from '../types.js';
import { type Costs, elisionCost, hiatusCost } from './costs.js';
import { endsInVowel, isStrongBeat, startsInVowel, type Unit } from './units.js';

export type JunctionKind =
  /** Entre palavras: as duas vogais em contato viram uma sílaba. */
  | 'elision'
  /** Dentro da palavra: dois núcleos em hiato viram um. */
  | 'synaeresis'
  /** Dentro da palavra: um ditongo se parte em dois núcleos. */
  | 'diaeresis';

export interface Junction {
  /**
   * Identidade estável o bastante para o autor travar a escolha.
   *
   * Provisória: hoje é o offset no texto, então uma edição antes da junção a
   * desloca. O modelo de documento definitivo precisa de âncora que sobreviva
   * a edição — está registrado no CLAUDE.md como pendência.
   */
  readonly id: string;
  readonly kind: JunctionKind;
  /** Índice da unidade à esquerda (fusão) ou da unidade que se parte. */
  readonly unitIndex: number;
  /** Onde desenhar o laço `‿`, em offset de texto. */
  readonly offset: number;
  readonly costApply: number;
  readonly costSkip: number;
  /** Efeito na contagem ao aplicar: fusão tira uma sílaba, diérese acrescenta. */
  readonly delta: -1 | 1;
}

/** `true` se a junção funde duas unidades (em vez de partir uma). */
export function isMerge(junction: Junction): boolean {
  return junction.kind !== 'diaeresis';
}

export function buildJunctions(
  units: readonly Unit[],
  prosody: Prosody,
  costs: Costs,
): Junction[] {
  const junctions: Junction[] = [];
  const merged = new Set<number>();

  for (let i = 0; i + 1 < units.length; i += 1) {
    const left = units[i];
    const right = units[i + 1];
    if (left === undefined || right === undefined) continue;
    if (!endsInVowel(left) || !startsInVowel(right)) continue;

    const sameWord = left.wordIndex === right.wordIndex;
    const leftStrong = isStrongBeat(left);

    if (sameWord) {
      // Hiato interno: o poeta pode fundir, mas o padrão é manter.
      junctions.push({
        id: `syn@${left.end}`,
        kind: 'synaeresis',
        unitIndex: i,
        offset: left.end,
        costApply: costs.synaeresis,
        costSkip: 0,
        delta: -1,
      });
    } else {
      const sameVowel = prosody.sameVowelSound(left.nucleus, right.nucleus);
      junctions.push({
        id: `eli@${left.end}`,
        kind: 'elision',
        unitIndex: i,
        offset: left.end,
        costApply: elisionCost(costs, leftStrong, prosody.isNasalNucleus(left.nucleus)),
        costSkip: hiatusCost(costs, leftStrong, sameVowel),
        delta: -1,
      });
    }

    merged.add(i);
    merged.add(i + 1);
  }

  // Diérese só onde não há fusão concorrente sobre a mesma unidade: partir e
  // fundir a mesma sílaba produziria leitura sem sentido, e o caso é raro o
  // bastante para não valer a complicação de modelar a exclusão mútua.
  units.forEach((unit, index) => {
    if (merged.has(index)) return;
    if (prosody.splitNucleus(unit.nucleus) === null) return;
    junctions.push({
      id: `die@${unit.start}`,
      kind: 'diaeresis',
      unitIndex: index,
      offset: unit.start,
      costApply: costs.diaeresis,
      costSkip: 0,
      delta: 1,
    });
  });

  junctions.sort((a, b) => a.unitIndex - b.unitIndex || a.offset - b.offset);
  return junctions;
}
