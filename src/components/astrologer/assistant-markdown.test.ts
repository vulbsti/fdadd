import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AssistantMarkdown } from './AssistantMarkdown';

const render = (content: string) => renderToStaticMarkup(React.createElement(AssistantMarkdown, { content }));
describe('assistant Markdown presentation', () => {
  it('renders model headings, emphasis, lists, and dated tables instead of syntax markers', () => {
    const html = render('### Periods\n\n**Rahu** and *Mars*\n\n- Reflect\n\n| Start | End |\n| --- | --- |\n| 2026-01-01 | 2026-12-31 |');
    expect(html).toContain('<h3>Periods</h3>');
    expect(html).toContain('<strong>Rahu</strong>');
    expect(html).toContain('<em>Mars</em>');
    expect(html).toContain('<li>Reflect</li>');
    expect(html).toContain('<td>2026-12-31</td>');
    expect(html).not.toContain('###');
  });
  it('does not execute raw HTML or fetch model-provided image URLs', () => {
    const html = render('<script>alert(1)</script>\n\n<img src="https://example.invalid/tracker">\n\n![chart](https://example.invalid/private-data)');
    expect(html).not.toMatch(/<script|<img|example\.invalid/);
    expect(html).toContain('[Image: chart]');
  });
  it('strips dangerous link protocols and protects links opened in a new tab', () => {
    const html = render('[unsafe](javascript:alert%281%29) [reference](https://example.com)');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="https://example.com"');
  });
});
