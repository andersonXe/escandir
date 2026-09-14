import { FORMAS, ptBR, type Rhyme } from '@escandir/engine';
import { describe, expect, it, vi } from 'vitest';

import { buildSystem, buildUser, SEPARATOR, type ProposalContext } from '../src/lib/ai/prompt.js';
import { evaluate, propose, splitCandidates } from '../src/lib/ai/propose.js';
import { ESCANDIR, runTool } from '../src/lib/ai/tools.js';
import type { CompletionResult } from '../src/lib/ai/types.js';

/** Terminação de rima a partir da grafia, como o motor a produziria. */
function alvo(tail: string): Rhyme {
  const sound = ptBR.prosody.rhymeSound(tail);
  return { tail, sound, vowels: ptBR.prosody.rhymeVowels(sound) };
}

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
    candidates: 3,
    usedRhymeWords: [],
    hasTool: false,
    ...patch,
  };
}

/** Resposta crua de um provedor, no formato que o pedido especifica. */
function resposta(...blocos: string[]): string {
  return blocos.join(`\n${SEPARATOR}\n`);
}

/** O provedor respondeu de vez, sem pedir ferramenta. */
function fala(...blocos: string[]): CompletionResult {
  return { text: resposta(...blocos), toolCalls: [] };
}

/** O provedor pediu a régua antes de responder. */
function pede(versos: string[]): CompletionResult {
  return {
    text: '',
    toolCalls: [{ id: 'c1', name: ESCANDIR, rawArguments: JSON.stringify({ versos }) }],
  };
}

describe('leitura da resposta crua', () => {
  it('reparte por linha separadora', () => {
    expect(splitCandidates(resposta('primeiro verso', 'segundo verso'))).toEqual([
      ['primeiro verso'],
      ['segundo verso'],
    ]);
  });

  it('candidato de várias linhas continua um candidato só', () => {
    const blocos = splitCandidates(resposta('verso um\nverso dois', 'verso três\nverso quatro'));
    expect(blocos).toHaveLength(2);
    expect(blocos[0]).toHaveLength(2);
  });

  it('tira numeração, marcador e aspas que o modelo insiste em pôr', () => {
    const cru = resposta('1. "a tarde desce lenta sobre o mar"', '- e nada mais se move no lugar');
    expect(splitCandidates(cru)).toEqual([
      ['a tarde desce lenta sobre o mar'],
      ['e nada mais se move no lugar'],
    ]);
  });

  it('ignora linhas vazias e resposta vazia', () => {
    expect(splitCandidates('\n\n')).toEqual([]);
  });
});

describe('o motor mede o que o modelo propõe', () => {
  it('separa o que fecha a forma do que não fecha', () => {
    const blocos = [
      ['e nada mais se move no lugar'], // 10, heroico
      ['e o vento esquece o nome que ele trazia'], // 11
    ];
    const [primeiro, segundo] = evaluate(blocos, contexto());
    expect(primeiro?.ok).toBe(true);
    expect(primeiro?.detail).toBe('10 sílabas');
    expect(segundo?.ok).toBe(false);
    expect(segundo?.detail).toBe('sobra 1 sílaba');
  });

  it('o que fecha vem primeiro, mas o que não fecha continua à mostra', () => {
    const blocos = [['e o vento esquece o nome que ele trazia'], ['e nada mais se move no lugar']];
    const ranqueados = evaluate(blocos, contexto());
    expect(ranqueados[0]?.ok).toBe(true);
    expect(ranqueados).toHaveLength(2);
  });

  it('cobra a rima pedida', () => {
    const contra = contexto({ rhymeTarget: alvo('ar') });
    expect(evaluate([['e nada mais se move no lugar']], contra)[0]?.ok).toBe(true);

    const fora = evaluate([['a pedra sabe o pouco que sabia']], contra)[0];
    expect(fora?.ok).toBe(false);
    expect(fora?.detail).toBe('rima em -ia');
  });

  it('numa estrofe, basta um verso furado para o candidato não fechar', () => {
    const blocos = [['e nada mais se move no lugar', 'e o vento esquece o nome que ele trazia']];
    expect(evaluate(blocos, contexto({ kind: 'stanza', verses: 2 }))[0]?.ok).toBe(false);
  });
});

describe('o laço de proposta', () => {
  it('não insiste quando algum candidato já fecha', async () => {
    const complete = vi.fn().mockResolvedValue(fala('e nada mais se move no lugar'));
    const candidatos = await propose(complete, contexto());
    expect(complete).toHaveBeenCalledTimes(1);
    expect(candidatos[0]?.ok).toBe(true);
  });

  it('tenta de novo quando nenhum fecha, devolvendo a medida do motor', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(fala('e o vento esquece o nome que ele trazia'))
      .mockResolvedValueOnce(fala('e nada mais se move no lugar'));

    const candidatos = await propose(complete, contexto());

    expect(complete).toHaveBeenCalledTimes(2);
    // A segunda chamada precisa dizer *o que* estava errado; "errado" não ensina.
    const segundoPedido = complete.mock.calls[1]?.[0]?.messages?.[0]?.content ?? '';
    expect(segundoPedido).toContain('sobra 1 sílaba');
    expect(candidatos[0]?.ok).toBe(true);
  });

  it('desiste depois de uma segunda tentativa, sem laço infinito', async () => {
    const complete = vi.fn().mockResolvedValue(fala('e o vento esquece o nome que ele trazia'));
    const candidatos = await propose(complete, contexto());
    expect(complete).toHaveBeenCalledTimes(2);
    expect(candidatos.every((candidato) => !candidato.ok)).toBe(true);
  });
});

describe('o texto do pedido', () => {
  it('ensina a regra que o modelo mais erra', () => {
    const system = buildSystem(contexto());
    expect(system).toContain('PARA NA ÚLTIMA TÔNICA');
    expect(system).toContain('Elisão entre palavras');
    // Exemplo escandido vale mais que regra enunciada.
    expect(system).toContain('breo|MAR');
  });

  it('declara a forma e a rima pedidas', () => {
    const user = buildUser(contexto({ rhymeTarget: alvo('ar') }));
    expect(user).toContain('10 sílabas poéticas');
    expect(user).toContain('6ª, 10ª');
    expect(user).toContain('-ar');
  });

  it('marca onde o verso entra, entre o que veio antes e o que vem depois', () => {
    const user = buildUser(
      contexto({ before: ['a tarde desce lenta sobre o mar'], after: ['e nada mais se move'] }),
    );
    expect(user).toContain('a tarde desce lenta sobre o mar');
    expect(user).toContain('>>> o verso pedido entra aqui <<<');
  });

  it('completar é continuar, não recomeçar', () => {
    const user = buildUser(contexto({ task: { kind: 'complete', partial: 'e o vento esquece' } }));
    expect(user).toContain('mantendo o começo exatamente como está');
    expect(user).toContain('e o vento esquece');
  });

  it('variar NÃO manda manter o começo — era o que alongava o verso', () => {
    const user = buildUser(
      contexto({ task: { kind: 'vary', original: 'uma brisa desliza entre as cadeiras' } }),
    );
    expect(user).not.toContain('mantendo o começo');
    expect(user).toContain('outras versões dele');
    expect(user).toContain('não uma');
  });

  it('refazer é refazer, não continuar', () => {
    const user = buildUser(
      contexto({ task: { kind: 'rewrite', original: 'verso comprido demais', problem: 'sobra 1 sílaba' } }),
    );
    expect(user).not.toContain('mantendo o começo');
    expect(user).toContain('sobra 1 sílaba');
    expect(user).toContain('refazê-lo inteiro');
  });

  it('trecho marcado pede só o trecho, com o verso em volta como contexto', () => {
    const user = buildUser(
      contexto({
        task: {
          kind: 'fragment',
          selected: 'entre as cadeiras',
          line: 'uma brisa desliza entre as cadeiras',
          start: 18,
          end: 35,
          selectedSyllables: 4,
          lineCount: 10,
          lineScansion: 'u|ma|BRI|sa|des|LI|za|en|treas|ca|DEI|(ras)',
        },
      }),
    );
    expect(user).toContain('entre as cadeiras');
    expect(user).toContain('substitutos para o trecho marcado');
    expect(user).toContain('sem o resto do verso em volta');
  });

  it('leva os comentários do autor', () => {
    const user = buildUser(contexto({ notes: ['aqui precisa de uma imagem de água'] }));
    expect(user).toContain('PEDIDOS DO AUTOR');
    expect(user).toContain('imagem de água');
  });
});

describe('a régua na mão do modelo', () => {
  it('mede quando o modelo pede, e devolve a divisão junto do número', () => {
    const cru = runTool(
      ESCANDIR,
      JSON.stringify({ versos: ['sobre o mar', 'e o vento esquece o nome que trazia'] }),
      FORMAS.heroico,
      null,
    );
    const { medidas } = JSON.parse(cru) as {
      medidas: { silabas: string; contagem: number; cabe: boolean; problema?: string }[];
    };

    // A divisão ensina o que o número sozinho não ensina: onde houve elisão.
    expect(medidas[0]?.silabas).toBe('so|breo|MAR');
    expect(medidas[0]?.cabe).toBe(false);
    expect(medidas[0]?.problema).toContain('falta');

    // Extramétrica entre parênteses: existe, aparece, não conta.
    expect(medidas[1]?.contagem).toBe(10);
    expect(medidas[1]?.silabas).toContain('(a)');
    expect(medidas[1]?.cabe).toBe(true);
  });

  it('cobra a rima pedida na medida devolvida ao modelo', () => {
    const cru = runTool(
      ESCANDIR,
      JSON.stringify({ versos: ['a pedra sabe o pouco que sabia'] }),
      FORMAS.heroico,
      'ar',
    );
    const { medidas } = JSON.parse(cru) as { medidas: { problema?: string }[] };
    expect(medidas[0]?.problema).toContain('rima em "-ia"');
  });

  it('argumento torto não derruba a proposta', () => {
    expect(JSON.parse(runTool(ESCANDIR, 'isto não é json', FORMAS.heroico, null))).toHaveProperty(
      'erro',
    );
  });

  it('o laço mede, devolve ao modelo e só então lê a resposta', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(pede(['e o vento esquece o nome que ele trazia']))
      .mockResolvedValueOnce(fala('e nada mais se move no lugar'));

    const candidatos = await propose(complete, contexto({ hasTool: true }));

    expect(complete).toHaveBeenCalledTimes(2);
    // A segunda chamada carrega o resultado da régua, não uma repetição do pedido.
    const segunda = complete.mock.calls[1]?.[0]?.messages ?? [];
    expect(segunda.at(-1)?.role).toBe('tool');
    expect(String(segunda.at(-1)?.content)).toContain('sobra 1');
    expect(candidatos[0]?.ok).toBe(true);
  });

  it('não roda ferramenta para sempre', async () => {
    const complete = vi.fn().mockResolvedValue(pede(['qualquer verso']));
    const candidatos = await propose(complete, contexto({ hasTool: true }), { maxToolRounds: 2 });
    // 3 rodadas com ferramenta + 1 sem, e para. Nunca sem fim.
    expect(complete.mock.calls.length).toBeLessThanOrEqual(8);
    expect(candidatos).toEqual([]);
  });
});

describe('variação de trecho marcado', () => {
  const linha = 'e nada mais se move no lugar';
  const fragmento = contexto({
    rhymeTarget: alvo('ar'),
    task: { kind: 'fragment', selected: 'se move', line: linha, start: 12, end: 19 },
  });

  it('mede o verso inteiro com o trecho no lugar, não o trecho solto', () => {
    // "se apaga" no lugar de "se move" mantém a medida do verso.
    const [candidato] = evaluate([['se apaga']], fragmento);
    expect(candidato?.lines[0]?.text).toBe('e nada mais se apaga no lugar');
    expect(candidato?.ok).toBe(true);
  });

  it('trecho que estoura a medida do verso é marcado como tal', () => {
    const [candidato] = evaluate([['se desfazia devagar']], fragmento);
    expect(candidato?.lines[0]?.text).toBe('e nada mais se desfazia devagar no lugar');
    expect(candidato?.ok).toBe(false);
    expect(candidato?.detail).toContain('sobra');
  });

  it('recompõe por offset, não por busca: trecho repetido não confunde', () => {
    const repetido = contexto({
      task: {
        kind: 'fragment',
        selected: 'mar',
        line: 'o mar e o mar',
        start: 10,
        end: 13,
        selectedSyllables: 1,
        lineCount: 4,
        lineScansion: 'o|MAR|eo|MAR',
      },
    });
    expect(evaluate([['céu']], repetido)[0]?.lines[0]?.text).toBe('o mar e o céu');
  });
});

describe('o que não é proposta não entra na lista', () => {
  it('descarta prosa disfarçada de candidato', () => {
    const desculpa =
      'Sinto muito, mas nenhuma das tentativas coube na métrica do verso. ' +
      'Deseja tentar novos caminhos de imagem, ou prefere um corte mais curto?';
    const lista = evaluate([[desculpa], ['e nada mais se move no lugar']], contexto());
    expect(lista).toHaveLength(1);
    expect(lista[0]?.lines[0]?.text).toBe('e nada mais se move no lugar');
  });

  it('mas verso ruim continua à mostra: quem decide é o autor', () => {
    const lista = evaluate([['e o vento esquece o nome que ele trazia']], contexto());
    expect(lista).toHaveLength(1);
    expect(lista[0]?.ok).toBe(false);
  });

  it('em verso livre não há alvo, então não há o que descartar por tamanho', () => {
    const livre = contexto({ spec: { syllables: 0, requiredStresses: [] } });
    expect(evaluate([['uma linha bem comprida que em verso medido seria descartada por excesso']], livre)).toHaveLength(1);
  });
});

describe('palavra rimando com ela mesma não é rima', () => {
  const comPraca = contexto({
    rhymeTarget: alvo('aça'),
    usedRhymeWords: ['praça'],
  });

  it('recusa o verso que repete a palavra da rima', () => {
    const [repetido] = evaluate([['o silêncio se estende sobre a praça']], comPraca);
    expect(repetido?.ok).toBe(false);
    expect(repetido?.detail).toBe('repete "praça"');
  });

  it('aceita outra palavra com o mesmo som', () => {
    const [outro] = evaluate([['o silêncio se estende sobre a massa']], comPraca);
    expect(outro?.ok).toBe(true);
  });

  it('sem rima declarada não há repetição a cobrar', () => {
    const [livre] = evaluate([['o silêncio se estende sobre a praça']], contexto());
    expect(livre?.ok).toBe(true);
  });
});

describe('o pedido de trecho de vários versos', () => {
  const trecho = contexto({
    kind: 'stanza',
    task: {
      kind: 'passage',
      original: ['a tarde cai devagar sobre a praça', 'e nada mais se move no lugar'],
    },
  });

  it('manda reescrever o trecho, não continuar nem resumir', () => {
    const user = buildUser(trecho);
    expect(user).toContain('outras versões do trecho inteiro');
    expect(user).toContain('a tarde cai devagar sobre a praça');
    expect(user).not.toContain('mantendo o começo');
  });

  it('o formato pede blocos do mesmo tamanho do trecho marcado', () => {
    expect(buildSystem(trecho)).toContain('de 2 versos cada');
  });

  it('cada candidato é um bloco, e basta um verso furado para não fechar', () => {
    const bons = [['e nada mais se move no lugar', 'a tarde desce lenta sobre o mar']];
    expect(evaluate(bons, trecho)[0]?.ok).toBe(true);

    const misto = [['e nada mais se move no lugar', 'e o vento esquece o nome que ele trazia']];
    expect(evaluate(misto, trecho)[0]?.ok).toBe(false);
  });
});

describe('o tema do poema', () => {
  const comTema = contexto({
    theme: 'a cidade vista de uma janela alta, ninguém na rua, começo de tarde',
  });

  it('entra no pedido na voz do autor', () => {
    const user = buildUser(comTema);
    expect(user).toContain('DO QUE O POEMA TRATA');
    expect(user).toContain('janela alta');
  });

  it('manda usar o material concreto, não evitá-lo', () => {
    const user = buildUser(comTema);
    // A primeira versão dizia o oposto — 'não repita estes termos' — e o modelo
    // obedeceu, trocando o específico do tema por atmosfera genérica.
    expect(user).toContain('USE-AS');
    expect(user).not.toContain('Não repita estes');
  });

  it('opõe o particular ao geral com exemplo, que é o erro concreto', () => {
    const user = buildUser(comTema);
    expect(user).toContain('escreva bonde');
    expect(user).toContain('não "trânsito"');
  });

  it('dá ao modelo um teste para aplicar sozinho', () => {
    expect(buildUser(comTema)).toContain('caberia em qualquer outro poema');
  });

  it('vem antes da forma: é o que enquadra o resto', () => {
    const user = buildUser(comTema);
    expect(user.indexOf('DO QUE O POEMA TRATA')).toBeLessThan(user.indexOf('FORMA'));
  });

  it('sem tema, a seção não existe — nada de cabeçalho vazio', () => {
    expect(buildUser(contexto())).not.toContain('DO QUE O POEMA TRATA');
    expect(buildUser(contexto({ theme: '   ' }))).not.toContain('DO QUE O POEMA TRATA');
  });

  it('é permanente, ao contrário da nota, que é presa a um lugar', () => {
    const user = buildUser(contexto({ theme: 'o mar', notes: ['aqui falta uma imagem'] }));
    expect(user).toContain('DO QUE O POEMA TRATA');
    expect(user).toContain('PEDIDOS DO AUTOR');
  });
});
