/**
 * Montagem do pedido. Não sabe de provedor nenhum.
 *
 * A primeira versão deste arquivo explicava as regras de escansão e pedia que
 * o modelo contasse certo. Não funcionou, e não ia funcionar: contar sílaba
 * poética é justamente o que LLM faz mal, e explicar melhor não conserta uma
 * limitação de percepção.
 *
 * O que funciona é a ferramenta `escandir` — o modelo mede em vez de adivinhar.
 * O texto abaixo mudou de função: não ensina mais a contar, ensina a **usar a
 * régua**. Quem garante continua sendo o motor, que mede tudo de novo depois.
 *
 * **Nenhum verso de exemplo.** Houve três decassílabos escandidos aqui, e o
 * formato da resposta era ilustrado com versos de verdade. Exemplo é o molde
 * mais forte de um prompt: o modelo levava o assunto e a cadência junto com a
 * contagem, e um poema sobre fábrica recebia como referência um verso sobre o
 * mar. O que calibra agora é o próprio poema, medido linha a linha
 * (`poema.ts`), e a régua sobre os rascunhos do modelo. Regra se enuncia;
 * formato se mostra com marcadores.
 */

import { type MetricSpec, NO_RHYME, type Rhyme } from '@escandir/engine';

import { describeScheme, letterAt, schemeChecks, type SchemeLead } from './esquema.js';
import type { PoemLine } from './poema.js';

export type ProposalKind = 'verse' | 'stanza';

/**
 * O que se está pedindo. Explícito de propósito.
 *
 * A primeira versão inferia a tarefa da presença de texto na linha: se havia
 * texto, era 'completar'. Isso fazia 'propor variações' virar 'complete este
 * verso mantendo o começo' — e o modelo devolvia versos cada vez mais longos,
 * porque estava obedecendo ao pedido errado. Tarefa se declara, não se adivinha.
 */
export type Task =
  /** Linha vazia. */
  | { readonly kind: 'write' }
  /** Verso pela metade: continuar o que está lá. */
  | { readonly kind: 'complete'; readonly partial: string }
  /** Verso inteiro que não fecha a forma: refazer mantendo o sentido. */
  | { readonly kind: 'rewrite'; readonly original: string; readonly problem: string }
  /** Verso que já fecha: outras versões dele. */
  | { readonly kind: 'vary'; readonly original: string }
  /** Só o trecho marcado muda; o resto do verso fica como está. */
  | {
      readonly kind: 'fragment';
      readonly selected: string;
      readonly line: string;
      /** Offsets exatos: recompor por busca de texto erraria em trecho repetido. */
      readonly start: number;
      readonly end: number;
      /** Sílabas que o trecho atual ocupa. Sem isto o modelo propõe do tamanho errado. */
      readonly selectedSyllables: number;
      /** Sílabas que o verso inteiro mede hoje. */
      readonly lineCount: number;
      /** Escansão do verso como está: mostra a forma que o substituto tem de imitar. */
      readonly lineScansion: string;
    }
  /** Estrofe inteira por escrever. */
  | { readonly kind: 'stanza'; readonly verses: number }
  /** Um trecho de vários versos já escritos, a refazer inteiro. */
  | { readonly kind: 'passage'; readonly original: readonly string[] }
  /** Comentário do autor a ser atendido. */
  | { readonly kind: 'note'; readonly instruction: string }
  /**
   * Um bloco de versos a partir do tema ou de um comentário: a estrofe seguinte
   * do poema, ou o poema inteiro quando ainda não há verso escrito.
   *
   * Diferente de `stanza`, que preenche linhas vazias no meio do texto com a
   * rima dos vizinhos, aqui o esquema de rima é cobrado **dentro** do bloco —
   * o verso 4 rima com o 1, que veio na mesma resposta.
   */
  | {
      readonly kind: 'poem';
      readonly source: 'theme' | 'note';
      /** O texto do comentário. Vazio quando a fonte é o tema, que já vai no pedido. */
      readonly instruction: string;
      /** Versos pedidos. `0` = o modelo escolhe a extensão. */
      readonly verses: number;
      /** Esquema de rima do poema, a partir do primeiro verso dele. Vazio = sem rima. */
      readonly scheme: string;
      /** Versos já escritos antes do bloco, que o esquema continua. */
      readonly lead: SchemeLead;
    };

export interface ProposalContext {
  readonly kind: ProposalKind;
  readonly spec: MetricSpec;
  /** Terminação que a rima precisa casar, ex.: `ar`. `null` = livre. */
  readonly rhymeTarget: Rhyme | null;
  /**
   * As linhas antes e depois do ponto pedido, já medidas. Nota e título vão no
   * lugar onde estão: nota é pedido preso a um ponto do texto, e é ali que ela
   * se lê.
   */
  readonly before: readonly PoemLine[];
  readonly after: readonly PoemLine[];
  /** Título do documento. Vazio ou o padrão "sem título" não vai no pedido. */
  readonly title: string;
  /** Do que o poema trata, na voz do autor. Contexto permanente. */
  readonly theme: string;
  /** Esquema de rima do poema inteiro. Vazio = sem rima. */
  readonly scheme: string;
  /** Versos que a forma declara. `0` = sem número fixo. */
  readonly declaredVerses: number;
  readonly task: Task;
  /** Quantos versos a estrofe pede. Ignorado quando `kind` é `verse`. */
  readonly verses: number;
  readonly candidates: number;
  /** Medidas erradas da tentativa anterior, para a segunda chamada. */
  readonly rejected?: readonly string[];
  /** Palavras que já rimam nesta posição. Repeti-las não é rimar. */
  readonly usedRhymeWords: readonly string[];
  /** A ferramenta está disponível nesta chamada. */
  readonly hasTool: boolean;
}

export const SEPARATOR = '---';

const REGRAS = `O que torna a contagem diferente da intuição:

1. Elisão entre palavras é a REGRA, não a exceção. Vogal final átona funde
   com vogal inicial seguinte, e as duas viram uma sílaba só.
2. A contagem PARA NA ÚLTIMA TÔNICA. O que vem depois existe e não conta.
   Por isso verso terminado em palavra grave mede uma sílaba a menos do que
   se fala, e em palavra esdrúxula, duas.
3. Sílaba poética não é sílaba gramatical.`;

/**
 * O que se espera por proposta. Precisa casar com a TAREFA: quando o pedido
 * era de trecho e o formato dizia 'versos', o modelo devolveu quatro
 * separadores vazios — entendeu o formato, não soube o que pôr dentro.
 *
 * O molde vem em marcadores, não em versos: verso posto aqui como ilustração
 * era copiado junto com o formato.
 */
function unidadeDaResposta(context: ProposalContext): { quantos: string; molde: readonly string[] } {
  const n = context.candidates;
  const bloco = ['<verso>', '<verso>', '...'];
  if (context.task.kind === 'poem') {
    const extensao =
      context.task.verses > 0 ? `de ${context.task.verses} versos cada` : 'da extensão que você escolher';
    return {
      quantos: `${n} blocos inteiros, ${extensao}, um verso por linha, sem linha em branco entre estrofes`,
      molde: bloco,
    };
  }
  if (context.kind === 'stanza') {
    const versos = context.task.kind === 'passage' ? context.task.original.length : context.verses;
    return { quantos: `${n} blocos inteiros, de ${versos} versos cada`, molde: bloco };
  }
  if (context.task.kind === 'fragment') {
    return {
      quantos: `${n} trechos — só o pedaço que substitui a marca, sem o verso em volta`,
      molde: ['<trecho>'],
    };
  }
  return { quantos: `${n} versos`, molde: ['<verso>'] };
}

export function buildSystem(context: ProposalContext): string {
  const { quantos, molde } = unidadeDaResposta(context);

  const partes: string[] = [
    'Você propõe versos para um poeta brasileiro que está escrevendo. Ele decide;',
    'você nunca decide por ele. Proponha alternativas, não a resposta certa.',
    '',
    REGRAS,
    '',
  ];

  if (context.hasTool) {
    partes.push(
      'MÉTODO — siga nesta ordem, sempre:',
      '',
      '1. Rascunhe mais versos do que vai entregar (uns 8).',
      '2. Chame a ferramenta `escandir` com todos eles de uma vez.',
      '3. Leia a medida. Onde não fechou, reescreva mexendo no número de sílabas',
      '   — troque uma palavra por outra mais curta ou mais longa, mude a ordem —',
      '   e chame `escandir` de novo.',
      '4. Repita até ter os que precisa fechando a forma.',
      '5. Só então responda, com os que fecharam.',
      '',
      'Não confie na sua contagem: ela erra. A ferramenta não erra. Chamá-la é',
      'barato e roda no computador do autor. Use quantas vezes precisar.',
      '',
    );
  } else {
    partes.push(
      'Conte as sílabas devagar, uma a uma, aplicando as elisões, antes de decidir',
      'que um verso está pronto.',
      '',
    );
  }

  partes.push(
    'FORMATO DA RESPOSTA FINAL:',
    `- Exatamente ${quantos}, e nada mais.`,
    `- Separe cada proposta por uma linha contendo só ${SEPARATOR}`,
    '- Sem numeração, sem aspas, sem título, sem comentário, sem explicação.',
    '- Nada de texto antes da primeira proposta nem depois da última.',
    '',
    'Molde, para dois candidatos. Os sinais <> marcam onde vai o texto e não',
    'fazem parte da resposta:',
    '',
    ...molde,
    SEPARATOR,
    ...molde,
    '',
    'SOBRE O QUE PROPOR:',
    '- O poema do autor, que vai no pedido, é a única referência de voz: siga o',
    '  vocabulário, o registro e as imagens do que já está escrito. Você está',
    '  continuando a voz dele, não estreando a sua.',
    '- Evite rima previsível e imagem gasta.',
    '- Prefira concreto a abstrato: coisa que se vê, se toca, se ouve.',
    '- Varie entre as propostas. Alternativas que se parecem não são alternativas:',
    '  mude a imagem, não só as palavras.',
    '- Sintaxe de quem fala português, não de quem precisa fechar a conta.',
    '  Verso que só funciona com inversão forçada não serve.',
  );

  return partes.join('\n');
}

/**
 * A tarefa, dita em voz alta. Cada uma tem uma restrição diferente, e trocá-las
 * não é detalhe: pedir "complete" quando se queria "varie" faz o modelo colar
 * texto novo no fim do verso e estourar a medida — foi exatamente o que
 * acontecia.
 */
function tarefaLinhas(task: Task): string[] {
  switch (task.kind) {
    case 'write':
      return ['Escreva o verso que falta.'];

    case 'complete':
      return [
        `Complete este verso, mantendo o começo exatamente como está: "${task.partial}"`,
        'Devolva o verso inteiro, do início ao fim, não só a parte que falta.',
      ];

    case 'rewrite':
      return [
        `Este verso não fecha a forma (${task.problem}):`,
        `  "${task.original}"`,
        'Reescreva-o. Guarde a imagem e o sentido; mude o que for preciso nas',
        'palavras para a medida fechar. Não é para continuar o verso — é para',
        'refazê-lo inteiro, do mesmo tamanho que a forma pede.',
      ];

    case 'vary':
      return [
        'Este verso já está escrito e já fecha a forma:',
        `  "${task.original}"`,
        'Proponha **outras versões dele** — mesmo lugar no poema, outra maneira',
        'de dizer. Cada proposta é um verso inteiro e independente, não uma',
        'continuação deste. Não repita o verso original nem o use como começo.',
      ];

    case 'fragment':
      return [
        `O verso como está mede ${task.lineCount} e se escande assim:`,
        `  ${task.lineScansion}`,
        `O trecho marcado ocupa ${task.selectedSyllables} sílabas dessa conta. O substituto`,
        'precisa ocupar o mesmo espaço e pôr tônica onde a forma pede — copie a',
        'forma acima, não só o número. Meça sempre com a ferramenta, que encaixa o',
        'trecho no verso antes de contar.',
        '',
        'Neste verso:',
        `  "${task.line}"`,
        `o autor marcou o trecho: "${task.selected}"`,
        '',
        'Proponha **substitutos para o trecho marcado**, e só para ele.',
        'Responda apenas com o trecho novo, sem o resto do verso em volta.',
        'O que está fora da marca não muda, e a medida do verso inteiro tem de',
        'continuar fechando — então o substituto precisa caber no lugar exato.',
      ];

    case 'stanza':
      return [`Escreva a estrofe de ${task.verses} versos que falta.`];

    case 'passage':
      return [
        `O autor marcou estes ${task.original.length} versos:`,
        ...task.original.map((verso) => `  ${verso}`),
        '',
        `Proponha **outras versões do trecho inteiro**, cada uma com ${task.original.length} versos.`,
        'Guarde o que o trecho faz no poema — o movimento, as imagens que ele',
        'carrega — e mude a maneira de dizer. Não é para continuar nem para',
        'resumir: é para reescrever o mesmo trecho de outro jeito.',
      ];

    case 'note':
      return [
        `O autor escreveu este pedido no meio do poema: "${task.instruction}"`,
        'Escreva o verso que atende a ele.',
      ];

    case 'poem':
      return tarefaPoema(task);
  }
}

type PoemTask = Extract<Task, { kind: 'poem' }>;

function tarefaPoema(task: PoemTask): string[] {
  const inteiro = task.lead.texts.length === 0;
  const extensao =
    task.verses > 0
      ? `${task.verses} versos`
      : 'a extensão que o assunto pedir, entre 8 e 16 versos';
  const partes: string[] = [];

  if (task.source === 'note') {
    partes.push(`O autor escreveu este pedido no poema: "${task.instruction}"`);
  } else {
    partes.push('O ponto de partida é o que o autor disse acima sobre o poema.');
  }
  partes.push(
    inteiro
      ? `Escreva o poema inteiro: ${extensao}.`
      : `Escreva a estrofe seguinte do poema, continuando o que já está escrito: ${extensao}.`,
    'Cada proposta é um bloco completo, que funciona sozinho e se lê de ponta a',
    'ponta; as propostas são alternativas entre si, não partes umas das outras.',
    'Um verso por linha. Não deixe linha em branco entre estrofes: no editor, cada',
    'linha é um verso e ocupa uma letra do esquema de rima.',
  );

  const verses = task.verses > 0 ? task.verses : task.scheme.length;
  const esquema = describeScheme(task.scheme, verses, task.lead.texts.length);
  if (esquema.length > 0) {
    partes.push('', ...esquema);
    if (task.verses <= 0) partes.push('(o esquema cicla: depois do último, recomeça do primeiro)');
    // Rima com o que já estava escrito: o modelo não tem como adivinhar qual
    // verso anterior carrega a letra, então diz-se a terminação de cada um.
    const vazios = Array.from({ length: verses }, () => '');
    const presos = schemeChecks(
      vazios,
      vazios.map(() => NO_RHYME),
      task.scheme,
      task.lead,
    ).flatMap((check, i) => {
      if (check.ref === null || check.ref >= 0 || check.target === null) return [];
      const origem = task.lead.texts[task.lead.texts.length + check.ref] ?? '';
      return [`  o ${i + 1}º verso rima em "-${check.target.tail}", com "${origem}"`];
    });
    if (presos.length > 0) partes.push('Rimas que vêm do que já está escrito:', ...presos);
    partes.push(
      'Versos de mesma letra rimam entre si por som, da vogal tônica ao fim. A',
      'mesma palavra repetida não é rima.',
    );
  }
  return partes;
}

/** Título que o editor põe sozinho não é do autor, e não vai no pedido. */
const SEM_TITULO = 'sem título';

/**
 * Quantas linhas de verso a proposta ocupa no poema, para a numeração do que
 * vem depois não pular nem repetir.
 */
function versosDoPedido(context: ProposalContext): number {
  const task = context.task;
  if (task.kind === 'poem') return task.verses;
  if (task.kind === 'passage') return task.original.length;
  return context.kind === 'stanza' ? context.verses : 1;
}

/**
 * Uma linha do poema como dado: número do verso, letra do esquema, medida e
 * terminação. É o que o sistema já sabe sobre cada verso, e é o que deixa o
 * modelo ver a forma do poema **deste** autor em vez de uma forma de exemplo.
 */
function linhaDoPoema(line: PoemLine, numero: number): string {
  if (line.kind === 'heading') return `     título de seção: ${line.text}`;
  if (line.kind === 'note') return `     nota do autor: ${line.text}`;
  const letra = line.letter === '' ? ' ' : line.letter;
  const rotulo = `${String(numero).padStart(3)} ${letra}`;
  if (line.text.trim() === '') return `${rotulo} [vazio]`;
  const medida =
    line.count === null
      ? (line.problem ?? 'sem medida')
      : `${line.count}${line.problem === null ? '' : `, ${line.problem}`}`;
  const rima = line.rhyme === '' ? '' : ` · -${line.rhyme}`;
  return `${rotulo} [${medida}${rima}] ${line.text}`;
}

function textoLinhas(context: ProposalContext): string[] {
  const saida: string[] = [];
  let numero = 0;
  const escreve = (line: PoemLine): void => {
    if (line.kind === 'verse') numero += 1;
    saida.push(linhaDoPoema(line, numero));
  };
  context.before.forEach(escreve);

  const primeiro = numero + 1;
  const ocupa = versosDoPedido(context);
  const onde =
    context.kind === 'stanza'
      ? ocupa > 0
        ? `versos ${primeiro} a ${primeiro + ocupa - 1}`
        : `a partir do verso ${primeiro}`
      : `verso ${primeiro}${context.scheme === '' ? '' : `, letra ${letterAt(context.scheme, primeiro - 1)}`}`;
  saida.push(
    context.kind === 'stanza'
      ? `>>> a estrofe pedida entra aqui <<< (${onde})`
      : `>>> o verso pedido entra aqui <<< (${onde})`,
  );
  numero += Math.max(ocupa, 0);

  context.after.forEach(escreve);
  return saida;
}

/** A forma declarada, campo por campo — as quatro coisas independentes. */
function formaLinhas(context: ProposalContext): string[] {
  const { spec } = context;
  const linhas: string[] = [];
  linhas.push(
    spec.syllables > 0
      ? `medida: ${spec.syllables} sílabas poéticas por verso, contadas até a última tônica`
      : 'medida: verso livre, sem número fixo de sílabas',
  );
  if (spec.syllables > 0 && spec.requiredStresses.length > 0) {
    linhas.push(`tônicas obrigatórias: ${spec.requiredStresses.map((p) => `${p}ª`).join(', ')}`);
  }
  linhas.push(context.scheme === '' ? 'esquema de rima: sem rima fixa' : `esquema de rima: ${context.scheme}`);
  const escritos = [...context.before, ...context.after].filter(
    (line) => line.kind === 'verse' && line.text.trim() !== '',
  ).length;
  linhas.push(
    context.declaredVerses > 0
      ? `extensão: ${context.declaredVerses} versos, ${escritos} escritos`
      : `extensão: livre, ${escritos} versos escritos`,
  );
  return linhas;
}

export function buildUser(context: ProposalContext): string {
  const partes: string[] = [];

  const titulo = context.title.trim();
  if (titulo !== '' && titulo.toLowerCase() !== SEM_TITULO) {
    partes.push('TÍTULO', titulo, '');
  }

  /*
   * O tema vem antes da forma, porque é o que enquadra tudo o mais.
   *
   * A primeira versão desta seção dizia "não repita estes termos", temendo que
   * o modelo encaixasse as palavras do tema à força. Saiu o contrário do
   * esperado: ele evitou justamente as coisas concretas que carregavam o
   * poema e entregou atmosfera genérica. O que se evita é a paráfrase, não o
   * material.
   *
   * A instrução já ilustrou isso com um par de palavras inventado. Saiu pelo
   * mesmo motivo dos versos de exemplo: a palavra do exemplo aparecia nos
   * poemas. A regra agora aponta para o tema do próprio autor, que está logo
   * acima dela.
   */
  if (context.theme.trim() !== '') {
    partes.push(
      'DO QUE O POEMA TRATA — nas palavras do autor',
      context.theme.trim(),
      '',
      'As coisas concretas nomeadas aí — objetos, lugares, sons, de onde se olha —',
      'são o material do poema. USE-AS. O que não se faz é parafrasear o tema nem',
      'explicá-lo em verso.',
      '',
      'Prefira sempre o particular ao geral: o que o tema nomeia, o verso nomeia',
      'com a mesma palavra, não com a categoria a que ela pertence nem com um',
      'termo mais vago. Trocar o específico pelo genérico é perder o poema.',
      '',
      'Teste cada verso antes de entregar: ele caberia em qualquer outro poema?',
      'Então não está usando o tema.',
      '',
    );
  }

  partes.push('FORMA', ...formaLinhas(context));

  if (context.rhymeTarget !== null && context.rhymeTarget.tail !== '') {
    partes.push(
      '',
      'RIMA PEDIDA',
      `O verso pedido precisa terminar rimando em "-${context.rhymeTarget.tail}".`,
      'A rima vai da vogal tônica até o fim do verso, então a terminação inteira',
      'precisa bater, não só a última letra. A comparação é por som, não por',
      'letra: grafia diferente com o mesmo som serve.',
      ...(context.usedRhymeWords.length > 0
        ? [
            `NÃO termine com estas palavras, que o poema já usou nesta rima: ${context.usedRhymeWords.join(', ')}.`,
            'Palavra rimando com ela mesma não é rima — é repetição, e o verso é recusado.',
          ]
        : []),
    );
  }

  if (context.before.length > 0 || context.after.length > 0) {
    partes.push(
      '',
      'O POEMA ATÉ AQUI',
      'Cada verso vem com o número, a letra do esquema e, entre colchetes, a medida',
      'que o motor deu e a terminação da rima. É o poema do autor: a voz a seguir.',
      '',
      ...textoLinhas(context),
    );
  }

  partes.push('', 'TAREFA');
  partes.push(...tarefaLinhas(context.task));

  if (context.rejected !== undefined && context.rejected.length > 0) {
    partes.push(
      '',
      'A TENTATIVA ANTERIOR ERROU A MEDIDA',
      'Estes não serviram, com o motivo medido pelo motor:',
      ...context.rejected.map((linha) => `- ${linha}`),
      context.hasTool
        ? 'Meça com `escandir` antes de responder desta vez.'
        : 'Conte de novo com cuidado, lembrando das elisões e da regra da última tônica.',
    );
  }

  return partes.join('\n');
}
