<script lang="ts">
  import { createAnalyzer, ptBR, rhymeOf, scanVerse, type Rhyme } from '@escandir/engine';

  import Ajustes from './components/Ajustes.svelte';
  import Biblioteca from './components/Biblioteca.svelte';
  import Forma from './components/Forma.svelte';
  import Line from './components/Line.svelte';
  import {
    DEFAULT_STYLE,
    fileName,
    FORMAT,
    MIME,
    parse,
    serialize,
    VERSION,
    newPoemId,
    type LineKind,
    type PoemDocument,
    type PoemStyle,
  } from './lib/document.js';
  import {
    DEFAULT_FORMA,
    formaLabel,
    matchModelo,
    newModeloId,
    type Forma as FormaType,
    type Modelo,
  } from './lib/forma.js';
  import { actionFor, type Action } from './lib/ai/action.js';
  import type { ProposalContext, Task } from './lib/ai/prompt.js';
  import { propose, type Candidate } from './lib/ai/propose.js';
  import { providerById } from './lib/ai/registry.js';
  import type { ProviderConfig, Usage } from './lib/ai/types.js';
  import { Lexicon } from '@escandir/lexicon';

  import { History } from './lib/history.js';
  import { EMPTY_SCAN, scanLine } from './lib/scan.js';
  import {
    clearAiConfig,
    debounced,
    deleteModelo,
    deletePoem,
    listModelos,
    listPoems,
    loadAiConfig,
    loadLastOpened,
    loadPoem,
    savePoem,
    saveAiConfig,
    saveModelo,
    setLastOpened,
    type PoemSummary,
  } from './lib/store.js';


  interface EditorLine {
    text: string;
    kind: LineKind;
    source: 'author' | 'ai';
  }

  /**
   * O editor abre vazio, e isso é decisão de produto, não esquecimento:
   * "nunca gerar verso completo, nem como exemplo, nem como ponto de partida".
   * Os versos de demonstração vivem nos testes do motor, onde são medida — não
   * no produto, onde seriam sugestão.
   */
  let lines = $state<EditorLine[]>([{ text: '', kind: 'verse', source: 'author' as const }]);
  let title = $state('sem título');
  /** Do que o poema trata. `theme` já é o claro/escuro; aqui é o assunto. */
  let tema = $state('');
  let temaAberto = $state(false);
  let forma = $state<FormaType>(DEFAULT_FORMA);
  let estilo = $state<PoemStyle>(DEFAULT_STYLE);
  let theme = $state<'claro' | 'escuro'>('claro');
  let screen = $state<'poema' | 'forma' | 'ajustes' | 'abrir'>('poema');
  let poemId = $state(newPoemId());
  let biblioteca = $state<PoemSummary[]>([]);
  let modelos = $state<Modelo[]>([]);

  /** Índice da linha com o cursor. Verso em curso não é verso errado. */
  let cursorLine = $state(0);
  /** Pedido de foco pendente: `[linha, coluna]`. */
  let pendingFocus = $state<[number, number] | null>(null);

  /**
   * Manda o cursor para uma linha. Marca `cursorLine` junto em vez de esperar
   * o evento de foco voltar: quem move o cursor já sabe para onde, e depender
   * do evento deixava a ação contextual apontando para a linha anterior.
   */
  function goTo(index: number, caret: number): void {
    // Mexer o cursor sem Shift desfaz a marca: é o que se espera de um editor.
    lineRange = null;
    cursorLine = index;
    pendingFocus = [index, caret];
  }

  /** Só grava depois de ler: senão o estado inicial vazio apaga o rascunho. */
  let ready = $state(false);
  let storageOk = $state(true);
  let notice = $state<string | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();

  const history = new History<EditorLine>();
  const rhymeAnalyzer = createAnalyzer(ptBR);

  const NO_AI: ProviderConfig = { providerId: 'openai', apiKey: '', model: '', baseUrl: '' };
  let aiConfig = $state<ProviderConfig>(NO_AI);
  const aiReady = $derived(aiConfig.apiKey.trim() !== '' && aiConfig.model.trim() !== '');

  interface ProposalState {
    readonly index: number;
    readonly action: Action;
    readonly loading: boolean;
    readonly error: string | null;
    readonly candidates: readonly Candidate[];
    readonly raw: string | null;
    readonly sent: string | null;
    readonly stage: string;
    /** Quantos versos esta proposta substitui ao ser aceita. */
    readonly replaces: number;
    /** O que esta proposta consumiu, somando todas as idas ao provedor. */
    readonly usage: Usage | null;
  }
  let proposal = $state<ProposalState | null>(null);

  /**
   * A chamada em curso, para poder desistir dela.
   *
   * Sem isto, fechar o painel só escondia a proposta: a requisição seguia até o
   * fim e seguia sendo cobrada. Num laço de ferramenta são várias idas ao
   * servidor, e o autor que mudou de ideia pagava as restantes sem ver nenhuma.
   *
   * A identidade do controlador é o que distingue uma resposta atual de uma
   * atrasada — comparar o índice da linha não bastaria, porque pedir de novo no
   * mesmo verso produz o mesmo índice.
   */
  let inFlight: AbortController | null = null;

  /** Desiste do que está no ar. Seguro de chamar quando não há nada. */
  function cancelProposal(): void {
    inFlight?.abort();
    inFlight = null;
  }

  /** Fecha o painel e desiste da chamada: recusar não deixa rastro nem conta. */
  function dismissProposal(): void {
    cancelProposal();
    proposal = null;
  }

  /**
   * Dicionário de rimas, carregado sob demanda. O manifesto é minúsculo e cada
   * consulta traz uma fatia de ~12 KB — não há motivo para carregar antes de
   * precisar, nem para carregar duas vezes.
   */
  let lexicon: Lexicon | null = null;
  let lexiconPending: Promise<Lexicon | null> | null = null;

  async function getLexicon(): Promise<Lexicon | null> {
    if (lexicon !== null) return lexicon;
    // Relativo à base: caminho absoluto quebraria num Pages de projeto,
    // servido em /<repo>/ e não na raiz.
    lexiconPending ??= Lexicon.load(`${import.meta.env.BASE_URL}lexico`)
      .then((carregado) => {
        lexicon = carregado;
        return carregado;
      })
      .catch((error: unknown) => {
        // Sem léxico o editor continua inteiro: é camada de ajuda, não de medida.
        console.warn('[metrica] léxico indisponível:', error);
        return null;
      });
    return lexiconPending;
  }
  /** Trecho marcado na linha do cursor. Vira a ação mais específica que existe. */
  let selection = $state<{ index: number; start: number; end: number } | null>(null);
  /**
   * Trecho marcado por verso, inclusivo nas duas pontas.
   *
   * Existe porque cada verso é um campo próprio, e navegador não seleciona
   * através de campos separados. A marca por verso não é remendo: é o gesto
   * certo para uma coisa que se pensa em versos, não em caracteres.
   */
  let lineRange = $state<{ from: number; to: number } | null>(null);

  const rangeSpan = $derived(
    lineRange === null ? null : { from: Math.min(lineRange.from, lineRange.to), to: Math.max(lineRange.from, lineRange.to) },
  );

  function inRange(index: number): boolean {
    return rangeSpan !== null && index >= rangeSpan.from && index <= rangeSpan.to;
  }

  function extendRange(to: number): void {
    const limite = Math.max(0, Math.min(to, lines.length - 1));
    lineRange = { from: lineRange?.from ?? cursorLine, to: limite };
    cursorLine = limite;
    pendingFocus = [limite, (lines[limite]?.text ?? '').length];
  }
  /** Última resposta crua do modelo. Existe para depurar o prompt junto. */
  let ultimaResposta = $state<string | null>(null);
  let ultimoPedido = $state<string | null>(null);

  const FONTES = ['Spectral', 'EB Garamond', 'Literata', 'IBM Plex Sans', 'IBM Plex Mono'];
  const FALLBACK: Record<string, string> = {
    'IBM Plex Sans': 'system-ui, sans-serif',
    'IBM Plex Mono': 'ui-monospace, monospace',
  };

  const poemFont = $derived(`'${estilo.font}', ${FALLBACK[estilo.font] ?? 'Georgia, serif'}`);

  const modeloAtual = $derived(matchModelo(forma, modelos));
  const formaNome = $derived(modeloAtual?.name.toLowerCase() ?? 'forma própria');

  /**
   * Título, nota e comentário não são poema: não entram na contagem de versos
   * nem consomem uma letra do esquema de rima. Inserir um "Refrão" no meio do
   * poema não pode deslocar todas as rimas abaixo dele.
   */
  const verseOrdinal = $derived.by(() => {
    const out: number[] = [];
    let n = 0;
    for (const line of lines) out.push(line.kind === 'verse' ? n++ : -1);
    return out;
  });

  const scans = $derived(
    lines.map((line, index) =>
      line.kind === 'verse' ? scanLine(line.text, forma.spec, index === cursorLine) : EMPTY_SCAN,
    ),
  );

  const errorCount = $derived(
    scans.filter((scan) => {
      const status = scan.assessment?.status;
      return status === 'over' || status === 'under' || status === 'rhythm';
    }).length,
  );

  const filled = $derived(
    lines.filter((line) => line.kind === 'verse' && line.text.trim() !== '').length,
  );
  const empty = $derived(lines.every((line) => line.text.trim() === ''));

  /**
   * O documento sai daqui em objetos simples, campo por campo.
   *
   * Não é cerimônia: o estado é um proxy reativo do Svelte, e o
   * `structuredClone` do IndexedDB recusa proxy. Espalhar o estado direto grava
   * silenciosamente nada. Construir explícito também deixa o formato visível
   * num lugar só.
   */
  function snapshot(): PoemDocument {
    return {
      format: FORMAT,
      version: VERSION,
      id: poemId,
      title,
      theme: tema,
      spec: {
        syllables: forma.spec.syllables,
        requiredStresses: [...forma.spec.requiredStresses],
      },
      rhyme: forma.rhyme,
      verses: forma.verses,
      style: { font: estilo.font, size: estilo.size },
      lines: lines.map((line) => ({ text: line.text, kind: line.kind, source: line.source })),
      updatedAt: new Date().toISOString(),
    };
  }

  function apply(doc: PoemDocument): void {
    poemId = doc.id;
    title = doc.title;
    tema = doc.theme;
    temaAberto = doc.theme.trim() !== '';
    forma = { spec: doc.spec, rhyme: doc.rhyme, verses: doc.verses };
    estilo = doc.style;
    lines = doc.lines.map((line) => ({
      text: line.text,
      kind: line.kind ?? 'verse',
      source: line.source ?? 'author',
    }));
    cursorLine = 0;
    dismissProposal();
    history.clear();
    void setLastOpened(doc.id);
  }

  const persist = debounced((doc: PoemDocument) => {
    void savePoem(doc).then((ok) => {
      storageOk = ok;
    });
  }, 400);

  $effect(() => {
    void loadLastOpened().then((doc) => {
      if (doc !== null) apply(doc);
      ready = true;
    });
    void listModelos().then((list) => {
      modelos = list;
    });
    void loadAiConfig().then((saved) => {
      if (saved !== null) aiConfig = saved;
    });
  });

  function changeAiConfig(next: ProviderConfig): void {
    aiConfig = next;
    void saveAiConfig(next);
  }

  function forgetAiConfig(): void {
    aiConfig = NO_AI;
    void clearAiConfig();
  }

  $effect(() => {
    // Montar o documento é o que assina as dependências: `snapshot` percorre
    // `lines` elemento a elemento. Tocar só na variável (`void lines`) observa
    // a reatribuição do array e não a edição de um verso — digitar não gravava.
    const doc = snapshot();
    if (!ready) return;
    persist(doc);
  });

  function currentState() {
    return {
      lines: lines.map((line) => ({ text: line.text, kind: line.kind, source: line.source })),
      cursor: cursorLine,
      // A coluna de verdade, quando se sabe qual é. Zero fixo mandava o cursor
      // para o começo do verso a cada desfazer, e quem desfaz quer continuar de
      // onde estava, não recomeçar a linha.
      caret: selection !== null && selection.index === cursorLine ? selection.start : 0,
    };
  }

  function record(force = false): void {
    history.push(currentState(), force);
  }

  function undo(): void {
    const previous = history.undo(currentState());
    if (previous === null) return;
    lines = previous.lines.map((line) => ({ ...line }));
    goTo(Math.min(previous.cursor, lines.length - 1), previous.caret);
  }

  function redo(): void {
    const next = history.redo(currentState());
    if (next === null) return;
    lines = next.lines.map((line) => ({ ...line }));
    goTo(Math.min(next.cursor, lines.length - 1), next.caret);
  }

  /**
   * Declarar uma forma com número de versos num poema em branco abre as linhas
   * vazias correspondentes: é o poeta vendo o tamanho do que vai escrever.
   * Num poema já começado, não se mexe — a forma muda, o texto não.
   */
  function changeForma(next: FormaType): void {
    const abriuEstrofe = next.verses > 0 && empty && lines.length < next.verses;
    forma = next;
    if (abriuEstrofe) {
      record(true);
      lines = Array.from({ length: next.verses }, () => ({
        text: '',
        kind: 'verse' as LineKind,
        source: 'author' as const,
      }));
    }
  }

  function rhymeFor(index: number): string {
    if (forma.rhyme === '') return '';
    const ordinal = verseOrdinal[index] ?? -1;
    if (ordinal < 0) return '';
    return forma.rhyme[ordinal % forma.rhyme.length] ?? '';
  }

  function focusAt(index: number): number | null {
    return pendingFocus !== null && pendingFocus[0] === index ? pendingFocus[1] : null;
  }

  /**
   * Texto colado com quebras de linha vira várias linhas.
   *
   * O campo é de uma linha só por convenção, não por construção: colar insere
   * os `\n` de verdade. Quem separa é isto, e por isso vale para qualquer
   * caminho de entrada, não só para o atalho de colar.
   */
  function change(index: number, text: string): void {
    if (!text.includes('\n') && !text.includes('\r')) {
      record();
      const line = lines[index];
      if (line !== undefined) line.text = text;
      return;
    }
    record(true);
    const kind = lines[index]?.kind ?? 'verse';
    const parts = text.split(/\r\n|\r|\n/);
    lines.splice(index, 1, ...parts.map((part) => ({ text: part, kind, source: 'author' as const })));
    const last = index + parts.length - 1;
    goTo(last, (parts[parts.length - 1] ?? '').length);
  }

  function changeKind(index: number, kind: LineKind): void {
    record(true);
    const line = lines[index];
    if (line !== undefined) line.kind = kind;
  }

  function split(index: number, caret: number): void {
    record(true);
    const current = lines[index];
    if (current === undefined) return;
    const kind = current.kind;
    lines.splice(
      index,
      1,
      { text: current.text.slice(0, caret), kind, source: current.source },
      // Continuar um título gera um verso: o cabeçalho é uma linha, não um bloco.
      { text: current.text.slice(caret), kind: kind === 'heading' ? 'verse' : kind, source: current.source },
    );
    goTo(index + 1, 0);
  }

  function mergeBack(index: number): void {
    if (index === 0) return;
    record(true);
    const previous = lines[index - 1];
    const current = lines[index];
    if (previous === undefined || current === undefined) return;
    lines.splice(index - 1, 2, {
      text: previous.text + current.text,
      kind: previous.kind,
      source: previous.source,
    });
    goTo(index - 1, previous.text.length);
  }

  function mergeForward(index: number): void {
    if (index >= lines.length - 1) return;
    record(true);
    const current = lines[index];
    const next = lines[index + 1];
    if (current === undefined || next === undefined) return;
    lines.splice(index, 2, {
      text: current.text + next.text,
      kind: current.kind,
      source: current.source,
    });
    goTo(index, current.text.length);
  }

  function move(index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (target < 0 || target >= lines.length) return;
    goTo(target, delta === -1 ? (lines[target]?.text ?? '').length : 0);
  }

  /**
   * Terminação que este verso precisa casar, lida do primeiro verso anterior
   * com a mesma letra de rima. Rima é relação entre versos, não propriedade de
   * um — então o alvo só existe se já houver com quem rimar.
   */
  function rhymeTargetFor(index: number): Rhyme | null {
    const letra = rhymeFor(index);
    if (letra === '') return null;
    for (let i = index - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (line === undefined || line.kind !== 'verse') continue;
      if (rhymeFor(i) !== letra || line.text.trim() === '') continue;
      const reading = scanVerse(line.text, ptBR, rhymeAnalyzer, { spec: forma.spec }).best;
      if (reading === null) continue;
      const rima = rhymeOf(reading, line.text, ptBR.prosody);
      if (rima.sound !== '') return rima;
    }
    return null;
  }

  /**
   * Palavras que já fecham versos desta mesma letra de rima.
   *
   * Rimar uma palavra com ela mesma não é rimar: é repetir. O motor recusa, o
   * dicionário não as oferece, e o pedido avisa — as três pontas, porque uma
   * só o modelo contorna.
   */
  function usedRhymeWordsFor(index: number): string[] {
    const letra = rhymeFor(index);
    if (letra === '') return [];
    const palavras: string[] = [];
    lines.forEach((line, i) => {
      if (i === index || line.kind !== 'verse' || line.text.trim() === '') return;
      if (rhymeFor(i) !== letra) return;
      const achadas = line.text.toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu);
      const ultima = achadas === null ? '' : (achadas[achadas.length - 1] ?? '');
      if (ultima !== '') palavras.push(ultima);
    });
    return palavras;
  }

  /** Linhas de verso vazias a partir daqui: é o que distingue verso de estrofe. */
  function emptyRunFrom(index: number): number {
    let n = 0;
    for (let i = index; i < lines.length; i += 1) {
      const line = lines[i];
      if (line === undefined || line.kind !== 'verse' || line.text.trim() !== '') break;
      n += 1;
    }
    return n;
  }

  function actionAt(index: number): Action | null {
    const line = lines[index];
    if (line === undefined) return null;
    const marcado =
      selection !== null && selection.index === index && selection.end > selection.start
        ? { start: selection.start, end: selection.end }
        : undefined;
    const trecho = rangeSpan !== null && index === rangeSpan.from ? rangeSpan.to - rangeSpan.from + 1 : undefined;
    return actionFor({
      ...(trecho === undefined ? {} : { rangeLength: trecho }),
      lineKind: line.kind,
      text: line.text,
      ...(marcado === undefined ? {} : { selection: marcado }),
      assessment: scans[index]?.assessment ?? null,
      spec: forma.spec,
      rhymeTarget: rhymeTargetFor(index)?.tail ?? null,
      emptyRun: emptyRunFrom(index),
    });
  }

  /**
   * Traduz a ação em tarefa. Antes isto era inferido da presença de texto na
   * linha, e por isso 'propor variações' virava 'complete mantendo o começo' —
   * o modelo então colava texto no fim e estourava a medida.
   */
  /** A escansão do verso como está: mostra ao modelo a forma a imitar. */
  function scansionOf(index: number): string {
    const reading = scans[index]?.reading;
    const count = scans[index]?.assessment?.count ?? 0;
    if (reading === undefined || reading === null) return '';
    return reading.syllables
      .map((s, i) => {
        const marca = s.stressStrength === 'strong' ? s.text.toUpperCase() : s.text;
        return i + 1 > count ? `()` : marca;
      })
      .join('|');
  }

  function taskFor(index: number, action: Action): Task {
    const line = lines[index];
    const text = line?.text ?? '';
    const assessment = scans[index]?.assessment ?? null;

    switch (action.id) {
      case 'write-verse':
        return { kind: 'write' };
      case 'write-stanza':
        return { kind: 'stanza', verses: emptyRunFrom(index) };
      case 'complete-verse':
        return { kind: 'complete', partial: text };
      case 'fix-verse':
        return { kind: 'rewrite', original: text, problem: action.label };
      case 'address-note':
        return { kind: 'note', instruction: text };
      case 'vary-passage': {
        const span = rangeSpan;
        if (span === null) return { kind: 'vary', original: text };
        return {
          kind: 'passage',
          original: lines.slice(span.from, span.to + 1).map((l) => l.text),
        };
      }
      case 'vary-fragment': {
        const marca = selection;
        if (marca === null || marca.index !== index || marca.end <= marca.start) {
          return { kind: 'vary', original: text };
        }
        const trecho = text.slice(marca.start, marca.end);
        // Quanto o trecho ocupa hoje: sem esse número o modelo propõe do
        // tamanho errado e a régua reprova tudo, e ele desiste.
        const medida = scanVerse(trecho, ptBR, rhymeAnalyzer, { spec: forma.spec }).best;
        return {
          kind: 'fragment',
          selected: trecho,
          line: text,
          start: marca.start,
          end: marca.end,
          selectedSyllables: medida?.total ?? 0,
          lineCount: assessment?.count ?? 0,
          lineScansion: scansionOf(index),
        };
      }
      default:
        return { kind: 'vary', original: text };
    }
  }

  function contextFor(index: number, action: Action): ProposalContext {
    const verses = action.kind === 'stanza' ? emptyRunFrom(index) : 0;
    return {
      kind: action.kind,
      spec: { syllables: forma.spec.syllables, requiredStresses: [...forma.spec.requiredStresses] },
      rhymeTarget: rhymeTargetFor(index),
      before: lines.slice(0, index).map((l) => l.text),
      after: lines.slice(index + (action.kind === 'stanza' ? verses : 1)).map((l) => l.text),
      // Todo comentário do documento é instrução; o que está na linha pedida
      // também, e por isso ela não entra como "verso parcial".
      theme: tema,
      notes: lines.filter((l) => l.kind === 'note' && l.text.trim() !== '').map((l) => l.text),
      task: taskFor(index, action),
      usedRhymeWords: usedRhymeWordsFor(index),
      verses,
      candidates: action.kind === 'stanza' ? 2 : 4,
      hasTool: providerById(aiConfig.providerId)?.supportsTools === true,
    };
  }

  async function runAction(index: number, action: Action): Promise<void> {
    // Quantos versos a proposta vai ocupar se aceita. Guardado agora porque a
    // marca pode ter sumido quando a resposta chegar.
    const replaces =
      action.id === 'vary-passage' && rangeSpan !== null
        ? rangeSpan.to - rangeSpan.from + 1
        : action.kind === 'stanza'
          ? Math.max(1, emptyRunFrom(index))
          : 1;
    const provider = providerById(aiConfig.providerId);
    if (provider === null || !aiReady) {
      screen = 'ajustes';
      return;
    }

    // Pedir de novo abandona o pedido anterior. Deixar os dois correndo pagaria
    // por uma resposta que ninguém vai ver.
    cancelProposal();
    const controller = new AbortController();
    inFlight = controller;
    /** Esta chamada ainda é a que a tela espera? */
    const atual = (): boolean => inFlight === controller;

    proposal = { index, action, loading: true, error: null, candidates: [], raw: null, sent: null, stage: 'escrevendo', replaces, usage: null };
    try {
      const dicionario = await getLexicon();
      const candidates = await propose(
        (request) => provider.complete(aiConfig, request),
        contextFor(index, action),
        {
          tools: provider.supportsTools,
          signal: controller.signal,
          ...(dicionario === null ? {} : { lexicon: dicionario }),
          onRaw: (raw) => (ultimaResposta = raw),
          onSent: (sent) => (ultimoPedido = sent),
          onProgress: (stage) => {
            if (atual() && proposal !== null) proposal = { ...proposal, stage };
          },
          onUsage: (usage) => {
            if (atual() && proposal !== null) proposal = { ...proposal, usage };
          },
        },
      );
      if (atual() && proposal !== null) {
        inFlight = null;
        proposal = { ...proposal, loading: false, candidates, raw: ultimaResposta, sent: ultimoPedido };
      }
    } catch (error) {
      // Desistência não é falha: quem cancelou já sabe o que aconteceu, e uma
      // mensagem de erro por cima do próprio gesto só confunde.
      if (!atual()) return;
      inFlight = null;
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'falha ao pedir proposta';
      if (proposal !== null) {
        proposal = { ...proposal, loading: false, error: message, raw: ultimaResposta, sent: ultimoPedido };
      }
    }
  }

  /**
   * Aceitar é o único caminho pelo qual texto da IA entra no poema, e o que
   * entra vira linha comum na hora — editável, apagável, com o cursor no fim.
   * A única coisa que fica diferente é o registro de que não foi você.
   */
  function acceptCandidate(candidate: Candidate): void {
    const current = proposal;
    if (current === null) return;
    record(true);
    const novas: EditorLine[] = candidate.lines.map((line) => ({
      text: line.text,
      kind: 'verse' as LineKind,
      source: 'ai' as const,
    }));
    lines.splice(current.index, current.replaces, ...novas);
    lineRange = null;
    const ultima = current.index + novas.length - 1;
    goTo(ultima, (lines[ultima]?.text ?? '').length);
    dismissProposal();
  }

  function guardarModelo(name: string): void {
    const modelo: Modelo = {
      id: newModeloId(),
      name,
      spec: {
        syllables: forma.spec.syllables,
        requiredStresses: [...forma.spec.requiredStresses],
      },
      rhyme: forma.rhyme,
      verses: forma.verses,
      builtin: false,
    };
    modelos = [...modelos, modelo];
    void saveModelo(modelo).then((ok) => {
      storageOk = ok;
    });
  }

  function apagarModelo(id: string): void {
    modelos = modelos.filter((modelo) => modelo.id !== id);
    void deleteModelo(id);
  }

  /**
   * Poema novo não apaga nada: o anterior já está gravado na biblioteca com o
   * id dele, e este começa com id próprio. Foi a biblioteca que tornou o "Novo"
   * seguro — enquanto havia um rascunho só, ele era destrutivo e precisava de
   * confirmação.
   *
   * A forma e a tipografia ficam. Você acabou de declarar em que forma escreve;
   * pedir um poema novo não é desdizer isso.
   */
  function novoPoema(): void {
    poemId = newPoemId();
    title = 'sem título';
    tema = '';
    temaAberto = false;
    lines = [{ text: '', kind: 'verse', source: 'author' }];
    dismissProposal();
    cursorLine = 0;
    goTo(0, 0);
    history.clear();
    screen = 'poema';
    void setLastOpened(poemId);
  }

  async function abrirBiblioteca(): Promise<void> {
    biblioteca = await listPoems();
    screen = 'abrir';
  }

  async function abrirPoema(id: string): Promise<void> {
    if (id === poemId) {
      screen = 'poema';
      return;
    }
    const doc = await loadPoem(id);
    if (doc === null) {
      notice = 'não foi possível abrir esse poema';
      return;
    }
    apply(doc);
    notice = null;
    screen = 'poema';
  }

  async function apagarPoema(id: string): Promise<void> {
    await deletePoem(id);
    biblioteca = await listPoems();
    // Apagar o que está aberto deixa o editor com um poema sem lastro; abrir
    // um em branco é mais honesto que continuar com um fantasma na tela.
    if (id === poemId) novoPoema();
  }

  function exportFile(): void {
    const doc = snapshot();
    const blob = new Blob([serialize(doc)], { type: MIME });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName(doc);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) return;
    try {
      apply(parse(await file.text()));
      notice = null;
    } catch (error) {
      notice = error instanceof Error ? error.message : 'não foi possível abrir';
    }
  }

  /**
   * Atalhos no nível da janela.
   *
   * Campos que não são verso — título, campos da Forma, o campo do tema —
   * ficam de fora do desfazer: ali o do navegador é o certo, e sequestrá-lo só
   * pioraria. O verso é a exceção, e é uma exceção necessária: Enter e
   * Backspace nas bordas viram operações sobre a lista de linhas, que o campo
   * não conhece, então o desfazer dele já está dessincronizado.
   *
   * Testar só por `HTMLInputElement` não bastava: o campo do tema é
   * `<textarea>`, escapava da guarda, e Ctrl+Z ali revertia o poema em vez do
   * tema — silenciosamente, num lugar onde o autor não estava olhando.
   */
  function onWindowKeydown(event: KeyboardEvent): void {
    const target = event.target;
    const emVerso = target instanceof HTMLTextAreaElement && target.dataset['verso'] === 'sim';
    const emCampo = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    const mod = event.ctrlKey || event.metaKey;

    if (event.key === 'Escape' && proposal !== null) {
      event.preventDefault();
      dismissProposal();
      return;
    }
    if (event.key === 'Escape' && screen !== 'poema') {
      event.preventDefault();
      screen = 'poema';
      return;
    }
    if (!mod) return;

    const key = event.key.toLowerCase();
    if (key === 's') {
      event.preventDefault();
      exportFile();
      return;
    }
    if (key === 'o') {
      event.preventDefault();
      void abrirBiblioteca();
      return;
    }
    if (key === ' ' || event.code === 'Space') {
      event.preventDefault();
      const action = actionAt(cursorLine);
      if (action !== null) void runAction(cursorLine, action);
      return;
    }
    // Desfazer do documento só vale dentro de um verso; em qualquer outro
    // campo o do navegador é o que o autor espera.
    if (emCampo && !emVerso) return;
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      undo();
      return;
    }
    if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault();
      redo();
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="app" data-t={theme} style="--poem-font: {poemFont}; --poem: {estilo.size}px">
  <div class="shell">
    <header>
      <div class="doc">
        <input class="title" bind:value={title} aria-label="título do poema" />
        <span class="sep">/</span>
        <span>rascunho</span>
      </div>

      <button
        class="badge"
        class:open={screen === 'forma'}
        onclick={() => (screen = screen === 'forma' ? 'poema' : 'forma')}
      >
        {formaLabel(forma, modeloAtual)}
      </button>

      {#if screen === 'forma'}
        <div class="tally"></div>
      {:else if errorCount > 0}
        <div class="errors">
          <span class="dot"></span>
          <span>{errorCount} {errorCount === 1 ? 'verso fora' : 'versos fora'} da forma</span>
        </div>
      {:else}
        <div class="tally">
          {filled}{forma.verses > 0 ? ` de ${forma.verses}` : ''}
          {filled === 1 && forma.verses === 0 ? 'verso' : 'versos'}
        </div>
      {/if}
    </header>

    <main>
      {#if screen === 'abrir'}
        <Biblioteca
          poems={biblioteca}
          currentId={poemId}
          onopen={abrirPoema}
          ondelete={apagarPoema}
          onfile={() => fileInput?.click()}
          onclose={() => (screen = 'poema')}
        />
      {:else if screen === 'ajustes'}
        <Ajustes
          config={aiConfig}
          onchange={changeAiConfig}
          onclear={forgetAiConfig}
          onclose={() => (screen = 'poema')}
        />
      {:else if screen === 'forma'}
        <Forma
          {forma}
          saved={modelos}
          onchange={changeForma}
          onsaveModelo={guardarModelo}
          ondeleteModelo={apagarModelo}
          onclose={() => (screen = 'poema')}
        />
      {:else}
        <div class="column">
          <!-- Contexto permanente do poema, distinto das notas presas a um verso. -->
          {#if temaAberto}
            <label class="tema">
              <span class="tema-rotulo">sobre o que é este poema</span>
              <textarea
                class="tema-campo"
                rows="2"
                placeholder="o que você diria a alguém que fosse ajudar a escrevê-lo"
                bind:value={tema}
                onblur={() => { if (tema.trim() === '') temaAberto = false; }}
              ></textarea>
            </label>
          {:else}
            <button class="tema-abrir" onclick={() => (temaAberto = true)}>+ sobre o que é este poema</button>
          {/if}

          {#each lines as line, index (index)}
            <Line
              text={line.text}
              kind={line.kind}
              {index}
              scan={scans[index] ?? EMPTY_SCAN}
              rhyme={rhymeFor(index)}
              forma={formaNome}
              font={estilo.font}
              size={estilo.size}
              focusAt={focusAt(index)}
              onchange={change}
              onkind={changeKind}
              onsplit={split}
              onmergeBack={mergeBack}
              onmergeForward={mergeForward}
              onmove={move}
              onfocused={() => (pendingFocus = null)}
              onfocus={(i) => (cursorLine = i)}
              onselection={(i, start, end) => (selection = { index: i, start, end })}
              action={index === (rangeSpan?.from ?? cursorLine) ? actionAt(index) : null}
              inRange={inRange(index)}
              onextend={extendRange}
              proposal={proposal?.index === index ? proposal : null}
              onaction={runAction}
              onaccept={acceptCandidate}
              ondismiss={dismissProposal}
            />
          {/each}
        </div>
      {/if}
    </main>

    <footer>
      {#if notice !== null}
        <span class="notice">{notice}</span>
      {:else if !storageOk}
        <span class="notice">sem armazenamento local — exporte o arquivo</span>
      {/if}

      <label class="tipo">
        <select
          value={estilo.font}
          aria-label="fonte do poema"
          onchange={(event) => (estilo = { ...estilo, font: event.currentTarget.value })}
        >
          {#each FONTES as fonte (fonte)}
            <option value={fonte}>{fonte}</option>
          {/each}
        </select>
      </label>
      <label class="tipo">
        <input
          type="number"
          min="12"
          max="60"
          value={estilo.size}
          aria-label="corpo do poema"
          onchange={(event) =>
            (estilo = {
              ...estilo,
              size: Math.min(60, Math.max(12, Number(event.currentTarget.value) || 27)),
            })}
        />
      </label>

      <button onclick={novoPoema}>Novo</button>
      <button class:on={screen === 'abrir'} onclick={abrirBiblioteca} title="Ctrl+O">Abrir</button>
      <button onclick={exportFile} title="Ctrl+S">Exportar</button>
      <input
        bind:this={fileInput}
        class="hidden-file"
        type="file"
        accept=".poema,application/json"
        onchange={importFile}
      />
      <button class:on={screen === 'ajustes'} onclick={() => (screen = screen === 'ajustes' ? 'poema' : 'ajustes')}>
        IA{aiReady ? '' : ' ·'}
      </button>
      <button onclick={() => (theme = theme === 'claro' ? 'escuro' : 'claro')}>
        {theme === 'claro' ? 'Escuro' : 'Claro'}
      </button>
    </footer>
  </div>
</div>

<style>
  .app {
    min-height: 100vh;
    background: var(--paper);
    color: var(--ink);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 28px 16px 40px;
    box-sizing: border-box;
  }

  .shell {
    width: 100%;
    max-width: 960px;
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px var(--pad);
    flex: none;
    /*
     * Numa tela estreita as três partes não cabem lado a lado, e sem quebrar
     * elas empurravam a página 6px para fora — a contagem de versos ficava
     * cortada e o corpo do documento rolava na horizontal.
     */
    flex-wrap: wrap;
  }

  .doc {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 12px;
    color: var(--ink3);
  }

  .title {
    font: inherit;
    color: var(--ink2);
    background: transparent;
    border: 0;
    outline: none;
    padding: 2px 4px;
    border-radius: 3px;
    width: 14ch;
  }

  .title:hover,
  .title:focus {
    background: var(--sel);
    color: var(--ink);
  }

  .sep {
    color: var(--rule);
  }

  .badge {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10.5px;
    letter-spacing: 0.06em;
    color: var(--ink2);
    padding: 5px 10px;
    border-radius: 999px;
    border: 0;
    background: transparent;
    cursor: pointer;
    text-align: center;
  }

  .badge:hover,
  .badge.open {
    background: var(--sel);
    color: var(--ink);
  }

  .errors {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11.5px;
    color: var(--err);
  }

  .errors .dot {
    width: 5px;
    height: 5px;
    border-radius: 5px;
    background: var(--err);
  }

  .tally {
    font-size: 11.5px;
    color: var(--ink3);
    min-width: 6ch;
    text-align: right;
  }

  main {
    flex: 1;
    min-height: 0;
    display: flex;
    justify-content: center;
    padding: var(--top) var(--pad) 40px;
  }

  .column {
    width: var(--colw);
    max-width: 100%;
  }

  .tema,
  .tema-abrir {
    display: block;
    margin-bottom: 26px;
  }

  .tema-abrir {
    font: inherit;
    font-size: 11.5px;
    color: var(--ink3);
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  .tema-abrir:hover {
    color: var(--ink);
  }

  .tema-rotulo {
    display: block;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 9.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink3);
    margin-bottom: 5px;
  }

  .tema-campo {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    font-size: 13px;
    line-height: 1.6;
    color: var(--ink2);
    background: transparent;
    border: 0;
    border-left: 2px solid var(--rule);
    padding: 2px 0 2px 12px;
    outline: none;
    resize: vertical;
  }

  .tema-campo:focus {
    border-left-color: var(--elis);
    color: var(--ink);
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding-top: 20px;
    flex-wrap: wrap;
  }

  .notice {
    font-size: 11.5px;
    color: var(--err);
    margin-right: 8px;
  }

  footer button {
    font: inherit;
    font-size: 11.5px;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid var(--rule);
    background: transparent;
    color: var(--ink2);
    cursor: pointer;
  }

  footer button.on {
    background: var(--sel);
    color: var(--ink);
  }

  footer button:hover {
    background: var(--sel);
    color: var(--ink);
  }

  .tipo select,
  .tipo input {
    font: inherit;
    font-size: 11.5px;
    padding: 5px 8px;
    border-radius: 999px;
    border: 1px solid var(--rule);
    background: transparent;
    color: var(--ink2);
    cursor: pointer;
    outline: none;
  }

  .tipo input {
    width: 54px;
    font-family: 'IBM Plex Mono', monospace;
    text-align: center;
  }

  .hidden-file {
    display: none;
  }
</style>
