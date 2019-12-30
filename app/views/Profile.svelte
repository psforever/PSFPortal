<script>
	import { onMount } from 'svelte';
	import axios from 'axios'
	import page from 'page'
	import moment from 'moment'
	import CharacterLink from '../components/CharacterLink'
	import LoginList from '../components/LoginList'

	export let ready;
	ready = false;

	let username;
	let characters = [];
	let createDate;
	let isAdmin;
	let email;
	let account;

	onMount(async () => {
		try {
			const resp = await axios.get("/api/user/profile")
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
				page("/login?redirect=/profile")
			}
		}
	});
</script>

<svelte:head>
<title>PSForever - Profile</title>
</svelte:head>

<h1>Your Account</h1>
<form>
	{#if isAdmin}
	<strong class="color-red">You are a GM.</strong>
	{/if}
	<div class="form-group row">
		<label for="staticUsername" class="col-sm-2 col-form-label">Username</label>
		<div class="col-sm-10">
			<input type="text" readonly class="form-control-plaintext" id="staticUsername" bind:value={username}>
		</div>
	</div>
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
{#if characters.length > 1}
<div class="row">
{#each characters as char, i}
	<div class="col-md-4 col-12"><CharacterLink character={char} /></div>
{/each}
</div>
{:else}
<p>You have no characters</p>
{/if}

<h2>Logins</h2>
{#if account}
<LoginList account_id={account.id} />
{/if}
