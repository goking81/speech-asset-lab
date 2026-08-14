import { EmptyState } from '@/components/empty-state';

type PlaceholderPageProps = {
  serial: string;
  title: string;
  introduction: string;
  emptyEyebrow: string;
  emptyTitle: string;
  emptyDescription: string;
};

export function PlaceholderPage({
  serial,
  title,
  introduction,
  emptyEyebrow,
  emptyTitle,
  emptyDescription,
}: PlaceholderPageProps) {
  return (
    <main className="page">
      <header className="page-heading">
        <p className="page-heading__eyebrow">{serial}</p>
        <h1>{title}</h1>
        <p>{introduction}</p>
      </header>
      <EmptyState eyebrow={emptyEyebrow} title={emptyTitle} description={emptyDescription} />
    </main>
  );
}
