<script>
	export let pagination;
	export let pageChange;
	export let setURLParam = false;
	export let displayPages = 10;

	let pages = []

	function pageClick(event) {
		const page = event.target.getAttribute('data-page');
		pageChange(parseInt(page))

		if (!setURLParam)
			event.preventDefault()
	}

	$ : {
		const new_pages = [];
		let pi = 0, i;
		let pg = pagination;

		const pageChunk = Math.max(Math.ceil(displayPages/3), 1);
		const middleChunk = Math.max(Math.ceil(pageChunk/2), 1);
		const leftBound = Math.min(pageChunk+1, pagination.page_count);
		const rightBound = Math.max(pagination.page_count-pageChunk, 1);

		// fast path: draw all pages
		if (pg.page_count <= displayPages || rightBound <= leftBound) {
			for (i = 1; i <= pg.page_count; i++)
				new_pages[pi++] = i;
		} else {
			let middleLeft = Math.max(pg.page-middleChunk, leftBound);
			let middleRight = Math.min(pg.page+middleChunk, rightBound);

			// left and middle chunks are joined
			if (middleLeft == leftBound) {
				middleLeft += 1;
				middleRight = Math.min(middleLeft+pageChunk, rightBound);
			// middle and right chunks are joined
			} else if (middleRight == rightBound) {
				middleRight -= 1;
				middleLeft = Math.min(middleRight-middleChunk, rightBound);
			}

			//console.log("[1-"+leftBound+"]", "["+middleLeft+"-"+middleRight+"]", "["+rightBound+"-"+pagination.page_count+"]");

			// left chunk
			for (i = 1; i <= leftBound; i++) new_pages[pi++] = i;
			if (leftBound+1 != middleLeft) new_pages[pi++] = -1;

			// middle chunk
			for (i = middleLeft; i <= middleRight; i++) new_pages[pi++] = i;

			// right chunk
			if (middleRight+1 != rightBound) new_pages[pi++] = -1;
			for (i = rightBound; i <= pg.page_count; i++) new_pages[pi++] = i;
		}

		pages = new_pages
		//console.log(pages);
	}
</script>

<p>Displaying {(pagination.page-1)*pagination.items_per_page+1} &mdash; {Math.min(pagination.page*pagination.items_per_page, pagination.item_count)}</p>

<nav aria-label="Page navigation">
	<ul class="pagination pagination-sm">
		<li class="page-item" class:disabled={pagination.page<=1}>
			<a class="page-link" href={"?page="+(pagination.page-1)}
				on:click={pageClick}
				data-page={pagination.page-1}
				aria-label="Previous">
				&laquo;
			</a>
		</li>
		{#each pages as page,i}
		{#if page == -1}
		<li class="page-item page-last-separator disabled"><span class="page-link">...</span></li>
		{:else}
		<li class="page-item" class:active={page==pagination.page}>
			<a on:click={pageClick} href={"?page="+page} data-page={page} class="page-link">{page}</a>
		</li>
		{/if}
		{/each}
		<li class="page-item" class:disabled={pagination.page>=pagination.page_count}>
			<a class="page-link" href={"?page="+(pagination.page+1)}
			   data-page={pagination.page+1}
			   on:click={pageClick}
			   aria-label="Next">
				&raquo;
			</a>
		</li>
	</ul>
</nav>
