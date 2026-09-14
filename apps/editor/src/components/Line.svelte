<script lang="ts">
  import Marks, { type Mark } from './Marks.svelte';
  import Propostas from './Propostas.svelte';
  import type { Action } from '../lib/ai/action.js';
  import type { Candidate } from '../lib/ai/propose.js';
  import type { LineKind } from '../lib/document.js';
  import { hintPhrase, isQuiet, mainPhrase } from '../lib/phrase.js';
  import type { LineScan } from '../lib/scan.js';

  interface Props {
    text: string;
    kind: LineKind;
    index: number;
    scan: LineScan;
    rhyme: string;
    forma: string;
    /**
     * A tipografia não é usada aqui — quem desenha é o CSS. Entra como
     * propriedade porque a régua precisa se remedir quando ela muda, e
     * variável de CSS não é dependência reativa.
     */
    font: string;
    size: number;
    /** Posição do cursor a assumir, ou `null` se esta linha não tem o foco. */
    focusAt: number | null;
    onchange: (index: number, text: string) => void;
    onkind: (index: number, kind: LineKind) => void;
    onsplit: (index: number, caret: number) => void;
    onmergeBack: (index: number) => void;
    onmergeForward: (index: number) => void;
    onmove: (index: number, delta: -1 | 1) => void;
    onfocused: () => void;
    onfocus: (index: number) => void;
    onselection: (index: number, start: number, end: number) => void;
    /** Marcar do verso do cursor até este. */
    onextend: (index: number) => void;
    /** Este verso faz parte do trecho marcado. */
    inRange: boolean;
    /** A ação que a IA oferece aqui e agora, ou nada. */
    action: Action | null;
    proposal: {
      readonly action: Action;
      readonly loading: boolean;
      readonly error: string | null;
      readonly candidates: readonly Candidate[];
      readonly raw: string | null;
      readonly sent: string | null;
      readonly stage: string;
    } | null;
    onaction: (index: number, action: Action) => void;
    onaccept: (candidate: Candidate) => void;
    ondismiss: () => void;
  }

  const {
    text,
    kind,
    index,
    scan,
    rhyme,
    forma,
    font,
    size,
    focusAt,
    onchange,
    onkind,
    onsplit,
    onmergeBack,
    onmergeForward,
    onmove,
    onfocused,
    onfocus,
    onselection,
    onextend,
    inRange,
    action,
    proposal,
    onaction,
    onaccept,
    ondismiss,
  }: Props = $props();

  let field: HTMLTextAreaElement | undefined = $state();
  let stack: HTMLDivElement | undefined = $state();
  let marks = $state<Mark[]>([]);
  let active = $state(false);

  const isVerse = $derived(kind === 'verse');

  interface Piece {
    readonly text: string;
    /** Índice na leitura, ou `null` para material entre sílabas. */
    readonly syllable: number | null;
  }

  /**
   * Fatia o verso pelas fronteiras das sílabas da leitura.
   *
   * Cada sílaba vira um `<span>` marcado. É ele que permite alinhar o ponto da
   * régua com a sílaba que ele assinala: o navegador já mediu esse texto ao
   * dispor a linha, e ler a posição do span é de graça perto de remedir o
   * texto num canvas.
   */
  function pieces(source: string, scanned: LineScan): Piece[] {
    const syllables = scanned.reading?.syllables ?? [];
    if (syllables.length === 0) return [{ text: source, syllable: null }];

    const out: Piece[] = [];
    let cursor = 0;
    syllables.forEach((syllable, position) => {
      if (syllable.start > cursor) {
        out.push({ text: source.slice(cursor, syllable.start), syllable: null });
      }
      out.push({ text: source.slice(syllable.start, syllable.end), syllable: position });
      cursor = syllable.end;
    });
    if (cursor < source.length) out.push({ text: source.slice(cursor), syllable: null });
    return out.filter((piece) => piece.text !== '');
  }

  /**
   * Uma sílaba só contém espaço quando nasceu de elisão. O laço se desenha
   * sobre esse espaço, sem entrar no texto: inserir `‿` mudaria a largura e
   * desalinharia o cursor do campo que fica por cima.
   */
  function tieParts(pieceText: string): [string, string, string] | null {
    const match = /\s+/.exec(pieceText);
    if (match === null) return null;
    const start = match.index;
    const end = start + match[0].length;
    return [pieceText.slice(0, start), pieceText.slice(start, end), pieceText.slice(end)];
  }

  const parts = $derived(isVerse ? pieces(text, scan) : [{ text, syllable: null }]);
  const assessment = $derived(isVerse ? scan.assessment : null);
  const quiet = $derived(assessment === null || isQuiet(assessment));
  const main = $derived(assessment === null ? null : mainPhrase(assessment));
  const hint = $derived(assessment === null ? null : hintPhrase(assessment, forma));

  function measure(): void {
    const host = stack;
    const reading = scan.reading;
    if (host === undefined || !isVerse || reading === null || assessment === null) {
      if (marks.length > 0) marks = [];
      return;
    }

    const origin = host.getBoundingClientRect();
    const next: Mark[] = [];
    for (const node of host.querySelectorAll<HTMLElement>('[data-syl]')) {
      const position = Number(node.dataset.syl);
      const syllable = reading.syllables[position];
      if (syllable === undefined) continue;
      // Um span que quebra de linha devolve várias caixas; a primeira é a que
      // contém o início da sílaba, e é sob ela que o ponto deve cair.
      const box = node.getClientRects()[0];
      if (box === undefined) continue;
      next.push({
        x: box.left - origin.left + box.width / 2,
        y: Math.round(box.bottom - origin.top) + 6,
        strong: syllable.stressStrength === 'strong',
        elided: syllable.hasSynalepha,
        extra: syllable.isExtrametrical,
        required: assessment.positions[position]?.required === true,
      });
    }
    marks = next;
  }

  $effect(() => {
    // Dependências explícitas: texto, leitura e tipografia mudam o que há para
    // medir e onde cada sílaba cai.
    void parts;
    void assessment;
    void font;
    void size;
    measure();
  });

  $effect(() => {
    // Webfont troca as métricas do texto sem mexer em estado nenhum: até ela
    // chegar, a medição é a da fonte de reserva, e a régua fica torta.
    if (typeof document === 'undefined' || document.fonts === undefined) return;
    const remedir = (): void => measure();
    void document.fonts.ready.then(remedir);
    document.fonts.addEventListener('loadingdone', remedir);
    return () => document.fonts.removeEventListener('loadingdone', remedir);
  });

  $effect(() => {
    const host = stack;
    if (host === undefined || typeof ResizeObserver === 'undefined') return;
    // A largura da coluna muda onde cada sílaba cai, sem mudar o texto.
    const observer = new ResizeObserver(() => measure());
    observer.observe(host);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (focusAt === null || field === undefined) return;
    const caret = Math.min(focusAt, text.length);
    field.focus();
    field.setSelectionRange(caret, caret);
    onfocused();
  });

  function onkeydown(event: KeyboardEvent): void {
    const el = event.currentTarget as HTMLTextAreaElement;
    const { selectionStart, selectionEnd, value } = el;
    const collapsed = selectionStart === selectionEnd;

    if (event.key === 'Enter') {
      event.preventDefault();
      onsplit(index, selectionStart);
      return;
    }
    if (event.key === 'Backspace' && collapsed && selectionStart === 0) {
      event.preventDefault();
      onmergeBack(index);
      return;
    }
    if (event.key === 'Delete' && collapsed && selectionStart === value.length) {
      event.preventDefault();
      onmergeForward(index);
      return;
    }
    if (event.key === 'ArrowUp' && collapsed && selectionStart === 0) {
      event.preventDefault();
      // Na borda, Shift deixa de estender caractere e passa a estender verso.
      if (event.shiftKey) onextend(index - 1);
      else onmove(index, -1);
      return;
    }
    if (event.key === 'ArrowDown' && collapsed && selectionStart === value.length) {
      event.preventDefault();
      if (event.shiftKey) onextend(index + 1);
      else onmove(index, 1);
    }
  }
</script>

<div
  class="line {kind}"
  class:in-range={inRange}
  onmouseenter={() => (active = true)}
  onmouseleave={() => (active = false)}
  role="presentation"
>
  <div class="stack" bind:this={stack}>
    <textarea
      bind:this={field}
      class="field text"
      rows="1"
      spellcheck="false"
      autocapitalize="off"
      aria-label={`linha ${index + 1}`}
      value={text}
      oninput={(event) => onchange(index, event.currentTarget.value)}
      onfocus={() => onfocus(index)}
      onmousedown={(event) => {
        if (event.shiftKey) {
          // Shift+clique noutro verso é marca de trecho, não de caractere.
          event.preventDefault();
          onextend(index);
          return;
        }
        // Não se espera o evento de foco voltar: quem clicou já disse onde
        // está. Depender só do foco já deixou a ação apontando para o verso
        // errado uma vez.
        onfocus(index);
      }}
      onselect={(event) =>
        onselection(index, event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
      onkeyup={(event) =>
        onselection(index, event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
      onmouseup={(event) =>
        onselection(index, event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
      {onkeydown}
    ></textarea>

    <div class="mirror text" aria-hidden="true">{#each parts as part, i (i)}{#if part.syllable === null}{part.text}{:else}{@const tie = tieParts(part.text)}<span
            class="syl"
            data-syl={part.syllable}
          >{#if tie === null}{part.text}{:else}{tie[0]}<span class="tie">{tie[1]}<span
                  class="tie-mark">‿</span></span>{tie[2]}{/if}</span>{/if}{/each}</div>

    <Marks {marks} />
  </div>

  {#if main !== null}
    <div class="diag" class:quiet>
      <span class="main">{main}</span>
      {#if hint !== null}<span class="hint">{hint}</span>{/if}
    </div>
  {/if}

  {#if action !== null && proposal === null}
    <!-- Uma ação só, nomeada pelo que falta. O menu de verbos é o modo de
         errar: obriga o autor a traduzir a própria situação. -->
    <button
      class="pedir"
      onmousedown={(event) => event.preventDefault()}
      onclick={() => onaction(index, action)}>{action.label}</button>
  {/if}

  {#if proposal !== null}
    <Propostas
      label={proposal.action.label}
      loading={proposal.loading}
      error={proposal.error}
      candidates={proposal.candidates}
      raw={proposal.raw}
      sent={proposal.sent}
      stage={proposal.stage}
      {onaccept}
      {ondismiss}
      onretry={() => onaction(index, proposal.action)}
    />
  {/if}

  <div class="gutter">
    {#if isVerse && assessment !== null}
      <span class="meta">
        <span class="rhyme">{rhyme}</span>
        <span class="count" class:bad={!quiet && assessment.status !== 'ok'}>{assessment.count}</span
        >
      </span>
    {/if}
    <!-- O seletor só aparece quando pedido: linha de poema não carrega
         controle à vista o tempo todo. -->
    <select
      class="kind"
      class:shown={!isVerse || active}
      value={kind}
      aria-label={`tipo da linha ${index + 1}`}
      onchange={(event) => onkind(index, event.currentTarget.value as LineKind)}
    >
      <option value="verse">verso</option>
      <option value="heading">título</option>
      <option value="note">nota</option>
    </select>
  </div>
</div>

<style>
  .line {
    position: relative;
    padding-right: 76px;
    margin-bottom: 26px;
  }

  /* Trecho marcado: o realce alcança a margem, para ler como bloco. */
  .line.in-range::before {
    content: "";
    position: absolute;
    inset: -4px -8px -4px -12px;
    background: var(--sel);
    border-radius: 2px;
    pointer-events: none;
  }

  /* O espaço de baixo é onde os pontos da régua caem. */
  .stack {
    position: relative;
    padding-bottom: 20px;
  }

  .line.heading .stack,
  .line.note .stack {
    padding-bottom: 0;
  }

  .line.heading {
    margin-bottom: 18px;
    margin-top: 10px;
  }

  .line.note {
    margin-bottom: 18px;
  }

  /* O espelho e o campo precisam ter métrica idêntica, ou o cursor descola. */
  .text {
    font-family: var(--poem-font);
    font-weight: 400;
    font-size: var(--poem);
    line-height: 1.62;
    letter-spacing: 0.004em;
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }

  .line.heading .text {
    font-size: calc(var(--poem) * 0.82);
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .line.note .text {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.6;
    letter-spacing: 0;
  }

  /*
   * O espelho fica *acima* do campo, e não o contrário.
   *
   * O campo tem texto transparente e pinta o realce de seleção; se ele estiver
   * por cima, o realce cobre as letras do espelho e some com o texto ao
   * selecionar. Embaixo, o realce fica atrás das letras, que é onde ele
   * pertence. O cursor continua visível porque o espelho não tem fundo.
   */
  .mirror {
    position: relative;
    z-index: 1;
    pointer-events: none;
    color: var(--ink);
    min-height: calc(var(--poem) * 1.62);
  }

  .line.heading .mirror {
    color: var(--ink);
    min-height: calc(var(--poem) * 0.82 * 1.62);
  }

  .line.note .mirror {
    color: var(--ink3);
    min-height: calc(13px * 1.6);
  }

  .field {
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    outline: none;
    resize: none;
    overflow: hidden;
    background: transparent;
    color: transparent;
    caret-color: var(--ink);
  }

  .field::selection {
    background: var(--sel);
  }

  .syl {
    /* Não pode mudar nada da disposição do texto: existe só para ser medido. */
    display: inline;
  }

  .tie {
    position: relative;
  }

  .tie-mark {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    color: var(--elis);
    pointer-events: none;
  }

  /* Só aparece na linha do cursor, e some assim que a proposta abre. */
  .pedir {
    font: inherit;
    font-size: 11px;
    margin-top: 4px;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid var(--rule);
    background: transparent;
    color: var(--ink3);
    cursor: pointer;
  }

  .pedir:hover {
    border-color: var(--elis);
    color: var(--elis);
  }

  .diag {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.5;
  }

  .main {
    color: var(--err);
  }

  .hint {
    color: var(--ink3);
  }

  /* Verso em curso não se anuncia em vermelho. */
  .diag.quiet .main {
    color: var(--ink3);
  }

  .gutter {
    position: absolute;
    right: 0;
    top: 0.4em;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--ink3);
  }

  /* Rima e contagem lado a lado, como no desenho; o seletor de tipo embaixo. */
  .meta {
    display: flex;
    align-items: baseline;
    gap: 9px;
  }

  .count.bad {
    color: var(--err);
  }

  .kind {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 9.5px;
    letter-spacing: 0.06em;
    color: var(--ink3);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    padding: 1px 2px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.12s;
  }

  .kind.shown {
    opacity: 1;
  }

  .kind:hover,
  .kind:focus {
    opacity: 1;
    border-color: var(--rule);
    color: var(--ink2);
  }
</style>
