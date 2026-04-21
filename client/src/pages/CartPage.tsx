/*
Brand reminder — Broadcast Noir Athletics:
Checkout should feel ready for a real payment provider: calm, premium,
clear hierarchy, and no cheap gambling cues.
*/

import { CheckCircle2, Clock3, CreditCard, XCircle } from "lucide-react";
import { GlassPanel, ScreenFrame, SectionHeader } from "@/components/predictor10/Primitives";
import { paymentStates, paymentSummary } from "@/lib/mockData";

export default function CartPage() {
  return (
    <ScreenFrame>
      <GlassPanel>
        <SectionHeader
          eyebrow="Cart / payment"
          title="A polished checkout shell, ready for provider wiring"
          description="No real processing is connected yet, but these states show where payment intent, verification, success, and failure can slot into the product later."
        />

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">Order summary</p>
              <h3 className="mt-3 font-['Barlow_Condensed'] text-4xl font-bold uppercase text-white">
                {paymentSummary.leagueName}
              </h3>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Round", value: paymentSummary.roundLabel },
                  { label: "Entries", value: String(paymentSummary.entries) },
                  { label: "Subtotal", value: `£${paymentSummary.subtotal}` },
                  { label: "Total", value: `£${paymentSummary.total}` },
                ].map((item) => (
                  <div key={item.label} className="rounded-[1.2rem] border border-white/8 bg-black/20 px-4 py-4">
                    <p className="text-[0.68rem] uppercase tracking-[0.22em] text-white/40">{item.label}</p>
                    <p className="mt-2 text-base font-semibold text-white">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-emerald-200">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Provider-ready slot</h3>
                  <p className="text-sm text-white/58">Stripe or another payment provider can connect here in a later phase.</p>
                </div>
              </div>

              <button
                type="button"
                className="mt-5 inline-flex w-full items-center justify-center rounded-[1.25rem] border border-emerald-300/20 bg-emerald-400/14 px-5 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-emerald-400/20"
              >
                Pay Now
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {Object.entries(paymentStates).map(([state, config]) => {
              const icon =
                state === "Success"
                  ? CheckCircle2
                  : state === "Failed"
                    ? XCircle
                    : Clock3;
              const Icon = icon;
              return (
                <div key={state} className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-white/82">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[0.68rem] uppercase tracking-[0.24em] text-white/40">Mock state</p>
                      <h4 className="font-semibold text-white">{config.title}</h4>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/60">{config.detail}</p>
                </div>
              );
            })}
          </div>
        </div>
      </GlassPanel>
    </ScreenFrame>
  );
}
