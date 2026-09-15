/**
 * A conta da proposta, e o que se faz para baixá-la.
 *
 * Em BYOK quem paga é o autor. O laço de ferramenta reenvia a conversa inteira
 * a cada rodada, e o `retry` roda o laço de novo — uma proposta chega a umas
 * vinte e oito mil fichas de entrada sem nada disso aparecer na tela. Estes
 * testes cobrem as duas respostas a isso: somar o consumo para poder mostrá-lo,
 * e marcar o prefixo estável para não pagá-lo de novo a cada rodada.
 */

import { FORMAS } from '@escandir/engine';
import { describe, expect, it, vi } from 'vitest';

import { propose } from '../src/lib/ai/propose.js';
import type { ProposalContext } from '../src/lib/ai/prompt.js';
import { SEPARATOR } from '../src/lib/ai/prompt.js';
import { ESCANDIR } from '../src/lib/ai/tools.js';
import { addUsage, NO_USAGE, readUsage, type CompletionResult } from '../src/lib/ai/types.js';
import { anthropic } from '../src/lib/ai/anthropic.js';

function contexto(patch: Partial<ProposalContext> = {}): ProposalContext {
  return {
    kind: 'verse',
    spec: FORMAS.heroico,
    rhymeTarget: null,
    before: [],
    after: [],
    theme: '',
    notes: [],
    task: { kind: 'write' },
    verses: 0,
    candidates: 2,
    usedRhymeWords: [],
    hasTool: true,
    ...patch,
  };
}

const VERSO_BOM = 'a tarde desce lenta sobre o mar';

describe('soma do consumo', () => {
  it('parte de zero e soma sem perder nada', () => {
    expect(addUsage(NO_USAGE, { input: 10, output: 5, cached: 2 })).toEqual({
      input: 10,
      output: 5,
      cached: 2,
    });
    expect(addUsage({ input: 3, output: 1, cached: 0 }, { input: 4, output: 2, cached: 7 })).toEqual({
      input: 7,
      output: 3,
      cached: 7,
    });
  });

  it('acumula por todas as rodadas de ferramenta, não só a última', async () => {
    const chamada = vi
      .fn<(...args: never[]) => Promise<CompletionResult>>()
      // Rodada 0: pede a régua.
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [{ id: 'c1', name: ESCANDIR, rawArguments: JSON.stringify({ versos: [VERSO_BOM] }) }],
        usage: { input: 1000, output: 100, cached: 0 },
      })
      // Rodada 1: responde, já lendo parte do cache.
      .mockResolvedValueOnce({
        text: `${VERSO_BOM}\n${SEPARATOR}\n${VERSO_BOM}`,
        toolCalls: [],
        usage: { input: 1500, output: 200, cached: 900 },
      });

    const vistos: { input: number; output: number; cached: number }[] = [];
    await propose(chamada, contexto(), { onUsage: (u) => vistos.push(u), retry: false });

    expect(chamada).toHaveBeenCalledTimes(2);
    // O último aviso é o total, não o da chamada que acabou de voltar.
    expect(vistos.at(-1)).toEqual({ input: 2500, output: 300, cached: 900 });
    // E avisa a cada rodada, para a conta subir durante a espera.
    expect(vistos).toHaveLength(2);
    expect(vistos[0]).toEqual({ input: 1000, output: 100, cached: 0 });
  });

  it('provedor que não relata consumo não quebra nem inventa número', async () => {
    const chamada = vi
      .fn<(...args: never[]) => Promise<CompletionResult>>()
      .mockResolvedValue({ text: VERSO_BOM, toolCalls: [] });

    const vistos: unknown[] = [];
    const candidatos = await propose(chamada, contexto(), {
      onUsage: (u) => vistos.push(u),
      retry: false,
    });

    expect(vistos).toEqual([]);
    expect(candidatos.length).toBeGreaterThan(0);
  });
});

describe('leitura do bloco de consumo de cada provedor', () => {
  it('lê o formato da Anthropic', () => {
    const usage = readUsage(
      { usage: { input_tokens: 120, output_tokens: 34, cache_read_input_tokens: 80, cache_creation_input_tokens: 40 } },
      { input: 'input_tokens', output: 'output_tokens', cached: ['cache_read_input_tokens'] },
    );
    // `cache_creation` custa mais caro que entrada normal: contá-lo como
    // economia diria ao autor o contrário do que aconteceu.
    expect(usage).toEqual({ input: 120, output: 34, cached: 80 });
  });

  it('lê o formato da OpenAI, com o número aninhado', () => {
    const usage = readUsage(
      { usage: { prompt_tokens: 200, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 128 } } },
      { input: 'prompt_tokens', output: 'completion_tokens', cached: ['prompt_tokens_details.cached_tokens'] },
    );
    expect(usage).toEqual({ input: 200, output: 50, cached: 128 });
  });

  it('corpo sem bloco de consumo vira zero, não NaN', () => {
    const campos = { input: 'input_tokens', output: 'output_tokens', cached: ['cache_read_input_tokens'] };
    expect(readUsage({}, campos)).toEqual(NO_USAGE);
    expect(readUsage({ usage: null }, campos)).toEqual(NO_USAGE);
    expect(readUsage({ usage: { input_tokens: 'muitos' } }, campos)).toEqual(NO_USAGE);
  });
});

describe('marca de cache no pedido à Anthropic', () => {
  /** Intercepta o `fetch` e devolve o corpo que o adaptador montou. */
  async function corpoEnviado(messages: Parameters<typeof anthropic.complete>[1]['messages']) {
    const capturado: { body?: Record<string, unknown> } = {};
    const stub = vi.fn(async (_url: string, init: RequestInit) => {
      capturado.body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', stub);
    try {
      await anthropic.complete(
        { providerId: 'anthropic', apiKey: 'k', model: 'claude-haiku-4-5', baseUrl: '' },
        { system: 'instruções estáveis', messages, maxTokens: 100, temperature: 0.8 },
      );
    } finally {
      vi.unstubAllGlobals();
    }
    return capturado.body ?? {};
  }

  it('marca o sistema, que é o prefixo mais estável do pedido', async () => {
    const body = await corpoEnviado([{ role: 'user', content: 'escreva' }]);
    expect(body['system']).toEqual([
      { type: 'text', text: 'instruções estáveis', cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('marca a última mensagem, para a marca andar com a conversa', async () => {
    const body = await corpoEnviado([
      { role: 'user', content: 'escreva' },
      { role: 'assistant-tools', content: '', calls: [{ id: 'c1', name: ESCANDIR, rawArguments: '{}' }] },
      { role: 'tool', callId: 'c1', name: ESCANDIR, content: '{"medidas":[]}' },
    ]);

    const mensagens = body['messages'] as { content: unknown }[];
    const ultima = mensagens[mensagens.length - 1];
    const blocos = ultima?.content as Record<string, unknown>[];
    expect(blocos[blocos.length - 1]?.['cache_control']).toEqual({ type: 'ephemeral' });

    // E só a última: marcar todas gastaria os quatro pontos que a API concede.
    // As outras seguem como vieram — texto solto continua texto solto.
    const marcadas = mensagens.filter((m) =>
      Array.isArray(m.content) &&
      (m.content as Record<string, unknown>[]).some((b) => b['cache_control'] !== undefined),
    );
    expect(marcadas).toHaveLength(1);
    expect(mensagens[0]?.content).toBe('escreva');
  });

  it('conversa vazia não inventa mensagem nem marca', async () => {
    const body = await corpoEnviado([]);
    expect(body['messages']).toEqual([]);
  });
});
