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
  /**
   * Verso (numerado desde o começo do bloco pedido) com quem este rima, ou
   * `null`. Negativo aponta para `lead`; de `texts.length` em diante, para
   * `trail`. Use `insideBlock` para saber se é do próprio bloco.
   */
  readonly ref: number | null;
  readonly target: Rhyme | null;
  /** Palavras que já fecham versos desta letra. Repeti-las não é rimar. */
  readonly used: readonly string[];
}

const NENHUM: SchemeLead = { texts: [], rhymes: [] };

/**
 * O alvo de cada linha é o verso anterior **mais próximo** com a mesma letra;
 * não havendo nenhum antes, o primeiro **depois** do bloco. É a mesma escolha
 * de `rhymeTargetFor` no editor, para que o que se aceita aqui continue
 * rimando quando for medido lá.
 *
 * O "depois" existe porque poeta compõe de trás para frente: escreve o fecho
 * primeiro e rima os anteriores com ele. Olhando só para trás, o verso 11 não
 * via que tinha de rimar com o 14 já escrito, e a régua aprovava qualquer rima.
 *
 * `scheme` começa no primeiro verso de `lead`, não no primeiro do bloco: o
 * bloco é a continuação do que já está escrito. `trail` são os versos depois
 * do bloco, e só faz sentido quando o bloco tem tamanho fixo — é pela posição
 * que se sabe a letra de cada um.
 */
export function schemeChecks(
  texts: readonly string[],
  rhymesOf: readonly Rhyme[],
  scheme: string,
  lead: SchemeLead = NENHUM,
  trail: SchemeLead = NENHUM,
): SchemeCheck[] {
  const offset = lead.texts.length;
  const fim = offset + texts.length;
  const todos = [...lead.texts, ...texts, ...trail.texts];
  const rimas = [...lead.rhymes, ...rhymesOf, ...trail.rhymes];
  return texts.map((_, i) => {
    const k = offset + i;
    const letter = letterAt(scheme, k);
    if (letter === '') return { letter, ref: null, target: null, used: [] };
    // Para trás primeiro, do mais próximo ao mais longe; depois os de depois
    // do bloco. Os do próprio bloco depois deste são conferidos na vez deles.
    const ordem: number[] = [];
    for (let j = k - 1; j >= 0; j -= 1) ordem.push(j);
    for (let j = fim; j < todos.length; j += 1) ordem.push(j);

    let ref: number | null = null;
    const used: string[] = [];
    for (const j of ordem) {
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

/** O parceiro de rima é um verso do próprio bloco, e não do que já estava escrito. */
export function insideBlock(check: SchemeCheck, blockSize: number): boolean {
  return check.ref !== null && check.ref >= 0 && check.ref < blockSize;
}

/** O verso já escrito com quem este rima, fora do bloco. Vazio se não há. */
export function writtenPartner(
  check: SchemeCheck,
  blockSize: number,
  lead: SchemeLead,
  trail: SchemeLead = NENHUM,
): string {
  if (check.ref === null || insideBlock(check, blockSize)) return '';
  return check.ref < 0
    ? (lead.texts[lead.texts.length + check.ref] ?? '')
    : (trail.texts[check.ref - blockSize] ?? '');
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
