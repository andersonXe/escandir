import { describe, expect, it } from 'vitest';

import { analyzeWord, createAnalyzer, ptBR } from '../src/index.js';
import type { WordScansion } from '../src/index.js';
import { ATONAS, PALAVRAS, TONICAS } from './golden/palavras.js';

/** Serializa uma escansão no mesmo formato do corpus: `'his|TÓ|ria'`. */
function toPattern(scansion: WordScansion): string {
  return scansion.syllables
    .map((syllable) => (syllable.isStressed ? syllable.text.toUpperCase() : syllable.text))
    .join('|');
}

describe('escansão de palavra (corpus escandido à mão)', () => {
  for (const [word, expected] of PALAVRAS) {
    it(`${word} -> ${expected}`, () => {
      expect(toPattern(analyzeWord(word))).toBe(expected);
    });
  }
});

describe('invariantes estruturais', () => {
  const words = PALAVRAS.map(([word]) => word);

  it('as sílabas recompõem a palavra, sem buraco nem sobreposição', () => {
    for (const word of words) {
      const scansion = analyzeWord(word);
      expect(scansion.syllables.map((s) => s.text).join('')).toBe(scansion.word);

      let cursor = 0;
      for (const syllable of scansion.syllables) {
        expect(syllable.start).toBe(cursor);
        expect(syllable.end).toBeGreaterThan(syllable.start);
        cursor = syllable.end;
      }
      expect(cursor).toBe(scansion.word.length);
    }
  });

  it('ataque, núcleo e coda recompõem a sílaba, e todo núcleo tem vogal', () => {
    for (const word of words) {
      for (const syllable of analyzeWord(word).syllables) {
        expect(syllable.onset + syllable.nucleus + syllable.coda).toBe(syllable.text);
        expect(syllable.nucleus.length).toBeGreaterThan(0);
      }
    }
  });

  it('há exatamente uma tônica, e ela é a apontada por stressIndex', () => {
    for (const word of words) {
      const scansion = analyzeWord(word);
      const stressed = scansion.syllables.filter((s) => s.isStressed);
      expect(stressed).toHaveLength(1);
      expect(scansion.syllables[scansion.stressIndex]?.isStressed).toBe(true);
    }
  });

  it('a caixa do original é preservada', () => {
    const scansion = analyzeWord('História');
    expect(scansion.syllables.map((s) => s.text)).toEqual(['His', 'tó', 'ria']);
    expect(scansion.stressIndex).toBe(1);
  });

  it('palavra sem vogal não produz sílaba', () => {
    const scansion = analyzeWord('—');
    expect(scansion.syllables).toHaveLength(0);
    expect(scansion.stressIndex).toBe(-1);
  });
});

describe('peso prosódico', () => {
  for (const word of ATONAS) {
    it(`"${word}" é átona`, () => {
      expect(analyzeWord(word).stressStrength).toBe('weak');
    });
  }

  for (const word of TONICAS) {
    it(`"${word}" é tônica`, () => {
      expect(analyzeWord(word).stressStrength).toBe('strong');
    });
  }
});

describe('origem da análise', () => {
  it('marca o que veio do léxico', () => {
    expect(analyzeWord('reunir').source).toBe('lexicon');
    expect(analyzeWord('casa').source).toBe('rules');
  });
});

describe('memoização', () => {
  it('devolve a mesma instância para a mesma palavra', () => {
    const analyzer = createAnalyzer(ptBR);
    const first = analyzer.analyze('coração');
    const second = analyzer.analyze('coração');
    expect(second).toBe(first);
    expect(analyzer.size).toBe(1);
  });

  it('esvazia o cache ao estourar o teto', () => {
    const analyzer = createAnalyzer(ptBR, { maxEntries: 2 });
    analyzer.analyze('um');
    analyzer.analyze('dois');
    analyzer.analyze('três');
    expect(analyzer.size).toBe(1);
  });
});
