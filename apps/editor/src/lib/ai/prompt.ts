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
 * régua** e mostra exemplos escandidos para calibrar a intuição. Quem garante
 * continua sendo o motor, que mede tudo de novo depois.
 */

import type { MetricSpec, Rhyme } from '@escandir/engine';

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
  | { readonly kind: 'note'; readonly instruction: string };

export interface ProposalContext {
  readonly kind: ProposalKind;
  readonly spec: MetricSpec;
  /** Terminação que a rima precisa casar, ex.: `ar`. `null` = livre. */
  readonly rhymeTarget: Rhyme | null;
  /** Versos já escritos antes do ponto pedido. */
  readonly before: readonly string[];
  readonly after: readonly string[];
  /** Do que o poema trata, na voz do autor. Contexto permanente. */
  readonly theme: string;
  /** Comentários do autor no documento, endereçados a quem propõe. */
  readonly notes: readonly string[];
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

/**
 * Exemplos escandidos. Valem mais que a regra enunciada: mostram a elisão
 * acontecendo, a contagem parando na tônica, e a sílaba extramétrica existindo
 * sem contar — as três coisas que o modelo erra sozinho.
 */
const EXEMPLOS = `Três versos decassílabos, escandidos (MAIÚSCULA = tônica, | separa sílaba,
parênteses = extramétrica):

  "A tarde desce lenta sobre o mar"
  a|TAR|de|DES|ce|LEN|ta|so|breo|MAR  ->  10
  Repare: "sobre o" virou "breo", uma sílaba só. Elisão.

  "e o vento esquece o nome que trazia"
  eo|VEN|toes|QUE|ceo|NO|me|que|tra|ZI|(a)  ->  10
  Repare: três elisões, e o "a" final não conta — vem depois da última tônica.
  O verso tem 11 sílabas faladas e mede 10.

  "e nada mais se move no lugar"
  e|NA|da|MAIS|se|MO|ve|no|lu|GAR  ->  10
  Nenhuma elisão. Aqui falado e medido coincidem.`;

const REGRAS = `O que torna a contagem diferente da intuição:

1. Elisão entre palavras é a REGRA, não a exceção. Vogal final átona funde
   com vogal inicial seguinte, e as duas viram uma sílaba só.
2. A contagem PARA NA ÚLTIMA TÔNICA. O que vem depois existe e não conta.
   Por isso verso terminado em palavra grave ("trazia", "lugar-es") mede uma
   a menos do que parece.
3. Sílaba poética não é sílaba gramatical.`;

function formaLinhas(spec: MetricSpec): string[] {
  if (spec.syllables <= 0) return ['Verso livre: sem número fixo de sílabas.'];
  const linhas = [`Cada verso: ${spec.syllables} sílabas poéticas, contadas até a última tônica.`];
  if (spec.requiredStresses.length > 0) {
    linhas.push(`Tônica obrigatória na: ${spec.requiredStresses.map((p) => `${p}ª`).join(', ')}.`);
  }
  return linhas;
}

/**
 * O que se espera por proposta. Precisa casar com a TAREFA: quando o pedido
 * era de trecho e o formato dizia 'versos', o modelo devolveu quatro
 * separadores vazios — entendeu o formato, não soube o que pôr dentro.
 */
function unidadeDaResposta(context: ProposalContext): { quantos: string; exemplo: string[] } {
  const n = context.candidates;
  if (context.kind === 'stanza') {
    const versos = context.task.kind === 'passage' ? context.task.original.length : context.verses;
    return {
      quantos: `${n} blocos inteiros, de ${versos} versos cada`,
      exemplo: ['e nada mais se move no lugar', 'a tarde desce lenta sobre o mar'],
    };
  }
  if (context.task.kind === 'fragment') {
    return {
      quantos: `${n} trechos — só o pedaço que substitui a marca, sem o verso em volta`,
      exemplo: ['entre os bancos vazios', 'por sobre as cadeiras'],
    };
  }
  return { quantos: `${n} versos`, exemplo: ['e nada mais se move no lugar', 'a tarde desce lenta sobre o mar'] };
}

export function buildSystem(context: ProposalContext): string {
  const { quantos, exemplo } = unidadeDaResposta(context);

  const partes: string[] = [
    'Você propõe versos para um poeta brasileiro que está escrevendo. Ele decide;',
    'você nunca decide por ele. Proponha alternativas, não a resposta certa.',
    '',
    REGRAS,
    '',
    EXEMPLOS,
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
    'Exemplo de resposta final bem formada, para dois candidatos:',
    '',
    exemplo[0] ?? '',
    SEPARATOR,
    exemplo[1] ?? '',
    '',
    'SOBRE O QUE PROPOR:',
    '- Siga o vocabulário, o registro e as imagens do que já está escrito.',
    '  A voz é do autor; você está continuando a dele, não estreando a sua.',
    '- Evite rima previsível e imagem gasta (coração/emoção, amor/dor, vida/ferida).',
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
  }
}

export function buildUser(context: ProposalContext): string {
  const partes: string[] = [];

  /*
   * O tema vem primeiro, antes da forma, porque é o que enquadra tudo o mais.
   *
   * A primeira versão desta seção dizia "não repita estes termos", temendo que
   * o modelo encaixasse as palavras do tema à força. Saiu o contrário do
   * esperado: ele evitou justamente as coisas concretas que carregavam o
   * poema — escreveu "trânsito" onde o tema dizia "bonde" — e entregou
   * atmosfera genérica. O que se evita é a paráfrase, não o material.
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
      'Prefira sempre o particular ao geral: se o tema diz "bonde", escreva bonde,',
      'não "trânsito"; se diz "janela alta", o verso olha de cima em vez de falar',
      'em "altura". Trocar o específico pelo genérico é perder o poema.',
      '',
      'Teste cada verso antes de entregar: ele caberia em qualquer outro poema?',
      'Então não está usando o tema.',
      '',
    );
  }

  partes.push('FORMA');
  partes.push(...formaLinhas(context.spec));
  if (context.rhymeTarget !== null && context.rhymeTarget.tail !== '') {
    partes.push(
      `Rima: o verso pedido precisa terminar rimando em "-${context.rhymeTarget.tail}"`,
      'A comparação é por som, não por letra: "caça" rima com "massa", "giz" com',
      '"quis", "mal" com "mau". Grafia diferente com o mesmo som serve.',
      ...(context.usedRhymeWords.length > 0
        ? [
            `NÃO termine com estas palavras, que o poema já usou nesta rima: ${context.usedRhymeWords.join(', ')}.`,
            'Palavra rimando com ela mesma não é rima — é repetição, e o verso é recusado.',
          ]
        : []),
      '(a rima vai da vogal tônica até o fim do verso, então a terminação inteira',
      'precisa bater, não só a última letra).',
    );
  }

  if (context.before.length > 0 || context.after.length > 0) {
    partes.push('', 'POEMA ATÉ AQUI');
    for (const linha of context.before) partes.push(linha === '' ? '(linha vazia)' : linha);
    partes.push(
      context.kind === 'stanza'
        ? '>>> a estrofe pedida entra aqui <<<'
        : '>>> o verso pedido entra aqui <<<',
    );
    for (const linha of context.after) partes.push(linha === '' ? '(linha vazia)' : linha);
  }

  if (context.notes.length > 0) {
    partes.push('', 'PEDIDOS DO AUTOR');
    for (const nota of context.notes) partes.push(`- ${nota}`);
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
