import { FORMAS } from '@escandir/engine';
import type { Lexicon, LexiconEntry } from '@escandir/lexicon';
import { describe, expect, it } from 'vitest';

import type { ProposalContext } from '../src/lib/ai/prompt.js';
import { propose } from '../src/lib/ai/propose.js';
import { runSons, SONS, sonsTool, soundTokens } from '../src/lib/ai/sons.js';
import type { CompletionRequest } from '../src/lib/ai/types.js';

const e = (word: string, band = 0, syllables = 2): LexiconEntry => ({ word, syllables, stressFromEnd: 2, band });

const palavras: LexiconEntry[] = [
  e('sela'),
  e('cela'),
  e('vela'),
  e('bela'),
  e('amar', 0, 2),
  e('mar', 0, 1),
  e('lar', 0, 1),
  e('lua'),
  e('rua'),
  e('chuva'),
  e('luta'),
  e('mala'),
  e('manto'),
  e('muralha', 2, 3),
  e('vê-la'),
  e('marulho', 5, 3),
];

function lexiconFake(entries: readonly LexiconEntry[]): Lexicon {
  return { words: async () => entries } as unknown as Lexicon;
}

async function consulta(args: object, obra?: Set<string>): Promise<Record<string, { total: number; palavras: string[]; da_obra?: string[] }>> {
  const cru = await runSons(JSON.stringify(args), lexiconFake(palavras), obra === undefined ? {} : { obra });
  return JSON.parse(cru) as Record<string, { total: number; palavras: string[]; da_obra?: string[] }>;
}

describe('a ferramenta de sons parecidos', () => {
  it('compara som, não letra: "cela" e "sela" soam igual', () => {
    expect(soundTokens('cela')).toEqual(soundTokens('sela'));
    expect(soundTokens('casa')).not.toEqual(soundTokens('caça'));
  });

  it('homófonas: mesmo som, outra grafia', async () => {
    const r = await consulta({ palavra: 'cela' });
    expect(r['homofonas']?.palavras).toEqual(['sela']);
  });

  it('parecidas: um som de diferença, para mais, para menos ou trocado', async () => {
    const r = await consulta({ palavra: 'mar', modo: 'parecidas' });
    expect(r['parecidas']?.palavras.sort()).toEqual(['amar', 'lar']);
  });

  it('aliteração: o mesmo começo', async () => {
    const r = await consulta({ palavra: 'mar', modo: 'aliteracao' });
    expect(r['aliteracao']?.palavras).toContain('manto');
    expect(r['aliteracao']?.palavras).not.toContain('lar');
  });

  it('assonância: a mesma sequência de vogais', async () => {
    const r = await consulta({ palavra: 'lua', modo: 'assonancia' });
    expect(r['assonancia']?.palavras.sort()).toEqual(['chuva', 'luta', 'rua']);
  });

  it('a palavra de partida e as evitadas não voltam', async () => {
    const r = await consulta({ palavra: 'cela', evitar: ['vela'] });
    const todas = Object.values(r).flatMap((m) => (typeof m === 'object' ? m.palavras : []));
    expect(todas).not.toContain('cela');
    expect(todas).not.toContain('vela');
  });

  it('forma com pronome não entra: o jogo é com a palavra', async () => {
    const r = await consulta({ palavra: 'vela', modo: 'parecidas' });
    expect(r['parecidas']?.palavras).not.toContain('vê-la');
  });

  it('as palavras do autor vêm à parte', async () => {
    const r = await consulta({ palavra: 'lua', modo: 'parecidas' }, new Set(['rua']));
    expect(r['parecidas']?.da_obra).toEqual(['rua']);
    expect(r['parecidas']?.palavras).not.toContain('rua');
  });

  it('filtra por sílabas para caber na medida', async () => {
    const r = await consulta({ palavra: 'mar', modo: 'aliteracao', silabas: 3 });
    expect(r['aliteracao']?.palavras.sort()).toEqual(['marulho', 'muralha']);
  });

  it('a amostra prefere o comum e a tradição ao raro da fala', async () => {
    // "muralha" é da faixa 2; "marulho", da tradição. Com uma vaga só, vai a
    // da tradição — e ainda assim a outra conta no total.
    const muitas: LexiconEntry[] = [e('marulho', 5, 3), e('muralha', 2, 3)];
    const cru = await runSons(JSON.stringify({ palavra: 'mar', modo: 'aliteracao' }), lexiconFake(muitas));
    const r = JSON.parse(cru) as Record<string, { total: number; palavras: string[] }>;
    expect(r['aliteracao']?.palavras[0]).toBe('marulho');
    expect(r['aliteracao']?.total).toBe(2);
  });

  it('argumento torto responde com o erro, sem derrubar a proposta', async () => {
    const cru = await runSons('não é json', lexiconFake(palavras));
    expect(JSON.parse(cru).erro).toBeDefined();
  });

  it('a descrição nomeia os quatro jogos e não obriga a usar', () => {
    const tool = sonsTool({ syllables: 10, requiredStresses: [6, 10] });
    expect(tool.name).toBe(SONS);
    for (const modo of ['homofonas', 'parecidas', 'aliteracao', 'assonancia']) expect(tool.description).toContain(modo);
    expect(tool.description).toContain('não é obrigação');
  });
});

describe('a ferramenta no laço de proposta', () => {
  const contexto: ProposalContext = {
    kind: 'verse',
    spec: FORMAS.heroico,
    rhymeTarget: null,
    before: [],
    after: [],
    title: '',
    theme: '',
    scheme: '',
    declaredVerses: 0,
    task: { kind: 'write' },
    verses: 0,
    candidates: 1,
    usedRhymeWords: [],
    hasTool: true,
  };

  it('é oferecida quando há dicionário, com ou sem rima a cumprir', async () => {
    const pedidos: CompletionRequest[] = [];
    await propose(
      async (request) => {
        pedidos.push(request);
        return { text: 'a tarde desce lenta sobre o mar', toolCalls: [] };
      },
      contexto,
      { lexicon: lexiconFake(palavras), retry: false },
    );
    expect(pedidos[0]?.tools?.map((t) => t.name)).toContain(SONS);
  });

  it('se a lista não baixa, o modelo recebe o erro e a proposta segue', async () => {
    const quebrado = { words: async () => Promise.reject(new Error('rede')) } as unknown as Lexicon;
    let rodada = 0;
    let resposta = '';
    const candidatos = await propose(
      async (request) => {
        rodada += 1;
        if (rodada === 1) {
          return { text: '', toolCalls: [{ id: 's1', name: SONS, rawArguments: '{"palavra":"mar"}' }] };
        }
        resposta = String(request.messages.at(-1)?.content ?? '');
        return { text: 'a tarde desce lenta sobre o mar', toolCalls: [] };
      },
      contexto,
      { lexicon: quebrado, retry: false },
    );
    expect(resposta).toContain('consulta indisponível');
    expect(candidatos).toHaveLength(1);
  });
});
