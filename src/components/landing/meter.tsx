"use client";

import { useEffect, useState } from "react";
import { TriangleAlert, Trophy } from "lucide-react";

/**
 * The landing page's "meter": what the overview shows, as a live readout.
 * Example data only (labelled on screen). It renders complete on the server;
 * after load the spend ticks up like a running meter and a new lead lands
 * now and then. With reduced motion it stays still.
 */

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

const CAMPAIGNS = [
  { name: "2 BHK · Baner · Lead form", spend: 18250, leads: 61, flag: "best" as const },
  { name: "3 BHK · Wakad · Retargeting", spend: 9400, leads: 14, flag: null },
  { name: "NRI · Dubai · Video", spend: 8120, leads: 0, flag: "waste" as const },
];

const INCOMING = ["Rohan M. · 2 BHK Baner", "Sneha K. · 3 BHK Wakad", "Arjun P. · 2 BHK Baner", "Fatima S. · Site visit"];

export function Meter() {
  const [spend, setSpend] = useState(35770);
  const [leads, setLeads] = useState(75);
  const [feed, setFeed] = useState<string[]>([INCOMING[0]]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 1;
    const tick = setInterval(() => setSpend((s) => s + 6 + Math.round(Math.random() * 18)), 1800);
    const lead = setInterval(() => {
      setLeads((n) => n + 1);
      setFeed((f) => [INCOMING[i++ % INCOMING.length], ...f].slice(0, 3));
    }, 7000);
    return () => {
      clearInterval(tick);
      clearInterval(lead);
    };
  }, []);

  const cpl = spend / leads;

  return (
    <figure className="relative rounded-2xl bg-ink p-2 text-ink-fg shadow-[0_24px_60px_-20px_rgba(22,21,15,0.55)]">
      <div className="rounded-xl border border-white/10 p-4 sm:p-5">
        <div className="flex items-center justify-between text-[11px] font-medium tracking-wide text-white/60 uppercase">
          <span>Today · all projects</span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-taxi motion-safe:animate-pulse" aria-hidden /> Meter running
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3">
          {[
            ["Spend", inr.format(spend)],
            ["Leads", String(leads)],
            ["Per lead", inr.format(cpl)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] text-white/60">{k}</dt>
              <dd className="mt-0.5 font-mono text-xl font-semibold text-taxi tabular-nums sm:text-2xl" aria-live={k === "Leads" ? "polite" : undefined}>
                {v}
              </dd>
            </div>
          ))}
        </dl>

        <table className="mt-5 w-full text-left text-xs">
          <caption className="sr-only">Campaigns, example data</caption>
          <thead className="text-white/50">
            <tr>
              <th scope="col" className="pb-2 font-normal">Campaign</th>
              <th scope="col" className="pb-2 text-right font-normal">Spend</th>
              <th scope="col" className="pb-2 text-right font-normal">Leads</th>
              <th scope="col" className="pb-2"><span className="sr-only">Flag</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {CAMPAIGNS.map((c) => (
              <tr key={c.name}>
                <td className="py-2 pr-2 text-white/90">{c.name}</td>
                <td className="py-2 text-right font-mono tabular-nums">{inr.format(c.spend)}</td>
                <td className="py-2 text-right font-mono tabular-nums">{c.leads}</td>
                <td className="py-2 pl-2 text-right">
                  {c.flag === "waste" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#f47a6e]/15 px-2 py-0.5 text-[11px] font-medium text-[#ff9b91]">
                      <TriangleAlert className="size-3" aria-hidden /> Wasting
                    </span>
                  ) : c.flag === "best" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#5cc97e]/15 px-2 py-0.5 text-[11px] font-medium text-[#7fdc9b]">
                      <Trophy className="size-3" aria-hidden /> Best
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 rounded-lg bg-white/[0.06] p-3">
          <p className="text-[11px] text-white/60">New leads</p>
          <ul className="mt-1.5 space-y-1">
            {feed.map((f, idx) => (
              <li key={`${f}-${idx}-${feed.length}`} className="flex items-center justify-between text-xs motion-safe:animate-[lead-in_400ms_ease-out]">
                <span>{f}</span>
                <span className="rounded bg-taxi px-1.5 py-0.5 text-[10px] font-semibold text-ink">NEW</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="px-3 pt-2 pb-1 text-[11px] text-white/50">Example data. Your overview shows your own accounts.</figcaption>
    </figure>
  );
}
