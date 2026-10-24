export function PageHeader({
  kicker,
  title,
  description,
  action,
}: {
  kicker?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker ? (
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
            {kicker}
          </p>
        ) : null}
        <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}
