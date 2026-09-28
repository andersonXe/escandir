import type { Lexicon } from '@escandir/lexicon';
import { describe, expect, it } from 'vitest';

import { runSentidos, SENTIDOS, sentidosTool } from '../src/lib/ai/sentidos.js';

const INDICE: Record<string, string[]> = {
  sela: ['verbo: forma de "selar"', 'subst.: assento de couro para montar', '(selar) verbo: pôr selo'],
  pena: ['subst.: castigo', 'subst.: desgosto', 'subst.: pluma das aves'],
};

/** Léxico falso: só o que a ferramenta consulta. */
function lexiconFake(indice: Record<string, string[]>, pedidas: string[][] = []): Lexicon {
  return {
    async senses(words: readonly string[]) {
      pedidas.push([...words]);
      return new Map(words.flatMap((w) => (indice[w] === undefined ? [] : [[w, indice[w]] as const])));
    },
  } as unknown as Lexicon;
}

async function consulta(args: object, obra?: Set<string>): Promise<Record<string, { sentidos: string[]; nota?: string; da_obra?: boolean }>> {
  const cru = await runSentidos(JSON.stringify(args), lexiconFake(INDICE), obra === undefined ? {} : { obra });
  return JSON.parse(cru) as Record<string, { sentidos: string[]; nota?: string; da_obra?: boolean }>;
}

describe('a ferramenta de duplo sentido', () => {
  it('devolve as acepções de cada palavra pedida', async () => {
    const r = await consulta({ palavras: ['pena', 'sela'] });
    expect(r['pena']?.sentidos).toContain('subst.: desgosto');
    expect(r['sela']?.sentidos).toContain('(selar) verbo: pôr selo');
  });

  it('sem registro não quer dizer sentido único, e o modelo é avisado', async () => {
    const r = await consulta({ palavras: ['mar'] });
    expect(r['mar']?.sentidos).toEqual([]);
    expect(r['mar']?.nota).toContain('sem registro');
  });

  it('marca as palavras que são do autor', async () => {
    const r = await consulta({ palavras: ['pena', 'sela'] }, new Set(['pena']));
    expect(r['pena']?.da_obra).toBe(true);
    expect(r['sela']?.da_obra).toBeUndefined();
  });

  it('normaliza, tira repetidas e respeita o teto', async () => {
    const pedidas: string[][] = [];
    const muitas = Array.from({ length: 30 }, (_, i) => `palavra${i}`);
    await runSentidos(JSON.stringify({ palavras: [' Pena ', 'pena', ...muitas] }), lexiconFake(INDICE, pedidas));
    expect(pedidas[0]?.[0]).toBe('pena');
    expect(pedidas[0]?.filter((w) => w === 'pena')).toHaveLength(1);
    expect(pedidas[0]?.length).toBe(16);
  });

  it('argumento torto responde com o erro', async () => {
    const cru = await runSentidos('{"palavras": []}', lexiconFake(INDICE));
    expect(JSON.parse(cru).erro).toBeDefined();
  });

  it('a descrição fala de duplo sentido, avisa das lacunas e não obriga', () => {
    const tool = sentidosTool();
    expect(tool.name).toBe(SENTIDOS);
    expect(tool.description).toContain('duplo sentido');
    expect(tool.description).toContain('lacunas');
    expect(tool.description).toContain('não é obrigação');
  });
});
