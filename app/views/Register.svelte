<script>
	import axios from 'axios'
	import page from 'page';
	import Alert from '../components/Alert'
	import { formToJSON } from '../util/form.js'
	import { get_initial_state } from '../UserState.js';

	let alert;
	let validated = false;
	let email, password; // for validation

	function validatePassword(e) {
		// cant use cpassword here because svelte has not propagated the bound value yet
		if (password !== e.target.value)
			e.target.setCustomValidity("Passwords do not match")
		else
			e.target.setCustomValidity("")
	}

	function validateEmail(e) {
		if (email !== e.target.value)
			e.target.setCustomValidity("Emails do not match")
		else
			e.target.setCustomValidity("")
	}

	async function submitLogin(e) {
		const data = formToJSON(e.target);

		if (e.target.checkValidity() === false) {
			validated = true
			return
		}

		validated = true

		try {
			delete data.cpassword
			delete data.cemail
			const resp = await axios.post("/api/register", data);

			if (await get_initial_state()) {
				page.redirect("/")
			} else {
				alert.message("Unknown login failure")
			}
		} catch (e) {
			if (e.response) {
				if (e.response.status >= 500) {
					alert.message("Unknown server error. Contact an administrator if this persists.")
				} else if (e.response.status === 400) {
					alert.message(e.response.data.message)
				} else if (e.response.status === 403) {
					alert.message(e.response.data.message)
				} else {
					alert.message("Unknown server error status");
				}
			} else if (e.request) {
				alert.message("Unknown server error. Contact an administrator if this persists.")
			} else {
				alert.message("Unknown request error: " + e.message)
			}
		}
	}
</script>

<svelte:head>
<title>PSForever - Register</title>
</svelte:head>

<main>
	<h1>Register for PSForever</h1>

	<Alert bind:this={alert} />

	<form name="login" class:was-validated={validated} class="form-group needs-validation" novalidate on:submit|preventDefault={submitLogin}>
		<div class="form-group">
			<label for="inputUsername">Username</label>
			<input class="form-control" id="inputUsername" placeholder="Username" name="username" minlength=3 pattern={String.raw`[A-Za-z0-9]{3,}`} required>
			<small id="emailHelp" class="form-text text-muted">This is used to login via the game client, launcher, and web interface.</small>
			<div class="invalid-feedback">
				Usernames must be at least 3 characters long and not contain special characters or spaces.
			</div>
		</div>
		<div class="form-row">
			<div class="form-group col">
				<label for="inputPassword">Password</label>
				<input bind:value={password} class="form-control" type="password" id="inputPassword" placeholder="Password" name="password" required>
			</div>
			<div class="form-group col">
				<label for="inputCPassword">Confim Password</label>
				<input on:input={validatePassword} on:change={validatePassword} class="form-control" type="password" id="inputCPassword" placeholder="Confirm Password" name="cpassword" required>
				<div class="invalid-feedback">Passwords must match.</div>
			</div>
		</div>
		<div class="form-row">
			<div class="form-group col">
				<label for="inputEmail">Email</label>
				<input bind:value={email} class="form-control" type="email" id="inputEmail" placeholder="Email" name="email" required>
				<small id="emailHelp" class="form-text text-muted">Emails are used to help confirm and recover accounts.</small>
				<div class="invalid-feedback">Please provide a valid email address.</div>
			</div>
			<div class="form-group col">
				<label for="inputCEmail">Confirm Email</label>
				<input on:input={validateEmail} on:change={validateEmail} class="form-control" type="email" id="inputCEmail" placeholder="Confirm Email" name="cemail" required>
				<div class="invalid-feedback">Email addresses must match.</div>
			</div>
		</div>
		<button type="submit" class="btn btn-primary">Join the fight!</button>
	</form>
</main>
