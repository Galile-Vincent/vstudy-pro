// @vitest-environment jsdom
import { renderToStaticMarkup as render } from 'react-dom/server';
import { TooltipProvider } from '../components/ui/tooltip';
const renderToStaticMarkup = (node:React.ReactNode) => render(<TooltipProvider>{node}</TooltipProvider>);
import { expect, it, vi } from 'vitest';
vi.mock('../bridge', () => ({ desktop: {} }));
vi.mock('../shell', () => ({ useNavigate: () => ({ navigate: () => {}, closeWelcome: () => {} }), useOptionalNavigation: () => null }));
import WelcomeView from './index';
import { i18n, resources } from '../../shared/i18n';
it('renders all seven sections and complete localized copy without animation APIs', async () => {
  for (const language of ['en', 'zh-Hant', 'ja'] as const) {
    await i18n.changeLanguage(language);
    const html = renderToStaticMarkup(<WelcomeView/>);
    const root = document.createElement('div'); root.innerHTML = html;
    expect(root.querySelectorAll('.w-content>section').length).toBe(7);
    expect(root.querySelectorAll('h1').length).toBe(1);
    expect(root.querySelector('#welcome-title .motion-sr')?.textContent).toBe(resources[language].welcome.hero_title);
    expect(root.querySelectorAll('.w-heading h2').length).toBe(6);
    expect(root.querySelector('.demo-stage')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.demo-stage')?.hasAttribute('inert')).toBe(true);
    expect([...root.querySelectorAll('.w-facts dt .motion-sr')].map(n => n.textContent)).toEqual(['8','6','3']);
    expect(html).not.toContain('welcome:'); expect(html).not.toContain('undefined');
  }
});
