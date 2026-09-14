/**
 * Corpus de versos escandidos à mão.
 *
 * Origem: os versos fixos do protótipo em `design/Editor Métrico.dc.html`,
 * escandidos por quem desenhou a interface, antes de existir motor. Servem de
 * teste de aceitação da camada 3 — são a prova de que a escansão calculada
 * reproduz a escansão que o desenho pressupõe.
 *
 * Notação, herdada do protótipo: sílabas separadas por `|`,
 * `*` tônica forte, `^` sílaba nascida de elisão, `+` extramétrica.
 *
 * Divergência deliberada em relação ao protótipo, uma só: em "que ele trazia"
 * o desenho lê "ele" como átona. O motor a trata como tônica, que é o que ela
 * é — pronome pessoal reto não é clítico. A diferença muda um ponto da régua e
 * não muda contagem nem diagnóstico: a última tônica continua na 11ª.
 */

import { FORMAS, type MetricSpec } from '../../src/spec.js';
import type { VerseStatus } from '../../src/assess.js';

export interface GoldenVerso {
  readonly texto: string;
  readonly escansao: string;
  /** Contagem até a última tônica. */
  readonly conta: number;
  readonly forma: MetricSpec;
  readonly status: VerseStatus;
  readonly nota?: string;
}

export const VERSOS: readonly GoldenVerso[] = [
  {
    texto: 'A tarde desce lenta sobre o mar',
    escansao: 'A|tar*|de|des*|ce|len*|ta|so|breo^|mar*',
    conta: 10,
    forma: FORMAS.heroico,
    status: 'ok',
    nota: 'Uma elisão. "sobre" é átona: não desenha tempo forte na 8ª.',
  },
  {
    texto: 'e o vento esquece o nome que trazia',
    escansao: 'eo^|ven*|toes^|que*|ceo^|no*|me|que|tra|zi*|a+',
    conta: 10,
    forma: FORMAS.heroico,
    status: 'ok',
    nota: 'Três elisões e uma extramétrica. 11 sílabas ao todo, 10 de conta.',
  },
  {
    texto: 'a pedra sabe o pouco que sabia',
    escansao: 'a|pe*|dra|sa*|beo^|pou*|co|que|sa|bi*|a+',
    conta: 10,
    forma: FORMAS.heroico,
    status: 'ok',
  },
  {
    texto: 'e nada mais se move no lugar',
    escansao: 'e|na*|da|mais*|se|mo*|ve|no|lu|gar*',
    conta: 10,
    forma: FORMAS.heroico,
    status: 'ok',
    nota: 'Nenhuma junção: contagem direta.',
  },
  {
    texto: 'e o vento esquece o nome que ele trazia',
    escansao: 'eo^|ven*|toes^|que*|ceo^|no*|me|quee*^|le|tra|zi*|a+',
    conta: 11,
    forma: FORMAS.heroico,
    status: 'over',
    nota: 'Sobra 1. A última tônica cai na 11ª.',
  },
  {
    texto: 'a noite cai devagar sobre o rio',
    escansao: 'a|noi*|te|cai*|de|va|gar*|so|breo^|ri*|o+',
    conta: 10,
    forma: FORMAS.heroico,
    status: 'rhythm',
    nota: 'Mede 10, mas "devagar" põe tônica na 7ª e a 6ª fica vazia.',
  },
];
