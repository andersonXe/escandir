import { beforeAll, describe, expect, it } from 'vitest';

import {
  assess,
  createAnalyzer,
  FORMAS,
  ptBR,
  rhymeKey,
  rhymeOf,
  rhymes,
  scanVerse,
  VERSO_LIVRE,
} from '../src/index.js';
import type { MetricSpec, Reading, Rhyme, VerseScansion, WordAnalyzer } from '../src/index.js';
import { JUNCOES } from './golden/juncoes.js';
import { VERSOS } from './golden/versos.js';

let analyzer: WordAnalyzer;

beforeAll(() => {
  analyzer = createAnalyzer(ptBR);
});

/** Serializa no formato do corpus: `'so|breo^|mar*'`. */
function toPattern(reading: Reading): string {
  return reading.syllables
    .map((syllable) => {
      let out = syllable.text;
      if (syllable.stressStrength === 'strong') out += '*';
      if (syllable.hasSynalepha) out += '^';
      if (syllable.isExtrametrical) out += '+';
      return out;
    })
    .join('|');
}

function scan(text: string, spec: MetricSpec = FORMAS.heroico): VerseScansion {
  return scanVerse(text, ptBR, analyzer, { spec });
}

function best(text: string, spec: MetricSpec = FORMAS.heroico): Reading {
  const reading = scan(text, spec).best;
  if (reading === null) throw new Error(`sem leitura para "${text}"`);
  return reading;
}

describe('camada 3: escansão de verso (corpus do protótipo)', () => {
  for (const verso of VERSOS) {
    it(`"${verso.texto}"`, () => {
      const reading = best(verso.texto, verso.forma);
      expect(toPattern(reading)).toBe(verso.escansao);
      expect(reading.count).toBe(verso.conta);
    });
  }
});

describe('camada 4: diagnóstico', () => {
  for (const verso of VERSOS) {
    it(`"${verso.texto}" -> ${verso.status}`, () => {
      const reading = best(verso.texto, verso.forma);
      expect(assess(reading, verso.forma).status).toBe(verso.status);
    });
  }

  it('sobra de sílaba vem como estrutura, não como frase', () => {
    const verso = 'e o vento esquece o nome que ele trazia';
    const result = assess(best(verso), FORMAS.heroico);
    expect(result.diagnostics).toContainEqual({ kind: 'count', got: 11, expected: 10, delta: 1 });
  });

  it('tônica fora do lugar aponta a posição esperada e a mais próxima', () => {
    const result = assess(best('a noite cai devagar sobre o rio'), FORMAS.heroico);
    expect(result.diagnostics).toContainEqual({ kind: 'stress', expected: 6, nearest: 7 });
    expect(result.delta).toBe(0);
  });

  it('verso em curso não é verso errado', () => {
    const reading = best('e nada mais se move no');
    expect(assess(reading, FORMAS.heroico).status).toBe('under');
    const partial = assess(reading, FORMAS.heroico, { partial: true });
    expect(partial.status).toBe('pending');
    // 8 sílabas digitadas, alvo 10: faltam 2 para escrever, não 4.
    expect(partial.diagnostics).toContainEqual({ kind: 'pending', missing: 2 });
  });

  it('verso livre não tem estado de erro', () => {
    const reading = best('qualquer linha sem forma declarada', VERSO_LIVRE);
    expect(assess(reading, VERSO_LIVRE).status).toBe('free');
  });

  it('a régua marca posição exigida e se foi cumprida', () => {
    const result = assess(best('a noite cai devagar sobre o rio'), FORMAS.heroico);
    expect(result.positions[5]).toEqual({ position: 6, required: true, satisfied: false });
    expect(result.positions[9]).toEqual({ position: 10, required: true, satisfied: true });
  });
});

describe('junções isoladas', () => {
  for (const caso of JUNCOES) {
    it(`${caso.texto} -> ${caso.silabas} (${caso.nota})`, () => {
      const reading = best(caso.texto, VERSO_LIVRE);
      expect(reading.total).toBe(caso.silabas);
    });
  }
});

describe('o grafo, não a contagem única', () => {
  it('devolve leituras ranqueadas, não um número', () => {
    const result = scan('a noite cai devagar sobre o rio');
    expect(result.readings.length).toBeGreaterThan(1);
    const counts = new Set(result.readings.map((r) => r.count));
    expect(counts.size).toBeGreaterThan(1);
  });

  it('a elisão entre palavras é o padrão, e o hiato custa mais', () => {
    const result = scan('sobre o mar', VERSO_LIVRE);
    const [cheapest] = result.readings;
    expect(cheapest?.total).toBe(3);
    const hiato = result.readings.find((r) => r.total === 4);
    expect(hiato).toBeDefined();
    expect(hiato?.cost).toBeGreaterThan(cheapest?.cost ?? 0);
  });

  it('não elide duas tônicas: "já é" fica em hiato', () => {
    expect(best('já é', VERSO_LIVRE).total).toBe(2);
  });

  it('elisão de vogais iguais átonas é quase obrigatória', () => {
    const result = scan('minha alma', VERSO_LIVRE);
    expect(result.best?.total).toBe(3);
    const hiato = result.readings.find((r) => r.total === 4);
    expect(hiato?.cost).toBeGreaterThan(result.best?.cost ?? 0);
  });

  it('coda consonantal não abre junção', () => {
    const result = scan('mar azul', VERSO_LIVRE);
    expect(result.junctions.filter((j) => j.kind === 'elision')).toHaveLength(0);
    expect(result.best?.total).toBe(3);
  });

  it('a busca com alvo escolhe outra leitura que não a mais barata', () => {
    const texto = 'a pedra sabe o pouco que sabia';
    // Solto, o motor elide "sabe o" e mede 10.
    expect(best(texto, VERSO_LIVRE).count).toBe(10);
    // Pedindo 11, ele recusa a elisão — mais cara, mas é a que cabe na forma.
    const onze = best(texto, { syllables: 11, requiredStresses: [] });
    expect(onze.count).toBe(11);
    expect(onze.cost).toBeGreaterThan(best(texto, VERSO_LIVRE).cost);
  });
});

describe('licença poética: o autor vence', () => {
  it('trava de hiato sobrepõe a elisão preferida pelo motor', () => {
    const solto = scan('sobre o mar', VERSO_LIVRE);
    const junction = solto.junctions.find((j) => j.kind === 'elision');
    expect(junction).toBeDefined();

    const travado = scanVerse('sobre o mar', ptBR, analyzer, {
      spec: VERSO_LIVRE,
      locks: new Map([[junction?.id ?? '', false]]),
    });
    expect(travado.best?.total).toBe(4);
  });

  it('escolha travada não pesa no custo', () => {
    const junction = scan('sobre o mar', VERSO_LIVRE).junctions[0];
    const travado = scanVerse('sobre o mar', ptBR, analyzer, {
      spec: VERSO_LIVRE,
      locks: new Map([[junction?.id ?? '', false]]),
    });
    expect(travado.best?.cost).toBe(0);
  });
});

describe('bordas', () => {
  it('linha vazia não produz leitura', () => {
    const result = scan('');
    expect(result.best).toBeNull();
    expect(result.readings).toHaveLength(0);
  });

  it('pontuação não vira sílaba', () => {
    expect(best('e nada mais se move no lugar.').count).toBe(10);
  });

  it('offsets apontam para o texto original', () => {
    const texto = 'A tarde desce lenta sobre o mar';
    const reading = best(texto);
    const primeira = reading.syllables[0];
    expect(texto.slice(primeira?.start, primeira?.end)).toBe('A');
    const ultima = reading.syllables[reading.syllables.length - 1];
    expect(texto.slice(ultima?.start, ultima?.end)).toBe('mar');
  });
});

describe('terminação de rima', () => {
  const key = (texto: string, spec: MetricSpec = VERSO_LIVRE): string =>
    rhymeKey(best(texto, spec), texto, ptBR.prosody);
  const rima = (texto: string): Rhyme => rhymeOf(best(texto, VERSO_LIVRE), texto, ptBR.prosody);

  it('vai da vogal tônica até o fim, não das últimas letras', () => {
    expect(key('e nada mais se move no lugar')).toBe('ar');
    expect(key('a tarde desce lenta sobre o mar')).toBe('ar');
  });

  it('arrasta a sílaba extramétrica, que é o que faz a rima grave', () => {
    expect(key('e o vento esquece o nome que trazia')).toBe('ia');
    expect(key('a pedra sabe o pouco que sabia')).toBe('ia');
  });

  it('ignora pontuação final', () => {
    expect(key('e nada mais se move no lugar.')).toBe('ar');
  });

  it('rima é comparação entre terminações, não entre versos', () => {
    expect(rhymes(rima('e nada mais se move no lugar'), rima('a tarde desce lenta sobre o mar'))).toBe(true);
    expect(rhymes(rima('e nada mais se move no lugar'), rima('a pedra sabe o pouco que sabia'))).toBe(false);
  });

  it('compara som, não grafia — é o que a rima é', () => {
    const par = (a: string, b: string): boolean => rhymes(rima(a), rima(b));
    // Grafias diferentes, mesmo som: todas rimam.
    expect(par('a lenta caça', 'e a densa massa')).toBe(true);
    expect(par('o velho giz', 'o que ele quis')).toBe(true);
    expect(par('o gesto mal', 'o gesto mau')).toBe(true);
    expect(par('a casa', 'a asa')).toBe(true);
    // Mesma letra final, sons diferentes: não rimam.
    expect(par('a casa', 'a caça')).toBe(false);
    expect(par('o pai', 'o mal')).toBe(false);
  });

  it('rima toante compara só as vogais', () => {
    const terra = rima('a terra');
    const vela = rima('a vela');
    expect(rhymes(terra, vela)).toBe(false);
    expect(rhymes(terra, vela, 'toante')).toBe(true);
  });

  it('verso sem tônica forte não tem terminação', () => {
    expect(key('e o que')).toBe('');
  });
});
