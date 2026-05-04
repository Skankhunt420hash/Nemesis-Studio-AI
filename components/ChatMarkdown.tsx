"use client";

import { useCallback, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function PreWithCopy({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    const text = ref.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, []);

  return (
    <div className="group relative my-2">
      <button
        type="button"
        onClick={() => void copy()}
        className="absolute right-2 top-2 z-[1] rounded border border-[#454545] bg-[#2d2d30] px-2 py-0.5 text-[11px] text-[#cccccc] opacity-0 transition-opacity hover:bg-[#3c3c3c] group-hover:opacity-100"
      >
        {copied ? "Kopiert" : "Kopieren"}
      </button>
      <pre
        ref={ref}
        className="overflow-x-auto rounded border border-[#454545] bg-[#1e1e1e] p-3 pr-16 font-mono text-[12px] leading-relaxed text-[#d4d4d4]"
      >
        {children}
      </pre>
    </div>
  );
}

export function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="markdown-chat text-[13px] leading-relaxed text-[#d4d4d4] [&_a]:text-[#4fc1ff] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[#569cd6] [&_blockquote]:pl-3 [&_blockquote]:text-[#b8b8b8] [&_h1]:mb-2 [&_h1]:text-[15px] [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-[14px] [&_h2]:font-semibold [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[#454545] [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-[#454545] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            return <PreWithCopy>{children}</PreWithCopy>;
          },
          code({ className, children, ...props }) {
            const isBlock = String(className ?? "").includes("language-");
            if (isBlock) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-[#3c3c3c] px-1 py-0.5 font-mono text-[12px] text-[#ce9178]"
                {...props}
              >
                {children}
              </code>
            );
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
