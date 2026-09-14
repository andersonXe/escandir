<script lang="ts">
  import type { PoemSummary } from '../lib/store.js';

  interface Props {
    poems: readonly PoemSummary[];
    currentId: string;
    onopen: (id: string) => void;
    ondelete: (id: string) => void;
    onfile: () => void;
    onclose: () => void;
  }

  const { poems, currentId, onopen, ondelete, onfile, onclose }: Props = $props();

  let confirmando = $state<string | null>(null);

  const formato = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  function quando(iso: string): string {
    const data = new Date(iso);
    return Number.isNaN(data.getTime()) ? '' : formato.format(data);
  }

  function apagar(id: string): void {
    if (confirmando !== id) {
      confirmando = id;
      return;
    }
    confirmando = null;
    ondelete(id);
  }
</script>

<div class="biblioteca">
  <div class="intro">
    <h1>Seus poemas</h1>
    <p>
      Guardados neste navegador. Não há conta nem servidor — se você limpar os dados do navegador,
      some. Exporte o que importa.
    </p>
  </div>

  {#if poems.length === 0}
    <p class="vazio">Nada guardado ainda.</p>
  {:else}
    <ul>
      {#each poems as poem (poem.id)}
        <li class:atual={poem.id === currentId}>
          <button class="abrir" onclick={() => onopen(poem.id)}>
            <span class="titulo">{poem.title}</span>
            <span class="verso">{poem.opening === '' ? 'sem versos ainda' : poem.opening}</span>
            <span class="meta">
              {poem.verses}
              {poem.verses === 1 ? 'verso' : 'versos'} · {quando(poem.updatedAt)}
              {#if poem.id === currentId}· aberto{/if}
            </span>
          </button>
          <button
            class="apagar"
            class:aviso={confirmando === poem.id}
            aria-label={`apagar ${poem.title}`}
            onclick={() => apagar(poem.id)}
          >
            {confirmando === poem.id ? 'apagar?' : '×'}
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="foot">
    <button class="link" onclick={onfile}>abrir arquivo .poema do computador</button>
    <button class="go" onclick={onclose}>Voltar ao poema</button>
  </div>
</div>

<style>
  .biblioteca {
    width: var(--colw);
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 24px;
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
    max-width: 48ch;
    margin: 0;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  li {
    display: flex;
    align-items: stretch;
    gap: 8px;
    border-bottom: 1px solid var(--rule);
  }

  li.atual {
    background: var(--surface);
  }

  .abrir {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    text-align: left;
    font: inherit;
    background: none;
    border: 0;
    padding: 12px 10px;
    cursor: pointer;
  }

  .abrir:hover {
    background: var(--sel);
  }

  .titulo {
    font-size: 13px;
    color: var(--ink);
  }

  .verso {
    font-family: var(--poem-font);
    font-size: 17px;
    color: var(--ink2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    color: var(--ink3);
  }

  .apagar {
    font: inherit;
    font-size: 13px;
    background: none;
    border: 0;
    padding: 0 12px;
    color: var(--ink3);
    cursor: pointer;
  }

  .apagar:hover {
    color: var(--err);
  }

  .apagar.aviso {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    color: var(--err);
  }

  .vazio {
    font-size: 13px;
    color: var(--ink3);
    margin: 0;
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
    padding-top: 12px;
  }

  .link {
    font: inherit;
    font-size: 11.5px;
    background: none;
    border: 0;
    padding: 0;
    color: var(--elis);
    cursor: pointer;
  }

  .link:hover {
    text-decoration: underline;
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
</style>
