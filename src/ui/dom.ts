export function h(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

export function qs<T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T {
  const e = root.querySelector<T>(sel);
  if (!e) throw new Error(`Missing element: ${sel}`);
  return e;
}

export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');

export function goldTag(n: number): string {
  return `<span class="coin"></span>${fmt(n)}`;
}

export const TIER_COLOR = ['', 'var(--tier1)', 'var(--tier2)', 'var(--tier3)', 'var(--tier4)', 'var(--tier5)'];

export function starsHtml(n: number): string {
  return `<span class="stars">${[0, 1, 2].map((i) => `<span class="${i < n ? 'lit' : ''}">★</span>`).join('')}</span>`;
}
