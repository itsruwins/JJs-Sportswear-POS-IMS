// Light / Dark / System theme choice, remembered on this device.
// "system" stores nothing and leaves <html> without data-theme, so CSS follows the device.

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_KEY = "jj-theme";

/** Runs before first paint (inlined in the root layout) so a saved theme never flashes. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}})();`;
