/**
 * Esquema de rima dentro de um candidato.
 *
 * Proposta de verso tem um alvo só: a terminação do verso anterior com a mesma
 * letra, que já está no poema. Proposta de estrofe ou de poema inteiro não tem
 * esse luxo — o verso 4 rima com o 1, que veio na mesma resposta. Então o alvo
 * de cada linha sai do próprio candidato, e a régua (ferramenta) e o juiz
 * (avaliação) fazem a mesma conta, ou um aprova o que o outro recusa.
 */

import type { Rhyme } from '@escandir/engine';

/** Última palavra da linha, que é onde a rima cai. */
export function lastWord(text: string): string {
  const palavras = text.toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu);
  return palavras === null ? '' : (palavras[palavras.length - 1] ?? '');
}

/** Letra do verso `i`. O esquema cicla, como no editor. Vazio = sem rima. */
export function letterAt(scheme: string, i: number): string {
  if (scheme === '') return '';
  return scheme[i % scheme.length] ?? '';
}

/**
 * O que vem antes do bloco pedido e já está no poema: a rima dos versos
 * escritos, para que a estrofe nova continue o esquema em vez de recomeçá-lo.
 */
export interface SchemeLead {
  readonly texts: readonly string[];
  readonly rhymes: readonly Rhyme[];
}

export interface SchemeCheck {
  readonly letter: string;
  /** Verso (numerado desde o começo do bloco pedido) com quem este rima, ou `null`. */
  readonly ref: number | null;
  readonly target: Rhyme | null;
  /** Palavras que já fecham versos desta letra. Repeti-las não é rimar. */
  readonly used: readonly string[];
}

/**
 * O alvo de cada linha é o verso anterior **mais próximo** com a mesma letra —
 * a mesma escolha de `rhymeTargetFor` no editor, para que o que se aceita aqui
 * continue rimando quando for medido lá.
 *
 * `scheme` começa no primeiro verso de `lead`, não no primeiro do bloco: o
 * bloco é a continuação do que já está escrito. `ref` negativo aponta para
 * dentro do que já estava no poema.
 */
export function schemeChecks(
  texts: readonly string[],
  rhymesOf: readonly Rhyme[],
  scheme: string,
  lead: SchemeLead = { texts: [], rhymes: [] },
): SchemeCheck[] {
  const offset = lead.texts.length;
  const todos = [...lead.texts, ...texts];
  const rimas = [...lead.rhymes, ...rhymesOf];
  return texts.map((_, i) => {
    const k = offset + i;
    const letter = letterAt(scheme, k);
    if (letter === '') return { letter, ref: null, target: null, used: [] };
    let ref: number | null = null;
    const used: string[] = [];
    for (let j = k - 1; j >= 0; j -= 1) {
      if (letterAt(scheme, j) !== letter) continue;
      const palavra = lastWord(todos[j] ?? '');
      if (palavra !== '') used.push(palavra);
      if (ref === null && (rimas[j]?.sound ?? '') !== '') ref = j;
    }
    return {
      letter,
      ref: ref === null ? null : ref - offset,
      target: ref === null ? null : (rimas[ref] ?? null),
      used,
    };
  });
}

/**
 * O esquema dito por extenso, para o pedido. "ABBA" sozinho o modelo lê como
 * enfeite; "o 4º rima com o 1º" ele consegue cumprir.
 */
export function describeScheme(scheme: string, verses: number, offset: number): string[] {
  if (scheme === '' || verses <= 0) return [];
  const letras = Array.from({ length: verses }, (_, i) => letterAt(scheme, offset + i));
  const grupos = new Map<string, number[]>();
  letras.forEach((letra, i) => grupos.set(letra, [...(grupos.get(letra) ?? []), i + 1]));
  const pares = [...grupos.entries()]
    .filter(([, nums]) => nums.length > 1)
    .map(([letra, nums]) => `${letra}: versos ${nums.map((n) => `${n}º`).join(', ')}`);
  return [`Esquema de rima, verso a verso: ${letras.join('')}`, ...pares.map((p) => `  ${p} rimam entre si`)];
}
