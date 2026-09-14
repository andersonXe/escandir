/**
 * Custos de naturalidade das junções.
 *
 * **Estes números são estimativas, não medições.** Vêm de princípio
 * fonológico, não de corpus. Estão todos aqui, num lugar só, porque é
 * exatamente isto que precisa ser recalibrado quando existir um corpus de
 * versos escandidos contra fonte verificada. A estrutura do grafo está certa;
 * os pesos estão em aberto.
 *
 * A escala é arbitrária e só as razões entre os valores importam. Leitura:
 * 0 = natural, 3 = aceitável, 6+ = marcado, o poeta está forçando.
 */

export interface Costs {
  /** Elidir: a vogal final da palavra some dentro da inicial da seguinte. */
  readonly elide: number;
  /** Elidir quando a vogal da esquerda é tônica forte: resistido. */
  readonly elideStressedLeft: number;
  /** Elidir quando a vogal da esquerda é nasal: resistido. */
  readonly elideNasalLeft: number;
  /** Não elidir, deixando o hiato entre palavras. */
  readonly hiatus: number;
  /**
   * Não elidir quando as duas vogais são átonas e do mesmo timbre.
   * "minha alma" lido "mi-nha-al-ma" soa quase agramatical.
   */
  readonly hiatusSameVowel: number;
  /** Sinérese: fundir um hiato interno à palavra ("po-e-ta" -> "poe-ta"). */
  readonly synaeresis: number;
  /** Diérese: desfazer um ditongo interno ("sau-da-de" -> "sa-u-da-de"). */
  readonly diaeresis: number;
}

export const DEFAULT_COSTS: Costs = {
  elide: 0,
  elideStressedLeft: 6,
  elideNasalLeft: 4,
  hiatus: 3,
  hiatusSameVowel: 7,
  synaeresis: 5,
  diaeresis: 6,
};

/**
 * Custo de fundir duas palavras. Zero no caso corrente: em português a elisão
 * entre palavras é a regra, e é o hiato que precisa se justificar.
 */
export function elisionCost(
  costs: Costs,
  leftIsStronglyStressed: boolean,
  leftIsNasal: boolean,
): number {
  let cost = costs.elide;
  if (leftIsStronglyStressed) cost += costs.elideStressedLeft;
  if (leftIsNasal) cost += costs.elideNasalLeft;
  return cost;
}

/** Custo de recusar a elisão e manter as duas sílabas. */
export function hiatusCost(
  costs: Costs,
  leftIsStronglyStressed: boolean,
  sameVowel: boolean,
): number {
  if (sameVowel && !leftIsStronglyStressed) return costs.hiatusSameVowel;
  return costs.hiatus;
}
