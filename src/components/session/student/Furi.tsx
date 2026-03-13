/**
 * Furigana component. Renders ruby annotation when enabled, plain text when not.
 * Usage: <Furi f="しょうこ" on={furigana}>証拠</Furi>
 */
import type { ComponentChildren } from 'preact';

interface Props {
  f: string;       // furigana reading
  on: boolean;     // whether furigana is enabled
  children: ComponentChildren;
}

export default function Furi({ f, on, children }: Props) {
  if (!on) return <>{children}</>;
  return <ruby>{children}<rp>(</rp><rt>{f}</rt><rp>)</rp></ruby>;
}
