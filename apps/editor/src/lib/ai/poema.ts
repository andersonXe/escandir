/**
 * O poema como dado, para o pedido.
 *
 * O pedido já levou exemplos escandidos — três decassílabos sobre o mar — para
 * calibrar a contagem do modelo. Calibravam também o assunto: exemplo é o
 * molde mais forte que há num prompt, e o poema do autor passava a se parecer
 * com o do exemplo. Com a régua na mão do modelo, eles nem eram mais
 * necessários: ele vê a escansão dos próprios rascunhos.
 *
 * O que substitui o exemplo é o próprio poema, medido. Cada linha chega com a
 * letra do esquema, a medida que o motor deu e a terminação da rima — o que o
 * sistema já sabe, organizado em vez de dito em prosa. O modelo calibra pela
 * voz de quem escreve, não por uma voz inventada.
 */

import {
  assess,
  createAnalyzer,
  ptBR,
  rhymeOf,
  scanVerse,
  type MetricSpec,
  type VerseAssessment,
} from '@escandir/engine';

import type { LineKind } from '../document.js';
import { letterAt } from './esquema.js';

const analyzer = createAnalyzer(ptBR);

export interface PoemLine {
  readonly kind: LineKind;
  readonly text: string;
  /** Letra do esquema de rima. Vazio sem esquema, ou quando não é verso. */
  readonly letter: string;
  /** Sílabas poéticas pela medida do motor. `null` em linha vazia ou que não é verso. */
  readonly count: number | null;
  /** O que não fecha, já dito: "sobra 1 sílaba". `null` quando fecha. */
  readonly problem: string | null;
  /** Terminação da rima, pela grafia. Vazio quando não há. */
  readonly rhyme: string;
}

/** O diagnóstico da camada 4 em poucas palavras. `null` = fecha a forma. */
export function diagnose(assessment: VerseAssessment | null): string | null {
  if (assessment === null) return 'fora da forma';
  if (assessment.status === 'ok' || assessment.status === 'free') return null;
  const diagnostic = assessment.diagnostics[0];
  if (diagnostic === undefined) return 'fora da forma';
  if (diagnostic.kind === 'count') {
    return diagnostic.delta > 0
      ? `sobra${diagnostic.delta === 1 ? ' 1 sílaba' : `m ${diagnostic.delta} sílabas`}`
      : `falta${-diagnostic.delta === 1 ? ' 1 sílaba' : `m ${-diagnostic.delta} sílabas`}`;
  }
  if (diagnostic.kind === 'stress') return `tônica na ${diagnostic.expected}ª`;
  return 'fora da forma';
}

/**
 * Mede o documento inteiro. Roda sob pedido, não a cada tecla: duzentas linhas
 * a 0,03ms cabem folgadas na espera de uma chamada de rede.
 *
 * A letra sai da ordem entre os **versos**, não entre as linhas: título e nota
 * não consomem letra do esquema, como no editor.
 */
export function describePoem(
  lines: readonly { readonly text: string; readonly kind: LineKind }[],
  spec: MetricSpec,
  scheme: string,
): PoemLine[] {
  let ordinal = 0;
  return lines.map((line): PoemLine => {
    if (line.kind !== 'verse') {
      return { kind: line.kind, text: line.text, letter: '', count: null, problem: null, rhyme: '' };
    }
    const letter = letterAt(scheme, ordinal);
    ordinal += 1;
    if (line.text.trim() === '') {
      return { kind: 'verse', text: line.text, letter, count: null, problem: null, rhyme: '' };
    }
    const reading = scanVerse(line.text, ptBR, analyzer, { spec }).best;
    if (reading === null) {
      return { kind: 'verse', text: line.text, letter, count: null, problem: 'fora da forma', rhyme: '' };
    }
    const assessment = assess(reading, spec);
    return {
      kind: 'verse',
      text: line.text,
      letter,
      count: assessment.count,
      problem: diagnose(assessment),
      rhyme: rhymeOf(reading, line.text, ptBR.prosody).tail,
    };
  });
}

/** Linhas sem medida, para quem só tem o texto — testes, e o que não é verso. */
export function plainLines(texts: readonly string[]): PoemLine[] {
  return texts.map((text) => ({ kind: 'verse', text, letter: '', count: null, problem: null, rhyme: '' }));
}
