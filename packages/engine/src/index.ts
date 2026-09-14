/**
 * @escandir/engine — motor de escansão.
 *
 * Sem DOM, sem fetch, sem I/O. Entra texto e especificação métrica, sai
 * estrutura. Camadas 2, 3 e 4 prontas; a 1 (léxico pré-computado) e a 5
 * (sugestão) entram por aqui conforme forem existindo.
 */

export type {
  LanguageRules,
  NucleusSplit,
  Prosody,
  ScansionSource,
  StressStrength,
  Syllable,
  WordScansion,
} from './types.js';

export { createAnalyzer } from './analyzer.js';
export type { AnalyzerOptions, WordAnalyzer } from './analyzer.js';

export { analyzeWord, ptBR } from './pt/index.js';

export { FORMAS, isFreeVerse, VERSO_LIVRE } from './spec.js';
export type { MetricSpec } from './spec.js';

export { DEFAULT_COSTS, elisionCost, hiatusCost } from './verse/costs.js';
export type { Costs } from './verse/costs.js';

export { isMerge } from './verse/junctions.js';
export type { Junction, JunctionKind } from './verse/junctions.js';

export type { Reading, ReadingSyllable } from './verse/reading.js';

export { scanVerse } from './verse/scan.js';
export type { ScanOptions, VerseScansion } from './verse/scan.js';

export { tokenizeVerse } from './verse/units.js';
export type { Unit, VerseWord } from './verse/units.js';

export { isSameWord, NO_RHYME, rhymeKey, rhymeOf, rhymes } from './rhyme.js';
export type { Rhyme, RhymeGrade } from './rhyme.js';

export { assess } from './assess.js';
export type {
  AssessOptions,
  Diagnostic,
  PositionMark,
  VerseAssessment,
  VerseStatus,
} from './assess.js';
