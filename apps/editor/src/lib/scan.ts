/**
 * Ponte entre o editor e o motor.
 *
 * Só isto: memoização por linha e o recorte do que a UI precisa. Nenhuma
 * regra de métrica mora aqui — se algo sobre escansão precisar ser decidido
 * neste arquivo, está no lugar errado.
 */

import {
  assess,
  createAnalyzer,
  ptBR,
  scanVerse,
  type MetricSpec,
  type Reading,
  type VerseAssessment,
} from '@escandir/engine';

const analyzer = createAnalyzer(ptBR);

export interface LineScan {
  readonly reading: Reading | null;
  readonly assessment: VerseAssessment | null;
  /** Offsets onde desenhar o laço de elisão. */
  readonly ties: readonly number[];
}

export const EMPTY_SCAN: LineScan = { reading: null, assessment: null, ties: [] };

const cache = new Map<string, LineScan>();
const MAX_CACHE = 500;

function key(text: string, spec: MetricSpec, partial: boolean): string {
  return `${spec.syllables}:${spec.requiredStresses.join(',')}:${partial ? 1 : 0}:${text}`;
}

/**
 * `partial` significa que o cursor está nesta linha: faltar sílaba ali é
 * estado de quem ainda está escrevendo, não erro.
 */
export function scanLine(text: string, spec: MetricSpec, partial: boolean): LineScan {
  if (text.trim() === '') return EMPTY_SCAN;

  const cacheKey = key(text, spec, partial);
  const hit = cache.get(cacheKey);
  if (hit !== undefined) return hit;

  const scansion = scanVerse(text, ptBR, analyzer, { spec });
  const reading = scansion.best;
  if (reading === null) return EMPTY_SCAN;

  const applied = new Set(reading.applied);
  const ties = scansion.junctions
    .filter((junction) => junction.kind === 'elision' && applied.has(junction.id))
    .map((junction) => junction.offset);

  const result: LineScan = {
    reading,
    assessment: assess(reading, spec, { partial }),
    ties,
  };

  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(cacheKey, result);
  return result;
}
