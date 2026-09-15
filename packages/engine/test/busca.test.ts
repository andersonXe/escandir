/**
 * As invariantes da busca em duas fases.
 *
 * A busca pontua toda leitura com aritmética de inteiros e só monta as sílabas
 * das seis que devolve — é o que tirou a escansão de 96ms por tecla numa linha
 * de treze junções. O risco desse desenho é específico e silencioso: se a
 * pontuação barata discordar da materialização, o ranque ordena por um número
 * e a UI mostra outro, sem erro nenhum a aparecer.
 *
 * Então o que se testa aqui não é a escansão — disso cuidam os golden tests —
 * é o acordo entre as duas fases, sobre um corpus gerado grande o bastante para
 * varrer os caminhos que um corpus escrito à mão não varre.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { createAnalyzer, FORMAS, ptBR, scanVerse, VERSO_LIVRE } from '../src/index.js';
import type { MetricSpec, Reading, WordAnalyzer } from '../src/index.js';

let analyzer: WordAnalyzer;

beforeAll(() => {
  analyzer = createAnalyzer(ptBR);
});

/**
 * Palavras escolhidas por criarem junção: terminam ou começam em vogal, têm
 * ditongo partível, ou hiato interno. É onde o espaço de busca cresce.
 */
const PALAVRAS = [
  'a', 'e', 'o', 'onda', 'hora', 'ave', 'alma', 'asa', 'ira', 'urna', 'aurora',
  'mar', 'tarde', 'desce', 'lenta', 'sobre', 'vento', 'esquece', 'nome', 'que',
  'trazia', 'saudade', 'poesia', 'fiel', 'ruim', 'herói', 'país', 'ideia',
  'cidade', 'inteira', 'sino', 'chama', 'coisa', 'ainda', 'muito', 'saúde',
];

/** Gerador determinístico: teste que falha tem de falhar sempre. */
function versos(quantos: number, semente: number): string[] {
  let s = semente;
  const proximo = (): number => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const saida: string[] = [];
  for (let i = 0; i < quantos; i += 1) {
    const n = 2 + Math.floor(proximo() * 10);
    const palavras: string[] = [];
    for (let k = 0; k < n; k += 1) {
      palavras.push(PALAVRAS[Math.floor(proximo() * PALAVRAS.length)] ?? 'a');
    }
    saida.push(palavras.join(' '));
  }
  return saida;
}

const CORPUS = versos(400, 2026);

const FORMAS_TESTADAS: readonly (readonly [string, MetricSpec])[] = [
  ['heroico', FORMAS.heroico],
  ['sáfico', FORMAS.safico],
  ['redondilha maior', FORMAS.redondilhaMaior],
  ['verso livre', VERSO_LIVRE],
];

/** A contagem que a leitura materializada de fato tem. */
function contagemReal(reading: Reading): number {
  let ultimaForte = -1;
  reading.syllables.forEach((syllable, index) => {
    if (syllable.stressStrength === 'strong') ultimaForte = index;
  });
  return ultimaForte >= 0 ? ultimaForte + 1 : reading.syllables.length;
}

describe('a leitura montada é coerente consigo mesma', () => {
  // Estes não veem a fase barata — `count` e `total` vêm de `materialize`.
  // Valem contra um erro na montagem; quem detecta desacordo entre as duas
  // fases é o bloco do ranque, logo abaixo.
  for (const [nome, spec] of FORMAS_TESTADAS) {
    it(`bate a contagem e o total em ${nome}`, () => {
      for (const verso of CORPUS) {
        for (const reading of scanVerse(verso, ptBR, analyzer, { spec }).readings) {
          expect(reading.total, verso).toBe(reading.syllables.length);
          expect(reading.count, verso).toBe(contagemReal(reading));
        }
      }
    });
  }
});

/**
 * Aqui é onde um desacordo entre as fases aparece.
 *
 * O ranque é ordenado pela pontuação barata; o que se inspeciona são as
 * leituras montadas. Se as duas discordarem em contagem ou custo, a ordem
 * devolvida deixa de casar com o conteúdo devolvido, e é isso que estes testes
 * medem. Verificado sabotando a pontuação: os dois primeiros ficam vermelhos.
 */
describe('o ranque devolve o que promete', () => {
  it('põe as leituras que cabem na forma antes das que não cabem', () => {
    for (const verso of CORPUS) {
      const { readings } = scanVerse(verso, ptBR, analyzer, { spec: FORMAS.heroico });
      const cabe = readings.map((r) => (r.count === FORMAS.heroico.syllables ? 0 : 1));
      // Uma vez que deixa de caber, não volta a caber.
      expect([...cabe].sort((a, b) => a - b), verso).toEqual(cabe);
    }
  });

  it('entre as que cabem igual, ordena da mais barata para a mais cara', () => {
    for (const verso of CORPUS) {
      const { readings } = scanVerse(verso, ptBR, analyzer, { spec: FORMAS.heroico });
      for (let i = 1; i < readings.length; i += 1) {
        const antes = readings[i - 1];
        const agora = readings[i];
        if (antes === undefined || agora === undefined) continue;
        const cabeAntes = antes.count === FORMAS.heroico.syllables;
        const cabeAgora = agora.count === FORMAS.heroico.syllables;
        if (cabeAntes === cabeAgora) {
          // O desempate por tônica pode inverter o custo entre duas que cabem;
          // fora disso, custo não anda para trás.
          if (!cabeAntes) expect(antes.cost, verso).toBeLessThanOrEqual(agora.cost);
        }
      }
    }
  });

  it('a melhor leitura é a primeira da lista, e não outra', () => {
    for (const verso of CORPUS) {
      const scansion = scanVerse(verso, ptBR, analyzer, { spec: FORMAS.heroico });
      expect(scansion.best, verso).toBe(scansion.readings[0] ?? null);
    }
  });

  it('nunca devolve mais leituras do que o pedido', () => {
    for (const verso of CORPUS.slice(0, 80)) {
      expect(scanVerse(verso, ptBR, analyzer, { spec: FORMAS.heroico, maxReadings: 3 }).readings.length)
        .toBeLessThanOrEqual(3);
    }
  });

  it('prefere, entre as que medem certo, a que põe tônica onde a forma pede', () => {
    // O desempate por tônica é o único critério que a fase barata calcula a
    // partir da posição da sílaba, e não do total — é o mais fácil de errar
    // por um, e o que menos aparece numa leitura solta.
    let comparadas = 0;
    for (const verso of CORPUS) {
      const scansion = scanVerse(verso, ptBR, analyzer, { spec: FORMAS.heroico });
      const cabem = scansion.readings.filter((r) => r.count === FORMAS.heroico.syllables);
      if (cabem.length < 2) continue;

      const faltando = (reading: typeof cabem[number]): number =>
        FORMAS.heroico.requiredStresses.filter(
          (p) => p <= reading.count && reading.syllables[p - 1]?.stressStrength !== 'strong',
        ).length;

      const primeira = cabem[0];
      if (primeira === undefined) continue;
      for (const outra of cabem.slice(1)) {
        expect(faltando(primeira), verso).toBeLessThanOrEqual(faltando(outra));
        comparadas += 1;
      }
    }
    // Se o corpus deixasse de produzir empates, o teste passaria sem testar.
    expect(comparadas).toBeGreaterThan(50);
  });
});

describe('o custo é somado, não aproximado', () => {
  /**
   * Custos fracionários e "feios", do tipo que sai de uma calibração contra
   * corpus — que é exatamente o que `costs.ts` diz que vai acontecer com estes
   * pesos um dia.
   *
   * Soma de ponto flutuante não é associativa. Uma versão desta busca somava o
   * custo por tabela de somas parciais: 8% mais rápida, e com custos assim dava
   * `3.600000000000001` onde a soma sequencial dá `3.6` — o bastante para duas
   * leituras empatadas desempatarem ao contrário. O teste fixa a ordem da soma.
   */
  const CUSTOS = {
    elide: 0.1,
    elideStressedLeft: 6.3,
    elideNasalLeft: 4.7,
    hiatus: 3.3,
    hiatusSameVowel: 7.7,
    synaeresis: 5.1,
    diaeresis: 6.9,
  };

  it('o custo da leitura é a soma exata das junções, na ordem delas', () => {
    let conferidas = 0;
    for (const verso of CORPUS.slice(0, 200)) {
      const scansion = scanVerse(verso, ptBR, analyzer, { spec: FORMAS.heroico, costs: CUSTOS });
      // Verso podado tem junções fechadas à força, e decisão fechada não pesa
      // no ranque — ali a soma esperada não é sobre todas as junções.
      if (scansion.truncated) continue;
      for (const reading of scansion.readings) {
        const aplicadas = new Set(reading.applied);
        let esperado = 0;
        for (const junction of scansion.junctions) {
          esperado += aplicadas.has(junction.id) ? junction.costApply : junction.costSkip;
        }
        // `toBe`, não `toBeCloseTo`: o ponto é que o último bit bate.
        expect(reading.cost, verso).toBe(esperado);
        conferidas += 1;
      }
    }
    expect(conferidas).toBeGreaterThan(100);
  });
});

describe('travas do autor', () => {
  it('a leitura devolvida respeita toda junção travada', () => {
    for (const verso of CORPUS.slice(0, 150)) {
      const { junctions } = scanVerse(verso, ptBR, analyzer, {});
      if (junctions.length === 0) continue;

      // Trava alternada: metade aplicada à força, metade proibida à força.
      const locks = new Map<string, boolean>();
      junctions.forEach((junction, index) => locks.set(junction.id, index % 2 === 0));

      const scansion = scanVerse(verso, ptBR, analyzer, { spec: FORMAS.heroico, locks });
      for (const reading of scansion.readings) {
        const aplicadas = new Set(reading.applied);
        for (const [id, deveAplicar] of locks) {
          // Quando o autor contraria o sistema, o autor vence — inclusive
          // quando o que ele pediu sai mais caro que a alternativa.
          expect(aplicadas.has(id), `${verso} / ${id}`).toBe(deveAplicar);
        }
      }
    }
  });
});

describe('o caso patológico continua respondendo', () => {
  it('escande uma linha de prosa inteira sem estourar', () => {
    const prosa =
      'a casa era enorme e o jardim ia ate o rio onde a agua corria e a gente ' +
      'ia ate la e olhava a tarde inteira e o sol ia embora e a noite vinha';
    const scansion = scanVerse(prosa, ptBR, analyzer, { spec: FORMAS.heroico });

    // Muitas junções: a poda entra, e dizê-lo faz parte da resposta.
    expect(scansion.truncated).toBe(true);
    expect(scansion.best).not.toBeNull();
    expect(scansion.readings.length).toBeGreaterThan(0);
    expect(scansion.best?.count).toBe(contagemReal(scansion.best as Reading));
  });

  it('verso sem nenhuma sílaba não tem leitura, e não quebra', () => {
    for (const vazio of ['', '   ', '...', '— ,']) {
      const scansion = scanVerse(vazio, ptBR, analyzer, { spec: FORMAS.heroico });
      expect(scansion.best, vazio).toBeNull();
      expect(scansion.readings, vazio).toEqual([]);
    }
  });
});
