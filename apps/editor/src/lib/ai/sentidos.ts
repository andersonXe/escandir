/**
 * Duplo sentido como ferramenta do modelo.
 *
 * Diferente das outras. Contagem, rima e som são o que o modelo não percebe,
 * porque lê grafia; significado é o que ele mais domina. O que ele não tem de
 * cabeça é a lista **completa e confiável** das acepções — que "sela" é o
 * assento do cavalo e é "ele sela a carta"; que "canto" é canção, esquina,
 * divisão de epopeia e "eu canto". Para fazer uma palavra valer por duas no
 * mesmo verso, é essa lista que se consulta.
 *
 * Os dados vêm do Wiktionary em português (CC BY-SA 4.0, ver NOTICE.md). Só
 * estão lá as palavras com dois sentidos ou mais; a ausência quer dizer "sem
 * registro de outro sentido", e o modelo é avisado disso — o dicionário tem
 * lacunas ("mar" tem uma acepção só lá), e ele pode saber o que falta.
 */

import type { Lexicon } from '@escandir/lexicon';

import type { ToolDefinition } from './types.js';

export const SENTIDOS = 'sentidos';

/** Teto de palavras por consulta: o bastante para as candidatas de um verso. */
const MAX_PALAVRAS = 16;

export function sentidosTool(): ToolDefinition {
  return {
    name: SENTIDOS,
    description: [
      'Lista as acepções de palavras em português, para o duplo sentido: a palavra',
      'que, no verso, pode ser lida de duas maneiras, as duas servindo ao poema.',
      'Mande as palavras que cogita — da obra do autor, candidatas a fechar o verso,',
      'palavras do tema. Formas flexionadas trazem os sentidos da palavra-base, entre',
      'parênteses. Palavra sem registro não é necessariamente de sentido único: o',
      'dicionário tem lacunas. Use quando a ambiguidade servir ao verso; não é obrigação.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        palavras: {
          type: 'array',
          items: { type: 'string' },
          description: `Até ${MAX_PALAVRAS} palavras.`,
        },
      },
      required: ['palavras'],
      additionalProperties: false,
    },
  };
}

function parseArgs(raw: string): string[] | null {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const lista = Array.isArray(p['palavras']) ? p['palavras'] : typeof p['palavra'] === 'string' ? [p['palavra']] : [];
    const palavras = lista
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim().toLowerCase().normalize('NFC'))
      .filter((v) => v !== '');
    return palavras.length === 0 ? null : [...new Set(palavras)].slice(0, MAX_PALAVRAS);
  } catch {
    return null;
  }
}

export interface SentidosOptions {
  /** Palavras que o autor escreveu, para marcar quais são dele. */
  readonly obra?: ReadonlySet<string>;
}

export async function runSentidos(
  rawArguments: string,
  lexicon: Lexicon,
  options: SentidosOptions = {},
): Promise<string> {
  const palavras = parseArgs(rawArguments);
  if (palavras === null) return JSON.stringify({ erro: 'mande {"palavras": ["..."]}' });
  const obra = options.obra ?? new Set<string>();
  const achados = await lexicon.senses(palavras);
  const resultado: Record<string, unknown> = {};
  for (const palavra of palavras) {
    const sentidos = achados.get(palavra);
    resultado[palavra] = {
      ...(obra.has(palavra) ? { da_obra: true } : {}),
      ...(sentidos === undefined ? { sentidos: [], nota: 'sem registro de outro sentido' } : { sentidos }),
    };
  }
  return JSON.stringify(resultado);
}
