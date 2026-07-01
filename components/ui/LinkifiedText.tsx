"use client";

type LinkifiedTextProps = {
  text?: string | null;
};

const URL_REGEX = /(https?:\/\/[^\s<>"']+)/g;
const TRAILING_PUNCTUATION_REGEX = /[.,)\]]+$/;

export default function LinkifiedText({ text }: LinkifiedTextProps) {
  if (!text) return null;

  const parts = text.split(URL_REGEX);

  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;

        const isUrl = /^https?:\/\//.test(part);
        if (isUrl) {
          const trailingMatch = part.match(TRAILING_PUNCTUATION_REGEX);
          const trailing = trailingMatch?.[0] ?? "";
          const href = trailing ? part.slice(0, -trailing.length) : part;

          return (
            <span key={`${part}-${index}`}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline underline-offset-2 break-all"
              >
                {href}
              </a>
              {trailing}
            </span>
          );
        }

        return part.split("\n").map((chunk, lineIndex, lines) => (
          <span key={`${index}-${lineIndex}`}>
            {chunk}
            {lineIndex < lines.length - 1 && <br />}
          </span>
        ));
      })}
    </>
  );
}
