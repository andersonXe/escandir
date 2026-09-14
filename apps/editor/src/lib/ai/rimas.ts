/**
 * O dicionário de rimas como ferramenta do modelo.
 *
 * Mesmo truque que resolveu a métrica, aplicado à rima: em vez de pedir que o
 * modelo lembre palavras que rimam — coisa que ele faz por aproximação, e
 * acaba inventando rima que não rima —, dá-se a consulta.
 *
 * A diferença aqui é que a consulta sabe o que ele não sabe: que "caça" rima
 * com "massa" e "praça", porque a chave é de som e não de letra. Isso amplia o
 * repertório dele em vez de só corrigi-lo.
 */

import type { Lexicon, LexiconEntry } from '@escandir/lexicon';
import type { MetricSpec, Rhyme } from '@escandir/engine';

import type { ToolDefinition } from './types.js';

export const RIMAS = 'rimas';

export function rimasTool(rhymeTarget: Rhyme, spec: MetricSpec): ToolDefinition {
  return {
    name: RIMAS,
    description: [
      `Lista palavras que rimam com "-${rhymeTarget.tail}" de verdade, por som.`,
      'Grafias diferentes com o mesmo som entram juntas: quem rima com "massa"',
      'rima com "caça" e "praça". Use antes de escolher a palavra final do verso —',
      'é um dicionário, não um palpite.',
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
          description: 'Palavras já usadas no poema, para não repetir.',
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

/** Agrupa por faixa de frequência: comuns e raras lado a lado, sem ranquear. */
function agrupar(entries: readonly LexiconEntry[]): Record<string, string[]> {
  const comuns: string[] = [];
  const correntes: string[] = [];
  const raras: string[] = [];
  for (const entry of entries) {
    if (entry.band <= 1) comuns.push(entry.word);
    else if (entry.band <= 3) correntes.push(entry.word);
    else raras.push(entry.word);
  }
  return {
    ...(comuns.length > 0 ? { comuns } : {}),
    ...(correntes.length > 0 ? { correntes } : {}),
    ...(raras.length > 0 ? { raras } : {}),
  };
}

export async function runRimas(
  rawArguments: string,
  lexicon: Lexicon,
  rhymeTarget: Rhyme,
  usedRhymeWords: readonly string[] = [],
): Promise<string> {
  const args = parseArgs(rawArguments);
  // As já usadas somem da lista mesmo que o modelo não peça: oferecer a
  // palavra que ele não pode usar é convidar ao erro.
  const evitar = [...(args.evitar ?? []), ...usedRhymeWords];
  const total = await lexicon.count(rhymeTarget.sound);
  const entries = await lexicon.rhymes({
    sound: rhymeTarget.sound,
    ...(args.silabas === undefined ? {} : { syllables: args.silabas }),
    ...(args.tonica === undefined ? {} : { stressFromEnd: args.tonica }),
    ...(evitar.length === 0 ? {} : { exclude: evitar }),
    limit: 80,
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

  return JSON.stringify({
    rima: rhymeTarget.tail,
    total,
    mostrando: entries.length,
    // Agrupadas, não ordenadas por preferência: a escolha é de quem escreve.
    palavras: agrupar(entries),
  });
}
