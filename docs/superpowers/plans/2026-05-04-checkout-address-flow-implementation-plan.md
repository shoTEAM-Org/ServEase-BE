# Checkout Address Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use the approved implementation workflow for task-by-task execution. This plan assumes the design in `docs/superpowers/specs/2026-05-04-checkout-address-flow-design.md` has been approved.

**Goal:** Replace technical coordinate entry in customer checkout with a friendly address flow that supports saved addresses, current location, and brand-new booking-only addresses.

**Architecture:** Keep saved-address management separate from checkout composition, normalize all address choices into one internal payload, geocode behind the scenes, and refresh pricing when the selected service location changes.

**Tech Stack:** Expo React Native mobile, Expo Router, NestJS gateway, Supabase-backed address persistence, browser geolocation on web, native geolocation on mobile, existing pricing quote flow

---

## File Map

**ServEase-MB — modified**
- `app/booking/new.tsx` — checkout address block, new-address composer, save toggle, pricing refresh
- `app/addresses/edit.tsx` — remove customer-facing latitude/longitude inputs, keep saved-address edit flow readable
- `src/types.ts` — add normalized checkout address payload shape if needed
- `src/state/AppState.tsx` — support booking-only address objects and optional save path
- `src/services/geocodingService.ts` — reuse geocoding for checkout address lookup and failure handling
- `src/services/geolocationService.ts` — ensure current-location shortcut works on web and native
- `src/services/serveaseClient.ts` — booking payload and address persistence calls
- `src/components/MapSketch.tsx` or a nearby shared map component — optional pin refinement / visual preview only if needed
- `__tests__/` — new or updated tests for checkout address flow and geolocation behavior

**ServEase-BE — modified only if backend booking payload shape or address snapshot handling needs adjustment**
- `apps/booking-service/src/booking.service.ts` — accept normalized booking address payload if current booking API needs expansion
- `libs/common/src/pricing/pricing-engine.ts` — only if request payload shape needs a small compatibility tweak

---

## Phase 0: Confirm Current Address Paths and Booking Payload Shape

**Objective:** Identify the smallest surface area needed to support checkout-time address creation without introducing a new backend model.

**Tasks:**
1. Review checkout screen address state in `app/booking/new.tsx`
2. Review saved-address CRUD flow in `app/addresses/edit.tsx`
3. Review current booking payload and pricing quote request shape in `src/services/serveaseClient.ts`
4. Confirm current customer address storage in `AppState` and `Address` type
5. Identify whether booking-only addresses can be sent as an address snapshot without backend schema changes

**Deliverable:** Short implementation note describing which existing objects can be reused and which need extension.

**Validation:**
- [ ] Current checkout address path documented
- [ ] Current saved-address path documented
- [ ] Booking payload shape identified

---

## Phase 1: Remove Customer-Facing Coordinate Entry

**Objective:** Make saved-address editing readable and eliminate latitude/longitude fields from customer-facing checkout UI.

**Tasks:**
1. Update `app/addresses/edit.tsx` so customers edit label, address line, city, and notes only
2. Keep the map preview or pin helper as a visual aid, but hide latitude/longitude inputs
3. If needed, resolve coordinates behind the scenes from the entered address line + city
4. Preserve save behavior for existing addresses

**Validation:**
- [ ] No customer-facing latitude/longitude fields remain in saved-address UI
- [ ] Existing saved addresses still edit and save correctly
- [ ] Map preview remains usable if present

---

## Phase 2: Build Checkout Address Composer

**Objective:** Add a single checkout section that supports saved addresses, current location, and brand-new booking-only addresses.

**Tasks:**
1. Add a checkout address block to `app/booking/new.tsx`
2. Render saved addresses as selectable cards
3. Add **Use my current location** shortcut
4. Add inline **New address** composer for label, address line, city, notes
5. Add **Save to my address book** toggle defaulting to off
6. Normalize the selected address into one internal checkout payload

**Validation:**
- [ ] Saved address can be selected from checkout
- [ ] Current location can be used from checkout
- [ ] Brand-new address can be entered during checkout
- [ ] New address defaults to booking-only

---

## Phase 3: Geocode and Resolve Coordinates Behind the Scenes

**Objective:** Convert every checkout address path into coordinates without asking customers to type them.

**Tasks:**
1. Reuse `geocodingService.ts` for new booking addresses and address edits
2. Ensure `geolocationService.ts` handles current location on mobile web and native mobile
3. Add failure states for geocoding permission errors, ambiguous results, and unavailable browser geolocation
4. Keep map pin adjustments optional and internal-only
5. Cache or debounce address resolution enough to avoid repeated lookup spam during checkout edits

**Validation:**
- [ ] Current location returns coordinates on supported platforms
- [ ] New address can be resolved without manual coordinates
- [ ] Geocoding failure is surfaced clearly to the customer
- [ ] Coordinate resolution does not block checkout unnecessarily

---

## Phase 4: Wire Booking Payload and Pricing Refresh

**Objective:** Ensure the selected service location updates quote and booking submission immediately.

**Tasks:**
1. Update booking payload assembly in `app/booking/new.tsx`
2. Pass resolved checkout coordinates into pricing quote requests
3. Refresh pricing whenever the selected address changes
4. Submit booking snapshots with address text plus hidden coordinates
5. Preserve booking-only addresses unless the save toggle is enabled

**Validation:**
- [ ] Quote updates when address changes
- [ ] Booking submission uses the chosen checkout address
- [ ] Booking-only address is not persisted to address book
- [ ] Saved new address still saves when toggle is enabled

---

## Phase 5: Persist Optional New Addresses

**Objective:** Reuse the existing address book when customers choose to save a new checkout address.

**Tasks:**
1. Route saved-toggle checkout addresses through existing address persistence logic
2. Reuse saved-address IDs where possible after persistence
3. Keep booking snapshot separate from address-book persistence
4. Ensure future checkouts show newly saved addresses in the selector

**Validation:**
- [ ] Saved toggle persists the new address
- [ ] New saved address appears in future saved-address lists
- [ ] Booking-only address remains one-time when not saved

---

## Phase 6: Testing and UX Validation

**Objective:** Verify the checkout flow is usable on mobile web and native mobile without coordinate exposure.

**Tasks:**
1. Add tests for saved-address selection in checkout
2. Add tests for current-location shortcut behavior
3. Add tests for new booking-only address creation
4. Add tests for optional save toggle persistence
5. Add tests for quote refresh on address change
6. Manually validate on mobile web and native mobile if available

**Validation:**
- [ ] Saved-address checkout test passes
- [ ] Current-location checkout test passes
- [ ] New booking-only address checkout test passes
- [ ] Save-toggle persistence test passes
- [ ] Pricing refresh test passes

---

## Dependency Graph

```
Phase 0
  ├─> Phase 1
  ├─> Phase 2
  │     ├─> Phase 3
  │     └─> Phase 4
  ├─> Phase 5
  └─> Phase 6

Phase 2 + Phase 3 + Phase 4 form the critical checkout path.
Phase 5 depends on address persistence shape from Phase 0.
Phase 6 depends on all prior phases.
```

---

## Parallelization Opportunities

1. Phase 1 and Phase 2 can be started in parallel once the current address payload shape is confirmed.
2. Phase 3 can be implemented alongside Phase 5 if the payload contract is stable.
3. Tests in Phase 6 can be written incrementally as each checkout behavior lands.

---

## Rollout Milestones

### Milestone 1: Readable Address Editing
Customers can edit and save addresses without seeing raw coordinates.

### Milestone 2: Checkout Address Composer
Checkout can use saved addresses, current location, or a brand-new address.

### Milestone 3: Hidden Coordinate Resolution
Coordinates are resolved internally for pricing and booking.

### Milestone 4: Optional Address Saving
New addresses can be persisted only when customers explicitly choose to save them.

### Milestone 5: Verified Checkout Behavior
Checkout works on mobile web and native mobile with pricing refresh and fallback handling.

---

## Testing Requirements

- Unit tests for geocoding / geolocation helpers
- Component tests for checkout address selection and save toggle
- Integration tests for booking payload and address persistence
- Manual browser validation for desktop and mobile web
- Mobile device validation for native geolocation path

---

## Risk Mitigation

### Risk: Checkout becomes too complex
**Mitigation:** Keep new address flow inline and default to a collapsed form until needed.

### Risk: Geocoding fails for partial addresses
**Mitigation:** Allow customers to refine the address or use current location before blocking checkout.

### Risk: Existing address persistence logic is too coupled to saved addresses
**Mitigation:** Introduce a normalized booking address object and adapt persistence only at the edges.

### Risk: Pricing quote and checkout address drift out of sync
**Mitigation:** Recompute quote immediately when the selected address changes.

---

## Definition of Done

- Customers can select a saved address during checkout
- Customers can use their current location during checkout
- Customers can create a brand-new address during checkout
- New addresses default to booking-only
- Customers can opt into saving the new address
- No customer-facing latitude/longitude fields remain in checkout
- Pricing updates when the selected address changes
- Flow works on mobile web and native mobile
