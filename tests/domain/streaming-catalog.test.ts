import test from "node:test";
import assert from "node:assert/strict";
import {
  SERVICES,
  serviceBySlug,
  providerIdToSlug,
  serviceMonthly,
} from "../../src/domain/streaming/catalog.js";

// Data-quality gate: catches catalog mistakes (a provider id assigned to two
// services, an unsorted tier list) before they can silently corrupt coverage.

test("no TMDb provider_id maps to two different services", () => {
  for (const region of Object.keys(SERVICES)) {
    const seen = new Map<number, string>();
    for (const svc of SERVICES[region]) {
      for (const pid of svc.providerIds) {
        const prev = seen.get(pid);
        assert.equal(prev, undefined, `provider ${pid} on both ${prev} and ${svc.slug} (${region})`);
        seen.set(pid, svc.slug);
      }
    }
  }
});

test("every service has ≥1 tier, sorted cheapest-first, with a unique slug", () => {
  for (const region of Object.keys(SERVICES)) {
    const slugs = new Set<string>();
    for (const svc of SERVICES[region]) {
      assert.ok(svc.tiers.length >= 1, `${svc.slug} has no tiers`);
      for (let i = 1; i < svc.tiers.length; i++) {
        assert.ok(svc.tiers[i].monthly >= svc.tiers[i - 1].monthly, `${svc.slug} tiers not cheapest-first`);
      }
      assert.equal(slugs.has(svc.slug), false, `duplicate slug ${svc.slug}`);
      slugs.add(svc.slug);
    }
  }
});

test("free services price to $0; paid services have a positive cheapest tier", () => {
  for (const svc of SERVICES.US) {
    const cheapest = serviceMonthly(svc, "cheapest") ?? 0;
    if (svc.kind === "paid") assert.ok(cheapest > 0, `${svc.slug} should cost > 0`);
    else assert.equal(cheapest, 0, `${svc.slug} should be free`);
  }
});

test("providerIdToSlug + serviceBySlug are consistent with SERVICES", () => {
  for (const svc of SERVICES.US) {
    assert.equal(serviceBySlug.US[svc.slug], svc);
    for (const pid of svc.providerIds) {
      assert.equal(providerIdToSlug.US.get(pid), svc.slug);
    }
  }
});

test("ad-free policy excludes always-ad services (Tubi/Pluto)", () => {
  assert.equal(serviceMonthly(serviceBySlug.US["tubi"], "adfree"), null);
  assert.equal(serviceMonthly(serviceBySlug.US["kanopy"], "adfree"), 0); // library = no ads
  assert.ok((serviceMonthly(serviceBySlug.US["netflix"], "adfree") ?? 0) > 0);
});
