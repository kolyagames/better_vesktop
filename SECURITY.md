# Security

## The model

Discord's page and all BetterDiscord and Vencord plugins run in a sandboxed renderer: no Node.js, context isolation on, like stock Vesktop. BetterDiscord reaches the computer only through the bridge in `src/main/betterdiscord`, and every request is checked in the main process:

- **Files:** only inside the BetterDiscord folder, paths you picked in a file dialog during the session, and folders you listed in `betterDiscord.extraPaths`. Paths are resolved through symlinks, UNC, device and alternate-stream paths are refused, and the allowed roots themselves can't be deleted or renamed.
- **Network:** `http` and `https` only, with no cookies from Discord. Loopback, private, link-local, multicast and other non-public addresses are refused (IPv4 and IPv6, including mapped, NAT64, 6to4 and Teredo forms) unless `betterDiscord.allowLocalNetwork` is on. Redirects are re-checked on every hop. Discord webhook URLs are refused.
- **IPC:** the page can only use a fixed list of BetterDiscord channels. Vesktop's own channels, such as settings or relaunch, are not reachable from a plugin.
- **Opening things:** only `http(s)` and `mailto` links, and folders or text-like files inside the BetterDiscord folder. Executables are never opened.
- **Windows opened for plugins** are hardened (sandboxed, no preload) and can't reach the bridge.

## What this does not protect against

- A plugin is code inside your Discord page. It can read and change what the page shows and act with your logged-in session. Treat installing a plugin like running a program written by its author.
- Discord's Content-Security-Policy for documents is removed, as BetterDiscord does, so plugins and themes can load remote resources.
- A host name can resolve to a different address between our check and the connection (DNS rebinding). The local network checks reduce the risk but are not a firewall.
- Anything inside the allowed folders is writable by plugins, including other plugins.

## Reporting a problem

Please report vulnerabilities privately through GitHub: **Security** tab, **Report a vulnerability**, on this repository. Include the version, steps to reproduce and what you expected. Don't open a public issue for something exploitable.

Network policy tests: `pnpm tsx scripts/test-policy.mts`.
