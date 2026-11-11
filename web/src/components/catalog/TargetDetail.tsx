import { ExternalLinkIcon } from "lucide-react";
import {
  Alert,
  Button,
  Readout,
  ReadoutGrid,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui";
import { riseSetTransitUtc } from "@/lib/astronomy";
import { azimuthCompass, type CatalogObject } from "@/lib/catalogTypes";
import {
  advancedTypeLabel,
  capitalise,
  altAzOf,
  formatClock,
  formatDecDeg,
  formatRaDeg,
  typeLabel,
  type Location,
  type TargetItem,
} from "./items";

export interface DetailState {
  item: TargetItem;
  /** Time the altitude and rise/set figures are computed for. */
  evalAt: Date;
}

interface Props {
  detail: DetailState | null;
  location: Location | null;
  active: boolean;
  pending: boolean;
  /** Failure from the last attempt to set the target, shown inside the sheet. */
  error: string | null;
  onClose: () => void;
  onGo: (item: TargetItem) => void;
}

const EQUIPMENT_LABELS: Record<string, string> = {
  "naked-eye": "Naked eye",
  binoculars: "Binoculars",
  "small-telescope": "Small scope",
  "medium-telescope": "Medium scope",
  "large-telescope": "Large scope",
};

/** Bottom sheet (side panel at md+) with the object's facts and a sticky "Go to". */
export function TargetDetail({
  detail, location, active, pending, error, onClose, onGo,
}: Props) {
  return (
    <Sheet open={detail !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent>
        {detail && (
          <DetailBody
            detail={detail}
            location={location}
            active={active}
            pending={pending}
            error={error}
            onGo={onGo}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({
  detail, location, active, pending, error, onGo,
}: Omit<Props, "detail" | "onClose"> & { detail: DetailState }) {
  const { item, evalAt } = detail;
  const aa = altAzOf(item, location, evalAt);
  const below = aa !== null && aa.altDeg < 0;
  const rst = location
    ? riseSetTransitUtc({
        raHours: item.ra_deg / 15,
        decDeg: item.dec_deg,
        latDeg: location.latitude,
        lonDeg: location.longitude,
        dateUtc: evalAt,
      })
    : null;

  const d = item.detail;
  const kind = d.kind === "buddy" ? typeLabel(d.object) : advancedTypeLabel(d.entry);
  const mag = d.kind === "buddy" ? d.object.magnitude : d.entry.mag;
  const constellation = d.kind === "buddy" ? d.object.constellation : d.entry.constellation;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{item.title}</SheetTitle>
        <SheetDescription>{item.subtitle}</SheetDescription>
      </SheetHeader>
      <SheetBody>
        {below && (
          <Alert variant="warning">This object is below the horizon right now.</Alert>
        )}
        {error && (
          <Alert variant="error" title="Couldn't set the target">
            {error}
          </Alert>
        )}
        <ReadoutGrid cols={2}>
          <Readout label="RA" value={formatRaDeg(item.ra_deg)} />
          <Readout label="Dec" value={formatDecDeg(item.dec_deg)} />
          <Readout label="Type" value={kind} />
          <Readout label="Magnitude" value={mag !== null ? mag.toFixed(1) : "—"} />
          {constellation && <Readout label="Constellation" value={constellation} />}
          <Readout
            label="Altitude"
            value={aa ? `${Math.round(aa.altDeg)}°` : "—"}
          />
          <Readout
            label="Direction"
            value={aa ? azimuthCompass(aa.azDeg) : "—"}
          />
          <Readout label="Rises" value={formatClock(rst?.rise ?? null)} />
          <Readout label="Transit" value={formatClock(rst?.transit ?? null)} />
          <Readout label="Sets" value={formatClock(rst?.set ?? null)} />
          {d.kind === "buddy" && (
            <>
              <Readout label="Equipment" value={EQUIPMENT_LABELS[d.object.minEquipment] ?? d.object.minEquipment} />
              <Readout label="Light pollution" value={capitalise(d.object.lpTolerance)} />
              <Readout label="Reward" value={capitalise(d.object.visualReward)} />
            </>
          )}
        </ReadoutGrid>
        {d.kind === "buddy" && <Description object={d.object} />}
        {d.kind === "buddy" && (
          <Button variant="secondary" size="sm" className="self-start" asChild>
            <a
              href={`https://stargazingbuddy.com/objects/${d.object.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Full description
              <ExternalLinkIcon />
            </a>
          </Button>
        )}
      </SheetBody>
      <SheetFooter>
        <Button
          size="lg"
          loading={pending}
          disabled={below}
          onClick={() => onGo(item)}
        >
          {active ? "Set as target again" : "Go to"}
        </Button>
      </SheetFooter>
    </>
  );
}

function Description({ object }: { object: CatalogObject }) {
  const paragraphs = object.description
    ? object.description.split(/\n\n+/).filter((p) => p.trim().length > 0)
    : [];
  if (paragraphs.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {paragraphs.map((para, i) => (
        <p key={i} className="text-body text-foreground">{para}</p>
      ))}
    </div>
  );
}
