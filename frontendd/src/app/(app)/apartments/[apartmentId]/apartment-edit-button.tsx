"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { updateApartment } from "@/shared/api/apartments";
import { useNotifications } from "@/shared/hooks/use-notifications";

type ApartmentForm = {
  number: string;
  address: string;
  floor: string;
  area: string;
  declaredResidents: string;
};

export function ApartmentEditButton({
  apartmentId,
  initialValue,
  labels,
}: {
  apartmentId: string;
  initialValue: ApartmentForm;
  labels: {
    edit: string;
    title: string;
    number: string;
    address: string;
    floor: string;
    area: string;
    declaredResidents: string;
    save: string;
    cancel: string;
    saving: string;
    success: string;
    error: string;
  };
}) {
  const router = useRouter();
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ApartmentForm>(initialValue);
  const [saving, setSaving] = useState(false);

  function updateField(field: keyof ApartmentForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    const numberFields = ["floor", "area", "declaredResidents"] as const;
    const parsed = Object.fromEntries(numberFields.flatMap((field) => {
      const value = form[field].trim();
      if (!value) return [];
      const numericValue = Number(value);
      return Number.isFinite(numericValue) && numericValue >= 0 ? [[field, numericValue]] : [];
    }));

    setSaving(true);
    try {
      await updateApartment(apartmentId, {
        number: form.number.trim(),
        address: form.address.trim(),
        ...parsed,
      });
      notifications.success(labels.success);
      setOpen(false);
      router.refresh();
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : labels.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {labels.edit}
      </Button>
      <ModalShell open={open} onClose={() => !saving && setOpen(false)} title={labels.title}>
        <div className="space-y-4">
          {([
            ["number", labels.number, "text"],
            ["address", labels.address, "text"],
            ["floor", labels.floor, "number"],
            ["area", labels.area, "number"],
            ["declaredResidents", labels.declaredResidents, "number"],
          ] as const).map(([field, label, type]) => (
            <label key={field} className="block text-sm font-medium text-slate-700">
              {label}
              <input
                type={type}
                min={type === "number" ? 0 : undefined}
                value={form[field]}
                onChange={(event) => updateField(field, event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          ))}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={saving}>{labels.cancel}</Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? labels.saving : labels.save}</Button>
          </div>
        </div>
      </ModalShell>
    </>
  );
}
