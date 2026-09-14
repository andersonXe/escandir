/**
 * Qual ação a IA oferece, e com que nome.
 *
 * Esta é a parte difícil, e a razão de ela não ser uma barra de seis botões:
 * o autor não devia ter que traduzir a própria situação para um menu de
 * verbos. O motor já sabe que esta linha tem uma sílaba a mais, que aquela
 * está vazia e devia rimar em `-ar`, que a outra é um comentário. Então a ação
 * se nomeia pelo que falta, e só uma aparece de cada vez.
 *
 * Função pura: entra o estado da linha, sai o rótulo. Sem isso, "contextual"
 * vira adivinhação espalhada pela interface.
 */

import type { MetricSpec, VerseAssessment } from '@escandir/engine';

import type { LineKind } from '../document.js';
import type { ProposalKind } from './prompt.js';

export type ActionId =
  | 'write-verse'
  | 'complete-verse'
  | 'fix-verse'
  | 'vary-verse'
  | 'vary-fragment'
  | 'vary-passage'
  | 'write-stanza'
  | 'address-note';

export interface Action {
  readonly id: ActionId;
  readonly label: string;
  readonly kind: ProposalKind;
}

export interface LineSituation {
  /** Versos marcados a partir deste, quando o autor marcou mais de um. */
  readonly rangeLength?: number;
  readonly lineKind: LineKind;
  readonly text: string;
  /** Trecho que o autor marcou nesta linha, se marcou algum. */
  readonly selection?: { readonly start: number; readonly end: number };
  readonly assessment: VerseAssessment | null;
  readonly spec: MetricSpec;
  readonly rhymeTarget: string | null;
  /** Linhas de verso vazias contíguas a partir desta, esta incluída. */
  readonly emptyRun: number;
}

function forma(spec: MetricSpec, rhymeTarget: string | null): string {
  const partes: string[] = [];
  if (spec.syllables > 0) partes.push(`${spec.syllables} sílabas`);
  if (rhymeTarget !== null && rhymeTarget !== '') partes.push(`rima em -${rhymeTarget}`);
  return partes.length === 0 ? '' : ` · ${partes.join(' · ')}`;
}

export function actionFor(situation: LineSituation): Action | null {
  const { lineKind, text, assessment, spec, rhymeTarget, emptyRun } = situation;

  /**
   * Trecho de vários versos marcado vence tudo — inclusive marca de caractere.
   * Selecionar três versos e receber proposta para um seria ignorar o gesto.
   */
  if (situation.rangeLength !== undefined && situation.rangeLength > 1) {
    return {
      id: 'vary-passage',
      label: `variar ${situation.rangeLength} versos`,
      kind: 'stanza',
    };
  }

  if (lineKind === 'heading') return null;

  if (lineKind === 'note') {
    if (text.trim() === '') return null;
    return { id: 'address-note', label: 'atender ao comentário', kind: 'verse' };
  }

  /**
   * Marcar um trecho é o gesto mais explícito que existe: o autor apontou
   * exatamente o que quer trocar. Vence qualquer outra leitura da situação —
   * não importa se o verso fecha a forma ou não.
   */
  if (situation.selection !== undefined) {
    const trecho = text.slice(situation.selection.start, situation.selection.end).trim();
    if (trecho !== '' && trecho !== text.trim()) {
      return { id: 'vary-fragment', label: `variar “${trecho}”`, kind: 'verse' };
    }
  }

  const sufixo = forma(spec, rhymeTarget);

  if (text.trim() === '') {
    // Várias linhas vazias seguidas são uma estrofe por escrever, não um verso.
    if (emptyRun >= 2) {
      return { id: 'write-stanza', label: `escrever ${emptyRun} versos${sufixo}`, kind: 'stanza' };
    }
    return { id: 'write-verse', label: `escrever verso${sufixo}`, kind: 'verse' };
  }

  if (assessment === null) return { id: 'vary-verse', label: 'propor variações', kind: 'verse' };

  switch (assessment.status) {
    case 'pending':
      return { id: 'complete-verse', label: `completar verso${sufixo}`, kind: 'verse' };
    case 'over':
    case 'under': {
      const alvo = spec.syllables;
      return { id: 'fix-verse', label: `ajustar para ${alvo} sílabas`, kind: 'verse' };
    }
    case 'rhythm': {
      const faltando = assessment.diagnostics.find((d) => d.kind === 'stress');
      const onde = faltando?.kind === 'stress' ? ` (tônica na ${faltando.expected}ª)` : '';
      return { id: 'fix-verse', label: `refazer o ritmo${onde}`, kind: 'verse' };
    }
    default:
      return { id: 'vary-verse', label: 'propor variações', kind: 'verse' };
  }
}
