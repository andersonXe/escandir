/**
 * O laço de proposta: pedir, medir, ranquear.
 *
 * O ponto todo está no "medir". LLM erra contagem de sílaba com frequência e
 * com confiança; este motor conta certo em fração de milissegundo. Então
 * nenhum candidato chega ao autor sem ter sido escandido contra a forma
 * declarada — o que não fecha aparece marcado, nunca disfarçado de certo.
 *
 * Provedor nenhum é mencionado aqui. Entra uma função que completa texto.
 */

import {
  assess,
  createAnalyzer,
  ptBR,
  rhymeOf,
  rhymes,
  scanVerse,
  NO_RHYME,
  type MetricSpec,
  type Rhyme,
  type VerseAssessment,
} from '@escandir/engine';

import type { Lexicon } from '@escandir/lexicon';

import { buildSystem, buildUser, SEPARATOR, type ProposalContext } from './prompt.js';
import { RIMAS, rimasTool, runRimas } from './rimas.js';
import { runTool, toolsFor, type Frame } from './tools.js';
import type { CompletionRequest, CompletionResult, Message } from './types.js';

const analyzer = createAnalyzer(ptBR);

export interface CandidateLine {
  readonly text: string;
  readonly assessment: VerseAssessment | null;
  readonly rhyme: Rhyme;
  readonly fitsMeter: boolean;
  readonly fitsRhyme: boolean;
}

export interface Candidate {
  readonly lines: readonly CandidateLine[];
  /** Todas as linhas fecham a forma e a rima pedida. */
  readonly ok: boolean;
  /** Resumo curto para a UI: "10 sílabas" ou "sobra 1 sílaba". */
  readonly detail: string;
}

/** Só isto o laço precisa saber de rede. */
export type Complete = (request: CompletionRequest) => Promise<CompletionResult>;

export interface ProposeOptions {
  readonly signal?: AbortSignal;
  /** Uma segunda tentativa quando nenhum candidato fecha a forma. */
  readonly retry?: boolean;
  /** O provedor aceita ferramenta. Quando não, o laço vira chamada simples. */
  readonly tools?: boolean;
  /** Teto de idas e voltas de ferramenta, para não rodar sem fim. */
  readonly maxToolRounds?: number;
  /** Última resposta crua, para a UI poder mostrar o que o modelo devolveu. */
  readonly onRaw?: (raw: string) => void;
  /** O pedido montado, para a UI poder mostrar o que foi perguntado. */
  readonly onSent?: (sent: string) => void;
  /** Progresso, para a espera não parecer travamento. */
  readonly onProgress?: (etapa: string) => void;
  /** Dicionário de rimas. Quando presente, vira o segundo tool do modelo. */
  readonly lexicon?: Lexicon;
}

const LIXO = /^\s*(?:[-*•]|\d+[.)])\s+/;

/** Tira numeração, marcador e aspas que o modelo insiste em pôr. */
function clean(line: string): string {
  return line
    .replace(LIXO, '')
    .replace(/^["“”'']+|["“”'']+$/g, '')
    .trim();
}

/**
 * Reparte a resposta crua nos candidatos. O separador é uma linha própria
 * porque candidato pode ter várias linhas — uma estrofe inteira — e aí quebra
 * de linha sozinha não distingue "três candidatos" de "um candidato de três
 * versos".
 */
export function splitCandidates(raw: string): string[][] {
  return raw
    .split(new RegExp(`^\\s*${SEPARATOR}+\\s*$`, 'm'))
    .map((bloco) =>
      bloco
        .split(/\r?\n/)
        .map(clean)
        .filter((line) => line !== ''),
    )
    .filter((linhas) => linhas.length > 0);
}

/** Última palavra da linha, que é onde a rima cai. */
function lastWord(text: string): string {
  const palavras = text.toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu);
  return palavras === null ? '' : (palavras[palavras.length - 1] ?? '');
}

function measure(
  text: string,
  spec: MetricSpec,
  rhymeTarget: Rhyme | null,
  usedRhymeWords: readonly string[] = [],
): CandidateLine {
  const scansion = scanVerse(text, ptBR, analyzer, { spec });
  const reading = scansion.best;
  if (reading === null) {
    return { text, assessment: null, rhyme: NO_RHYME, fitsMeter: false, fitsRhyme: false };
  }
  const assessment = assess(reading, spec);
  const rhyme = rhymeOf(reading, text, ptBR.prosody);
  return {
    text,
    assessment,
    rhyme,
    fitsMeter: assessment.status === 'ok' || assessment.status === 'free',
    // Som, não grafia: recusar "massa" por não ser "ça" seria recusar rima.
    // Mas a mesma palavra rimando com ela mesma não é rima, é repetição.
    fitsRhyme:
      !usedRhymeWords.includes(lastWord(text)) &&
      (rhymeTarget === null || rhymeTarget.sound === '' || rhymes(rhyme, rhymeTarget)),
  };
}

function describe(
  lines: readonly CandidateLine[],
  spec: MetricSpec,
  usadas: readonly string[] = [],
): string {
  const quebrado = lines.find((line) => !line.fitsMeter);
  if (quebrado === undefined) {
    const fora = lines.find((line) => !line.fitsRhyme);
    if (fora !== undefined) {
      return usadas.includes(lastWord(fora.text))
        ? `repete "${lastWord(fora.text)}"`
        : `rima em -${fora.rhyme.tail}`;
    }
    return spec.syllables > 0 ? `${spec.syllables} sílabas` : 'verso livre';
  }
  const diagnostic = quebrado.assessment?.diagnostics[0];
  if (diagnostic === undefined) return 'fora da forma';
  if (diagnostic.kind === 'count') {
    return diagnostic.delta > 0
      ? `sobra${diagnostic.delta === 1 ? ' 1 sílaba' : `m ${diagnostic.delta} sílabas`}`
      : `falta${-diagnostic.delta === 1 ? ' 1 sílaba' : `m ${-diagnostic.delta} sílabas`}`;
  }
  if (diagnostic.kind === 'stress') return `tônica na ${diagnostic.expected}ª`;
  return 'fora da forma';
}

/**
 * Num pedido de trecho, o modelo devolve só o pedaço. O que se mede — e o que
 * o autor vê e aceita — é o verso inteiro com o pedaço no lugar: medir o
 * fragmento sozinho não diria nada sobre a forma do verso.
 */
function frameOf(context: ProposalContext): Frame | undefined {
  const task = context.task;
  if (task.kind !== 'fragment') return undefined;
  return { before: task.line.slice(0, task.start), after: task.line.slice(task.end) };
}

function compose(text: string, context: ProposalContext): string {
  const frame = frameOf(context);
  return frame === undefined ? text : frame.before + text + frame.after;
}

/**
 * Descarta o que claramente não é proposta.
 *
 * Quando não acha nada que caiba, o modelo às vezes responde em prosa — pede
 * desculpas, faz pergunta. Isso entrava na lista como candidato de 47 sílabas.
 * O dobro do alvo é folga generosa: verso ruim passa e continua à mostra,
 * parágrafo não.
 */
function pareceProposta(candidate: Candidate, spec: MetricSpec): boolean {
  if (spec.syllables <= 0) return true;
  return candidate.lines.every((line) => (line.assessment?.count ?? 0) <= spec.syllables * 2);
}

export function evaluate(blocks: readonly string[][], context: ProposalContext): Candidate[] {
  const candidates = blocks.map((linhas): Candidate => {
    const lines = linhas.map((bruto) =>
      measure(compose(bruto, context), context.spec, context.rhymeTarget, context.usedRhymeWords),
    );
    const ok = lines.every((line) => line.fitsMeter && line.fitsRhyme);
    return { lines, ok, detail: describe(lines, context.spec, context.usedRhymeWords) };
  });

  // Os que fecham vêm primeiro. Os outros continuam à mostra, marcados: o autor
  // pode querer justamente o que passa da medida, e esconder seria decidir.
  return candidates
    .filter((candidate) => pareceProposta(candidate, context.spec))
    .sort((a, b) => Number(b.ok) - Number(a.ok));
}

/**
 * Poucas rodadas de propósito. Num modelo de raciocínio cada ida custa uns 15
 * segundos, e o pedido já manda medir tudo de uma vez — quem precisa de seis
 * rodadas não está convergindo, está tateando, e a espera vira inaceitável.
 */
const MAX_TOOL_ROUNDS = 3;

export async function propose(
  complete: Complete,
  context: ProposalContext,
  options: ProposeOptions = {},
): Promise<Candidate[]> {
  const useTools = options.tools !== false;
  const maxRounds = options.maxToolRounds ?? MAX_TOOL_ROUNDS;

  /**
   * Uma rodada de conversa. Enquanto o modelo pedir a régua, mede e devolve;
   * quando ele parar de pedir, é porque respondeu.
   *
   * O teto de rodadas existe para o caso de o modelo entrar em laço medindo
   * sem nunca concluir — acontece, e sai caro na conta de quem paga.
   */
  const ask = async (current: ProposalContext): Promise<Candidate[]> => {
    const system = buildSystem(current);
    const user = buildUser(current);
    options.onSent?.(`### SISTEMA\n${system}\n\n### PEDIDO\n${user}`);
    const messages: Message[] = [{ role: 'user', content: user }];
    const frame = frameOf(current);
    const alvo = current.rhymeTarget;
    // O dicionário só entra quando há rima a cumprir: sem alvo, seria ruído.
    const podeRimar = options.lexicon !== undefined && alvo !== null && alvo.sound !== '';
    const tools = useTools
      ? [
          ...toolsFor(current.spec, current.rhymeTarget, frame),
          ...(podeRimar && alvo !== null ? [rimasTool(alvo, current.spec)] : []),
        ]
      : undefined;

    for (let round = 0; round <= maxRounds; round += 1) {
      options.onProgress?.(round === 0 ? 'escrevendo' : `medindo (${round})`);
      const result = await complete({
        system,
        messages,
        // Folgado de propósito: modelo de raciocínio gasta deste mesmo teto
        // antes de escrever a primeira palavra visível. Apertado, ele raciocina
        // até o limite e devolve vazio.
        maxTokens: current.kind === 'stanza' ? 6000 : 4000,
        // Mais baixa que antes: com a régua na mão, o que se quer do modelo é
        // variedade de imagem, não de contagem.
        temperature: 0.8,
        ...(tools === undefined || round === maxRounds ? {} : { tools }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });

      if (result.toolCalls.length === 0) {
        options.onRaw?.(result.text);
        return evaluate(splitCandidates(result.text), current);
      }

      messages.push({ role: 'assistant-tools', content: result.text, calls: result.toolCalls });
      for (const call of result.toolCalls) {
        const content =
          call.name === RIMAS && options.lexicon !== undefined && alvo !== null
            ? await runRimas(call.rawArguments, options.lexicon, alvo, current.usedRhymeWords)
            : runTool(call.name, call.rawArguments, current.spec, current.rhymeTarget, frame);
        messages.push({ role: 'tool', callId: call.id, name: call.name, content });
      }
    }
    return [];
  };

  const first = await ask(context);
  options.onProgress?.('conferindo');
  if (options.retry === false || first.some((candidate) => candidate.ok)) return first;

  // Nenhum fechou: devolve ao modelo o que o motor mediu e pede de novo. É a
  // única forma de correção que faz diferença — dizer "errado" não ajuda, dizer
  // "este tem 11 e devia ter 10" ajuda.
  const rejected = first
    .flatMap((candidate) => candidate.lines)
    .filter((line) => !line.fitsMeter || !line.fitsRhyme)
    .slice(0, 6)
    .map((line) => `"${line.text}" — ${describe([line], context.spec, context.usedRhymeWords)}`);

  if (rejected.length === 0) {
    // Nem candidato bom nem candidato ruim: o modelo devolveu nada. Repetir com
    // o mesmo pedido costuma bastar — foi confusão de formato, não de conteúdo.
    if (first.length > 0) return first;
    return ask({ ...context, rejected: ['(a resposta anterior veio vazia)'] });
  }

  const second = await ask({ ...context, rejected });
  const todos = [...second, ...first];
  return todos.sort((a, b) => Number(b.ok) - Number(a.ok));
}
