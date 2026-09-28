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
  | 'address-note'
  | 'write-poem';

export interface Action {
  readonly id: ActionId;
  readonly label: string;
  readonly kind: ProposalKind;
  /** Versos pedidos, quando a ação é um bloco a partir do tema ou do comentário. `0` = livre. */
  readonly verses?: number;
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
  /** Nenhum verso escrito no poema ainda. */
  readonly poemEmpty?: boolean;
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
    // Comentário num poema sem verso nenhum não pede um verso: pede o poema.
    // Um verso solto ali não teria vizinho com quem conversar.
    if (situation.poemEmpty === true) {
      return { id: 'write-poem', label: 'escrever o poema a partir do comentário', kind: 'stanza' };
    }
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

export interface ThemeSituation {
  readonly theme: string;
  /** Versos já escritos no poema. */
  readonly written: number;
  /** Versos que a forma prevê. `0` = sem limite. */
  readonly declared: number;
  readonly scheme: string;
  readonly spec: MetricSpec;
}

/**
 * Tamanho de uma estrofe quando a forma não diz. O esquema de rima é a melhor
 * pista que há — ABAB é uma quadra, AABB também —, mas um esquema de soneto
 * inteiro não é estrofe, e aí vale a quadra.
 */
function stanzaSize(scheme: string): number {
  return scheme.length >= 2 && scheme.length <= 8 ? scheme.length : 4;
}

/**
 * A ação do campo de tema, oferecida a qualquer momento enquanto ele está em
 * foco. O tema é o ponto de partida; o que se pede a partir dele depende do
 * que já está escrito:
 *
 * - nada escrito: o poema inteiro, do tamanho que a forma declarou;
 * - poema pela metade, com tamanho declarado: os versos que faltam;
 * - o resto: a estrofe seguinte.
 */
export function themeAction(situation: ThemeSituation): Action | null {
  const { theme, written, declared, scheme, spec } = situation;
  if (theme.trim() === '') return null;

  const medida = spec.syllables > 0 ? ` · ${spec.syllables} sílabas` : '';

  if (declared > 0 && written < declared) {
    const faltam = declared - written;
    const label =
      written === 0
        ? `escrever o poema · ${declared} versos${medida}`
        : `escrever ${faltam === 1 ? 'o verso que falta' : `os ${faltam} versos que faltam`}${medida}`;
    return { id: 'write-poem', label, kind: 'stanza', verses: faltam };
  }
  if (written === 0) {
    return { id: 'write-poem', label: `escrever o poema${medida}`, kind: 'stanza', verses: 0 };
  }
  const n = stanzaSize(scheme);
  return { id: 'write-poem', label: `escrever estrofe · ${n} versos${medida}`, kind: 'stanza', verses: n };
}
