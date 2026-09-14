/**
 * Busca com alvo sobre o grafo de junções.
 *
 * A escansão não é uma função `verso -> número`. É um conjunto de leituras
 * ranqueadas, e quem escolhe entre elas é o poeta — o sistema só ordena.
 */

import { isFreeVerse, type MetricSpec } from '../spec.js';
import type { WordAnalyzer } from '../analyzer.js';
import type { LanguageRules } from '../types.js';
import { type Costs, DEFAULT_COSTS } from './costs.js';
import { buildJunctions, type Junction } from './junctions.js';
import { materialize, type Reading } from './reading.js';
import { buildUnits, type Unit } from './units.js';

export interface ScanOptions {
  readonly spec?: MetricSpec;
  /**
   * Decisões travadas pelo autor: id da junção -> aplicar ou não.
   * Uma junção travada sai da busca e não custa nada: quando o autor contraria
   * o sistema, o autor vence, e o custo de naturalidade deixa de ser relevante.
   */
  readonly locks?: ReadonlyMap<string, boolean>;
  readonly costs?: Costs;
  /** Quantas leituras devolver. Padrão 6. */
  readonly maxReadings?: number;
}

export interface VerseScansion {
  readonly text: string;
  readonly units: readonly Unit[];
  readonly junctions: readonly Junction[];
  /** Ranqueadas: primeiro as que cabem na forma, depois por custo. */
  readonly readings: readonly Reading[];
  /** A leitura que a UI deve mostrar. `null` só para verso sem nenhuma sílaba. */
  readonly best: Reading | null;
  /** `true` quando a busca precisou podar o espaço. Ver `MAX_FREE_JUNCTIONS`. */
  readonly truncated: boolean;
}

/**
 * Teto do espaço de busca. 2^14 leituras, cada uma O(sílabas), cabe em ~2ms —
 * dentro do orçamento de 16ms com folga para a UI. Versos reais ficam entre 3
 * e 8 junções; o teto existe para o caso patológico, não para o corrente.
 */
const MAX_FREE_JUNCTIONS = 14;

function countMissingStresses(reading: Reading, spec: MetricSpec): number {
  let missing = 0;
  for (const position of spec.requiredStresses) {
    if (position > reading.count) continue;
    const syllable = reading.syllables[position - 1];
    if (syllable === undefined || syllable.stressStrength !== 'strong') missing += 1;
  }
  return missing;
}

export function scanVerse(
  text: string,
  language: LanguageRules,
  analyzer: WordAnalyzer,
  options: ScanOptions = {},
): VerseScansion {
  const costs = options.costs ?? DEFAULT_COSTS;
  const spec = options.spec;
  const locks = options.locks;
  const maxReadings = options.maxReadings ?? 6;

  const units = buildUnits(text, analyzer);
  const junctions = buildJunctions(units, language.prosody, costs);

  if (units.length === 0) {
    return { text, units, junctions, readings: [], best: null, truncated: false };
  }

  // Travadas saem da busca; o resto é o espaço livre.
  const forced = new Map<string, boolean>();
  let free: Junction[] = [];
  for (const junction of junctions) {
    const lock = locks?.get(junction.id);
    if (lock === undefined) free.push(junction);
    else forced.set(junction.id, lock);
  }

  // Poda: acima do teto, só as elisões continuam abertas. São as que mais
  // mudam a contagem; sinérese e diérese ficam na opção mais barata.
  let truncated = false;
  if (free.length > MAX_FREE_JUNCTIONS) {
    truncated = true;
    const keep: Junction[] = [];
    for (const junction of free) {
      if (junction.kind === 'elision' && keep.length < MAX_FREE_JUNCTIONS) keep.push(junction);
      else forced.set(junction.id, junction.costApply <= junction.costSkip);
    }
    free = keep;
  }

  const forcedCost = 0; // Escolha travada ou podada não pesa no ranque.
  const readings: Reading[] = [];
  const total = 1 << free.length;

  for (let mask = 0; mask < total; mask += 1) {
    const applied = new Set<string>();
    let cost = forcedCost;
    for (const [id, on] of forced) {
      if (on) applied.add(id);
    }
    for (let bit = 0; bit < free.length; bit += 1) {
      const junction = free[bit];
      if (junction === undefined) continue;
      if ((mask & (1 << bit)) !== 0) {
        applied.add(junction.id);
        cost += junction.costApply;
      } else {
        cost += junction.costSkip;
      }
    }
    readings.push(materialize(units, junctions, applied, language.prosody, cost));
  }

  const targeted = spec !== undefined && !isFreeVerse(spec);
  readings.sort((a, b) => {
    if (targeted && spec !== undefined) {
      const fitA = a.count === spec.syllables ? 0 : 1;
      const fitB = b.count === spec.syllables ? 0 : 1;
      if (fitA !== fitB) return fitA - fitB;
      // Tônica na posição certa só desempata entre leituras que já medem
      // certo. Comparar posições entre leituras de medidas diferentes é
      // comparar contra réguas diferentes, e faz o motor preferir uma leitura
      // absurda de 13 sílabas só porque a 10ª caiu numa tônica.
      if (fitA === 0) {
        const missA = countMissingStresses(a, spec);
        const missB = countMissingStresses(b, spec);
        if (missA !== missB) return missA - missB;
      }
    }
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.total - b.total;
  });

  const ranked = readings.slice(0, maxReadings);
  return {
    text,
    units,
    junctions,
    readings: ranked,
    best: ranked[0] ?? null,
    truncated,
  };
}
