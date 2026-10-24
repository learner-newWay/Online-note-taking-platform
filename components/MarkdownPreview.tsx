"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function MarkdownPreview({ content }: { content: string }) {
  if (!content.trim()) {
    return (
      <p className="text-sm italic text-zinc-400 dark:text-zinc-500">
        这篇笔记还是空的，切换到「编辑」开始写点什么吧。
      </p>
    );
  }

  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          table: ({ node: _node, ...props }) => (
            <div className="overflow-x-auto">
              <table {...props} />
            </div>
          ),
          pre: ({ node: _node, children, ...props }) => {
            const child = Array.isArray(children) ? children[0] : children;
            const className = (child as any)?.props?.className || "";
            const match = /language-([\w-]+)/.exec(className);
            const language = match?.[1];
            const preProps = language ? { "data-language": language, ...props } : props;
            return <pre {...preProps}>{children}</pre>;
          },
          code: ({ node: _node, inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
