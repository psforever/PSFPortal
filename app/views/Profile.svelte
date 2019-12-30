<script>
	import { onMount } from 'svelte';
	import axios from 'axios'
	import page from 'page'
	import moment from 'moment'
	import CharacterLink from '../components/CharacterLink'
	import { userId } from '../UserState'
	import LoginList from '../components/LoginList'
	import AccountLink from '../components/AccountLink'

	export let pageCtx;
	export let appAlert;
	export let params;
	export let ready;

	ready = false;

	let username;
	let characters = [];
	let createDate;
	let isAdmin;
	let email;
	let account;

	onMount(async () => {
		let loadID = params.id || $userId;

		try {
			const resp = await axios.get("/api/user/"+loadID+"/profile")
			account = resp.data;
			username = resp.data.name;
			characters = resp.data.characters;
			createDate = moment(resp.data.account_created).format('MMMM Do YYYY, h:mm:ss a')
			+ " (" + moment(resp.data.account_created).fromNow() + ")";
			isAdmin = resp.data.admin;
			email = resp.data.email;

			ready = true
		} catch (e) {
			if (e.response && e.response.status == 403) {
				if (e.response.data.message == "session required") {
					page("/login?redirect="+pageCtx.pathname)
				} else {
					appAlert.message(e.response.data.message)
				}
			} else {
				appAlert.message(e.message)
			}
		}
	});
</script>

<svelte:head>
<title>PSForever - Profile</title>
</svelte:head>

{#if account}
<h1>Account: <AccountLink account={account}/></h1>
<form>
	<div class="form-group row">
		<label for="staticEmail" class="col-sm-2 col-form-label">Email</label>
		<div class="col-sm-10">
			<input type="text" readonly class="form-control-plaintext" id="staticEmail" bind:value={email}>
		</div>
	</div>
	<div class="form-group row">
		<label for="staticAccountCreated" class="col-sm-2 col-form-label">Account Created</label>
		<div class="col-sm-10">
			<input type="text" readonly class="form-control-plaintext" id="staticAccountCreated" bind:value={createDate}>
		</div>
	</div>
</form>

<h2>Characters</h2>
<p>
	{#if characters.length > 1}
	<div class="row">
	{#each characters as char, i}
		<div class="col-md-4 col-12"><CharacterLink character={char} /></div>
	{/each}
	</div>
	{:else}
	You have no characters
	{/if}
</p>

<h2>Logins</h2>
<p>
<LoginList account_id={account.id} />
</p>
{/if}

