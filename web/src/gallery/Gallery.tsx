import { useState, type ReactNode } from "react"
import {
  CrosshairIcon,
  FilterIcon,
  ListIcon,
  Maximize2Icon,
  RotateCcwIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  StarIcon,
  TelescopeIcon,
  Trash2Icon,
  Volume2Icon,
  WifiIcon,
} from "lucide-react"

import {
  ActionBar,
  Alert,
  AppBar,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Chip,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Disclosure,
  EmptyState,
  Field,
  Input,
  Label,
  List,
  ListRow,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  Readout,
  ReadoutGrid,
  SegmentedControl,
  Separator,
  SettingRow,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Slider,
  SliderField,
  Spinner,
  StatusDot,
  Steps,
  Switch,
} from "@/components/ui"
import { StarField } from "./StarField"
import {
  RAMP,
  SEMANTIC_BORDERS,
  SEMANTIC_FILLS,
  SEMANTIC_TEXT,
  TYPE_ROLES,
} from "./tokens"

const SECTIONS = [
  ["colour", "Colour"],
  ["type", "Type"],
  ["sizes", "Sizes"],
  ["buttons", "Button"],
  ["choice", "Segmented control · Chip"],
  ["inputs", "Input · Field"],
  ["sliders", "Slider · SliderField"],
  ["binary", "Switch · Checkbox · SettingRow"],
  ["cards", "Card · Disclosure"],
  ["lists", "List · ListRow"],
  ["readouts", "Readout"],
  ["status", "Badge · StatusDot · Alert"],
  ["steps", "Steps"],
  ["feedback", "Progress · Spinner · EmptyState · Separator"],
  ["overlays", "Sheet · Dialog · Popover"],
  ["frame", "night-frame"],
] as const

const WIZARD_STEPS = [
  { label: "Camera setup" },
  { label: "Sync scope" },
  { label: "Record roll" },
  { label: "Tracking" },
]

const OBJECTS = [
  { id: "m42", name: "Orion Nebula", sub: "M 42 · Nebula · mag 4.0", meta: "54° SE" },
  { id: "m31", name: "Andromeda Galaxy", sub: "M 31 · Galaxy · mag 3.4", meta: "71° NE" },
  { id: "m45", name: "Pleiades", sub: "M 45 · Open cluster · mag 1.6", meta: "62° E" },
  { id: "ngc7000", name: "North America Nebula", sub: "NGC 7000 · Emission nebula · mag 4.0", meta: "38° NW" },
]

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-3">
      <h2 className="text-title text-foreground">{title}</h2>
      {children}
    </section>
  )
}

function Demo({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption text-muted-foreground uppercase">{label}</p>
      <div className={className ?? "flex flex-wrap items-center gap-3"}>
        {children}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- tokens */

function ColourSection() {
  return (
    <Section id="colour" title="Colour">
      <p className="text-body">
        Every colour is on the red channel only. Primitive ramp (never used
        directly in components):
      </p>
      <List>
        {RAMP.map((r) => (
          <li key={r.token} className="flex items-center gap-3 px-3 py-2">
            <span
              className="size-10 shrink-0 rounded-lg border border-input"
              style={{ background: `var(${r.token})` }}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="readout text-label">{r.token}</span>
              <span className="truncate text-label text-muted-foreground">{r.role}</span>
            </span>
            <span className="readout shrink-0 text-label">{r.hex}</span>
          </li>
        ))}
      </List>
      <Demo label="Semantic fills" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SEMANTIC_FILLS.map((s) => (
          <div key={s.name} className="flex items-center gap-3">
            <span className={`size-10 shrink-0 rounded-lg border border-input ${s.cls}`} />
            <span className="flex min-w-0 flex-col">
              <span className="readout text-label">
                {s.cls} <span className="text-muted-foreground">({s.src})</span>
              </span>
              <span className="truncate text-label text-muted-foreground">{s.use}</span>
            </span>
          </div>
        ))}
      </Demo>
      <Demo label="Text" className="flex flex-col gap-1">
        {SEMANTIC_TEXT.map((s) => (
          <p key={s.name} className={`text-body ${s.cls}`}>
            <span className="readout">{s.cls}</span> — {s.use}
          </p>
        ))}
      </Demo>
      <Demo label="Borders" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {SEMANTIC_BORDERS.map((s) => (
          <div
            key={s.name}
            className={`flex flex-col rounded-lg border-[1.5px] bg-card p-3 ${s.cls}`}
          >
            <span className="readout text-label">{s.cls}</span>
            <span className="text-label text-muted-foreground">{s.use}</span>
          </div>
        ))}
      </Demo>
      <Demo label="Overlay strokes (camera frame, dome)">
        <svg viewBox="0 0 240 48" className="h-12 w-60" aria-hidden>
          <line x1="8" y1="12" x2="232" y2="12" strokeWidth="2" className="stroke-overlay-strong" />
          <line x1="8" y1="24" x2="232" y2="24" strokeWidth="2" className="stroke-overlay" />
          <line x1="8" y1="36" x2="232" y2="36" strokeWidth="2" className="stroke-overlay-dim" />
        </svg>
        <span className="text-label text-muted-foreground">strong · default · dim</span>
      </Demo>
    </Section>
  )
}

function TypeSection() {
  return (
    <Section id="type" title="Type">
      <Card>
        {TYPE_ROLES.map((t) => (
          <div key={t.name} className="flex flex-col gap-0.5">
            <span className="readout text-label text-muted-foreground">
              {t.name} · {t.spec}
            </span>
            <span className={t.cls}>{t.sample}</span>
          </div>
        ))}
        <div className="flex flex-col gap-0.5">
          <span className="readout text-label text-muted-foreground">readout</span>
          <span className="readout text-body">05h 35m 17.3s  −05° 23′ 28″</span>
        </div>
      </Card>
    </Section>
  )
}

function SizesSection() {
  return (
    <Section id="sizes" title="Sizes">
      <Demo label="Touch targets (to scale)" className="flex flex-wrap items-end gap-4">
        {[
          ["size-touch-sm", "touch-sm 44"],
          ["size-touch", "touch 48"],
          ["size-touch-lg", "touch-lg 56"],
        ].map(([cls, label]) => (
          <div key={cls} className="flex flex-col items-center gap-1">
            <span className={`${cls} rounded-lg border-[1.5px] border-dashed border-primary bg-accent`} />
            <span className="readout text-label">{label}</span>
          </div>
        ))}
      </Demo>
      <Demo label="Radius" className="flex flex-wrap items-end gap-4">
        {[
          ["rounded-lg", "lg 12 · controls"],
          ["rounded-xl", "xl 16 · cards, sheets"],
          ["rounded-full", "full · pills, thumbs"],
        ].map(([cls, label]) => (
          <div key={cls} className="flex flex-col items-center gap-1">
            <span className={`h-touch w-24 border-[1.5px] border-input bg-secondary ${cls}`} />
            <span className="text-label">{label}</span>
          </div>
        ))}
      </Demo>
    </Section>
  )
}

/* ------------------------------------------------------------ components */

function ButtonSection() {
  const [loading, setLoading] = useState(false)
  return (
    <Section id="buttons" title="Button">
      <Demo label="Variants">
        <Button>Sync</Button>
        <Button variant="secondary">Skip</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="danger">
          <Trash2Icon /> Clear sync
        </Button>
      </Demo>
      <Demo label="Sizes">
        <Button size="sm" variant="secondary">sm 44</Button>
        <Button variant="secondary">md 48</Button>
        <Button size="lg">lg 56</Button>
        <Button size="icon" variant="secondary" aria-label="Settings">
          <SettingsIcon />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Sound">
          <Volume2Icon />
        </Button>
      </Demo>
      <Demo label="States">
        <Button disabled>Disabled</Button>
        <Button variant="secondary" disabled>Disabled</Button>
        <Button
          loading={loading}
          onClick={() => {
            setLoading(true)
            window.setTimeout(() => setLoading(false), 2000)
          }}
        >
          {loading ? "Solving…" : "Tap to load"}
        </Button>
        <Button variant="secondary" loading>
          Loading
        </Button>
      </Demo>
      <Demo label="Full width primary (the one action of a step)" className="flex flex-col">
        <Button size="lg" className="w-full">
          <CrosshairIcon /> Sync on this star
        </Button>
      </Demo>
    </Section>
  )
}

function ChoiceSection() {
  const [view, setView] = useState<"tonight" | "search" | "manual">("tonight")
  const [mode, setMode] = useState<"j2000" | "jnow">("j2000")
  const [filters, setFilters] = useState<Record<string, boolean>>({
    Galaxies: true,
    Nebulae: false,
    Clusters: true,
    Planets: false,
  })
  return (
    <Section id="choice" title="Segmented control · Chip">
      <Demo label="Full width, with icons" className="flex flex-col">
        <SegmentedControl
          aria-label="Targets view"
          fullWidth
          value={view}
          onValueChange={setView}
          options={[
            { value: "tonight", label: "Tonight", icon: <SparklesIcon /> },
            { value: "search", label: "Search", icon: <SearchIcon /> },
            { value: "manual", label: "Manual", icon: <ListIcon /> },
          ]}
        />
        <p className="text-label text-muted-foreground">
          Selected: <span className="readout text-foreground">{view}</span>
        </p>
      </Demo>
      <Demo label="Inline, lg · disabled">
        <SegmentedControl
          aria-label="Epoch"
          size="lg"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: "j2000", label: "J2000" },
            { value: "jnow", label: "JNow" },
          ]}
        />
        <SegmentedControl
          aria-label="Disabled example"
          disabled
          value="a"
          onValueChange={() => {}}
          options={[
            { value: "a", label: "On" },
            { value: "b", label: "Off" },
          ]}
        />
      </Demo>
      <Demo label="Filter chips">
        {Object.entries(filters).map(([k, v]) => (
          <Chip
            key={k}
            pressed={v}
            onPressedChange={(p) => setFilters((f) => ({ ...f, [k]: p }))}
          >
            {k}
          </Chip>
        ))}
        <Chip disabled>Comets</Chip>
      </Demo>
    </Section>
  )
}

function InputSection() {
  const [lat, setLat] = useState("51.4769")
  const latBad = lat.trim() === "" || Number.isNaN(Number(lat)) || Math.abs(Number(lat)) > 90
  return (
    <Section id="inputs" title="Input · Field">
      <Card>
        <Field label="Latitude" hint="Decimal degrees, north positive." error={latBad ? "Enter a number between −90 and 90." : undefined}>
          <Input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
        </Field>
        <Field label="Search" hint="Name, Messier or NGC number">
          <Input placeholder="e.g. M 42" />
        </Field>
        <Field label="Longitude" error="Enter a number between −180 and 180.">
          <Input defaultValue="abc" />
        </Field>
        <Field label="Elevation (disabled)">
          <Input disabled defaultValue="45 m" />
        </Field>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bare-input">Bare Label + Input</Label>
          <Input id="bare-input" placeholder="Placeholder text" />
        </div>
      </Card>
    </Section>
  )
}

function SliderSection() {
  const [exp, setExp] = useState(120)
  const [gain, setGain] = useState(12)
  const [plain, setPlain] = useState([40])
  const [committed, setCommitted] = useState<string>("—")
  return (
    <Section id="sliders" title="Slider · SliderField">
      <Card>
        <SliderField
          label="Exposure"
          value={exp}
          min={10}
          max={1000}
          step={10}
          formatValue={(v) => `${v} ms`}
          onValueChange={setExp}
          onValueCommit={(v) => setCommitted(`Exposure ${v} ms`)}
        />
        <SliderField
          label="Gain"
          value={gain}
          min={0}
          max={24}
          step={1}
          formatValue={(v) => `${v} dB`}
          onValueChange={setGain}
          onValueCommit={(v) => setCommitted(`Gain ${v} dB`)}
        />
        <SliderField
          label="Brightness (disabled)"
          value={50}
          min={0}
          max={100}
          disabled
        />
        <p className="text-label text-muted-foreground">
          Last commit: <span className="readout text-foreground">{committed}</span>
        </p>
      </Card>
      <Demo label="Plain slider" className="flex flex-col">
        <Slider aria-label="Plain" value={plain} onValueChange={setPlain} />
      </Demo>
    </Section>
  )
}

function BinarySection() {
  const [sound, setSound] = useState(true)
  const [power, setPower] = useState(false)
  const [lock, setLock] = useState(true)
  const [labels, setLabels] = useState(false)
  return (
    <Section id="binary" title="Switch · Checkbox · SettingRow">
      <Card className="gap-0 py-1 md:py-1">
        <SettingRow label="Sounds" description="Beep on lock and on lost lock.">
          <Switch checked={sound} onCheckedChange={setSound} />
        </SettingRow>
        <Separator />
        <SettingRow
          label="Power saving"
          description="Caps the Pi's CPU clock at 1200 MHz."
        >
          <Switch checked={power} onCheckedChange={setPower} />
        </SettingRow>
        <Separator />
        <SettingRow label="Disabled setting" description="Needs a camera.">
          <Switch disabled />
        </SettingRow>
        <Separator />
        <SettingRow label="Show star labels">
          <Checkbox
            checked={labels}
            onCheckedChange={(c) => setLabels(c === true)}
          />
        </SettingRow>
        <Separator />
        <SettingRow label="Hide objects below horizon">
          <Checkbox checked={lock} onCheckedChange={(c) => setLock(c === true)} />
        </SettingRow>
        <Separator />
        <SettingRow label="Disabled checkbox">
          <Checkbox disabled checked />
        </SettingRow>
      </Card>
    </Section>
  )
}

function CardSection() {
  return (
    <Section id="cards" title="Card · Disclosure">
      <Card>
        <CardHeader>
          <CardTitle>Sync scope</CardTitle>
          <CardDescription>
            Centre a bright star in the eyepiece, then tap it on the frame.
          </CardDescription>
          <CardAction>
            <Badge variant="muted">2 / 3</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <p className="text-body">
            PushNav uses three stars to work out how the camera sits on the tube.
          </p>
        </CardContent>
        <CardFooter>
          <Button className="flex-1">
            <CrosshairIcon /> Sync
          </Button>
          <Button variant="ghost">Skip</Button>
        </CardFooter>
      </Card>
      <Disclosure title="Camera" summary="120 ms · 12 dB" icon={<TelescopeIcon />}>
        <SliderField label="Exposure" value={120} min={10} max={1000} step={10} formatValue={(v) => `${v} ms`} />
      </Disclosure>
      <Disclosure title="Sky dome" summary="Pointing 54° SE, a very long summary that truncates" defaultOpen>
        <p className="text-body">Open by default. The chevron points up when open.</p>
      </Disclosure>
    </Section>
  )
}

function ListSection() {
  const [selected, setSelected] = useState("m42")
  const [target, setTarget] = useState<string | null>(null)
  return (
    <Section id="lists" title="List · ListRow">
      <List>
        {OBJECTS.map((o) => (
          <ListRow
            key={o.id}
            title={o.name}
            subtitle={o.sub}
            meta={o.meta}
            selected={selected === o.id}
            onPress={() => setSelected(o.id)}
            action={
              <Button
                size="sm"
                variant={target === o.id ? "primary" : "secondary"}
                onClick={() => setTarget(o.id)}
              >
                {target === o.id ? "Target" : "Go to"}
              </Button>
            }
          />
        ))}
      </List>
      <p className="text-label text-muted-foreground">
        Tap a row to select it; “Go to” sets the target (
        <span className="readout text-foreground">{target ?? "none"}</span>).
      </p>
      <Demo label="Static rows with leading icon" className="flex flex-col">
        <List className="w-full">
          <ListRow leading={<WifiIcon />} title="SkySafari" subtitle="192.168.1.24 · LX200" meta="1 min" />
          <ListRow leading={<StarIcon />} title="Stellarium" subtitle="Not connected" />
        </List>
      </Demo>
    </Section>
  )
}

function ReadoutSection() {
  return (
    <Section id="readouts" title="Readout">
      <Card>
        <Readout label="Distance to target" value="12.4°" size="lg" />
        <ReadoutGrid>
          <Readout label="RA" value="05h 35m 17s" />
          <Readout label="Dec" value="−05° 23′ 28″" />
          <Readout label="Alt" value="54.2°" />
          <Readout label="Az" value="141.7° SE" />
        </ReadoutGrid>
        <ReadoutGrid cols={3}>
          <Readout label="Stars" value="23" />
          <Readout label="Solve" value="84 ms" />
          <Readout label="Roll" value="−2.1°" />
        </ReadoutGrid>
      </Card>
    </Section>
  )
}

function StatusSection() {
  return (
    <Section id="status" title="Badge · StatusDot · Alert">
      <Demo label="Badges">
        <Badge variant="solid">
          <CrosshairIcon /> Lock
        </Badge>
        <Badge variant="outline">Searching</Badge>
        <Badge variant="muted">No camera</Badge>
      </Demo>
      <Demo label="Status dots">
        <StatusDot active label="Stellarium" />
        <StatusDot active={false} label="SkySafari" />
        <StatusDot active />
        <StatusDot active={false} />
      </Demo>
      <Demo label="Alerts" className="flex flex-col gap-2">
        <Alert variant="info" title="Tip">
          Turn the focus ring until stars are sharp points.
        </Alert>
        <Alert variant="warning" title="Twilight">
          The sky is still bright; solving may be slow.
        </Alert>
        <Alert
          variant="error"
          title="Camera disconnected"
          action={
            <Button size="sm" variant="secondary">
              <RotateCcwIcon /> Retry
            </Button>
          }
        >
          Check the USB cable.
        </Alert>
      </Demo>
    </Section>
  )
}

function StepsSection() {
  const [cur, setCur] = useState(1)
  return (
    <Section id="steps" title="Steps">
      <Card>
        <Steps steps={WIZARD_STEPS} current={cur} />
        <div className="flex gap-2">
          <Button variant="secondary" disabled={cur === 0} onClick={() => setCur((c) => c - 1)}>
            Back
          </Button>
          <Button
            className="flex-1"
            disabled={cur === WIZARD_STEPS.length - 1}
            onClick={() => setCur((c) => c + 1)}
          >
            Next
          </Button>
        </div>
      </Card>
    </Section>
  )
}

function FeedbackSection() {
  return (
    <Section id="feedback" title="Progress · Spinner · EmptyState · Separator">
      <Card>
        <Demo label="Progress 35 %" className="flex flex-col">
          <Progress value={35} aria-label="Recording roll" />
        </Demo>
        <Demo label="Spinner">
          <Spinner /> <span className="text-label">Solving…</span>
        </Demo>
        <Separator />
        <EmptyState
          icon={<SearchIcon />}
          title="No matches"
          description="Try a Messier number like M 42, or an NGC number."
          action={<Button variant="secondary">Clear search</Button>}
        />
      </Card>
    </Section>
  )
}

function OverlaySection() {
  const [isTarget, setIsTarget] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  return (
    <Section id="overlays" title="Sheet · Dialog · Popover">
      <Demo label="Open each">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="secondary">Object detail sheet</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Orion Nebula</SheetTitle>
              <SheetDescription>M 42 · Nebula · mag 4.0</SheetDescription>
            </SheetHeader>
            <SheetBody>
              <ReadoutGrid>
                <Readout label="RA" value="05h 35m 17s" />
                <Readout label="Dec" value="−05° 23′ 28″" />
                <Readout label="Alt" value="54.2°" />
                <Readout label="Az" value="141.7° SE" />
                <Readout label="Rises" value="18:42" />
                <Readout label="Sets" value="06:11" />
              </ReadoutGrid>
              {Array.from({ length: 6 }, (_, i) => (
                <p key={i} className="text-body">
                  A huge stellar nursery 1,344 light-years away, visible to the
                  naked eye as the middle “star” of Orion’s sword. Even a small
                  scope shows the Trapezium at its heart.
                </p>
              ))}
            </SheetBody>
            <SheetFooter>
              <Button
                size="lg"
                onClick={() => {
                  setIsTarget(true)
                  setSheetOpen(false)
                }}
              >
                <CrosshairIcon /> Set as target
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="danger">
              <Trash2Icon /> Clear sync
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Clear sync?</DialogTitle>
              <DialogDescription>
                You will need to sync on three stars again before push-to works.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Keep</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="danger">
                  <Trash2Icon /> Clear
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="secondary">
              <FilterIcon /> Filters
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <p className="text-heading">Minimum altitude</p>
            <SliderField label="Altitude" value={20} min={0} max={60} formatValue={(v) => `${v}°`} />
          </PopoverContent>
        </Popover>
      </Demo>
      <p className="text-label text-muted-foreground">
        Target set from sheet:{" "}
        <span className="readout text-foreground">{isTarget ? "Orion Nebula" : "none"}</span>
      </p>
    </Section>
  )
}

function FrameSection() {
  return (
    <Section id="frame" title="night-frame">
      <p className="text-body">
        The camera sends greyscale (white) frames. Wrapping them in{" "}
        <span className="readout">night-frame</span> keeps only the red
        channel.
      </p>
      <div className="night-frame overflow-hidden rounded-xl border border-border">
        <StarField />
      </div>
    </Section>
  )
}

export default function Gallery() {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppBar>
        <TelescopeIcon className="size-6 shrink-0" aria-hidden />
        <h1 className="flex-1 truncate text-heading">PushNav design system</h1>
        <Badge variant="solid">
          <CrosshairIcon /> Lock
        </Badge>
        <Button size="icon-sm" variant="ghost" aria-label="Full screen">
          <Maximize2Icon />
        </Button>
      </AppBar>

      <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-8 px-gutter py-4">
        <nav aria-label="Sections" className="flex flex-wrap gap-2">
          {SECTIONS.map(([id, label]) => (
            <Button key={id} asChild size="sm" variant="ghost" className="border-input">
              <a href={`#${id}`}>{label}</a>
            </Button>
          ))}
        </nav>
        <ColourSection />
        <TypeSection />
        <SizesSection />
        <ButtonSection />
        <ChoiceSection />
        <InputSection />
        <SliderSection />
        <BinarySection />
        <CardSection />
        <ListSection />
        <ReadoutSection />
        <StatusSection />
        <StepsSection />
        <FeedbackSection />
        <OverlaySection />
        <FrameSection />
      </main>

      <ActionBar>
        <Button variant="secondary" asChild>
          <a href="#colour">Top</a>
        </Button>
        <Button className="flex-1" asChild>
          <a href={location.pathname}>Open the app</a>
        </Button>
      </ActionBar>
    </div>
  )
}
