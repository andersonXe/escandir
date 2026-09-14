/**
 * Silabação fonológica do português.
 *
 * Não é hifenização: o alvo é a sílaba falada, que é o que a métrica conta.
 * O resultado é a leitura *canônica* — a que um falante faria em prosa.
 * Ditongo desfeito (diérese) e hiato desfeito (sinérese) são desvios dessa
 * leitura, têm custo, e pertencem à camada 3.
 */

import {
  at,
  hasStressMark,
  isGlideVowel,
  isNucleusVowel,
  isValidComplexOnset,
  isVowelChar,
} from './chars.js';
import { finalVowelIsStressed } from './endings.js';

/** Fronteiras de uma sílaba. `onset = [start, nucleusStart)`, `coda = [nucleusEnd, end)`. */
export interface SyllableSpan {
  readonly start: number;
  readonly end: number;
  readonly nucleusStart: number;
  readonly nucleusEnd: number;
}

interface Unit {
  readonly kind: 'C' | 'V';
  readonly start: number;
  readonly end: number;
}

interface Span {
  readonly start: number;
  readonly end: number;
}

/**
 * Quebra a palavra em unidades indivisíveis.
 *
 * Dígrafos consonantais (`ch`, `lh`, `nh`) são uma unidade. `qu`/`gu` antes de
 * vogal também: o `u` ali é mudo ou semivogal, e em nenhum dos dois casos abre
 * sílaba — "á-gua", "quan-do", "lin-gui-ça" contam igual de qualquer forma.
 *
 * `rr`, `ss`, `sc`, `sç` e `xc` ficam de fora de propósito: são duas unidades,
 * e a regra de ataque já as separa ("car-ro", "nas-cer", "ex-ce-to").
 */
function toUnits(w: string): Unit[] {
  const units: Unit[] = [];
  let i = 0;
  while (i < w.length) {
    const c = at(w, i);
    if (isVowelChar(c)) {
      units.push({ kind: 'V', start: i, end: i + 1 });
      i += 1;
      continue;
    }
    const next = at(w, i + 1);
    let length = 1;
    if ((c === 'c' || c === 'l' || c === 'n') && next === 'h') {
      length = 2;
    } else if ((c === 'q' || c === 'g') && (next === 'u' || next === 'ü') && isVowelChar(at(w, i + 2))) {
      length = 2;
    }
    units.push({ kind: 'C', start: i, end: i + length });
    i += length;
  }
  return units;
}

/**
 * Decide se um encontro fraca+forte ("ia", "ua", "ie"...) é ditongo crescente
 * ou hiato.
 *
 * A ortografia já resolveu isso, e é por isso que a regra é barata: pela norma
 * vigente, paroxítono terminado em ditongo crescente *tem* acento gráfico
 * ("his-tó-ria", "sé-rie", "á-gua", "vá-cuo"). Logo, se o encontro está na
 * última sequência vocálica e existe acento escrito antes dela, é ditongo.
 * Sem acento antes, a fraca é a própria tônica e o encontro é hiato:
 * "di-a", "va-zi-o", "sa-bi-a", "e-ner-gi-a".
 *
 * Fora da sílaba final o padrão é hiato ("pi-a-no", "cri-an-ça", "ci-ên-cia").
 * A leitura contrária existe em verso — é junção com custo, não erro.
 */
function risingIsDiphthong(isLastRun: boolean, stressMarkIndex: number, runStart: number): boolean {
  return isLastRun && stressMarkIndex >= 0 && stressMarkIndex < runStart;
}

/** Fatia uma sequência de vogais contíguas nos núcleos que ela comporta. */
function splitVowelRun(
  w: string,
  run: Span,
  isLastRun: boolean,
  stressMarkIndex: number,
  protectedIndex: number,
): Span[] {
  /**
   * Uma vogal blindada não pode ser absorvida pelo núcleo vizinho: ou é a
   * tônica que a grafia exige ("ca-ir", "ju-iz", "ru-im"), ou vem antes de
   * `nh`, que em português sempre desfaz o ditongo ("ra-i-nha", "mo-i-nho").
   */
  const isProtected = (index: number): boolean =>
    index === protectedIndex || (index + 1 === run.end && w.startsWith('nh', run.end));

  const nuclei: Span[] = [];
  let i = run.start;
  while (i < run.end) {
    const v = at(w, i);
    let end = i + 1;
    const next = at(w, end);
    const canTake = end < run.end && !isProtected(end);

    if (isNucleusVowel(v)) {
      if (canTake && (v === 'ã' || v === 'õ') && (next === 'o' || next === 'e')) {
        // Ditongo nasal: "não", "mãe", "põe".
        end += 1;
      } else if (canTake && isGlideVowel(next)) {
        // Ditongo decrescente: "pai", "lei", "céu", "boi", "sau-da-de".
        end += 1;
      }
    } else if (
      canTake &&
      isNucleusVowel(next) &&
      risingIsDiphthong(isLastRun, stressMarkIndex, run.start)
    ) {
      // Ditongo crescente: "his-tó-ria", "á-gua".
      end += 1;
      if (end < run.end && !isProtected(end) && isGlideVowel(at(w, end))) {
        // Tritongo, fora dos casos de qu/gu: raro, mas possível.
        end += 1;
      }
    } else if (canTake && isGlideVowel(next)) {
      // Duas fracas: "mui-to", "viu", "fui".
      end += 1;
    }

    nuclei.push({ start: i, end });
    i = end;
  }
  return nuclei;
}

function lastVowelIndex(w: string): number {
  for (let i = w.length - 1; i >= 0; i -= 1) {
    if (isVowelChar(at(w, i))) return i;
  }
  return -1;
}

function indexOfStressMark(w: string): number {
  for (let i = 0; i < w.length; i += 1) {
    if (hasStressMark(at(w, i))) return i;
  }
  return -1;
}

/**
 * Onde cortar o grupo consonantal entre dois núcleos. O português é generoso
 * com o ataque: leva para a sílaba seguinte o máximo que possa abri-la
 * ("abs-tra-to", "es-cre-ver"), e só o que sobra vira coda.
 */
function cutCluster(w: string, fullCluster: readonly Unit[], fallback: number): number {
  // Hífen de ênclise ("dá-lo", "guarda-chuva") não abre sílaba: fica na coda
  // anterior, e a sílaba seguinte começa na letra.
  let size = fullCluster.length;
  while (size > 0) {
    const unit = fullCluster[size - 1];
    if (unit === undefined || w.slice(unit.start, unit.end) !== '-') break;
    size -= 1;
  }
  const cluster = fullCluster.slice(0, size);

  const lastUnit = cluster[cluster.length - 1];
  if (lastUnit === undefined) return fallback;
  const beforeLast = cluster[cluster.length - 2];
  if (
    beforeLast !== undefined &&
    isValidComplexOnset(
      w.slice(beforeLast.start, beforeLast.end),
      w.slice(lastUnit.start, lastUnit.end),
    )
  ) {
    return beforeLast.start;
  }
  return lastUnit.start;
}

/**
 * Divide a palavra (normalizada e em minúsculas) em sílabas fonológicas.
 * Palavra sem vogal devolve lista vazia.
 */
export function syllabify(w: string): SyllableSpan[] {
  const units = toUnits(w);
  const stressMarkIndex = indexOfStressMark(w);
  const protectedIndex = finalVowelIsStressed(w) ? lastVowelIndex(w) : -1;

  const vowelRuns: Span[] = [];
  // `clusters[k]` é o grupo consonantal que precede `vowelRuns[k]`.
  const clusters: Unit[][] = [];
  let pending: Unit[] = [];
  let runStart = -1;

  for (const unit of units) {
    if (unit.kind === 'V') {
      if (runStart < 0) {
        clusters.push(pending);
        pending = [];
        runStart = unit.start;
      }
    } else {
      if (runStart >= 0) {
        vowelRuns.push({ start: runStart, end: unit.start });
        runStart = -1;
      }
      pending.push(unit);
    }
  }
  if (runStart >= 0) vowelRuns.push({ start: runStart, end: w.length });

  if (vowelRuns.length === 0) return [];

  const nuclei: Span[] = [];
  const runOfNucleus: number[] = [];
  for (let r = 0; r < vowelRuns.length; r += 1) {
    const run = vowelRuns[r];
    if (run === undefined) continue;
    const isLastRun = r === vowelRuns.length - 1;
    for (const nucleus of splitVowelRun(w, run, isLastRun, stressMarkIndex, protectedIndex)) {
      nuclei.push(nucleus);
      runOfNucleus.push(r);
    }
  }

  const starts: number[] = [];
  for (let k = 0; k < nuclei.length; k += 1) {
    const nucleus = nuclei[k];
    if (nucleus === undefined) continue;
    if (k === 0) {
      starts.push(0);
    } else if (runOfNucleus[k] === runOfNucleus[k - 1]) {
      // Hiato dentro da mesma sequência vocálica: não há consoante entre eles.
      starts.push(nucleus.start);
    } else {
      const cluster = clusters[runOfNucleus[k] ?? 0] ?? [];
      starts.push(cutCluster(w, cluster, nucleus.start));
    }
  }

  return nuclei.map((nucleus, index) => ({
    start: starts[index] ?? nucleus.start,
    end: index === nuclei.length - 1 ? w.length : (starts[index + 1] ?? w.length),
    nucleusStart: nucleus.start,
    nucleusEnd: nucleus.end,
  }));
}
