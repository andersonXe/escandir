/**
 * Onde a estrutura vira frase.
 *
 * O motor devolve `{ kind: 'count', delta: 1 }`; quem decide que isso se diz
 * "sobra 1 sílaba" é esta camada, e só ela. É o ponto em que outra interface
 * — ou outro idioma — diria a mesma coisa de outro jeito.
 */

import type { Diagnostic, VerseAssessment } from '@escandir/engine';

function ordinal(n: number): string {
  return `${n}ª`;
}

function silabas(n: number): string {
  return n === 1 ? '1 sílaba' : `${n} sílabas`;
}

function phraseOf(diagnostic: Diagnostic): string {
  switch (diagnostic.kind) {
    case 'count':
      return diagnostic.delta > 0
        ? `sobra ${silabas(diagnostic.delta)}`
        : `${-diagnostic.delta === 1 ? 'falta' : 'faltam'} ${silabas(-diagnostic.delta)}`;
    case 'stress':
      return diagnostic.nearest === null
        ? `falta tônica na ${ordinal(diagnostic.expected)}`
        : `tônica na ${ordinal(diagnostic.nearest)}, esperada na ${ordinal(diagnostic.expected)}`;
    case 'pending':
      return `${diagnostic.missing === 1 ? 'falta' : 'faltam'} ${silabas(diagnostic.missing)}`;
  }
}

/** A frase em destaque. `null` quando não há nada a dizer. */
export function mainPhrase(assessment: VerseAssessment): string | null {
  const first = assessment.diagnostics[0];
  return first === undefined ? null : phraseOf(first);
}

/**
 * A frase de apoio: o dado que explica a primeira sem repeti-la.
 * Fica em tom baixo porque é contexto, não acusação.
 */
export function hintPhrase(assessment: VerseAssessment, forma: string): string | null {
  const first = assessment.diagnostics[0];
  if (first === undefined) return null;

  switch (first.kind) {
    case 'count':
      return `última tônica na ${ordinal(assessment.count)}`;
    case 'stress':
      return `${silabas(assessment.count)}, ritmo fora do ${forma}`;
    case 'pending': {
      const next = assessment.expected;
      return next > 0 ? `tônica na ${ordinal(next)}` : null;
    }
  }
}

/** Um verso em curso não se anuncia em vermelho. */
export function isQuiet(assessment: VerseAssessment): boolean {
  return assessment.status === 'pending' || assessment.status === 'free';
}
