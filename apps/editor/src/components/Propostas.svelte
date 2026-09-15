<script lang="ts">
  import type { Candidate } from '../lib/ai/propose.js';
  import type { Usage } from '../lib/ai/types.js';

  interface Props {
    label: string;
    loading: boolean;
    error: string | null;
    candidates: readonly Candidate[];
    /** Resposta crua do modelo, para depurar o pedido. */
    raw: string | null;
    /** O pedido exato que produziu essa resposta. */
    sent: string | null;
    stage: string;
    /** O que já se gastou nesta proposta. `null` antes da primeira resposta. */
    usage: Usage | null;
    onaccept: (candidate: Candidate) => void;
    ondismiss: () => void;
    onretry: () => void;
  }

  const { label, loading, error, candidates, raw, sent, stage, usage, onaccept, ondismiss, onretry }: Props =
    $props();

  let vendo = $state<'nada' | 'pedido' | 'resposta'>('nada');

  /**
   * Token em milhares, com uma casa. Mil e quatrocentos lidos de uma vez não
   * dizem nada; "1,4k" dá a ordem de grandeza, que é o que se compara.
   */
  function milhares(n: number): string {
    if (n < 1000) return String(n);
    return `${(n / 1000).toFixed(1).replace('.', ',')}k`;
  }

  /**
   * A conta, em token e não em dinheiro.
   *
   * Preço muda por modelo, por provedor e por mês, e o campo de modelo é texto
   * livre justamente para não precisar de catálogo — uma tabela de preços aqui
   * envelheceria e passaria a mentir. Token é o que os dois provedores relatam
   * e o que o autor converte na tabela de quem cobra dele.
   */
  const conta = $derived.by(() => {
    if (usage === null) return null;
    const partes = [`${milhares(usage.input)} entrada`, `${milhares(usage.output)} saída`];
    if (usage.cached > 0) partes.push(`${milhares(usage.cached)} de cache`);
    return partes.join(' · ');
  });

  async function copiar(texto: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Sem permissão de área de transferência: o texto está à vista para
      // selecionar à mão, que é o que importa.
    }
  }
</script>

<!--
  A proposta vive fora do documento até ser aceita. Nada daqui está escrito no
  poema: recusar não deixa rastro, e aceitar é um gesto, não uma omissão.
-->
<div class="propostas" role="group" aria-label="propostas da IA">
  <div class="topo">
    <span class="titulo">{label}</span>
    {#if loading}
      <span class="estado">{stage}…</span>
      <!-- Desistir precisa estar à vista enquanto se espera: é o momento em que
           o autor mais quer sair, e é o único em que sair economiza dinheiro. -->
      <button class="acao" onclick={ondismiss}>desistir</button>
    {:else}
      <button class="acao" onclick={onretry}>outras</button>
      <button class="acao" onclick={ondismiss}>descartar</button>
    {/if}
    <!-- Em BYOK quem paga é quem escreve. A conta sobe durante a espera, que é
         quando ela ainda informa alguma coisa. -->
    {#if conta !== null}
      <span class="conta" title="tokens desta proposta, somando todas as idas ao provedor">
        {conta}
      </span>
    {/if}
  </div>

  {#if error !== null}
    <p class="erro">{error}</p>
  {:else if loading}
    <p class="vazio">o motor vai medir cada proposta antes de mostrar</p>
  {:else if candidates.length === 0}
    <p class="vazio">nada veio. tente de novo, ou escreva você.</p>
  {:else}
    <ul>
      {#each candidates as candidate, index (index)}
        <li>
          <button class="candidato" class:fora={!candidate.ok} onclick={() => onaccept(candidate)}>
            <span class="versos">
              <!-- Chaveado pelo índice, não pelo texto: estrofe com refrão tem
                   dois versos iguais, e chave repetida derruba o bloco inteiro
                   — em produção também, não só em desenvolvimento. -->
              {#each candidate.lines as line, i (i)}
                <span class="verso">{line.text}</span>
              {/each}
            </span>
            <span class="medida" class:bad={!candidate.ok}>{candidate.detail}</span>
          </button>
        </li>
      {/each}
    </ul>
    <p class="rodape">clique para aceitar — vira texto seu, editável na hora</p>
  {/if}

  {#if !loading && (raw !== null || sent !== null)}
    <!-- O que foi pedido e o que voltou, lado a lado: é assim que se afina um
         prompt sem adivinhar. Copiável para testar variações fora do editor. -->
    <div class="depurar">
      {#if sent !== null}
        <button class="cru" onclick={() => (vendo = vendo === 'pedido' ? 'nada' : 'pedido')}>
          o pedido
        </button>
      {/if}
      {#if raw !== null}
        <button class="cru" onclick={() => (vendo = vendo === 'resposta' ? 'nada' : 'resposta')}>
          a resposta
        </button>
      {/if}
      {#if vendo !== 'nada'}
        <button class="cru" onclick={() => copiar(vendo === 'pedido' ? (sent ?? '') : (raw ?? ''))}>
          copiar
        </button>
      {/if}
    </div>
    {#if vendo === 'pedido' && sent !== null}
      <pre class="bruto">{sent}</pre>
    {:else if vendo === 'resposta' && raw !== null}
      <pre class="bruto">{raw}</pre>
    {/if}
  {/if}
</div>

<style>
  .propostas {
    margin-top: 10px;
    border-left: 2px solid var(--elis);
    padding: 10px 0 10px 14px;
  }

  .topo {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 8px;
  }

  .titulo {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--elis);
    flex: 1;
  }

  .estado,
  .acao {
    font: inherit;
    font-size: 11px;
    color: var(--ink3);
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  .acao:hover {
    color: var(--ink);
  }

  /* Informação, não controle: fica em monoespaçado e no tom mais baixo. */
  .conta {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    color: var(--ink3);
    opacity: 0.75;
    white-space: nowrap;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .candidato {
    width: 100%;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 14px;
    text-align: left;
    background: none;
    border: 0;
    border-radius: 3px;
    padding: 6px 8px;
    cursor: pointer;
    font: inherit;
  }

  .candidato:hover {
    background: var(--sel);
  }

  .versos {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .verso {
    font-family: var(--poem-font);
    font-size: calc(var(--poem) * 0.66);
    line-height: 1.4;
    color: var(--ink);
  }

  /* Candidato fora da forma continua à mostra: o autor pode querer justamente
     o que passa da medida. Esconder seria decidir por ele. */
  .candidato.fora .verso {
    color: var(--ink2);
  }

  .medida {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    color: var(--ink3);
    white-space: nowrap;
  }

  .medida.bad {
    color: var(--err);
  }

  .depurar {
    display: flex;
    gap: 14px;
    padding-top: 6px;
  }

  .cru {
    font: inherit;
    font-size: 10.5px;
    color: var(--ink3);
    background: none;
    border: 0;
    padding: 6px 0 0;
    cursor: pointer;
  }

  .cru:hover {
    color: var(--ink);
  }

  .bruto {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10.5px;
    line-height: 1.5;
    color: var(--ink2);
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 3px;
    padding: 8px 10px;
    margin: 6px 0 0;
    max-height: 220px;
    overflow: auto;
    white-space: pre-wrap;
  }

  .erro {
    font-size: 12px;
    color: var(--err);
    margin: 0;
  }

  .vazio,
  .rodape {
    font-size: 11px;
    color: var(--ink3);
    margin: 8px 0 0;
  }
</style>
