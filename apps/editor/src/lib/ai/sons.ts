/**
 * Sons parecidos como ferramenta do modelo.
 *
 * Rima é só um dos jogos de som de um poema. Os outros — a palavra que ecoa a
 * vizinha trocando um som ("mar" e "amar"), a de mesmo som e outro sentido
 * ("cela" e "sela"), a repetição da consoante do começo, a da sequência de
 * vogais — o modelo faz de ouvido, e ouvido é justamente o que ele não tem:
 * lê grafia, não som. É o mesmo problema da métrica e da rima, com a mesma
 * saída: dar a consulta em vez de pedir o palpite.
 *
 * Tudo se mede sobre a chave fonêmica que o motor já usa para rima, aplicada à
 * palavra inteira. Não é transcrição fonética, e não precisa ser: é o
 * bastante para "casa" e "caça" ficarem a um som de distância, e "cela" e
 * "sela" a nenhum.
 */

import { ptBR, type MetricSpec } from '@escandir/engine';
import { BAND_TRADITION, type Lexicon, type LexiconEntry } from '@escandir/lexicon';

import type { ToolDefinition } from './types.js';

export const SONS = 'sons';

const MODOS = ['homofonas', 'parecidas', 'aliteracao', 'assonancia'] as const;
type Modo = (typeof MODOS)[number];

/** Quantas por modo quando se pedem todos, e quando se pede um só. */
const POR_MODO = 20;
const MODO_UNICO = 60;

/** Comuns na fala, e a tradição: o que a amostra oferece primeiro. */
const PREFERIDAS: ReadonlySet<number> = new Set([0, 1, BAND_TRADITION]);

export function sonsTool(spec: MetricSpec): ToolDefinition {
  return {
    name: SONS,
    description: [
      'Acha palavras pelo som, a partir de uma palavra sua. Quatro jogos:',
      '"homofonas" — mesmo som, outra grafia e outro sentido;',
      '"parecidas" — diferem por um som só, o eco que aproxima duas palavras;',
      '"aliteracao" — começam com o mesmo som;',
      '"assonancia" — têm a mesma sequência de vogais.',
      'As palavras que o autor já escreveu vêm à parte, em "da_obra".',
      'Use quando o jogo de som servir ao verso; não é obrigação.',
      spec.syllables > 0 ? 'Filtre por número de sílabas para caber na medida.' : '',
    ]
      .filter((linha) => linha !== '')
      .join(' '),
    parameters: {
      type: 'object',
      properties: {
        palavra: { type: 'string', description: 'A palavra de partida.' },
        modo: {
          type: 'string',
          enum: [...MODOS],
          description: 'Um jogo só, com mais resultados. Omita para ver os quatro.',
        },
        silabas: { type: 'integer', description: 'Só palavras com este número de sílabas.' },
        evitar: { type: 'array', items: { type: 'string' }, description: 'Palavras a não devolver.' },
      },
      required: ['palavra'],
      additionalProperties: false,
    },
  };
}

/** Sons da palavra, um por posição; a nasalização vai junto da vogal. */
export function soundTokens(palavra: string): string[] {
  const chave = ptBR.prosody.rhymeSound(palavra);
  const tokens: string[] = [];
  for (const c of chave) {
    if (c === '~' && tokens.length > 0) tokens[tokens.length - 1] += '~';
    else tokens.push(c);
  }
  return tokens;
}

const VOGAL = /^[aeiou]~?$/;

/** As vogais, sem as semivogais: é o que a assonância repete. */
function vogais(tokens: readonly string[]): string {
  return tokens.filter((t) => VOGAL.test(t)).join('.');
}

/** O começo: as consoantes até a primeira vogal, ou a própria vogal inicial. */
function ataque(tokens: readonly string[]): string {
  const primeira = tokens.findIndex((t) => VOGAL.test(t));
  if (primeira === 0) return tokens[0] ?? '';
  return tokens.slice(0, primeira < 0 ? tokens.length : primeira).join('.');
}

/** Distância exatamente um: uma troca, uma inserção ou uma supressão. */
function umSomDeDistancia(a: readonly string[], b: readonly string[]): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let diferencas = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    diferencas += 1;
    if (diferencas > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  diferencas += a.length - i + (b.length - j);
  return diferencas === 1;
}

interface Chaveada {
  readonly entry: LexiconEntry;
  readonly tokens: readonly string[];
  readonly som: string;
  readonly vogais: string;
  readonly ataque: string;
}

/**
 * A lista com o som de cada palavra, calculado uma vez. São 135 mil chaves;
 * refazer a cada consulta custaria um décimo de segundo à toa.
 */
const cache = new WeakMap<readonly LexiconEntry[], Chaveada[]>();

function chavear(entries: readonly LexiconEntry[]): Chaveada[] {
  const pronta = cache.get(entries);
  if (pronta !== undefined) return pronta;
  const lista = entries
    // Forma com pronome ("vê-la") e composto ("porta-bandeira") só poluem o
    // jogo de som: o que se quer é a palavra.
    .filter((entry) => !entry.word.includes('-'))
    .map((entry): Chaveada => {
      const tokens = soundTokens(entry.word);
      return { entry, tokens, som: tokens.join('.'), vogais: vogais(tokens), ataque: ataque(tokens) };
    });
  cache.set(entries, lista);
  return lista;
}

function sortear<T>(itens: readonly T[], n: number, random: () => number): T[] {
  const copia = [...itens];
  const limite = Math.min(n, copia.length);
  for (let i = 0; i < limite; i += 1) {
    const j = i + Math.floor(random() * (copia.length - i));
    const tmp = copia[i] as T;
    copia[i] = copia[j] as T;
    copia[j] = tmp;
  }
  return copia.slice(0, limite);
}

interface Args {
  readonly palavra: string;
  readonly modo?: Modo;
  readonly silabas?: number;
  readonly evitar: readonly string[];
}

function parseArgs(raw: string): Args | null {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const palavra = typeof p['palavra'] === 'string' ? p['palavra'].trim().toLowerCase() : '';
    if (palavra === '') return null;
    const modo = MODOS.find((m) => m === p['modo']);
    const silabas = typeof p['silabas'] === 'number' ? p['silabas'] : undefined;
    const evitar = Array.isArray(p['evitar']) ? p['evitar'].filter((v): v is string => typeof v === 'string') : [];
    return {
      palavra,
      evitar: evitar.map((v) => v.toLowerCase()),
      ...(modo === undefined ? {} : { modo }),
      ...(silabas === undefined ? {} : { silabas }),
    };
  } catch {
    return null;
  }
}

export interface SonsOptions {
  /** Palavras que o autor escreveu: tema, título, versos, comentários. */
  readonly obra?: ReadonlySet<string>;
  readonly random?: () => number;
}

export async function runSons(rawArguments: string, lexicon: Lexicon, options: SonsOptions = {}): Promise<string> {
  const args = parseArgs(rawArguments);
  if (args === null) return JSON.stringify({ erro: 'mande {"palavra": "..."}' });
  const random = options.random ?? Math.random;
  const obra = options.obra ?? new Set<string>();

  const lista = chavear(await lexicon.words());
  const alvo = soundTokens(args.palavra);
  const som = alvo.join('.');
  const alvoVogais = vogais(alvo);
  const alvoAtaque = ataque(alvo);
  const fora = new Set([args.palavra, ...args.evitar]);

  const casa: Record<Modo, (c: Chaveada) => boolean> = {
    homofonas: (c) => c.som === som,
    parecidas: (c) => umSomDeDistancia(c.tokens, alvo),
    aliteracao: (c) => alvoAtaque !== '' && c.ataque === alvoAtaque,
    // Palavra de uma vogal só casa com metade do léxico: não diz nada.
    assonancia: (c) => alvoVogais.includes('.') && c.vogais === alvoVogais,
  };
  const modos: readonly Modo[] = args.modo === undefined ? MODOS : [args.modo];
  const quantas = args.modo === undefined ? POR_MODO : MODO_UNICO;

  const resultado: Record<string, unknown> = { palavra: args.palavra, som: alvo.join('') };
  for (const modo of modos) {
    const achadas = lista
      .filter((c) => !fora.has(c.entry.word))
      .filter((c) => args.silabas === undefined || c.entry.syllables === args.silabas)
      .filter(casa[modo]);
    const daObra = achadas.filter((c) => obra.has(c.entry.word)).map((c) => c.entry.word);
    const resto = achadas.filter((c) => !obra.has(c.entry.word));
    // Homófonas são poucas e valem todas; o resto é amostra, nova a cada vez.
    //
    // A amostra sai primeiro do que é comum ou da tradição, e só completa com
    // o resto se faltar. Aliteração em "m" são sete mil palavras, e sorteadas
    // sem preferência vinham "montanhismo" e "maldosamente".
    const preferidas = resto.filter((c) => PREFERIDAS.has(c.entry.band)).map((c) => c.entry.word);
    const demais = resto.filter((c) => !PREFERIDAS.has(c.entry.band)).map((c) => c.entry.word);
    const amostra =
      modo === 'homofonas'
        ? [...preferidas, ...demais].slice(0, quantas)
        : [
            ...sortear(preferidas, quantas, random),
            ...sortear(demais, Math.max(0, quantas - preferidas.length), random),
          ];
    resultado[modo] = {
      ...(daObra.length > 0 ? { da_obra: daObra.slice(0, quantas) } : {}),
      total: achadas.length,
      palavras: amostra,
    };
  }
  return JSON.stringify(resultado);
}
