<script lang="ts">
  import {
    BUILTIN,
    formaLabel,
    MAX_SYLLABLES,
    MAX_VERSES,
    matchModelo,
    normalizeRhyme,
    sameForma,
    toggleStress,
    withRhyme,
    withSyllables,
    withVerses,
    type Forma,
    type Modelo,
  } from '../lib/forma.js';

  interface Props {
    forma: Forma;
    saved: readonly Modelo[];
    onchange: (next: Forma) => void;
    onsaveModelo: (name: string) => void;
    ondeleteModelo: (id: string) => void;
    onclose: () => void;
  }

  const { forma, saved, onchange, onsaveModelo, ondeleteModelo, onclose }: Props = $props();

  let novoNome = $state('');

  const atual = $derived(matchModelo(forma, saved));
  const posicoes = $derived(
    Array.from({ length: forma.spec.syllables }, (_, i) => i + 1),
  );

  /** Atalhos de metro. Mexer neles não toca em rima nem em número de versos. */
  const metros = [
    ['Redondilha menor', 5],
    ['Redondilha maior', 7],
    ['Decassílabo', 10],
    ['Alexandrino', 12],
    ['Verso livre', 0],
  ] as const;

  /** Atalhos de acentuação, válidos para o metro corrente. */
  const acentos = [
    ['heroico', [6, 10]],
    ['sáfico', [4, 8, 10]],
    ['martelo', [3, 6, 10]],
    ['jâmbico', [2, 4, 6, 8, 10]],
  ] as const;

  const rimas = ['ABAB', 'ABBA', 'AABB', 'AAAA'] as const;
  const estrofes = [
    ['dístico', 2],
    ['terceto', 3],
    ['quarteto', 4],
    ['oitava', 8],
    ['soneto', 14],
  ] as const;

  function stressesFit(positions: readonly number[]): boolean {
    return positions.every((p) => p <= forma.spec.syllables);
  }

  function sameStresses(positions: readonly number[]): boolean {
    const current = forma.spec.requiredStresses;
    return current.length === positions.length && current.every((p, i) => p === positions[i]);
  }

  function applyModelo(modelo: Modelo): void {
    onchange({ spec: modelo.spec, rhyme: modelo.rhyme, verses: modelo.verses });
  }

  function setSyllables(value: string): void {
    onchange(withSyllables(forma, Number(value)));
  }

  function setStresses(positions: readonly number[]): void {
    onchange({ ...forma, spec: { ...forma.spec, requiredStresses: [...positions] } });
  }

  function salvar(): void {
    const nome = novoNome.trim();
    if (nome === '') return;
    onsaveModelo(nome);
    novoNome = '';
  }
</script>

<div class="forma">
  <div class="intro">
    <h1>A forma do poema</h1>
    <p>
      Você define antes. Depois o sistema só mede — e avisa quando o verso sai da forma. Cada campo
      é independente: o modelo é atalho, não amarra.
    </p>
  </div>

  <section>
    <div class="label">modelos</div>
    <div class="chips">
      {#each BUILTIN as modelo (modelo.id)}
        <button
          class="chip"
          class:on={atual?.id === modelo.id}
          onclick={() => applyModelo(modelo)}>{modelo.name}</button
        >
      {/each}
    </div>
    {#if saved.length > 0}
      <div class="chips">
        {#each saved as modelo (modelo.id)}
          <span class="chip own" class:on={atual?.id === modelo.id}>
            <button class="own-apply" onclick={() => applyModelo(modelo)}>{modelo.name}</button>
            <button
              class="own-del"
              title="apagar modelo"
              aria-label={`apagar modelo ${modelo.name}`}
              onclick={() => ondeleteModelo(modelo.id)}>×</button
            >
          </span>
        {/each}
      </div>
    {/if}
  </section>

  <section>
    <div class="label">sílabas</div>
    <div class="row">
      <input
        class="num"
        type="number"
        min="0"
        max={MAX_SYLLABLES}
        value={forma.spec.syllables}
        aria-label="número de sílabas"
        oninput={(event) => setSyllables(event.currentTarget.value)}
      />
      <div class="chips">
        {#each metros as [nome, n] (nome)}
          <button
            class="chip small"
            class:on={forma.spec.syllables === n}
            onclick={() => setSyllables(String(n))}>{nome}</button
          >
        {/each}
      </div>
    </div>
    {#if forma.spec.syllables === 0}
      <p class="note">Verso livre: o sistema mede e não cobra.</p>
    {/if}
  </section>

  {#if forma.spec.syllables > 0}
    <section>
      <div class="label-row">
        <div class="label">tônicas obrigatórias</div>
        <div class="links">
          {#each acentos as [nome, positions] (nome)}
            {#if stressesFit(positions)}
              <button
                class="link"
                class:on={sameStresses(positions)}
                onclick={() => setStresses(positions)}>{nome}</button
              >
            {/if}
          {/each}
          {#if forma.spec.requiredStresses.length > 0}
            <button class="link" onclick={() => setStresses([])}>limpar</button>
          {/if}
        </div>
      </div>
      <div class="grid">
        {#each posicoes as p (p)}
          {@const on = forma.spec.requiredStresses.includes(p)}
          <button
            class="pos"
            class:on
            aria-pressed={on}
            onclick={() => onchange(toggleStress(forma, p))}
          >
            <span class="pos-dot" class:on></span>
            <span>{p}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <section>
    <div class="label">rima</div>
    <div class="row">
      <input
        class="text"
        value={forma.rhyme}
        placeholder="ABBA"
        spellcheck="false"
        aria-label="esquema de rima"
        oninput={(event) => onchange(withRhyme(forma, event.currentTarget.value))}
      />
      <div class="chips">
        {#each rimas as esquema (esquema)}
          <button
            class="chip small"
            class:on={forma.rhyme === esquema}
            onclick={() => onchange(withRhyme(forma, esquema))}>{esquema}</button
          >
        {/each}
        <button
          class="chip small"
          class:on={forma.rhyme === ''}
          onclick={() => onchange(withRhyme(forma, ''))}>branco</button
        >
      </div>
    </div>
    <p class="note">
      Uma letra por verso, repetida quando o poema passa do esquema. Vazio é verso branco.
    </p>
  </section>

  <section>
    <div class="label">versos</div>
    <div class="row">
      <input
        class="num"
        type="number"
        min="0"
        max={MAX_VERSES}
        value={forma.verses}
        aria-label="número de versos"
        oninput={(event) => onchange(withVerses(forma, Number(event.currentTarget.value)))}
      />
      <div class="chips">
        {#each estrofes as [nome, n] (nome)}
          <button
            class="chip small"
            class:on={forma.verses === n}
            onclick={() => onchange(withVerses(forma, n))}>{nome}</button
          >
        {/each}
        <button
          class="chip small"
          class:on={forma.verses === 0}
          onclick={() => onchange(withVerses(forma, 0))}>sem limite</button
        >
      </div>
    </div>
  </section>

  <section class="salvar">
    <div class="label">guardar como modelo</div>
    <div class="row">
      <input
        class="text wide"
        bind:value={novoNome}
        placeholder={formaLabel(forma, null)}
        aria-label="nome do modelo"
        onkeydown={(event) => {
          if (event.key === 'Enter') salvar();
        }}
      />
      <button class="chip small" disabled={novoNome.trim() === ''} onclick={salvar}>Guardar</button>
    </div>
    {#if atual !== null && saved.some((m) => sameForma(m, forma))}
      <p class="note">Esta forma já está guardada como “{atual.name}”.</p>
    {/if}
  </section>

  <div class="foot">
    <span class="resumo">{formaLabel(forma, atual)}</span>
    <button class="go" onclick={onclose}>Começar a escrever</button>
  </div>

  <p class="note final">
    A forma pode mudar a qualquer momento — nada do que já foi escrito é reescrito.
  </p>
</div>

<style>
  .forma {
    width: var(--colw);
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  .intro h1 {
    font-family: Spectral, Georgia, serif;
    font-size: 28px;
    font-weight: 400;
    color: var(--ink);
    margin: 0 0 8px;
  }

  .intro p {
    font-size: 13px;
    color: var(--ink2);
    line-height: 1.6;
    max-width: 46ch;
    margin: 0;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .label {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink3);
  }

  .label-row {
    display: flex;
    align-items: baseline;
    gap: 14px;
    flex-wrap: wrap;
  }

  .links {
    display: flex;
    gap: 10px;
  }

  .link {
    font: inherit;
    font-size: 11.5px;
    background: none;
    border: 0;
    padding: 0;
    color: var(--ink3);
    cursor: pointer;
  }

  .link:hover {
    color: var(--ink);
  }

  .link.on {
    color: var(--ink);
    border-bottom: 1px solid var(--ink);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip {
    font: inherit;
    font-size: 13px;
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid var(--rule);
    background: transparent;
    color: var(--ink2);
    cursor: pointer;
  }

  .chip.small {
    font-size: 11.5px;
    padding: 6px 12px;
  }

  .chip:hover {
    background: var(--sel);
    color: var(--ink);
  }

  .chip.on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }

  .chip:disabled {
    opacity: 0.4;
    cursor: default;
  }

  /* Modelo do autor: aplicar e apagar são ações distintas no mesmo chip. */
  .chip.own {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 0 6px 0 0;
  }

  .own-apply,
  .own-del {
    font: inherit;
    background: none;
    border: 0;
    cursor: pointer;
    color: inherit;
  }

  .own-apply {
    font-size: 13px;
    padding: 8px 6px 8px 14px;
  }

  .own-del {
    font-size: 15px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 50%;
    color: var(--ink3);
  }

  .own-del:hover {
    color: var(--err);
  }

  .num,
  .text {
    font: inherit;
    font-size: 13px;
    padding: 8px 10px;
    border-radius: 3px;
    border: 1px solid var(--rule);
    background: var(--surface);
    color: var(--ink);
    outline: none;
  }

  .num {
    width: 72px;
    font-family: 'IBM Plex Mono', monospace;
  }

  .text {
    width: 140px;
    font-family: 'IBM Plex Mono', monospace;
    letter-spacing: 0.08em;
  }

  .text.wide {
    width: 220px;
    font-family: inherit;
    letter-spacing: 0;
  }

  .num:focus,
  .text:focus {
    border-color: var(--ink3);
  }

  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .pos {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    width: 34px;
    height: 40px;
    border-radius: 3px;
    border: 1px solid var(--rule);
    background: transparent;
    color: var(--ink3);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    cursor: pointer;
  }

  .pos:hover {
    background: var(--sel);
    color: var(--ink);
  }

  .pos.on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }

  .pos-dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--ink3);
  }

  .pos-dot.on {
    width: 7px;
    height: 7px;
    background: var(--paper);
  }

  .note {
    font-size: 11.5px;
    color: var(--ink3);
    line-height: 1.6;
    margin: 0;
  }

  .note.final {
    margin-top: -12px;
  }

  .salvar {
    padding-top: 20px;
    border-top: 1px solid var(--rule);
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
    padding-top: 20px;
    border-top: 1px solid var(--rule);
  }

  .resumo {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--ink3);
  }

  .go {
    font: inherit;
    font-size: 13px;
    padding: 10px 20px;
    border-radius: 999px;
    border: 0;
    background: var(--ink);
    color: var(--paper);
    cursor: pointer;
  }

  .go:hover {
    opacity: 0.86;
  }
</style>
