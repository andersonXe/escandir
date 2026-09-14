/**
 * Tonicidade do português.
 *
 * Depois das reformas ortográficas dos anos 40, achar a vogal tônica a partir
 * da palavra escrita é processo de regra, não de dicionário. A hierarquia é:
 * acento agudo/circunflexo > til > regra dos paroxítonos. O léxico entra só
 * como lista de exceções.
 */

import { at, hasStressMark, hasTilde } from './chars.js';
import { isParoxytoneByEnding } from './endings.js';
import type { SyllableSpan } from './syllabify.js';

function syllableOfIndex(spans: readonly SyllableSpan[], charIndex: number): number {
  for (let i = 0; i < spans.length; i += 1) {
    const span = spans[i];
    if (span === undefined) continue;
    if (charIndex >= span.nucleusStart && charIndex < span.nucleusEnd) return i;
  }
  return -1;
}

/**
 * Índice da sílaba tônica. Devolve `-1` se a palavra não tem núcleo.
 *
 * Proparoxítonas não precisam de regra própria: pela ortografia vigente,
 * toda proparoxítona é acentuada, e o acento já resolve.
 */
export function findStressIndex(w: string, spans: readonly SyllableSpan[]): number {
  if (spans.length === 0) return -1;
  if (spans.length === 1) return 0;

  for (let i = 0; i < w.length; i += 1) {
    if (hasStressMark(at(w, i))) {
      const index = syllableOfIndex(spans, i);
      if (index >= 0) return index;
    }
  }

  // O til marca nasalidade; só vale como marca de tônica na ausência de acento
  // agudo ou circunflexo — por isso "ór-gão" e "bên-ção" são paroxítonas.
  for (let i = 0; i < w.length; i += 1) {
    if (hasTilde(at(w, i))) {
      const index = syllableOfIndex(spans, i);
      if (index >= 0) return index;
    }
  }

  return isParoxytoneByEnding(w) ? spans.length - 2 : spans.length - 1;
}
