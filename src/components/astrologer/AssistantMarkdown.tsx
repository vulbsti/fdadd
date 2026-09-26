import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Model text is untrusted: no raw HTML, automatic images, or embedded widgets. */
export function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="space-y-2 whitespace-normal [overflow-wrap:anywhere] [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_pre]:rounded [&_pre]:bg-background/70 [&_pre]:p-2 [&_code]:text-xs">
      <Markdown skipHtml remarkPlugins={[remarkGfm]} components={{
        img: ({ alt }) => <span>{alt ? `[Image: ${alt}]` : '[Image omitted]'}</span>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{children}</a>,
        table: ({ children }) => <div className="max-w-full overflow-x-auto"><table className="w-full border-collapse text-left [&_th]:border-b [&_th]:p-2 [&_td]:border-b [&_td]:p-2">{children}</table></div>,
      }}>{content}</Markdown>
    </div>
  );
}
