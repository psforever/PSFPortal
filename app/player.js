import { writable } from 'svelte/store';
import axios from 'axios'

// Create a writable store to hold the selected player data
export const selectedPlayer = writable({});