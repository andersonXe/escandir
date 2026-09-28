import { FORMAS, ptBR, type Rhyme } from '@escandir/engine';
import { describe, expect, it, vi } from 'vitest';

import { buildSystem, buildUser, SEPARATOR, type ProposalContext } from '../src/lib/ai/prompt.js';
import { describePoem, plainLines } from '../src/lib/ai/poema.js';
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
    title: '',
    scheme: '',
    declaredVerses: 0,
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
  });

  it('não traz verso de exemplo — o modelo copiava o assunto junto', () => {
    const tudo = [
      contexto(),
      contexto({ kind: 'stanza', verses: 4 }),
      contexto({ theme: 'uma fábrica fechada' }),
    ].flatMap((c) => [buildSystem(c), buildUser(c)]);
    for (const texto of tudo) {
      expect(texto).not.toMatch(/(?<!\p{L})(mar|lugar|trazia|bonde|trânsito|coração|massa|giz)(?!\p{L})/u);
      expect(texto).not.toContain('|');
    }
  });

  it('o formato se mostra com marcadores, não com versos', () => {
    const system = buildSystem(contexto());
    expect(system).toContain('<verso>');
    expect(system).toContain(SEPARATOR);
  });

  it('declara a forma e a rima pedidas', () => {
    const user = buildUser(contexto({ rhymeTarget: alvo('ar') }));
    expect(user).toContain('10 sílabas poéticas');
    expect(user).toContain('6ª, 10ª');
    expect(user).toContain('-ar');
  });

  it('marca onde o verso entra, entre o que veio antes e o que vem depois', () => {
    const user = buildUser(
      contexto({ before: plainLines(['a tarde desce lenta sobre o mar']), after: plainLines(['e nada mais se move']) }),
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

  it('leva os comentários do autor no lugar onde estão, e os junto ao ponto no pedido', () => {
    const linhas = describePoem(
      [
        { kind: 'verse', text: 'a tarde desce lenta sobre o mar' },
        { kind: 'note', text: 'aqui precisa de uma imagem de água' },
      ],
      FORMAS.heroico,
      '',
    );
    const user = buildUser(contexto({ before: linhas }));
    const nota = user.indexOf('(comentário do autor: aqui precisa de uma imagem de água)');
    expect(nota).toBeGreaterThan(user.indexOf('sobre o mar'));
    expect(nota).toBeLessThan(user.indexOf('>>> o verso pedido'));
    expect(user).toContain('  - depois do verso 1: aqui precisa de uma imagem de água');
    const pedido = user.slice(user.indexOf('<pedido>'));
    expect(pedido).toContain('atenda a eles em TODAS as propostas');
    expect(pedido).toContain('imagem de água');
  });

  it('comentário longe do ponto fica na obra, mas não é cobrado ali', () => {
    const linhas = describePoem(
      [
        { kind: 'note', text: 'o fim tem de ser seco' },
        { kind: 'verse', text: 'a tarde desce lenta sobre o mar' },
      ],
      FORMAS.heroico,
      '',
    );
    const user = buildUser(contexto({ before: linhas }));
    expect(user).toContain('  - no começo do poema: o fim tem de ser seco');
    expect(user.slice(user.indexOf('<pedido>'))).not.toContain('o fim tem de ser seco');
  });

  it('o mesmo candidato duas vezes aparece uma vez só', () => {
    const verso = 'a tarde desce lenta sobre o mar';
    expect(evaluate([[verso], [verso.toUpperCase()], ['e nada mais se move no lugar']], contexto())).toHaveLength(2);
  });

  it('o que o autor já viu neste ponto vai no pedido, para não voltar', () => {
    const user = buildUser(contexto({ alreadyShown: ['um verso já visto'] }));
    const pedido = user.slice(user.indexOf('<pedido>'));
    expect(pedido).toContain('já mostrados ao autor');
    expect(pedido).toContain('um verso já visto');
    expect(buildUser(contexto())).not.toContain('já mostrados');
  });
});

describe('o poema como dado', () => {
  const doc = [
    { kind: 'heading' as const, text: 'Porto' },
    { kind: 'verse' as const, text: 'a tarde desce lenta sobre o mar' },
    { kind: 'note' as const, text: 'mais luz' },
    { kind: 'verse' as const, text: 'e o vento esquece o nome que ele trazia' },
    { kind: 'verse' as const, text: '' },
    { kind: 'verse' as const, text: 'e nada mais se move no lugar' },
  ];

  it('mede cada verso: letra do esquema, medida, problema, terminação', () => {
    const [titulo, mar, nota, trazia, vazio, lugar] = describePoem(doc, FORMAS.heroico, 'ABBA');
    expect(titulo).toMatchObject({ kind: 'heading', letter: '', count: null });
    expect(mar).toMatchObject({ letter: 'A', count: 10, problem: null, rhyme: 'ar' });
    // Nota não consome letra: o verso seguinte é o B.
    expect(nota?.letter).toBe('');
    expect(trazia).toMatchObject({ letter: 'B', count: 11, problem: 'sobra 1 sílaba' });
    expect(vazio).toMatchObject({ letter: 'B', count: null });
    expect(lugar).toMatchObject({ letter: 'A', count: 10, rhyme: 'ar' });
  });

  it('a obra vai inteira como dado: título, forma, comentários, texto medido', () => {
    const medido = describePoem(doc, FORMAS.heroico, 'ABBA');
    const user = buildUser(
      contexto({
        title: 'Porto',
        scheme: 'ABBA',
        declaredVerses: 4,
        before: medido.slice(0, 4),
        after: medido.slice(5),
      }),
    );
    const obra = user.slice(user.indexOf('<obra>'), user.indexOf('</obra>'));
    expect(obra).toContain('título: Porto');
    expect(obra).toContain('medida: 10 sílabas poéticas');
    expect(obra).toContain('tônicas obrigatórias: 6ª, 10ª');
    expect(obra).toContain('esquema de rima: ABBA');
    expect(obra).toContain('extensão: 4 versos, 3 escritos');
    expect(obra).toContain('    1 A [10 · -ar] a tarde desce lenta sobre o mar');
    expect(obra).toContain('[11, sobra 1 sílaba · -ia]');
    expect(obra).toContain('# Porto');
    expect(obra).toContain('  - depois do verso 1: mais luz');
    expect(obra).toContain('>>> o verso pedido entra aqui <<< (verso 3, letra B)');
    expect(obra).toContain('    4 A [10 · -ar] e nada mais se move no lugar');
    expect(user.indexOf('</obra>')).toBeLessThan(user.indexOf('<pedido>'));
    expect(user.slice(user.indexOf('<pedido>'))).toContain('onde: verso 3, letra B');
  });

  it('o título padrão não é do autor e não vai', () => {
    expect(buildUser(contexto({ title: 'sem título' }))).not.toContain('título:');
  });

  it('sem esquema e sem extensão, a forma diz que são livres', () => {
    const user = buildUser(contexto());
    expect(user).toContain('esquema de rima: sem rima fixa');
    expect(user).toContain('extensão: livre');
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

describe('poema ou estrofe a partir do tema', () => {
  const MAR = 'a tarde desce lenta sobre o mar';
  const LUGAR = 'e nada mais se move no lugar';
  const TRAZIA = 'e o vento esquece o nome que trazia';
  const SABIA = 'a pedra sabe o pouco que sabia';

  function poema(patch: Partial<Extract<ProposalContext['task'], { kind: 'poem' }>> = {}): ProposalContext {
    return contexto({
      kind: 'stanza',
      theme: 'a tarde no porto, ninguém no cais',
      task: { kind: 'poem', source: 'theme', instruction: '', verses: 4, scheme: 'ABBA', lead: { texts: [], rhymes: [] }, ...patch },
      verses: 4,
      candidates: 2,
    });
  }

  it('cobra o esquema dentro do próprio candidato', () => {
    const [bom] = evaluate([[MAR, TRAZIA, SABIA, LUGAR]], poema());
    expect(bom?.ok).toBe(true);
    expect(bom?.detail).toBe('4 versos · 10 sílabas');
  });

  it('o 4º tem de rimar com o 1º, e a frase diz com qual', () => {
    const [furado] = evaluate([[MAR, TRAZIA, SABIA, TRAZIA.replace('trazia', 'sorria')]], poema());
    expect(furado?.ok).toBe(false);
    expect(furado?.detail).toContain('verso 4');
    expect(furado?.detail).toContain('com o 1º');
  });

  it('palavra repetida no fim não é rima, nem dentro do bloco', () => {
    const [repetido] = evaluate([[MAR, 'e nada mais se move sobre o mar']], poema({ verses: 2, scheme: 'AA' }));
    expect(repetido?.ok).toBe(false);
    expect(repetido?.detail).toBe('verso 2: repete "mar"');
  });

  it('bloco do tamanho errado não fecha', () => {
    const [curto] = evaluate([[MAR, TRAZIA]], poema());
    expect(curto?.ok).toBe(false);
    expect(curto?.detail).toBe('2 versos, pedidos 4');
  });

  it('extensão livre aceita qualquer tamanho', () => {
    expect(evaluate([[MAR, LUGAR]], poema({ verses: 0, scheme: 'AA' }))[0]?.ok).toBe(true);
  });

  it('a estrofe seguinte continua o esquema do que já está escrito', () => {
    // AABB com um verso em -ar já no poema: o primeiro do bloco é o 2º A.
    const continuacao = poema({ verses: 1, scheme: 'AABB', lead: { texts: [MAR], rhymes: [alvo('ar')] } });
    expect(evaluate([[LUGAR]], continuacao)[0]?.ok).toBe(true);
    const fora = evaluate([[SABIA]], continuacao)[0];
    expect(fora?.ok).toBe(false);
    expect(fora?.detail).toContain('verso já escrito');
  });

  it('o pedido diz o esquema por extenso e proíbe linha em branco', () => {
    const user = buildUser(poema());
    expect(user).toContain('Escreva o poema inteiro: 4 versos');
    expect(user).toContain('verso a verso: ABBA');
    expect(user).toContain('A: versos 1º, 4º');
    expect(buildSystem(poema())).toContain('sem linha em branco');
  });

  it('continuação diz com que verso escrito cada rima se prende', () => {
    const user = buildUser(poema({ verses: 1, scheme: 'AABB', lead: { texts: [MAR], rhymes: [alvo('ar')] } }));
    expect(user).toContain('estrofe seguinte');
    expect(user).toContain(`rima em "-ar", com "${MAR}"`);
  });

  it('comentário como fonte vai no pedido com o texto do autor', () => {
    const user = buildUser(poema({ source: 'note', instruction: 'um soneto sobre o cais vazio' }));
    expect(user).toContain('um soneto sobre o cais vazio');
  });

  it('a régua confere o esquema quando recebe o bloco na ordem', () => {
    const cru = runTool(
      ESCANDIR,
      JSON.stringify({ versos: [MAR, TRAZIA, SABIA, SABIA.replace('sabia', 'sorria')] }),
      FORMAS.heroico,
      null,
      undefined,
      { scheme: 'ABBA', lead: { texts: [], rhymes: [] } },
    );
    const { medidas } = JSON.parse(cru) as { medidas: { cabe: boolean; problema?: string }[] };
    expect(medidas.slice(0, 3).every((m) => m.cabe)).toBe(true);
    expect(medidas[3]?.cabe).toBe(false);
    expect(medidas[3]?.problema).toContain('letra A');
  });
});

describe('o tema do poema', () => {
  const comTema = contexto({
    theme: 'a cidade vista de uma janela alta, ninguém na rua, começo de tarde',
  });

  it('entra na obra na voz do autor, antes da forma', () => {
    const user = buildUser(comTema);
    expect(user).toContain('tema, nas palavras do autor:');
    expect(user).toContain('janela alta');
    expect(user.indexOf('tema, nas palavras')).toBeLessThan(user.indexOf('forma:'));
  });

  it('as instruções sobre o tema ficam no sistema, não misturadas à obra', () => {
    const system = buildSystem(comTema);
    // A primeira versão dizia o oposto — 'não repita estes termos' — e o modelo
    // obedeceu, trocando o específico do tema por atmosfera genérica.
    expect(system).toContain('USE-AS');
    expect(system).toContain('particular ao geral');
    expect(system).toContain('mesma palavra');
    expect(system).toContain('caberia em qualquer outro poema');
    expect(system).not.toContain('Não repita estes');
  });

  it('sem tema, a chave não existe — nada de campo vazio', () => {
    expect(buildUser(contexto())).not.toContain('tema, nas palavras');
    expect(buildUser(contexto({ theme: '   ' }))).not.toContain('tema, nas palavras');
  });

  it('o sistema cobra comentário como instrução e variedade entre propostas', () => {
    const system = buildSystem(contexto());
    expect(system).toContain('Os comentários do autor são instruções');
    expect(system).toContain('Cada proposta termina numa palavra diferente');
  });
});

describe('compor de trás para frente', () => {
  const MAR = 'a tarde desce lenta sobre o mar';
  const LUGAR = 'e nada mais se move no lugar';
  const TRAZIA = 'e o vento esquece o nome que trazia';
  const SABIA = 'a pedra sabe o pouco que sabia';
  const nada = { texts: [], rhymes: [] };

  // ABBA com só o 4º escrito: o 1º, que é A, tem de rimar com ele.
  const fechoPrimeiro = contexto({
    kind: 'stanza',
    task: {
      kind: 'stanza',
      verses: 3,
      block: { scheme: 'ABBA', lead: nada, trail: { texts: [LUGAR], rhymes: [alvo('ar')] } },
    },
    verses: 3,
    candidates: 2,
  });

  it('o verso antes do fecho rima com ele', () => {
    const [bom] = evaluate([[MAR, TRAZIA, SABIA]], fechoPrimeiro);
    expect(bom?.ok).toBe(true);
  });

  it('e é recusado quando não rima, com a frase apontando o verso escrito', () => {
    const [fora] = evaluate([[SABIA, TRAZIA, SABIA.replace('sabia', 'sorria')]], fechoPrimeiro);
    expect(fora?.ok).toBe(false);
    expect(fora?.detail).toContain('verso 1');
    expect(fora?.detail).toContain('verso já escrito');
  });

  it('não pode terminar na palavra do fecho', () => {
    const [repete] = evaluate([['e nada mais se move em seu lugar', TRAZIA, SABIA]], fechoPrimeiro);
    expect(repete?.ok).toBe(false);
    expect(repete?.detail).toContain('repete "lugar"');
  });

  it('o pedido diz que a rima vem de um verso que está depois', () => {
    const user = buildUser(fechoPrimeiro);
    expect(user).toContain(`o 1º verso rima em "-ar", com "${LUGAR}", que vem depois`);
  });

  it('a régua confere contra o fecho também', () => {
    const cru = runTool(ESCANDIR, JSON.stringify({ versos: [SABIA, TRAZIA, SABIA] }), FORMAS.heroico, null, undefined, {
      scheme: 'ABBA',
      lead: nada,
      trail: { texts: [LUGAR], rhymes: [alvo('ar')] },
    });
    const { medidas } = JSON.parse(cru) as { medidas: { cabe: boolean; problema?: string }[] };
    expect(medidas[0]?.cabe).toBe(false);
    expect(medidas[0]?.problema).toContain(LUGAR);
  });

  it('com verso antes e depois, vale o de antes — a escolha de sempre', () => {
    const [bom] = evaluate(
      [[TRAZIA]],
      contexto({
        kind: 'stanza',
        task: {
          kind: 'stanza',
          verses: 1,
          block: {
            scheme: 'ABBA',
            lead: { texts: [MAR], rhymes: [alvo('ar')] },
            trail: { texts: [SABIA, LUGAR], rhymes: [alvo('ia'), alvo('ar')] },
          },
        },
        verses: 1,
      }),
    );
    // O 2º é B: não tem B antes, então rima com o 3º, que está depois.
    expect(bom?.ok).toBe(true);
  });
});
