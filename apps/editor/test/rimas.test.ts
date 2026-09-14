import { ptBR, type Rhyme } from '@escandir/engine';
import type { Lexicon, LexiconEntry, RhymeQuery } from '@escandir/lexicon';
import { describe, expect, it } from 'vitest';

import { RIMAS, rimasTool, runRimas } from '../src/lib/ai/rimas.js';

function alvo(tail: string): Rhyme {
  const sound = ptBR.prosody.rhymeSound(tail);
  return { tail, sound, vowels: ptBR.prosody.rhymeVowels(sound) };
}

/** Léxico falso: as consultas são exatas, então vale testar sem os 7 MB. */
function lexiconFake(entries: readonly LexiconEntry[]): Lexicon {
  return {
    async count(): Promise<number> {
      return entries.length;
    },
    async rhymes(query: RhymeQuery): Promise<LexiconEntry[]> {
      const excluir = new Set((query.exclude ?? []).map((w) => w.toLowerCase()));
      return entries.filter(
        (e) =>
          (query.syllables === undefined || e.syllables === query.syllables) &&
          (query.stressFromEnd === undefined || e.stressFromEnd === query.stressFromEnd) &&
          !excluir.has(e.word),
      );
    },
  } as unknown as Lexicon;
}

const palavras: LexiconEntry[] = [
  { word: 'praça', syllables: 2, stressFromEnd: 2, band: 1 },
  { word: 'massa', syllables: 2, stressFromEnd: 2, band: 0 },
  { word: 'caça', syllables: 2, stressFromEnd: 2, band: 2 },
  { word: 'alfazema', syllables: 4, stressFromEnd: 2, band: 5 },
  { word: 'taça', syllables: 2, stressFromEnd: 2, band: 4 },
];

describe('o dicionário de rimas na mão do modelo', () => {
  it('agrupa por faixa em vez de ranquear — a escolha é de quem escreve', async () => {
    const cru = await runRimas('{}', lexiconFake(palavras), alvo('aça'));
    const { palavras: grupos, total } = JSON.parse(cru) as {
      total: number;
      palavras: Record<string, string[]>;
    };
    expect(total).toBe(5);
    expect(grupos['comuns']).toEqual(['praça', 'massa']);
    expect(grupos['correntes']).toEqual(['caça']);
    expect(grupos['raras']).toEqual(['alfazema', 'taça']);
  });

  it('filtra por sílabas e por posição da tônica', async () => {
    const cru = await runRimas('{"silabas":4}', lexiconFake(palavras), alvo('aça'));
    const { palavras: grupos } = JSON.parse(cru) as { palavras: Record<string, string[]> };
    expect(Object.values(grupos).flat()).toEqual(['alfazema']);
  });

  it('não repete o que o poema já usou', async () => {
    const cru = await runRimas('{"evitar":["massa","praça"]}', lexiconFake(palavras), alvo('aça'));
    expect(JSON.parse(cru).palavras.comuns).toBeUndefined();
  });

  it('argumento torto não derruba a proposta', async () => {
    const cru = await runRimas('isto não é json', lexiconFake(palavras), alvo('aça'));
    expect(JSON.parse(cru).total).toBe(5);
  });

  it('avisa quando o filtro não deixou nada, sem fingir resultado', async () => {
    const cru = await runRimas('{"silabas":9}', lexiconFake(palavras), alvo('aça'));
    const resposta = JSON.parse(cru) as { aviso?: string; palavras: Record<string, string[]> };
    expect(resposta.aviso).toContain('tente outro número de sílabas');
    expect(resposta.palavras).toEqual({});
  });

  it('a descrição diz ao modelo o que ele não sabe: que a rima é por som', () => {
    const tool = rimasTool(alvo('aça'), { syllables: 10, requiredStresses: [6, 10] });
    expect(tool.name).toBe(RIMAS);
    expect(tool.description).toContain('por som');
    expect(tool.description).toContain('"caça"');
    expect(tool.description).toContain('10 sílabas');
  });
});
