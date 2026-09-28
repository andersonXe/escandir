/**
 * Montagem do pedido. Não sabe de provedor nenhum.
 *
 * A primeira versão deste arquivo explicava as regras de escansão e pedia que
 * o modelo contasse certo. Não funcionou, e não ia funcionar: contar sílaba
 * poética é justamente o que LLM faz mal, e explicar melhor não conserta uma
 * limitação de percepção. O que funciona é a ferramenta `escandir` — o modelo
 * mede em vez de adivinhar, e o motor mede tudo de novo depois.
 *
 * **Regras no sistema, obra no pedido.** O pedido é dado, não conversa: a obra
 * inteira em `<obra>` — título, tema, forma, comentários com a posição de cada
 * um, e o texto medido verso a verso —, e o que se quer em `<pedido>`. Quando
 * as instruções vinham misturadas ao poema, o poema virava mais um parágrafo
 * entre parágrafos, e o modelo o considerava pouco.
 *
 * **Nenhum exemplo.** Houve três decassílabos escandidos aqui, e o formato da
 * resposta era ilustrado com versos de verdade. Exemplo é o molde mais forte
 * de um prompt: o modelo levava o assunto e a cadência junto com a contagem.
 * Regra se enuncia; formato se mostra com marcadores.
 */

import { type MetricSpec, NO_RHYME, type Rhyme } from '@escandir/engine';

import {
  describeScheme,
  insideBlock,
  letterAt,
  schemeChecks,
  writtenPartner,
  type SchemeLead,
} from './esquema.js';
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
  /**
   * Estrofe inteira por escrever, no meio do poema. Com esquema, cada verso
   * tem a sua letra e rima com os vizinhos já escritos — antes **ou depois**,
   * porque há quem escreva o fecho primeiro.
   */
  | { readonly kind: 'stanza'; readonly verses: number; readonly block?: SchemeBlock }
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
      /** Versos já escritos depois do bloco. Só com extensão fixa. */
      readonly trail?: SchemeLead;
    };

/** O esquema em volta de um bloco: o que vem antes e o que já está depois. */
export interface SchemeBlock {
  /** Esquema do poema, a partir do primeiro verso dele. */
  readonly scheme: string;
  readonly lead: SchemeLead;
  readonly trail?: SchemeLead;
}

export interface ProposalContext {
  readonly kind: ProposalKind;
  readonly spec: MetricSpec;
  /** Terminação que a rima precisa casar, ex.: `ar`. `null` = livre. */
  readonly rhymeTarget: Rhyme | null;
  /**
   * As linhas antes e depois do ponto pedido, já medidas. Juntas são a obra
   * inteira, menos o que a proposta vai substituir.
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
  /**
   * O que o autor já viu neste ponto, nesta sessão, e não aceitou. Pedir de
   * novo é dizer "outra coisa"; sem isto o pedido saía idêntico e a resposta
   * também.
   */
  readonly alreadyShown?: readonly string[];
  /** Palavras que já rimam nesta posição. Repeti-las não é rimar. */
  readonly usedRhymeWords: readonly string[];
  /** A ferramenta está disponível nesta chamada. */
  readonly hasTool: boolean;
}

export const SEPARATOR = '---';

const COMO_LER = `O PEDIDO chega em duas partes:
- <obra>: o poema do autor inteiro, como dado — título, tema, forma, os
  comentários dele e o texto medido verso a verso.
- <pedido>: o ponto do texto onde você vai propor, e o que se quer ali.`;

const A_OBRA = `A OBRA É A REFERÊNCIA, NÃO VOCÊ
- Leia a obra inteira antes de escrever. O que você propõe vai morar dentro
  dela e tem de soar como o resto: o mesmo vocabulário, o mesmo registro, as
  mesmas imagens, a mesma sintaxe. Continue a voz do autor; não estreie a sua.
- Os comentários do autor são instruções dele para você. Os que estão junto
  ao ponto pedido valem para TODAS as propostas. Os outros dizem o que ele quer
  do poema como um todo. Nenhuma proposta pode contrariar um comentário.
- O tema é o chão do poema. As coisas concretas que ele nomeia — objetos,
  lugares, sons, de onde se olha — são o material: USE-AS, com a mesma palavra
  que o autor usou, não com a categoria a que ela pertence nem com um termo
  mais vago. Prefira o particular ao geral. Não parafraseie o tema nem o
  explique em verso.
- Teste cada verso antes de entregar: ele caberia em qualquer outro poema?
  Então não está usando esta obra.`;

const VARIEDADE = `PROPOSTAS DIFERENTES DE VERDADE
- O autor escolhe entre as propostas. Se elas se parecem, ele não tem escolha.
- Antes de rascunhar, dê a cada proposta um ponto de partida diferente, tirado
  da obra: outra imagem do texto, outro elemento do tema ou dos comentários,
  outro ângulo de quem fala, outra construção de frase, outro jogo de som —
  o eco entre duas palavras, a de mesmo som e outro sentido, a aliteração.
- Cada proposta termina numa palavra diferente.
- Se o pedido traz propostas já mostradas ao autor, ele as viu e pediu de novo:
  quer outra coisa. Não as repita, não as parafraseie, não reuse as palavras
  finais delas.`;

const REGRAS = `A MEDIDA
1. Elisão entre palavras é a REGRA, não a exceção. Vogal final átona funde
   com vogal inicial seguinte, e as duas viram uma sílaba só.
2. A contagem PARA NA ÚLTIMA TÔNICA. O que vem depois existe e não conta.
   Por isso verso terminado em palavra grave mede uma sílaba a menos do que
   se fala, e em palavra esdrúxula, duas.
3. Sílaba poética não é sílaba gramatical.
4. Sintaxe de quem fala português, não de quem precisa fechar a conta. Verso
   que só fecha com inversão forçada não serve.`;

/**
 * O que se espera por proposta. Precisa casar com a TAREFA: quando o pedido
 * era de trecho e o formato dizia 'versos', o modelo devolveu quatro
 * separadores vazios — entendeu o formato, não soube o que pôr dentro.
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
    COMO_LER,
    '',
    A_OBRA,
    '',
    VARIEDADE,
    '',
    REGRAS,
    '',
  ];

  if (context.hasTool) {
    partes.push(
      'MÉTODO — siga nesta ordem, sempre:',
      '1. Escolha os pontos de partida, um por proposta.',
      '2. Rascunhe mais versos do que vai entregar (uns 8).',
      '3. Chame a ferramenta `escandir` com todos eles de uma vez.',
      '4. Leia a medida. Onde não fechou, reescreva mexendo no número de sílabas',
      '   — troque uma palavra por outra mais curta ou mais longa, mude a ordem —',
      '   e chame `escandir` de novo. Ajuste sem perder o ponto de partida.',
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
      return [
        `Escreva a estrofe de ${task.verses} versos que falta.`,
        ...(task.block === undefined ? [] : esquemaDoBloco(task.block, task.verses, false)),
      ];

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
    partes.push('O ponto de partida é o tema, em <obra>.');
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
  const block: SchemeBlock = {
    scheme: task.scheme,
    lead: task.lead,
    ...(task.trail === undefined ? {} : { trail: task.trail }),
  };
  partes.push(...esquemaDoBloco(block, verses, task.verses <= 0));
  return partes;
}

/**
 * O esquema de um bloco, dito por extenso, com a rima que cada verso herda do
 * que já está escrito — antes ou depois dele. O modelo não tem como adivinhar
 * qual verso escrito carrega a letra, então diz-se a terminação e o verso.
 */
function esquemaDoBloco(block: SchemeBlock, verses: number, cicla: boolean): string[] {
  const esquema = describeScheme(block.scheme, verses, block.lead.texts.length);
  if (esquema.length === 0) return [];
  const partes: string[] = ['', ...esquema];
  if (cicla) partes.push('(o esquema cicla: depois do último, recomeça do primeiro)');
  const vazios = Array.from({ length: verses }, () => '');
  const presos = schemeChecks(
    vazios,
    vazios.map(() => NO_RHYME),
    block.scheme,
    block.lead,
    block.trail,
  ).flatMap((check, i) => {
    if (check.target === null || insideBlock(check, verses)) return [];
    const origem = writtenPartner(check, verses, block.lead, block.trail);
    const onde = check.ref !== null && check.ref >= verses ? ', que vem depois' : '';
    return [`  o ${i + 1}º verso rima em "-${check.target.tail}", com "${origem}"${onde}`];
  });
  if (presos.length > 0) partes.push('Rimas que vêm do que já está escrito:', ...presos);
  partes.push(
    'Versos de mesma letra rimam entre si por som, da vogal tônica ao fim. A',
    'mesma palavra repetida não é rima.',
  );
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

/** Texto de várias linhas, recuado para caber sob uma chave. */
function recuado(texto: string, recuo = '  '): string[] {
  return texto
    .trim()
    .split(/\r?\n/)
    .map((linha) => `${recuo}${linha.trim()}`);
}

/**
 * Uma linha do texto como dado: número do verso, letra do esquema, medida e
 * terminação. É o que o sistema já sabe sobre cada verso, e é o que deixa o
 * modelo ver a forma do poema **deste** autor.
 */
function linhaDoPoema(line: PoemLine, numero: number): string {
  if (line.kind === 'heading') return `       # ${line.text}`;
  if (line.kind === 'note') return `       (comentário do autor: ${line.text})`;
  const letra = line.letter === '' ? ' ' : line.letter;
  const rotulo = `  ${String(numero).padStart(3)} ${letra}`;
  if (line.text.trim() === '') return `${rotulo} [vazio]`;
  const medida =
    line.count === null
      ? (line.problem ?? 'sem medida')
      : `${line.count}${line.problem === null ? '' : `, ${line.problem}`}`;
  const rima = line.rhyme === '' ? '' : ` · -${line.rhyme}`;
  return `${rotulo} [${medida}${rima}] ${line.text}`;
}

interface Comentario {
  readonly texto: string;
  readonly lugar: string;
  /** Está colado ao ponto pedido, sem verso escrito no meio. */
  readonly junto: boolean;
}

interface Leitura {
  readonly texto: string[];
  readonly comentarios: Comentario[];
  /** "verso 3, letra B" ou "versos 5 a 8". */
  readonly onde: string;
}

/**
 * Percorre a obra uma vez e tira dela o texto numerado, os comentários com o
 * lugar de cada um, e onde fica o ponto pedido.
 *
 * Comentário "junto" ao ponto é o que não tem verso escrito entre ele e o
 * ponto: é o que o autor deixou ali para ser atendido ali.
 */
function lerObra(context: ProposalContext): Leitura {
  const texto: string[] = [];
  const comentarios: Comentario[] = [];
  let numero = 0;

  const ultimoEscrito = context.before.reduce(
    (ultimo, line, i) => (line.kind === 'verse' && line.text.trim() !== '' ? i : ultimo),
    -1,
  );
  const primeiroEscrito = context.after.findIndex((line) => line.kind === 'verse' && line.text.trim() !== '');

  const lugar = (): string => (numero === 0 ? 'no começo do poema' : `depois do verso ${numero}`);

  context.before.forEach((line, i) => {
    if (line.kind === 'verse') numero += 1;
    if (line.kind === 'note' && line.text.trim() !== '') {
      comentarios.push({ texto: line.text.trim(), lugar: lugar(), junto: i > ultimoEscrito });
    }
    texto.push(linhaDoPoema(line, numero));
  });

  const primeiro = numero + 1;
  const ocupa = versosDoPedido(context);
  const onde =
    context.kind === 'stanza'
      ? ocupa > 0
        ? `versos ${primeiro} a ${primeiro + ocupa - 1}`
        : `a partir do verso ${primeiro}`
      : `verso ${primeiro}${context.scheme === '' ? '' : `, letra ${letterAt(context.scheme, primeiro - 1)}`}`;
  texto.push(
    context.kind === 'stanza'
      ? `  >>> a estrofe pedida entra aqui <<< (${onde})`
      : `  >>> o verso pedido entra aqui <<< (${onde})`,
  );
  numero += Math.max(ocupa, 0);

  context.after.forEach((line, i) => {
    if (line.kind === 'verse') numero += 1;
    if (line.kind === 'note' && line.text.trim() !== '') {
      const junto = primeiroEscrito === -1 || i < primeiroEscrito;
      comentarios.push({ texto: line.text.trim(), lugar: lugar(), junto });
    }
    texto.push(linhaDoPoema(line, numero));
  });

  return { texto, comentarios, onde };
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
  linhas.push(
    context.scheme === ''
      ? 'esquema de rima: sem rima fixa'
      : `esquema de rima: ${context.scheme} (a letra de cada verso está no texto)`,
  );
  const escritos = [...context.before, ...context.after].filter(
    (line) => line.kind === 'verse' && line.text.trim() !== '',
  ).length;
  linhas.push(
    context.declaredVerses > 0
      ? `extensão: ${context.declaredVerses} versos, ${escritos} escritos`
      : `extensão: livre, ${escritos} versos escritos`,
  );
  return linhas.map((linha) => `  ${linha}`);
}

/**
 * A obra inteira como dado. Nada aqui é instrução: é o que o autor escreveu e
 * declarou, organizado. As instruções sobre como usá-la estão no sistema.
 */
function obraLinhas(context: ProposalContext, leitura: Leitura): string[] {
  const partes: string[] = ['<obra>'];

  const titulo = context.title.trim();
  if (titulo !== '' && titulo.toLowerCase() !== SEM_TITULO) partes.push(`título: ${titulo}`);

  // O tema vem antes da forma: é o que enquadra o resto.
  if (context.theme.trim() !== '') partes.push('tema, nas palavras do autor:', ...recuado(context.theme));

  partes.push('forma:', ...formaLinhas(context));

  partes.push(
    leitura.comentarios.length === 0 ? 'comentários do autor: nenhum' : 'comentários do autor:',
    ...leitura.comentarios.map((c) => `  - ${c.lugar}: ${c.texto}`),
  );

  partes.push(
    'texto — número do verso, letra do esquema, [medida pelo motor · terminação da rima]:',
    ...leitura.texto,
    '</obra>',
  );
  return partes;
}

function pedidoLinhas(context: ProposalContext, leitura: Leitura): string[] {
  const partes: string[] = ['<pedido>', `onde: ${leitura.onde}`, 'tarefa:'];
  partes.push(...tarefaLinhas(context.task).map((linha) => (linha === '' ? '' : `  ${linha}`)));

  const junto = leitura.comentarios.filter((c) => c.junto);
  if (junto.length > 0) {
    partes.push(
      'comentários do autor junto a este ponto — atenda a eles em TODAS as propostas:',
      ...junto.map((c) => `  - ${c.texto}`),
    );
  }

  if (context.rhymeTarget !== null && context.rhymeTarget.tail !== '') {
    partes.push(
      `rima: termina rimando em "-${context.rhymeTarget.tail}", por som, da vogal tônica até o fim`,
      '  (grafia diferente com o mesmo som serve; só a última letra não basta)',
    );
    if (context.usedRhymeWords.length > 0) {
      partes.push(
        `  NÃO termine com: ${context.usedRhymeWords.join(', ')} — o poema já rima com elas aqui,`,
        '  e palavra rimando com ela mesma é repetição: o verso é recusado.',
      );
    }
  }

  const mostrados = context.alreadyShown ?? [];
  if (mostrados.length > 0) {
    partes.push(
      'já mostrados ao autor neste ponto, e ele pediu de novo — quer outra coisa:',
      ...mostrados.map((texto) => `  - ${texto}`),
      '  Não repita, não parafraseie, não termine nas mesmas palavras. Parta de outro lugar da obra.',
    );
  }

  if (context.rejected !== undefined && context.rejected.length > 0) {
    partes.push(
      'a tentativa anterior errou a medida — estes não serviram, com o motivo medido pelo motor:',
      ...context.rejected.map((linha) => `  - ${linha}`),
      context.hasTool
        ? '  Meça com `escandir` antes de responder desta vez.'
        : '  Conte de novo com cuidado, lembrando das elisões e da regra da última tônica.',
    );
  }

  partes.push('</pedido>');
  return partes;
}

export function buildUser(context: ProposalContext): string {
  const leitura = lerObra(context);
  return [...obraLinhas(context, leitura), '', ...pedidoLinhas(context, leitura)].join('\n');
}
