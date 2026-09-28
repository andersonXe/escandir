/**
 * O dicionário de rimas como ferramenta do modelo.
 *
 * Mesmo truque que resolveu a métrica, aplicado à rima: em vez de pedir que o
 * modelo lembre palavras que rimam — coisa que ele faz por aproximação, e
 * acaba inventando rima que não rima —, dá-se a consulta. A chave é de som e
 * não de letra, o que amplia o repertório dele em vez de só corrigi-lo.
 *
 * **A lista não é a mesma a cada consulta.** A primeira versão devolvia as 80
 * primeiras do léxico, que vem ordenado do comum ao raro — as mesmas 80, na
 * mesma ordem, em todo pedido. O modelo escolhia entre elas, e as rimas do
 * poema convergiam para o mesmo punhado de palavras frequentes. Agora cada
 * consulta é uma amostra nova de cada faixa de frequência, e consultar de novo
 * traz outras palavras.
 *
 * **As da obra vêm à parte.** Palavras que o autor já escreveu — no tema, no
 * título, nos versos, nos comentários — e que rimam com o alvo formam um grupo
 * próprio. É a ligação com o tema que sai de graça, sem modelo semântico: não
 * se adivinha o que é "do assunto", lê-se o que o autor escreveu. O resto da
 * relação com o tema fica com o modelo, que escolhe na amostra; a ferramenta
 * não ordena por proximidade de sentido, que é decisão de produto em aberto.
 */

import { BAND_DICTIONARY, BAND_TRADITION, type Lexicon, type LexiconEntry } from '@escandir/lexicon';
import type { MetricSpec, Rhyme } from '@escandir/engine';

import type { ToolDefinition } from './types.js';

export const RIMAS = 'rimas';

/**
 * Quantas de cada grupo entram numa consulta. O dicionário vem por último e
 * em poucas: é em boa parte termo técnico, que o léxico guarda para a palavra
 * rara não sumir, mas que raramente serve a um verso.
 */
const AMOSTRA = { comuns: 20, correntes: 25, tradicao: 20, raras: 15, dicionario: 8 } as const;

export function rimasTool(rhymeTarget: Rhyme, spec: MetricSpec): ToolDefinition {
  return {
    name: RIMAS,
    description: [
      `Lista palavras que rimam com "-${rhymeTarget.tail}" de verdade, por som:`,
      'grafias diferentes com o mesmo som entram juntas.',
      'O grupo "da_obra" traz as que o autor já escreveu no tema, no título, nos',
      'versos ou nos comentários — são as mais ligadas ao poema; olhe-as primeiro.',
      'As outras são uma amostra ao acaso: "comuns", "correntes" e "raras" pela',
      'frequência na fala; "tradicao", palavras que a poesia de língua portuguesa',
      'usa e a fala quase não; "dicionario", vocabulário técnico, só em último caso.',
      'Cada consulta traz palavras diferentes, então consulte de novo se nenhuma',
      'servir ao tema. Escolha pela obra, não pela primeira da lista.',
      spec.syllables > 0
        ? `O verso tem ${spec.syllables} sílabas, então a última palavra precisa caber no que sobrar.`
        : '',
      'Filtre por número de sílabas da palavra para achar a que encaixa.',
    ]
      .filter((linha) => linha !== '')
      .join(' '),
    parameters: {
      type: 'object',
      properties: {
        silabas: {
          type: 'integer',
          description: 'Só palavras com este número de sílabas. Omita para ver todas.',
        },
        tonica: {
          type: 'integer',
          description:
            'Posição da tônica contada do fim: 1 oxítona, 2 paroxítona, 3 proparoxítona. ' +
            'Determina se o verso fecha na última sílaba ou sobra extramétrica.',
        },
        evitar: {
          type: 'array',
          items: { type: 'string' },
          description: 'Palavras a não devolver: as já usadas, ou as que você já viu e descartou.',
        },
      },
      additionalProperties: false,
    },
  };
}

interface Args {
  readonly silabas?: number;
  readonly tonica?: number;
  readonly evitar?: readonly string[];
}

function parseArgs(raw: string): Args {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const silabas = typeof parsed['silabas'] === 'number' ? parsed['silabas'] : undefined;
    const tonica = typeof parsed['tonica'] === 'number' ? parsed['tonica'] : undefined;
    const evitar = Array.isArray(parsed['evitar'])
      ? parsed['evitar'].filter((v): v is string => typeof v === 'string')
      : undefined;
    return {
      ...(silabas === undefined ? {} : { silabas }),
      ...(tonica === undefined ? {} : { tonica }),
      ...(evitar === undefined ? {} : { evitar }),
    };
  } catch {
    return {};
  }
}

/** Palavras de um texto, em minúscula. A mesma regra de `lastWord`. */
export function wordsOf(texts: readonly string[]): Set<string> {
  const palavras = new Set<string>();
  for (const texto of texts) {
    for (const palavra of texto.toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu) ?? []) palavras.add(palavra);
  }
  return palavras;
}

/** `n` elementos ao acaso, sem repetir. Fisher–Yates parcial. */
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

type Grupo = keyof typeof AMOSTRA;

function grupoDe(band: number): Grupo {
  if (band === BAND_TRADITION) return 'tradicao';
  if (band === BAND_DICTIONARY) return 'dicionario';
  if (band <= 1) return 'comuns';
  if (band <= 3) return 'correntes';
  return 'raras';
}

/**
 * Amostra por grupo: comuns e raras lado a lado, sem ranquear. A ordem das
 * chaves é a ordem em que o modelo lê — o dicionário por último.
 */
function amostrar(entries: readonly LexiconEntry[], random: () => number): Record<string, string[]> {
  const porGrupo = new Map<Grupo, string[]>();
  for (const entry of entries) {
    const grupo = grupoDe(entry.band);
    porGrupo.set(grupo, [...(porGrupo.get(grupo) ?? []), entry.word]);
  }
  const grupos: Record<string, string[]> = {};
  for (const grupo of Object.keys(AMOSTRA) as Grupo[]) {
    const escolhidas = sortear(porGrupo.get(grupo) ?? [], AMOSTRA[grupo], random);
    if (escolhidas.length > 0) grupos[grupo] = escolhidas;
  }
  return grupos;
}

export interface RimasOptions {
  /** Palavras que o autor escreveu: tema, título, versos, comentários. */
  readonly obra?: ReadonlySet<string>;
  /** Fonte de acaso. Existe para o teste poder fixá-la. */
  readonly random?: () => number;
}

export async function runRimas(
  rawArguments: string,
  lexicon: Lexicon,
  rhymeTarget: Rhyme,
  usedRhymeWords: readonly string[] = [],
  options: RimasOptions = {},
): Promise<string> {
  const args = parseArgs(rawArguments);
  const random = options.random ?? Math.random;
  // As já usadas somem da lista mesmo que o modelo não peça: oferecer a
  // palavra que ele não pode usar é convidar ao erro.
  const evitar = [...(args.evitar ?? []), ...usedRhymeWords];
  const total = await lexicon.count(rhymeTarget.sound);
  // Todas as que passam no filtro: a amostra se tira daqui, e não das
  // primeiras, que seriam sempre as mesmas.
  const entries = await lexicon.rhymes({
    sound: rhymeTarget.sound,
    ...(args.silabas === undefined ? {} : { syllables: args.silabas }),
    ...(args.tonica === undefined ? {} : { stressFromEnd: args.tonica }),
    ...(evitar.length === 0 ? {} : { exclude: evitar }),
    limit: Number.MAX_SAFE_INTEGER,
  });

  if (entries.length === 0) {
    return JSON.stringify({
      rima: rhymeTarget.tail,
      total,
      aviso:
        total === 0
          ? 'nenhuma palavra rima com esta terminação no léxico'
          : 'nenhuma com esses filtros; tente outro número de sílabas',
      palavras: {},
    });
  }

  const obra = options.obra ?? new Set<string>();
  const daObra = entries.filter((entry) => obra.has(entry.word)).map((entry) => entry.word);
  const resto = entries.filter((entry) => !obra.has(entry.word));
  const palavras = {
    ...(daObra.length > 0 ? { da_obra: daObra } : {}),
    // Agrupadas, não ordenadas por preferência: a escolha é de quem escreve.
    ...amostrar(resto, random),
  };

  return JSON.stringify({
    rima: rhymeTarget.tail,
    total,
    disponiveis: entries.length,
    mostrando: Object.values(palavras).reduce((n, lista) => n + lista.length, 0),
    palavras,
  });
}
