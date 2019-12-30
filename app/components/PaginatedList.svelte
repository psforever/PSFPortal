<script>
	import { onMount } from 'svelte'
	import axios from 'axios'
	import Pagination from '../components/Pagination'

	export let fetch;

	let data;
	let fetching = false;
	let pagination = { page: 1 };

	export async function refresh() {
		await list_fetch(pagination.page)
	}

	onMount(async () => {
		const url = new URL(window.location.href)
		let page = url.searchParams.get('page')

		if (page == undefined)
			page = 1;

		await list_fetch(page);
	})

	async function pageChange(page) {
		if (pagination.page == page || fetching)
			return

		await list_fetch(page);
	}

	async function list_fetch(page) {
		fetching = true;

		try {
			if (fetch != undefined) {
				const results = await fetch(page)

				if (results != undefined) {
					data = results[0];
					pagination = results[1]
				}
			}
		} finally {
			fetching = false;
		}
	}
</script>

{#if data}
<slot name="header" data={data} pagination={pagination}></slot>
<Pagination {pagination} {pageChange} />
<slot name="body" data={data} pagination={pagination}></slot>
<Pagination {pagination} {pageChange} />
<slot name="footer" data={data} pagination={pagination}></slot>
{/if}
