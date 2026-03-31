# Communications Visits Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen visits map modal inside Centro de Comunicaciones that visualizes Cadiz and Huelva customers from the CRM, grouped by city and centered around Jerez de la Frontera.

**Architecture:** Keep Communications as the entry point and move map behavior into a dedicated modal component plus a small utility module for filtering, grouping, coordinate fallback, and distance calculations. Use React Leaflet for rendering, CRM `/api/customers` data already loaded by Communications, and localStorage-backed coordinate caching for customer markers.

**Tech Stack:** React, TypeScript, React Leaflet, Leaflet, Node test runner with `tsx`

---

### Task 1: Visits Map Data Utilities

**Files:**
- Create: `src/components/communications/visitsMapUtils.ts`
- Create: `src/components/communications/visitsMapUtils.test.ts`

- [ ] Write the failing utility tests for province filtering, city grouping, and Jerez distance ordering.
- [ ] Run `node --import tsx --test src/components/communications/visitsMapUtils.test.ts` and confirm failure.
- [ ] Implement the minimal utility functions to satisfy the tests.
- [ ] Re-run `node --import tsx --test src/components/communications/visitsMapUtils.test.ts` and confirm pass.

### Task 2: Full-Screen Visits Map Modal

**Files:**
- Create: `src/components/communications/VisitsMapModal.tsx`
- Modify: `src/pages/Communications.tsx`

- [ ] Build the modal shell with header, close action, city list, and map canvas.
- [ ] Use the utility module to derive Cadiz/Huelva city groups from loaded CRM customers.
- [ ] Add customer markers, city markers, route lines from Jerez, and popup/list interactions.
- [ ] Add user geolocation support with a locate-me action.

### Task 3: Verification

**Files:**
- Modify: `package.json` only if a dedicated test script is needed.

- [ ] Run the utility tests again.
- [ ] Run `npm run check`.
- [ ] Run `npm run build`.
- [ ] Fix any integration issues until all checks pass.
