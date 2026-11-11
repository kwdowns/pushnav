import { useState, type FormEvent } from "react";
import { ArrowRightIcon } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { parseDecInput, parseRaInput } from "./manualCoords";

interface Props {
  /** Sets the target; resolves true on success. */
  onGo: (key: string, raDeg: number, decDeg: number) => Promise<boolean>;
  pending: boolean;
}

/** Type J2000 RA / Dec and go there. */
export function ManualPanel({ onGo, pending }: Props) {
  const [ra, setRa] = useState("");
  const [dec, setDec] = useState("");
  const [errors, setErrors] = useState<{ ra?: string; dec?: string }>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const raDeg = parseRaInput(ra);
    const decDeg = parseDecInput(dec);
    const next: { ra?: string; dec?: string } = {};
    if (raDeg === null) next.ra = "Enter RA from 0h to 24h, such as 05h 35m 17s or 5.588.";
    if (decDeg === null) next.dec = "Enter Dec from -90° to +90°, such as -05° 23' 28\" or -5.39.";
    setErrors(next);
    if (raDeg === null || decDeg === null) return;
    void onGo("manual", raDeg, decDeg);
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <Field
        label="Right ascension (J2000)"
        hint="Hours, minutes, seconds, or decimal hours."
        error={errors.ra}
      >
        <Input
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="05h 35m 17s"
          value={ra}
          onChange={(e) => setRa(e.target.value)}
        />
      </Field>
      <Field
        label="Declination (J2000)"
        hint="Degrees, minutes, seconds, or decimal degrees. Use - for south."
        error={errors.dec}
      >
        <Input
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="-05° 23' 28&quot;"
          value={dec}
          onChange={(e) => setDec(e.target.value)}
        />
      </Field>
      <Button type="submit" loading={pending}>
        <ArrowRightIcon />
        Go to
      </Button>
    </form>
  );
}
