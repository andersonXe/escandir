/**
 * O que um arquivo `.poema` pode trazer para dentro do editor.
 *
 * Importar é a única porta por onde entra dado que o editor não produziu. A
 * tela de Forma limita sílabas e versos; um arquivo não passa por ela, e sem
 * limite aqui `syllables: 1000000` atravessava a validação inteira — era
 * número, era finito — e travava a aba assim que a tela de Forma tentasse
 * desenhar uma casa de régua por sílaba.
 */

import { describe, expect, test } from 'vitest';

import { fromRaw, parse, VERSION } from '../src/lib/document.js';

function arquivo(extra: Record<string, unknown>): unknown {
  return {
    format: 'metrica-poema',
    version: VERSION,
    spec: { syllables: 10, requiredStresses: [6, 10] },
    lines: [{ text: 'a tarde desce lenta sobre o mar', kind: 'verse' }],
    ...extra,
  };
}

describe('limites da forma na importação', () => {
  test('sílabas absurdas são cortadas no teto', () => {
    const doc = fromRaw(arquivo({ spec: { syllables: 1_000_000, requiredStresses: [] } }));
    expect(doc.spec.syllables).toBe(20);
  });

  test('sílabas negativas viram verso livre, não medida impossível', () => {
    const doc = fromRaw(arquivo({ spec: { syllables: -5, requiredStresses: [] } }));
    expect(doc.spec.syllables).toBe(0);
  });

  test('sílaba fracionária vira inteiro', () => {
    const doc = fromRaw(arquivo({ spec: { syllables: 10.7, requiredStresses: [] } }));
    expect(doc.spec.syllables).toBe(10);
  });

  test('tônica exigida fora do verso não entra', () => {
    // A mesma regra que a tela aplica ao baixar o número de sílabas: exigir
    // tônica na 14ª de um decassílabo não é exigência, é lixo.
    const doc = fromRaw(arquivo({ spec: { syllables: 10, requiredStresses: [6, 10, 14, 0, -2] } }));
    expect(doc.spec.requiredStresses).toEqual([6, 10]);
  });

  test('número de versos é cortado no teto', () => {
    const doc = fromRaw(arquivo({ verses: 10_000_000 }));
    expect(doc.verses).toBe(200);
  });

  test('esquema de rima não passa do número de versos possível', () => {
    const doc = fromRaw(arquivo({ rhyme: 'AB'.repeat(5000) }));
    expect(doc.rhyme.length).toBe(200);
  });

  test('a forma legítima atravessa intacta', () => {
    const doc = fromRaw(arquivo({ spec: { syllables: 12, requiredStresses: [6, 12] }, verses: 14, rhyme: 'ABBA' }));
    expect(doc.spec).toEqual({ syllables: 12, requiredStresses: [6, 12] });
    expect(doc.verses).toBe(14);
    expect(doc.rhyme).toBe('ABBA');
  });
});

describe('recusas legíveis', () => {
  test('arquivo que não é poema diz o que é', () => {
    expect(() => parse('{"format":"outra-coisa"}')).toThrow(/não é um arquivo de poema/);
  });

  test('JSON quebrado diz que é JSON quebrado', () => {
    expect(() => parse('{ isto não é json')).toThrow(/não é JSON válido/);
  });

  test('versão futura é recusada em vez de lida pela metade', () => {
    expect(() => fromRaw(arquivo({ version: VERSION + 1 }))).toThrow(/mais nova que este editor/);
  });
});
