// VibeSurvivors deployment settings (loaded as a classic script before the
// game module; there is no build step, so this is the settings file).
//
// The game reads window.VIVS_CFG; a missing or empty file simply means "no
// deployment defaults" (pure single player unless ?mp=host:port is given).
//
// mpHost    ‒ WSS endpoint host[:port] or full wss:// URL that the client
//             auto-connects to.
// mpDomain  ‒ page hostname where the BARE url is automatically multiplayer
//             (players just open the site, no ?mp= needed). ?sp forces
//             single player there. ?mp= always wins everywhere.
window.VIVS_CFG = {
  mpHost: 'ws.kopale.site',
  mpDomain: 'vibesurvivors.kopale.site',
};
