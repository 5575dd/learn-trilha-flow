import Markdown from "react-markdown";
import type { ReactNode } from "react";

const allowedElements = [
  "p",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "br",
  "code",
  "pre",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
];
const Heading = ({ children }: { children?: ReactNode }) => (
  <p className="font-semibold">{children}</p>
);

export function TutorAnswer({ text }: { text: string }) {
  return (
    <div className="min-w-0 break-words leading-relaxed [overflow-wrap:anywhere] [&_p]:mb-3 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-2 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_code]:text-[0.9em] [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3">
      <Markdown
        skipHtml
        allowedElements={allowedElements}
        unwrapDisallowed
        components={{
          h1: Heading,
          h2: Heading,
          h3: Heading,
          h4: Heading,
          h5: Heading,
          h6: Heading,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
