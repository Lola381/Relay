// Plain module (not 'use client') so the server-rendered root layout can inline the script.
export const THEME_KEY = 'relay:theme';

/** Inline script for <head>: applies the saved theme before first paint (no flash). */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
