import type { ReactNode } from 'react';

type EmptyStateProps = {
  eyebrow: string;
  title: string;
  description: string;
  footer?: ReactNode;
};

export function EmptyState({ eyebrow, title, description, footer }: EmptyStateProps) {
  return (
    <section className="empty-state" aria-label={title}>
      <span className="empty-state__rule" aria-hidden="true" />
      <p className="empty-state__eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
      {footer ? <div className="empty-state__footer">{footer}</div> : null}
    </section>
  );
}
