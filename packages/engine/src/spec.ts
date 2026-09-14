/**
 * A forma que o poeta declarou.
 *
 * O alvo é dado, não inferido — é o que separa este motor de um sistema de
 * escansão acadêmico e o que torna a busca barata: não há o que descobrir
 * sobre a forma, só o que medir contra ela.
 */

export interface MetricSpec {
  /** Sílabas até a última tônica. `0` significa verso livre. */
  readonly syllables: number;
  /** Posições (1-based) onde a tônica é obrigatória. */
  readonly requiredStresses: readonly number[];
}

export const VERSO_LIVRE: MetricSpec = { syllables: 0, requiredStresses: [] };

/** Formas correntes em português, como atalho. */
export const FORMAS = {
  redondilhaMenor: { syllables: 5, requiredStresses: [2, 5] },
  redondilhaMaior: { syllables: 7, requiredStresses: [3, 7] },
  heroico: { syllables: 10, requiredStresses: [6, 10] },
  safico: { syllables: 10, requiredStresses: [4, 8, 10] },
  martelo: { syllables: 10, requiredStresses: [3, 6, 10] },
  alexandrino: { syllables: 12, requiredStresses: [6, 12] },
  livre: VERSO_LIVRE,
} satisfies Record<string, MetricSpec>;

export function isFreeVerse(spec: MetricSpec): boolean {
  return spec.syllables <= 0;
}
