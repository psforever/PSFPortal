<script>
  import { fade } from 'svelte/transition';

  export function message(e, ehtml) {
	  errorMessage = e ? e : "";
	  errorMessageHTML = ehtml ? ehtml : "";

      shake = true;
      setTimeout(() => {shake = false;}, 800)
  }

  let errorMessage = ""
  let errorMessageHTML = ""
  let shake = false;
</script>

{#if errorMessage || errorMessageHTML}
<div in:fade class:notification-shake={shake} class="alert alert-danger" role="alert">
{errorMessage}
{@html errorMessageHTML}
</div>
{/if}
