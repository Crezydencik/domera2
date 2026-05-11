import { cookies } from "next/headers";
import { FaInfoCircle, FaRegUser } from "react-icons/fa";
import { getRoleDataBundle } from "@/shared/lib/domera-api.server";

type SettingsPageProps = {
  searchParams?: Promise<{ role?: string }>;
};

type UnknownRecord = Record<string, unknown>;

const tabs = ["Lietotājs", "Kontaktpersonas", "Norēķinu konti", "Papildlietotāji", "Datu pārvaldība"];

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function joinNameParts(profile: UnknownRecord | undefined): string {
  return firstString(
    profile?.fullName,
    [profile?.firstName, profile?.lastName].filter((value) => typeof value === "string" && value.trim()).join(" "),
    profile?.name,
    profile?.displayName,
  );
}

function maskPersonalCode(value: string): string {
  if (!value) return "190299-*****";
  const normalized = value.replace(/\s/g, "");
  if (normalized.length <= 6) return `${normalized}*****`;

  return `${normalized.slice(0, 6)}-*****`;
}

function SettingsRow({
  label,
  value,
  withInfo = false,
}: {
  label: string;
  value: string;
  withInfo?: boolean;
}) {
  return (
    <div className="grid gap-3 border-t border-slate-200 py-6 sm:grid-cols-[1fr_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-base font-semibold text-black">{label}</p>
          {withInfo ? <FaInfoCircle className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" /> : null}
        </div>
        <p className="mt-2 break-words text-base leading-6 text-slate-700">{value}</p>
      </div>
      <button type="button" className="justify-self-start border-b border-black text-base font-semibold leading-5 text-black sm:justify-self-end">
        Labot
      </button>
    </div>
  );
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = (await searchParams) ?? {};
  const data = await getRoleDataBundle(params.role);
  const cookieStore = await cookies();
  const profile = data.profile;

  const email = firstString(profile?.email, cookieStore.get("userEmail")?.value, "kargini@inbox.lv");
  const userName = firstString(joinNameParts(profile), email.split("@")[0], "DENISS KARGINS").toUpperCase();
  const clientNumber = firstString(profile?.clientNumber, profile?.customerNumber, data.userId, "13475715");
  const username = firstString(profile?.username, profile?.login, clientNumber);
  const personalCode = maskPersonalCode(firstString(profile?.personalCode, profile?.identityCode));

  return (
    <div className="mx-auto w-full max-w-5xl">

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-sm sm:px-8">
        <div className="overflow-x-auto border-b border-slate-300">
          <nav className="flex min-w-max gap-7" aria-label="Settings sections">
            {tabs.map((tab, index) => (
              <button
                key={tab}
                type="button"
                className={`pb-5 text-base font-semibold text-black ${
                  index === 0 ? "border-b-[3px] border-black" : "border-b-[3px] border-transparent"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4 border-b border-slate-200 py-8">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black text-white">
            <FaRegUser className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold leading-7 text-black">{userName}</p>
            <p className="mt-1 text-base text-black">
              Klienta numurs: <span className="text-slate-600">{clientNumber}</span>
            </p>
          </div>
        </div>

        <div className="pt-5">
          <h2 className="mb-3 text-lg font-bold text-black">Personas dati</h2>
          <SettingsRow label="E-pasts" value={email} withInfo />
          <SettingsRow label="Lietotājvārds" value={username} />
          <SettingsRow label="Parole" value="******" />
          <SettingsRow label="Personas kods" value={personalCode} withInfo />
        </div>

        <div className="rounded-lg bg-slate-50 px-6 py-5 text-sm leading-6 text-slate-700">
          <p>
            Ņem vērā: augstāk norādītais e-pasts, lietotājvārds un parole ir ielogošanās dati vietnēs - Mans Tet,
            Tet.lv, Tet e-veikals, Tet+ un Palīdzība. Veicot, piemēram, paroles maiņu, turpmāk visās šajās vietnēs,
            lai ielogotos, būs jāizmanto jaunā parole.
          </p>
        </div>
      </section>
    </div>
  );
}
