import type { ReactNode } from "react";

type Props = {
  content: string;
  className?: string;
};

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const text = paragraphLines.join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      blocks.push({ type: "paragraph", text });
    }
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push({ type: "list", items: [...listItems] });
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      listItems.push(bulletMatch[1].trim());
      continue;
    }

    if (listItems.length > 0) {
      listItems[listItems.length - 1] = `${listItems[listItems.length - 1]} ${line}`.trim();
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const segments = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);

  return segments.map((segment, index) => {
    const boldMatch = segment.match(/^\*\*(.+)\*\*$/);
    if (boldMatch) {
      return (
        <strong key={`${segment}-${index}`} className="font-semibold text-[#fbf1d0]">
          {boldMatch[1]}
        </strong>
      );
    }

    return <span key={`${segment}-${index}`}>{segment}</span>;
  });
}

export default function CouncilRichText({ content, className }: Props) {
  const blocks = parseBlocks(content);

  return (
    <div className={className}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const headingClassName =
            block.level === 1
              ? "text-lg font-semibold tracking-[0.08em] text-[#fbefc8]"
              : block.level === 2
                ? "text-base font-semibold tracking-[0.08em] text-[#f8ebc3]"
                : "text-sm font-semibold uppercase tracking-[0.22em] text-[#f2c46e]";

          return (
            <div key={`heading-${index}`} className={index === 0 ? headingClassName : `mt-5 ${headingClassName}`}>
              {renderInline(block.text)}
            </div>
          );
        }

        if (block.type === "list") {
          return (
            <ul key={`list-${index}`} className="mt-4 space-y-2 pl-5 text-sm leading-7 text-[rgba(247,236,209,0.94)] marker:text-[rgba(214,162,79,0.88)] list-disc">
              {block.items.map((item, itemIndex) => (
                <li key={`item-${index}-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`paragraph-${index}`} className={index === 0 ? "text-sm leading-7 text-[rgba(247,236,209,0.94)]" : "mt-4 text-sm leading-7 text-[rgba(247,236,209,0.94)]"}>
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}
