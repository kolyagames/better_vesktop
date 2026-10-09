/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const UNIFIED_CSS = `
.bdvk-wrap{display:flex;flex-direction:column;gap:14px;padding-bottom:24px}
.bdvk-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.bdvk-search{flex:1 1 220px;min-width:180px;height:36px;padding:0 12px;border-radius:8px;border:1px solid var(--border-subtle,rgba(255,255,255,.1));background:var(--input-background,var(--background-tertiary,#1e1f22));color:var(--text-default,var(--text-normal,#fff));font-size:14px;outline:none}
.bdvk-search:focus{border-color:var(--brand-500,#5865f2)}
.bdvk-pills{display:flex;flex-wrap:wrap;gap:6px}
.bdvk-pill{height:30px;padding:0 12px;border-radius:15px;border:1px solid var(--border-subtle,rgba(255,255,255,.12));background:transparent;color:var(--text-muted,#b5bac1);font-size:13px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.bdvk-pill:hover{background:var(--background-modifier-hover,rgba(255,255,255,.06));color:var(--text-default,#fff)}
.bdvk-pill[data-on="1"]{background:var(--brand-500,#5865f2);border-color:transparent;color:#fff}
.bdvk-count{opacity:.75;font-size:12px}
.bdvk-actions{display:flex;gap:8px;margin-left:auto}
.bdvk-btn{height:32px;padding:0 12px;border-radius:6px;border:none;background:var(--button-secondary-background,rgba(255,255,255,.1));color:var(--text-default,#fff);font-size:13px;font-weight:500;cursor:pointer}
.bdvk-btn:hover{filter:brightness(1.15)}
.bdvk-btn--brand{background:var(--brand-500,#5865f2)}
.bdvk-notice{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;background:rgba(250,166,26,.14);border:1px solid rgba(250,166,26,.4);color:var(--text-default,#fff);font-size:13px}
.bdvk-notice span{flex:1}
.bdvk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:12px}
.bdvk-card{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:10px;background:var(--background-base-low,var(--background-secondary,#2b2d31));border:1px solid var(--border-subtle,rgba(255,255,255,.06));min-height:112px}
.bdvk-card[data-on="1"]{border-color:rgba(88,101,242,.45)}
.bdvk-head{display:flex;align-items:center;gap:8px}
.bdvk-name{flex:1;min-width:0;font-weight:600;font-size:15px;color:var(--header-primary,#fff);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bdvk-badge{flex:none;padding:1px 7px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:.02em;color:#fff}
.bdvk-badge--vc{background:#5865f2}
.bdvk-badge--bd{background:#3e82e5}
.bdvk-desc{flex:1;font-size:13px;line-height:1.35;color:var(--text-muted,#b5bac1);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.bdvk-foot{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-muted,#b5bac1)}
.bdvk-author{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bdvk-icon{width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:var(--interactive-normal,#b5bac1);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:16px}
.bdvk-icon:hover{background:var(--background-modifier-hover,rgba(255,255,255,.08));color:var(--interactive-hover,#fff)}
.bdvk-icon[disabled]{opacity:.35;cursor:default}
.bdvk-switch{flex:none;position:relative;width:40px;height:22px;border-radius:11px;border:none;padding:0;background:var(--primary-500,#4e5058);cursor:pointer;transition:background .15s}
.bdvk-switch::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}
.bdvk-switch[aria-checked="true"]{background:var(--green-360,#23a55a)}
.bdvk-switch[aria-checked="true"]::after{transform:translateX(18px)}
.bdvk-switch[disabled]{opacity:.45;cursor:not-allowed}
.bdvk-empty{padding:36px 0;text-align:center;color:var(--text-muted,#b5bac1)}

/* plugin cards: a soft lift and a lit border on hover, so they read as things you can use */
.bdvk-card { transition: transform 0.25s cubic-bezier(0.2, 0.7, 0.2, 1), border-color 0.25s, box-shadow 0.25s, background 0.25s; }
.bdvk-card:hover { transform: translateY(-2px); border-color: rgba(141, 130, 255, 0.6); box-shadow: 0 12px 26px -16px rgba(141, 130, 255, 0.55); }
@media (prefers-reduced-motion: reduce) {
    .bdvk-card { transition: border-color 0.25s, box-shadow 0.25s; }
    .bdvk-card:hover { transform: none; }
}
`;
