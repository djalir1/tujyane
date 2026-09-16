import type { ReactNode } from 'react';

type Props = {
  kicker: string;
  title: string;
  updated: string;
  children: ReactNode;
};

/**
 * Shared shell for the static content pages (Terms, Privacy, How it works,
 * About). Typography is tight and readable; the page grows with the browser
 * width up to a comfortable reading measure.
 */
export function ContentLayout({ kicker, title, updated, children }: Props) {
  return (
    <div className="bg-bg">
      <section className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
        <div className="t-caption">{kicker}</div>
        <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-text">{title}</h1>
        <p className="mt-2 text-sm text-text-muted">Last updated: {updated}</p>
        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-text [&_h2]:t-h2 [&_h2]:mt-8 [&_h2]:text-text [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-text [&_h3]:mt-6 [&_p]:text-text-muted [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_li]:text-text-muted [&_a]:text-brand [&_a]:font-semibold hover:[&_a]:underline">
          {children}
        </div>
      </section>
    </div>
  );
}
