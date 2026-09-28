import { assess, createAnalyzer, FORMAS, ptBR, scanVerse, type MetricSpec } from '@escandir/engine';
import { describe, expect, it } from 'vitest';

import { actionFor, themeAction, type LineSituation } from '../src/lib/ai/action.js';

const analyzer = createAnalyzer(ptBR);

function medir(texto: string, spec: MetricSpec = FORMAS.heroico, partial = false) {
  const reading = scanVerse(texto, ptBR, analyzer, { spec }).best;
  return reading === null ? null : assess(reading, spec, { partial });
}

function situacao(patch: Partial<LineSituation> = {}): LineSituation {
  return {
    lineKind: 'verse',
    text: '',
    assessment: null,
    spec: FORMAS.heroico,
    rhymeTarget: null,
    emptyRun: 1,
    ...patch,
  };
}

describe('a ação se nomeia pelo que falta', () => {
  it('linha vazia pede um verso, e diz a forma dele', () => {
    const action = actionFor(situacao({ rhymeTarget: 'ar' }));
    expect(action?.id).toBe('write-verse');
    expect(action?.label).toBe('escrever verso · 10 sílabas · rima em -ar');
  });

  it('várias linhas vazias seguidas são estrofe, não verso', () => {
    const action = actionFor(situacao({ emptyRun: 4 }));
    expect(action?.id).toBe('write-stanza');
    expect(action?.kind).toBe('stanza');
    expect(action?.label).toContain('4 versos');
  });

  it('verso em curso pede para completar', () => {
    const action = actionFor(
      situacao({ text: 'e nada mais se move no', assessment: medir('e nada mais se move no', FORMAS.heroico, true) }),
    );
    expect(action?.id).toBe('complete-verse');
    expect(action?.label).toContain('completar verso');
  });

  it('verso com sílaba sobrando pede ajuste, com o alvo no rótulo', () => {
    const texto = 'e o vento esquece o nome que ele trazia';
    const action = actionFor(situacao({ text: texto, assessment: medir(texto) }));
    expect(action?.id).toBe('fix-verse');
    expect(action?.label).toBe('ajustar para 10 sílabas');
  });

  it('verso que mede certo mas erra o ritmo pede outra coisa, e diz onde', () => {
    const texto = 'a noite cai devagar sobre o rio';
    const action = actionFor(situacao({ text: texto, assessment: medir(texto) }));
    expect(action?.id).toBe('fix-verse');
    expect(action?.label).toBe('refazer o ritmo (tônica na 6ª)');
  });

  it('verso pronto oferece variação, não conserto', () => {
    const texto = 'e nada mais se move no lugar';
    const action = actionFor(situacao({ text: texto, assessment: medir(texto) }));
    expect(action?.id).toBe('vary-verse');
  });

  it('comentário do autor vira pedido', () => {
    const action = actionFor(situacao({ lineKind: 'note', text: 'falta uma imagem de água' }));
    expect(action?.id).toBe('address-note');
    expect(action?.label).toBe('atender ao comentário');
  });

  it('título não pede nada, nem comentário vazio', () => {
    expect(actionFor(situacao({ lineKind: 'heading', text: 'Canto I' }))).toBeNull();
    expect(actionFor(situacao({ lineKind: 'note', text: '   ' }))).toBeNull();
  });

  it('em verso livre o rótulo não promete medida que não existe', () => {
    const livre: MetricSpec = { syllables: 0, requiredStresses: [] };
    expect(actionFor(situacao({ spec: livre }))?.label).toBe('escrever verso');
  });
});

describe('a partir do tema, a qualquer momento', () => {
  const base = { theme: 'o cais vazio no fim da tarde', scheme: 'ABBAABBACDCDCD', spec: FORMAS.heroico };

  it('sem tema, não há o que oferecer', () => {
    expect(themeAction({ ...base, theme: '  ', written: 0, declared: 14 })).toBeNull();
  });

  it('nada escrito: o poema inteiro, do tamanho declarado', () => {
    const action = themeAction({ ...base, written: 0, declared: 14 });
    expect(action?.id).toBe('write-poem');
    expect(action?.label).toBe('escrever o poema · 14 versos · 10 sílabas');
    expect(action?.verses).toBe(14);
  });

  it('pela metade: os versos que faltam', () => {
    const action = themeAction({ ...base, written: 8, declared: 14 });
    expect(action?.label).toBe('escrever os 6 versos que faltam · 10 sílabas');
    expect(action?.verses).toBe(6);
  });

  it('sem tamanho declarado e já começado: a estrofe seguinte, do tamanho do esquema', () => {
    const action = themeAction({ ...base, scheme: 'ABAB', written: 4, declared: 0 });
    expect(action?.label).toBe('escrever estrofe · 4 versos · 10 sílabas');
    expect(action?.verses).toBe(4);
  });

  it('esquema comprido demais para ser estrofe vale uma quadra', () => {
    expect(themeAction({ ...base, written: 14, declared: 14 })?.verses).toBe(4);
  });

  it('nada escrito e sem tamanho: o modelo escolhe a extensão', () => {
    expect(themeAction({ ...base, written: 0, declared: 0 })?.verses).toBe(0);
  });

  it('comentário num poema vazio pede o poema, não um verso', () => {
    const action = actionFor(situacao({ lineKind: 'note', text: 'um soneto sobre o cais', poemEmpty: true }));
    expect(action?.id).toBe('write-poem');
    expect(action?.kind).toBe('stanza');
  });
});

describe('trecho de vários versos', () => {
  it('marcar mais de um verso pede variação do trecho inteiro', () => {
    const action = actionFor(situacao({ rangeLength: 3, text: 'a tarde cai devagar' }));
    expect(action?.id).toBe('vary-passage');
    expect(action?.label).toBe('variar 3 versos');
    // Bloco de versos, não verso solto: o formato da resposta depende disso.
    expect(action?.kind).toBe('stanza');
  });

  it('vence a marca de caractere: quem marcou 3 versos não pediu meia palavra', () => {
    const action = actionFor(
      situacao({ rangeLength: 2, text: 'a tarde cai', selection: { start: 0, end: 5 } }),
    );
    expect(action?.id).toBe('vary-passage');
  });

  it('um verso só não é trecho', () => {
    expect(actionFor(situacao({ rangeLength: 1, text: '' }))?.id).toBe('write-verse');
  });
});
