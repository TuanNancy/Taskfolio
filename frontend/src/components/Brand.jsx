import { ListChecks } from "lucide-react";

export default function Brand() {
  return <span className="inline-flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-foreground">
    <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
      <ListChecks className="size-5" aria-hidden="true" />
    </span>
    Taskfolio<span className="-ml-2 text-primary">.</span>
  </span>;
}
