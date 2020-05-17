<script>
	import { get_initial_state, logout, isAdmin, loggedIn, username } from '../UserState.js';
	import axios from 'axios'
	export let route;
</script>

<nav class="navbar navbar-expand-sm navbar-dark bg-dark justify-content-between">
	<div class="container">
		<a class="navbar-brand" href="/">
			<img src="/img/logo_crop.png" height="30" class="d-inline-block align-top" alt="">
		</a>
		<button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
			<span class="navbar-toggler-icon"></span>
		</button>

		<div class="collapse navbar-collapse" id="navbarSupportedContent">
			<ul class="navbar-nav mr-auto">
				<li class="nav-item" class:active={route=="/"}>
					<a class="nav-link" href="/">Server Status</a>
				</li>
				{#if $isAdmin}
				<li class="nav-item" class:active={route=="/admin"}>
					<a class="nav-link" style="color: red;" href="/admin">Admin Panel</a>
				</li>
				{/if}
			</ul>
			<ul class="navbar-nav">
				{#if $loggedIn}
				<li class="nav-item" class:active={route=="/profile"}>
					<span class="navbar-text">Welcome <a href="/profile">{$username}</a>!</span>
				</li>
				<li class="nav-item">
					<a class="nav-link" on:click|preventDefault={logout} href="/logout">Logout</a>
				</li>
				{:else}
				<li class="nav-item" class:active={route=="/login"}>
					<a class="nav-link" href="/login">Login</a>
				</li>
				<li class="nav-item" class:active={route=="/register"}>
					<a class="nav-link" href="/register">Register</a>
				</li>
				{/if}
			</ul>
		</div>
	</div>
</nav>
