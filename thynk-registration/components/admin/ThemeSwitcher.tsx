'use client';
import React, { useState, useEffect, useRef } from 'react';

export interface Theme {
  id: string;
  name: string;
  emoji: string;
  // CSS variable overrides applied to :root
  vars: Record<string, string>;
  // Sidebar specific (dark bg + text)
  sidebar: string;
  sidebarActive: string;
  sidebarBorder: string;
  sidebarText: string;
}

export const THEMES: Theme[] = [
  {
    id: 'indigo',
    name: 'Indigo Night',
    emoji: '🌌',
    vars: {
      '--bg': '#f5f7ff', '--card': '#ffffff', '--bd': '#e2e8f0',
      '--acc': '#4f46e5', '--acc2': '#4338ca', '--acc3': '#eef2ff',
      '--green': '#10b981', '--green2': '#d1fae5',
      '--red': '#ef4444', '--red2': '#fee2e2',
      '--orange': '#f59e0b', '--orange2': '#fef3c7',
      '--purple': '#8b5cf6', '--purple2': '#ede9fe',
      '--text': '#1e1b4b', '--m': '#6b7280', '--m2': '#9ca3af',
    },
    sidebar: '#1e1b4b',
    sidebarActive: 'linear-gradient(135deg,rgba(79,70,229,.45),rgba(139,92,246,.3))',
    sidebarBorder: 'rgba(255,255,255,.06)',
    sidebarText: 'rgba(255,255,255,.45)',
  },
  {
    id: 'emerald',
    name: 'Emerald Forest',
    emoji: '🌿',
    vars: {
      '--bg': '#f0fdf4', '--card': '#ffffff', '--bd': '#d1fae5',
      '--acc': '#059669', '--acc2': '#047857', '--acc3': '#ecfdf5',
      '--green': '#10b981', '--green2': '#d1fae5',
      '--red': '#ef4444', '--red2': '#fee2e2',
      '--orange': '#f59e0b', '--orange2': '#fef3c7',
      '--purple': '#8b5cf6', '--purple2': '#ede9fe',
      '--text': '#064e3b', '--m': '#6b7280', '--m2': '#9ca3af',
    },
    sidebar: '#064e3b',
    sidebarActive: 'linear-gradient(135deg,rgba(5,150,105,.5),rgba(16,185,129,.3))',
    sidebarBorder: 'rgba(255,255,255,.08)',
    sidebarText: 'rgba(255,255,255,.45)',
  },
  {
    id: 'rose',
    name: 'Rose Gold',
    emoji: '🌸',
    vars: {
      '--bg': '#fff1f2', '--card': '#ffffff', '--bd': '#fecdd3',
      '--acc': '#e11d48', '--acc2': '#be123c', '--acc3': '#fff1f2',
      '--green': '#10b981', '--green2': '#d1fae5',
      '--red': '#ef4444', '--red2': '#fee2e2',
      '--orange': '#f59e0b', '--orange2': '#fef3c7',
      '--purple': '#8b5cf6', '--purple2': '#ede9fe',
      '--text': '#881337', '--m': '#6b7280', '--m2': '#9ca3af',
    },
    sidebar: '#881337',
    sidebarActive: 'linear-gradient(135deg,rgba(225,29,72,.5),rgba(244,63,94,.3))',
    sidebarBorder: 'rgba(255,255,255,.08)',
    sidebarText: 'rgba(255,255,255,.45)',
  },
  {
    id: 'ocean',
    name: 'Deep Ocean',
    emoji: '🌊',
    vars: {
      '--bg': '#f0f9ff', '--card': '#ffffff', '--bd': '#bae6fd',
      '--acc': '#0284c7', '--acc2': '#0369a1', '--acc3': '#e0f2fe',
      '--green': '#10b981', '--green2': '#d1fae5',
      '--red': '#ef4444', '--red2': '#fee2e2',
      '--orange': '#f59e0b', '--orange2': '#fef3c7',
      '--purple': '#8b5cf6', '--purple2': '#ede9fe',
      '--text': '#0c4a6e', '--m': '#6b7280', '--m2': '#9ca3af',
    },
    sidebar: '#0c4a6e',
    sidebarActive: 'linear-gradient(135deg,rgba(2,132,199,.5),rgba(6,182,212,.3))',
    sidebarBorder: 'rgba(255,255,255,.08)',
    sidebarText: 'rgba(255,255,255,.45)',
  },
  {
    id: 'amber',
    name: 'Amber Sunset',
    emoji: '🌅',
    vars: {
      '--bg': '#fffbeb', '--card': '#ffffff', '--bd': '#fde68a',
      '--acc': '#d97706', '--acc2': '#b45309', '--acc3': '#fef3c7',
      '--green': '#10b981', '--green2': '#d1fae5',
      '--red': '#ef4444', '--red2': '#fee2e2',
      '--orange': '#f59e0b', '--orange2': '#fef3c7',
      '--purple': '#8b5cf6', '--purple2': '#ede9fe',
      '--text': '#78350f', '--m': '#6b7280', '--m2': '#9ca3af',
    },
    sidebar: '#78350f',
    sidebarActive: 'linear-gradient(135deg,rgba(217,119,6,.5),rgba(245,158,11,.3))',
    sidebarBorder: 'rgba(255,255,255,.08)',
    sidebarText: 'rgba(255,255,255,.45)',
  },
  {
    id: 'violet',
    name: 'Violet Dreams',
    emoji: '💜',
    vars: {
      '--bg': '#faf5ff', '--card': '#ffffff', '--bd': '#e9d5ff',
      '--acc': '#7c3aed', '--acc2': '#6d28d9', '--acc3': '#f5f3ff',
      '--green': '#10b981', '--green2': '#d1fae5',
      '--red': '#ef4444', '--red2': '#fee2e2',
      '--orange': '#f59e0b', '--orange2': '#fef3c7',
      '--purple': '#8b5cf6', '--purple2': '#ede9fe',
      '--text': '#4c1d95', '--m': '#6b7280', '--m2': '#9ca3af',
    },
    sidebar: '#4c1d95',
    sidebarActive: 'linear-gradient(135deg,rgba(124,58,237,.5),rgba(167,139,250,.3))',
    sidebarBorder: 'rgba(255,255,255,.08)',
    sidebarText: 'rgba(255,255,255,.45)',
  },
  {
    id: 'slate',
    name: 'Slate Pro',
    emoji: '🪨',
    vars: {
      '--bg': '#f8fafc', '--card': '#ffffff', '--bd': '#e2e8f0',
      '--acc': '#475569', '--acc2': '#334155', '--acc3': '#f1f5f9',
      '--green': '#10b981', '--green2': '#d1fae5',
      '--red': '#ef4444', '--red2': '#fee2e2',
      '--orange': '#f59e0b', '--orange2': '#fef3c7',
      '--purple': '#8b5cf6', '--purple2': '#ede9fe',
      '--text': '#0f172a', '--m': '#64748b', '--m2': '#94a3b8',
    },
    sidebar: '#0f172a',
    sidebarActive: 'linear-gradient(135deg,rgba(71,85,105,.5),rgba(100,116,139,.3))',
    sidebarBorder: 'rgba(255,255,255,.08)',
    sidebarText: 'rgba(255,255,255,.4)',
  },
  {
    id: 'midnight',
    name: 'Midnight Dark',
    emoji: '🌙',
    vars: {
      '--bg': '#0f172a', '--card': '#1e293b', '--bd': '#334155',
      '--acc': '#818cf8', '--acc2': '#6366f1', '--acc3': '#1e293b',
      '--green': '#34d399', '--green2': '#064e3b',
      '--red': '#f87171', '--red2': '#450a0a',
      '--orange': '#fbbf24', '--orange2': '#451a03',
      '--purple': '#a78bfa', '--purple2': '#2e1065',
      '--text': '#f1f5f9', '--m': '#94a3b8', '--m2': '#64748b',
    },
    sidebar: '#020617',
    sidebarActive: 'linear-gradient(135deg,rgba(129,140,248,.3),rgba(99,102,241,.2))',
    sidebarBorder: 'rgba(255,255,255,.06)',
    sidebarText: 'rgba(255,255,255,.4)',
  },
];

const STORAGE_KEY = 'thynk_admin_theme';

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v));

  // Apply sidebar colors via CSS variables
  root.style.setProperty('--sidebar-bg',     theme.sidebar);
  root.style.setProperty('--sidebar-active', theme.sidebarActive);
  root.style.setProperty('--sidebar-border', theme.sidebarBorder);
  root.style.setProperty('--sidebar-text',   theme.sidebarText);

  // Inject dynamic sidebar CSS
  let styleEl = document.getElementById('__theme_sidebar__') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = '__theme_sidebar__';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    .sidebar { background: ${theme.sidebar} !important; }
    .sb-logo { border-bottom-color: ${theme.sidebarBorder} !important; }
    .sb-section { color: ${theme.sidebarText} !important; }
    .sb-item { color: ${theme.sidebarText} !important; }
    .sb-item:hover { background: rgba(255,255,255,.07) !important; color: rgba(255,255,255,.9) !important; }
    .sb-item.active { background: ${theme.sidebarActive} !important; color: #fff !important; }
    .sb-logo-icon { background: linear-gradient(135deg, ${theme.vars['--acc']}, ${theme.vars['--purple']}) !important; }
    .sb-avatar { background: linear-gradient(135deg, ${theme.vars['--acc']}, ${theme.vars['--purple']}) !important; }
    .sb-bottom { border-top-color: ${theme.sidebarBorder} !important; }
    .btn-primary { background: linear-gradient(135deg, ${theme.vars['--acc']}, ${theme.vars['--purple']}) !important; }
    .topbar-left h1 span { color: ${theme.vars['--acc']} !important; }
    .badge-live { background: ${theme.vars['--green2']} !important; color: ${theme.vars['--green']} !important; }
    .dot { background: ${theme.vars['--green']} !important; }
    .period-tab.active { background: ${theme.vars['--acc']} !important; border-color: ${theme.vars['--acc']} !important; color: #fff !important; }
    .badge-paid { background: ${theme.vars['--green2']} !important; color: ${theme.vars['--green']} !important; }
    body { background: ${theme.vars['--bg']} !important; color: ${theme.vars['--text']} !important; }
    .card { background: ${theme.vars['--card']} !important; }
    .tbl-wrap table thead { background: ${theme.vars['--acc3']} !important; }
    input, select, textarea { background: ${theme.vars['--card']} !important; color: ${theme.vars['--text']} !important; border-color: ${theme.vars['--bd']} !important; }
  `;

  localStorage.setItem(STORAGE_KEY, theme.id);
}

export function loadSavedTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const theme = THEMES.find(t => t.id === saved) ?? THEMES[0];
  applyTheme(theme);
  return theme;
}

// ── Theme Switcher UI Component ───────────────────────────────────────────────
export function ThemeSwitcher() {
  const [open, setOpen]   = useState(false);
  const [active, setActive] = useState<Theme>(THEMES[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const theme = THEMES.find(t => t.id === saved) ?? THEMES[0];
    setActive(theme);
    applyTheme(theme);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectTheme = (theme: Theme) => {
    setActive(theme);
    applyTheme(theme);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Change theme"
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '7px 13px', borderRadius: 10,
          border: '1.5px solid var(--bd)',
          background: 'var(--card)',
          color: 'var(--text)',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'DM Sans, sans-serif',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--acc)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--bd)')}
      >
        <span style={{ fontSize: 16 }}>{active.emoji}</span>
        <span style={{ display: 'flex', gap: 3 }}>
          {[active.vars['--acc'], active.vars['--green'], active.vars['--orange']].map((c, i) => (
            <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
          ))}
        </span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 999,
          background: 'var(--card)', border: '1px solid var(--bd)',
          borderRadius: 18, boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
          padding: 16, width: 340, fontFamily: 'DM Sans, sans-serif',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--m)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
            🎨 Choose Theme
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {THEMES.map(theme => {
              const isActive = theme.id === active.id;
              return (
                <button key={theme.id} onClick={() => selectTheme(theme)} style={{
                  display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px',
                  borderRadius: 14, border: `2px solid ${isActive ? theme.vars['--acc'] : 'var(--bd)'}`,
                  background: isActive ? theme.vars['--acc3'] : 'var(--bg)',
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                  boxShadow: isActive ? `0 0 0 3px ${theme.vars['--acc']}22` : 'none',
                }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = theme.vars['--acc']; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--bd)'; }}
                >
                  {/* Color swatches */}
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: theme.sidebar, flexShrink: 0 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                      <div style={{ height: 8, borderRadius: 4, background: theme.vars['--acc'] }} />
                      <div style={{ display: 'flex', gap: 3 }}>
                        <div style={{ flex: 1, height: 5, borderRadius: 3, background: theme.vars['--green'] }} />
                        <div style={{ flex: 1, height: 5, borderRadius: 3, background: theme.vars['--orange'] }} />
                        <div style={{ flex: 1, height: 5, borderRadius: 3, background: theme.vars['--bg'], border: '1px solid var(--bd)' }} />
                      </div>
                    </div>
                    {isActive && (
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: theme.vars['--acc'], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>✓</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: isActive ? 800 : 600, color: isActive ? theme.vars['--acc'] : 'var(--text)' }}>
                      {theme.emoji} {theme.name}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
