/**
 * O motor como ferramenta do modelo.
 *
 * Esta é a correção de fundo, e vale mais que qualquer redação de prompt:
 * LLM não conta sílaba poética confiavelmente, e nenhuma explicação conserta
 * isso — é limitação de como ela lê texto, não falta de instrução. Mas ela
 * sabe *usar* quem conta. Então em vez de pedir que conte, dá-se a régua.
 *
 * A ferramenta executa **no navegador**, contra o mesmo motor que mede o poema
 * na tela. Não há servidor, não custa nada, e responde em fração de
 * milissegundo — dá para chamar dezenas de vezes numa proposta só.
 */

import {
  assess,
  createAnalyzer,
  ptBR,
  rhymeOf,
  rhymes,
  scanVerse,
  type MetricSpec,
  type Rhyme,
} from '@escandir/engine';

import type { ToolDefinition } from './types.js';

const analyzer = createAnalyzer(ptBR);

export const ESCANDIR = 'escandir';

/**
 * Moldura do trecho, quando o pedido é de fragmento.
 *
 * O que se mede aí não é o trecho: é o verso com ele no lugar. Sem isto a
 * régua devolve "falta 7 sílabas" para todo pedaço curto, o modelo conclui
 * que nada serve e responde vazio — foi exatamente o que aconteceu.
 */
export interface Frame {
  readonly before: string;
  readonly after: string;
}

function encaixar(texto: string, frame?: Frame): string {
  return frame === undefined ? texto : frame.before + texto + frame.after;
}

export function toolsFor(
  spec: MetricSpec,
  rhymeTarget: Rhyme | null,
  frame?: Frame,
): ToolDefinition[] {
  const alvo =
    spec.syllables > 0
      ? `A forma pedida é de ${spec.syllables} sílabas${
          spec.requiredStresses.length > 0
            ? ` com tônica obrigatória na ${spec.requiredStresses.map((p) => `${p}ª`).join(' e na ')}`
            : ''
        }${rhymeTarget !== null && rhymeTarget.tail !== '' ? `, rimando em "-${rhymeTarget.tail}" (por som, não por letra)` : ''}.`
      : 'A forma pedida é verso livre.';

  return [
    {
      name: ESCANDIR,
      description: [
        frame === undefined
          ? 'Mede um verso em português:'
          : `Mede o verso inteiro com o seu trecho no lugar: encaixa o que você mandar entre "${frame.before}" e "${frame.after}", e mede o resultado. Mande só o trecho, nunca o verso todo.`,
        'Separa as sílabas poéticas, marca as tônicas,',
        'Devolve a contagem correta — use sempre, não confie na sua própria contagem.',
        alvo,
        'Chame para cada verso que você cogitar, antes de responder. Se não fechar,',
        'reescreva e meça de novo.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          versos: {
            type: 'array',
            items: { type: 'string' },
            description:
              frame === undefined
                ? 'Um ou mais versos a medir, cada um como uma linha de texto.'
                : 'Um ou mais trechos candidatos. Só o trecho, sem o resto do verso.',
          },
        },
        required: ['versos'],
        additionalProperties: false,
      },
    },
  ];
}

interface Medida {
  readonly verso: string;
  readonly silabas: string;
  readonly contagem: number;
  readonly total: number;
  readonly tonicas: number[];
  readonly rima: string;
  readonly cabe: boolean;
  readonly problema?: string;
}

function medir(
  bruto: string,
  spec: MetricSpec,
  rhymeTarget: Rhyme | null,
  frame?: Frame,
): Medida {
  const texto = encaixar(bruto, frame);
  const reading = scanVerse(texto, ptBR, analyzer, { spec }).best;
  if (reading === null) {
    return {
      verso: texto,
      silabas: '',
      contagem: 0,
      total: 0,
      tonicas: [],
      rima: '',
      cabe: false,
      problema: 'sem sílabas',
    };
  }
  const result = assess(reading, spec);
  const rima = rhymeOf(reading, texto, ptBR.prosody);
  const tonicas = reading.syllables
    .map((s, i) => (s.stressStrength === 'strong' ? i + 1 : 0))
    .filter((p) => p > 0);

  const rimaErrada =
    rhymeTarget !== null && rhymeTarget.sound !== '' && !rhymes(rima, rhymeTarget);
  const problemas: string[] = [];
  if (result.status === 'over') problemas.push(`sobra ${result.delta}`);
  if (result.status === 'under') problemas.push(`falta ${-result.delta}`);
  if (result.status === 'rhythm') {
    const falha = result.diagnostics.find((d) => d.kind === 'stress');
    if (falha?.kind === 'stress') problemas.push(`sem tônica na ${falha.expected}ª`);
  }
  if (rimaErrada) problemas.push(`rima em "-${rima.tail}", precisa ser "-${rhymeTarget?.tail ?? ''}"`);

  return {
    verso: texto,
    // A divisão explícita ensina mais que o número: o modelo vê onde as
    // elisões aconteceram e onde a contagem parou.
    silabas: reading.syllables
      .map((s, i) => {
        const marca = s.stressStrength === 'strong' ? s.text.toUpperCase() : s.text;
        return i + 1 > result.count ? `(${marca})` : marca;
      })
      .join('|'),
    contagem: result.count,
    total: reading.total,
    tonicas,
    rima: rima.tail,
    cabe: problemas.length === 0,
    ...(problemas.length === 0 ? {} : { problema: problemas.join('; ') }),
  };
}

/**
 * Executa a chamada de ferramenta. O resultado volta como JSON porque é o que
 * o modelo lê melhor, e traz a divisão silábica junto: ver "so|breo|MAR"
 * corrige a intuição dele de um jeito que o número sozinho não corrige.
 */
export function runTool(
  name: string,
  rawArguments: string,
  spec: MetricSpec,
  rhymeTarget: Rhyme | null,
  frame?: Frame,
): string {
  if (name !== ESCANDIR) return JSON.stringify({ erro: `ferramenta desconhecida: ${name}` });

  let versos: unknown;
  try {
    versos = (JSON.parse(rawArguments) as { versos?: unknown }).versos;
  } catch {
    return JSON.stringify({ erro: 'argumentos não são JSON válido' });
  }

  const lista = Array.isArray(versos)
    ? versos.filter((v): v is string => typeof v === 'string')
    : typeof versos === 'string'
      ? [versos]
      : [];

  if (lista.length === 0) return JSON.stringify({ erro: 'nenhum verso recebido' });

  return JSON.stringify({
    legenda: 'silabas: divisão da leitura; MAIÚSCULA = tônica; (parênteses) = extramétrica, não conta',
    medidas: lista.slice(0, 12).map((verso) => medir(verso, spec, rhymeTarget, frame)),
  });
}
