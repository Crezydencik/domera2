"use client";

import { useState } from "react";
import { FaInfoCircle, FaRegUser } from "react-icons/fa";

type SettingsTab = "user" | "notifications" | "contacts" | "billing" | "additionalUsers" | "dataManagement";

type UserSettings = {
  userName: string;
  clientNumber: string;
  email: string;
  username: string;
  personalCode: string;
};

type SettingsTabsProps = {
  user: UserSettings;
};

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "user", label: "Lietotājs" },
  { id: "notifications", label: "Paziņojumi" },
  { id: "contacts", label: "Kontaktpersonas" },
  { id: "billing", label: "Norēķinu konti" },
  { id: "additionalUsers", label: "Papildlietotāji" },
  { id: "dataManagement", label: "Datu pārvaldība" },
];

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

function NotificationToggle({ label }: { label: string }) {
  return (
    <label className="block w-fit cursor-pointer">
      <span className="block text-base leading-6 text-black">{label}</span>
      <span className="mt-1.5 block">
        <input type="checkbox" defaultChecked className="peer sr-only" aria-label={label} />
        <span className="flex h-6 w-[50px] items-center rounded-full bg-slate-300 p-0.5 transition peer-checked:bg-blue-500">
          <span className="h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-6" />
        </span>
      </span>
    </label>
  );
}

function NotificationsPanel() {
  return (
    <div className="py-7">
      <h2 className="text-xl font-bold leading-7 text-black">Paziņojumu iestatījumi</h2>

      <div className="mt-7 space-y-5">
        <NotificationToggle label="Vispārīgie paziņojumi" />
        <NotificationToggle label="Atgādinājums par rādījumu iesniegšanu" />
        <NotificationToggle label="Maksājuma atgādinājums" />

        <label className="block">
          <span className="block text-base leading-6 text-black">Paziņojumu valoda</span>
          <select className="mt-1 h-[34px] w-44 rounded border border-black bg-white px-2 text-base leading-6 text-black">
            <option>Krievu</option>
            <option>Latviešu</option>
            <option>Angļu</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function EmptyTabPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-t border-slate-200 py-8">
      <h2 className="text-lg font-bold text-black">{title}</h2>
      <p className="mt-2 max-w-2xl text-base leading-6 text-slate-600">{description}</p>
      <button type="button" className="mt-5 rounded-lg border border-black px-4 py-2 text-sm font-semibold text-black">
        Pievienot
      </button>
    </div>
  );
}

export function SettingsTabs({ user }: SettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("user");

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-sm sm:px-8">
      <div className="overflow-x-auto border-b border-slate-300">
        <nav className="flex min-w-max gap-7" aria-label="Settings sections">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`pb-5 text-base font-semibold text-black ${
                  isActive ? "border-b-[3px] border-black" : "border-b-[3px] border-transparent"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === "user" ? (
        <>
          <div className="flex items-center gap-4 border-b border-slate-200 py-8">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black text-white">
              <FaRegUser className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold leading-7 text-black">{user.userName}</p>
              <p className="mt-1 text-base text-black">
                Klienta numurs: <span className="text-slate-600">{user.clientNumber}</span>
              </p>
            </div>
          </div>

          <div className="pt-5">
            <h2 className="mb-3 text-lg font-bold text-black">Personas dati</h2>
            <SettingsRow label="E-pasts" value={user.email} withInfo />
            <SettingsRow label="Lietotājvārds" value={user.username} />
            <SettingsRow label="Parole" value="******" />
            <SettingsRow label="Personas kods" value={user.personalCode} withInfo />
          </div>

          <div className="rounded-lg bg-slate-50 px-6 py-5 text-sm leading-6 text-slate-700">
            <p>
              Ņem vērā: augstāk norādītais e-pasts, lietotājvārds un parole ir ielogošanās dati vietnēs - Mans Tet,
              Tet.lv, Tet e-veikals, Tet+ un Palīdzība. Veicot, piemēram, paroles maiņu, turpmāk visās šajās vietnēs,
              lai ielogotos, būs jāizmanto jaunā parole.
            </p>
          </div>
        </>
      ) : null}

      {activeTab === "notifications" ? <NotificationsPanel /> : null}

      {activeTab === "contacts" ? (
        <EmptyTabPanel
          title="Kontaktpersonas"
          description="Šeit varēs pārvaldīt kontaktpersonas un to saziņas datus."
        />
      ) : null}

      {activeTab === "billing" ? (
        <EmptyTabPanel
          title="Norēķinu konti"
          description="Šeit varēs pievienot un labot norēķinu kontus."
        />
      ) : null}

      {activeTab === "additionalUsers" ? (
        <EmptyTabPanel
          title="Papildlietotāji"
          description="Šeit varēs pārvaldīt papildu lietotājus un piekļuves tiesības."
        />
      ) : null}

      {activeTab === "dataManagement" ? (
        <EmptyTabPanel
          title="Datu pārvaldība"
          description="Šeit būs pieejami datu pārvaldības un privātuma iestatījumi."
        />
      ) : null}
    </section>
  );
}
