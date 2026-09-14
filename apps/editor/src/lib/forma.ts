/**
 * A forma declarada, e os modelos que a nomeiam.
 *
 * A forma é **quatro coisas independentes**: quantas sílabas, onde caem as
 * tônicas obrigatórias, que esquema de rima, quantos versos. Um modelo é só um
 * atalho que preenche as quatro de uma vez — "decassílabo heroico" é um nome
 * para uma combinação, não uma entidade própria. Quem escreve pode partir de um
 * modelo e mexer em qualquer das quatro, ou não usar modelo nenhum.
 *
 * Só as duas primeiras interessam ao motor (`MetricSpec`). Rima e número de
 * versos são do documento: a camada 3 não sabe o que é uma estrofe.
 */

import { FORMAS, type MetricSpec } from '@escandir/engine';

export interface Forma {
  readonly spec: MetricSpec;
  /** Uma letra por verso, ciclada se o poema for mais longo. Vazio = branco. */
  readonly rhyme: string;
  /** Versos que a forma prevê. `0` = sem limite. */
  readonly verses: number;
}

export interface Modelo extends Forma {
  readonly id: string;
  readonly name: string;
  /** Modelo de fábrica: não se apaga. */
  readonly builtin: boolean;
}

const livre: MetricSpec = { syllables: 0, requiredStresses: [] };

/**
 * Os clássicos. Os que só prescrevem metro deixam rima e número de versos em
 * aberto — uma redondilha não manda rimar, e fingir que manda seria inventar
 * regra que a tradição não tem.
 */
export const BUILTIN: readonly Modelo[] = [
  {
    id: 'redondilha-menor',
    name: 'Redondilha menor',
    spec: FORMAS.redondilhaMenor,
    rhyme: '',
    verses: 0,
    builtin: true,
  },
  {
    id: 'redondilha-maior',
    name: 'Redondilha maior',
    spec: FORMAS.redondilhaMaior,
    rhyme: '',
    verses: 0,
    builtin: true,
  },
  {
    id: 'heroico',
    name: 'Decassílabo heroico',
    spec: FORMAS.heroico,
    rhyme: '',
    verses: 0,
    builtin: true,
  },
  {
    id: 'safico',
    name: 'Decassílabo sáfico',
    spec: FORMAS.safico,
    rhyme: '',
    verses: 0,
    builtin: true,
  },
  {
    id: 'martelo',
    name: 'Martelo agalopado',
    spec: FORMAS.martelo,
    rhyme: '',
    verses: 0,
    builtin: true,
  },
  {
    id: 'alexandrino',
    name: 'Alexandrino',
    spec: FORMAS.alexandrino,
    rhyme: '',
    verses: 0,
    builtin: true,
  },
  {
    id: 'quarteto-heroico',
    name: 'Quarteto heroico',
    spec: FORMAS.heroico,
    rhyme: 'ABBA',
    verses: 4,
    builtin: true,
  },
  {
    id: 'soneto',
    name: 'Soneto',
    spec: FORMAS.heroico,
    rhyme: 'ABBAABBACDCDCD',
    verses: 14,
    builtin: true,
  },
  { id: 'livre', name: 'Verso livre', spec: livre, rhyme: '', verses: 0, builtin: true },
];

export const MAX_SYLLABLES = 20;
export const MAX_VERSES = 200;

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.min(high, Math.max(low, Math.trunc(value)));
}

/**
 * Tônica não pode ser exigida fora do verso: baixar o número de sílabas
 * descarta as posições que deixaram de existir. Perder a exigência é melhor
 * que guardar uma exigência impossível de cumprir.
 */
export function withSyllables(forma: Forma, syllables: number): Forma {
  const count = clamp(syllables, 0, MAX_SYLLABLES);
  return {
    ...forma,
    spec: {
      syllables: count,
      requiredStresses: forma.spec.requiredStresses.filter((p) => p <= count),
    },
  };
}

export function toggleStress(forma: Forma, position: number): Forma {
  const current = forma.spec.requiredStresses;
  const next = current.includes(position)
    ? current.filter((p) => p !== position)
    : [...current, position].sort((a, b) => a - b);
  return { ...forma, spec: { ...forma.spec, requiredStresses: next } };
}

export function withStresses(forma: Forma, positions: readonly number[]): Forma {
  const valid = [...new Set(positions)]
    .filter((p) => p >= 1 && p <= forma.spec.syllables)
    .sort((a, b) => a - b);
  return { ...forma, spec: { ...forma.spec, requiredStresses: valid } };
}

export function withVerses(forma: Forma, verses: number): Forma {
  return { ...forma, verses: clamp(verses, 0, MAX_VERSES) };
}

/** Só letras, em caixa alta. O que o autor digitar fora disso é ruído. */
export function normalizeRhyme(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, MAX_VERSES);
}

export function withRhyme(forma: Forma, raw: string): Forma {
  return { ...forma, rhyme: normalizeRhyme(raw) };
}

export function sameSpec(a: MetricSpec, b: MetricSpec): boolean {
  return (
    a.syllables === b.syllables &&
    a.requiredStresses.length === b.requiredStresses.length &&
    a.requiredStresses.every((n, i) => n === b.requiredStresses[i])
  );
}

export function sameForma(a: Forma, b: Forma): boolean {
  return sameSpec(a.spec, b.spec) && a.rhyme === b.rhyme && a.verses === b.verses;
}

/** O modelo que corresponde exatamente à forma corrente, se houver. */
export function matchModelo(forma: Forma, saved: readonly Modelo[]): Modelo | null {
  return [...saved, ...BUILTIN].find((modelo) => sameForma(modelo, forma)) ?? null;
}

/** Texto curto da forma, para o cabeçalho. */
export function formaLabel(forma: Forma, modelo: Modelo | null): string {
  if (modelo !== null) return modelo.name.toLowerCase();
  const partes: string[] = [];
  partes.push(forma.spec.syllables === 0 ? 'verso livre' : `${forma.spec.syllables} sílabas`);
  if (forma.spec.requiredStresses.length > 0) {
    partes.push(`tônicas ${forma.spec.requiredStresses.join('·')}`);
  }
  if (forma.rhyme !== '') partes.push(forma.rhyme.toLowerCase());
  if (forma.verses > 0) partes.push(`${forma.verses} versos`);
  return partes.join(' · ');
}

export function newModeloId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** A forma com que o editor abre. Decassílabo heroico, sem rima declarada. */
export const DEFAULT_FORMA: Forma = {
  spec: FORMAS.heroico,
  rhyme: '',
  verses: 0,
};
