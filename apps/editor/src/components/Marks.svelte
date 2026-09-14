<script lang="ts">
  export interface Mark {
    readonly x: number;
    readonly y: number;
    readonly strong: boolean;
    readonly elided: boolean;
    readonly extra: boolean;
    readonly required: boolean;
  }

  interface Props {
    marks: readonly Mark[];
  }

  const { marks }: Props = $props();
</script>

{#each marks as mark, index (index)}
  <span class="slot" style="left: {mark.x}px; top: {mark.y}px">
    {#if mark.extra}
      <span class="dot extra"></span>
    {:else}
      <span
        class="dot"
        class:strong={mark.strong}
        class:weak={!mark.strong}
        class:elided={mark.elided}
      ></span>
    {/if}
    {#if mark.required}
      <span class="tick" class:bad={!mark.strong}></span>
    {/if}
  </span>
{/each}

<style>
  /* Posicionada sobre o centro horizontal da sílaba que assinala. */
  .slot {
    position: absolute;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 9px;
    height: 8px;
    pointer-events: none;
  }

  .dot {
    border-radius: 50%;
  }

  .strong {
    width: 7px;
    height: 7px;
    background: var(--ink2);
  }

  .weak {
    width: 3px;
    height: 3px;
    background: var(--ink3);
  }

  /* Sílaba nascida de elisão: mesma forma, outra cor. */
  .elided {
    background: var(--elis);
  }

  /* Extramétrica: existe, aparece, não conta. */
  .extra {
    width: 3px;
    height: 3px;
    border: 1px solid var(--rule);
    border-radius: 50%;
  }

  .tick {
    position: absolute;
    bottom: -4px;
    width: 9px;
    height: 1px;
    background: var(--ink3);
  }

  .tick.bad {
    background: var(--err);
  }
</style>
