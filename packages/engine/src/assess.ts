/**
 * Camada 4: ajuste da leitura ao esquema.
 *
 * Devolve estrutura, nunca frase. "sobra 1 sílaba" é decisão da UI sobre
 * `{ kind: 'count', delta: 1 }` — outra interface pode dizer a mesma coisa de
 * outro jeito, ou não dizer nada.
 */

import { isFreeVerse, type MetricSpec } from './spec.js';
import type { Reading } from './verse/reading.js';

export type VerseStatus =
  /** Dentro da forma. */
  | 'ok'
  /** Passou do alvo. */
  | 'over'
  /** Não chegou ao alvo, e o verso está terminado. */
  | 'under'
  /** A medida bate, mas uma tônica obrigatória não está onde deveria. */
  | 'rhythm'
  /** Não chegou ao alvo, mas ainda está sendo escrito. Não é erro. */
  | 'pending'
  /** Sem alvo declarado. Ausência de métrica não é estado de erro. */
  | 'free';

export type Diagnostic =
  | { readonly kind: 'count'; readonly got: number; readonly expected: number; readonly delta: number }
  /** Posição exigida sem tônica forte. `nearest` é a tônica mais próxima. */
  | { readonly kind: 'stress'; readonly expected: number; readonly nearest: number | null }
  /** Quanto falta para fechar a forma, num verso ainda em curso. */
  | { readonly kind: 'pending'; readonly missing: number };

/** Uma casa da régua, do ponto de vista da forma declarada. */
export interface PositionMark {
  readonly position: number;
  readonly required: boolean;
  readonly satisfied: boolean;
}

export interface VerseAssessment {
  readonly status: VerseStatus;
  readonly count: number;
  /** `0` em verso livre. */
  readonly expected: number;
  readonly delta: number;
  readonly diagnostics: readonly Diagnostic[];
  readonly positions: readonly PositionMark[];
}

export interface AssessOptions {
  /** O verso ainda está sendo digitado: faltar sílaba não é erro. */
  readonly partial?: boolean;
}

function isStrongAt(reading: Reading, position: number): boolean {
  return reading.syllables[position - 1]?.stressStrength === 'strong';
}

function nearestStress(reading: Reading, position: number): number | null {
  for (let distance = 1; distance < reading.syllables.length; distance += 1) {
    if (isStrongAt(reading, position + distance)) return position + distance;
    if (position - distance >= 1 && isStrongAt(reading, position - distance)) {
      return position - distance;
    }
  }
  return null;
}

export function assess(
  reading: Reading,
  spec: MetricSpec,
  options: AssessOptions = {},
): VerseAssessment {
  const count = reading.count;

  if (isFreeVerse(spec)) {
    return {
      status: 'free',
      count,
      expected: 0,
      delta: 0,
      diagnostics: [],
      positions: reading.syllables.map((syllable, index) => ({
        position: index + 1,
        required: false,
        satisfied: syllable.stressStrength === 'strong',
      })),
    };
  }

  const delta = count - spec.syllables;
  const diagnostics: Diagnostic[] = [];

  let status: VerseStatus;
  if (delta === 0) status = 'ok';
  else if (delta > 0) status = 'over';
  else status = options.partial === true ? 'pending' : 'under';

  if (status === 'pending') {
    // Num verso em curso o que falta se mede do total digitado, não da última
    // tônica: quem escreveu 8 sílabas com a tônica na 6ª precisa de mais 2
    // para chegar à 10ª, não de mais 4. Medir pela contagem métrica aqui
    // daria um número certo sobre a pergunta errada.
    diagnostics.push({ kind: 'pending', missing: Math.max(0, spec.syllables - reading.total) });
  } else if (delta !== 0) {
    diagnostics.push({ kind: 'count', got: count, expected: spec.syllables, delta });
  }

  // Tônica obrigatória só é cobrada nas posições que o verso já alcançou:
  // num verso pela metade, exigir a 10ª seria acusar o poeta de não ter
  // terminado de escrever.
  const positions: PositionMark[] = [];
  const limit = Math.max(count, spec.syllables);
  for (let position = 1; position <= limit; position += 1) {
    const required = spec.requiredStresses.includes(position);
    const satisfied = isStrongAt(reading, position);
    positions.push({ position, required, satisfied });
    if (required && !satisfied && position <= count) {
      diagnostics.push({ kind: 'stress', expected: position, nearest: nearestStress(reading, position) });
    }
  }

  // Tônica fora do lugar com a medida certa não é sobra nem falta: é erro de
  // ritmo, e merece estado próprio. Num verso em curso não se cobra ritmo.
  if (status === 'ok' && diagnostics.some((d) => d.kind === 'stress')) {
    status = 'rhythm';
  }

  return { status, count, expected: spec.syllables, delta, diagnostics, positions };
}
