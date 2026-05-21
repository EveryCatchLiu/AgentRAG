import type { ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface MarkdownMessageProps {
  content: string
  className?: string
}

interface CompProps {
  children?: ReactNode
  className?: string
  href?: string
}

export default function MarkdownMessage({ content, className = "" }: MarkdownMessageProps) {
  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }: CompProps) => (
            <pre className="my-2 overflow-x-auto rounded-lg bg-[#f5f1ec] p-3 text-xs text-[#5c4a3a]">
              {children}
            </pre>
          ),
          code: ({ children, className: codeClass, ...props }: CompProps & { node?: unknown }) => {
            const isInline = !codeClass
            if (isInline) {
              return (
                <code className="rounded bg-[#f5f1ec] px-1 py-0.5 text-[0.85em] text-[#8b5e3c]" {...props}>
                  {children}
                </code>
              )
            }
            return (
              <code className={codeClass} {...props}>
                {children}
              </code>
            )
          },
          table: ({ children }: CompProps) => (
            <div className="my-2 overflow-x-auto">
              <table className="min-w-full border-collapse border border-[#e8e0d5] text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }: CompProps) => (
            <th className="border border-[#e8e0d5] bg-[#f5f1ec] px-3 py-1.5 text-left font-medium text-[#5c4a3a]">
              {children}
            </th>
          ),
          td: ({ children }: CompProps) => (
            <td className="border border-[#e8e0d5] px-3 py-1.5 text-[#5c4a3a]">
              {children}
            </td>
          ),
          h1: ({ children }: CompProps) => (
            <h1 className="mt-3 mb-1.5 text-base font-semibold text-[#3d3530]">{children}</h1>
          ),
          h2: ({ children }: CompProps) => (
            <h2 className="mt-2.5 mb-1 text-sm font-semibold text-[#3d3530]">{children}</h2>
          ),
          h3: ({ children }: CompProps) => (
            <h3 className="mt-2 mb-1 text-xs font-semibold text-[#3d3530]">{children}</h3>
          ),
          ul: ({ children }: CompProps) => (
            <ul className="my-1 list-disc space-y-0.5 pl-5 text-[#5c4a3a]">{children}</ul>
          ),
          ol: ({ children }: CompProps) => (
            <ol className="my-1 list-decimal space-y-0.5 pl-5 text-[#5c4a3a]">{children}</ol>
          ),
          li: ({ children }: CompProps) => (
            <li className="text-[#5c4a3a]">{children}</li>
          ),
          p: ({ children }: CompProps) => (
            <p className="my-1 leading-relaxed text-[#5c4a3a]">{children}</p>
          ),
          strong: ({ children }: CompProps) => (
            <strong className="font-semibold text-[#3d3530]">{children}</strong>
          ),
          a: ({ href, children }: CompProps) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#8b5e3c] underline hover:text-[#d4704a]">
              {children}
            </a>
          ),
          blockquote: ({ children }: CompProps) => (
            <blockquote className="my-1.5 border-l-2 border-[#e8954c] bg-[#fefaf5] py-1.5 pl-3 pr-2 text-xs text-[#8b5e3c] italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-[#e8e0d5]" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
