import { Globe } from "lucide-react";

/** One exhibitor as attendees see them in the directory (Event Hub, the
 *  exhibitor's own profile preview). */
export function ExhibitorTile(props: {
  company: string;
  logoUrl: string | null;
  category: string | null;
  description: string | null;
  website: string | null;
  standLabel: string | null;
  active?: boolean;
  onSelect?: () => void;
}) {
  const site = props.website ? (/^https?:\/\//i.test(props.website) ? props.website : `https://${props.website}`) : null;
  const body = (
    <>
      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-white">
        {props.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.logoUrl} alt="" className="h-full w-full object-contain p-1" />
        ) : (
          <span className="text-lg font-bold text-[#1a0b1f]">{props.company.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="font-semibold text-white">{props.company}</p>
        <p className="text-xs text-muted">
          {props.standLabel ? `Stand ${props.standLabel}` : "Stand to be announced"}
          {props.category ? ` · ${props.category}` : ""}
        </p>
        {props.description && <p className="mt-1.5 text-sm text-fg-3">{props.description}</p>}
      </div>
    </>
  );
  return (
    <div className="eb-exh-tile" data-active={props.active || undefined}>
      {props.onSelect ? (
        <button type="button" onClick={props.onSelect} className="flex w-full items-start gap-3" aria-pressed={!!props.active}>
          {body}
        </button>
      ) : (
        <div className="flex items-start gap-3">{body}</div>
      )}
      {site && (
        <a href={site} target="_blank" rel="noreferrer noopener" className="ml-[68px] mt-1.5 inline-flex items-center gap-1 text-xs text-[#ff8af5] hover:underline">
          <Globe size={12} aria-hidden="true" /> {props.website?.replace(/^https?:\/\//i, "")}
        </a>
      )}
    </div>
  );
}
