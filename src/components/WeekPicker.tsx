"use client";

import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { startOfWeek, endOfWeek, format } from "date-fns";

export function WeekPicker({
  weekStart,
  onWeekChange,
}: {
  weekStart: string; // yyyy-MM-dd
  onWeekChange: (weekStart: string) => void;
}) {
  const selected = new Date(`${weekStart}T12:00:00.000Z`);

  const selectedRange = {
    from: startOfWeek(selected, { weekStartsOn: 1 }),
    to: endOfWeek(selected, { weekStartsOn: 1 }),
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-zinc-700">Week</div>
        <div className="text-xs text-zinc-500 tabular-nums">
          {format(selectedRange.from, "MMM d")} – {format(selectedRange.to, "MMM d, yyyy")}
        </div>
      </div>
      <DayPicker
        mode="single"
        selected={selected}
        onSelect={(d) => {
          if (!d) return;
          const monday = startOfWeek(d, { weekStartsOn: 1 });
          onWeekChange(format(monday, "yyyy-MM-dd"));
        }}
        weekStartsOn={1}
        showOutsideDays
        modifiers={{ selectedRange }}
        modifiersClassNames={{
          selectedRange:
            "bg-[color:color-mix(in_srgb,var(--brand),transparent_85%)] text-zinc-900",
        }}
        classNames={{
          months: "flex flex-col",
          month: "space-y-2",
          caption: "flex items-center justify-between px-2",
          caption_label: "text-sm font-semibold text-zinc-900",
          nav: "flex items-center gap-2",
          nav_button:
            "h-8 w-8 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50",
          table: "w-full border-collapse",
          head_row: "flex",
          head_cell: "w-9 text-xs font-medium text-zinc-500",
          row: "flex w-full",
          cell: "relative h-9 w-9 p-0",
          day: "h-9 w-9 rounded-lg hover:bg-zinc-50",
          day_selected:
            "bg-[var(--brand)] text-white hover:bg-[var(--brand)]",
          day_today: "border border-[var(--brand)]",
          day_outside: "text-zinc-300",
        }}
      />
    </div>
  );
}

