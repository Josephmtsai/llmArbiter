## 1. Mobile Breakpoints — pages/index.vue style block

- [x] 1.1 Add `@media (max-width: 768px)` rule for `.arb-analyze`: switch grid to single column (`grid-template-columns: 1fr`)
- [x] 1.2 Add `@media (max-width: 768px)` rule for `.arb-analyze__input-row`: switch to `flex-direction: column-reverse` and `align-items: stretch`
- [x] 1.3 Add `@media (max-width: 768px)` rule for `.arb-analyze__run-col`: set `align-items: stretch` so the Analyze button stretches full width
- [x] 1.4 Add `@media (max-width: 768px)` rule for `.arb-analyze__result-header`: switch to `flex-direction: column` and `align-items: flex-start` with a small gap
- [x] 1.5 Add `@media (max-width: 768px)` rule for `.arb-analyze__right`: remove any fixed width so it flows to 100%

## 2. Verify

- [x] 2.1 Confirm no horizontal scroll on 375 px viewport (iPhone SE width) in browser DevTools
- [x] 2.2 Confirm Analyze button is full-width and appears above the Failures field on mobile
- [x] 2.3 Confirm right rail (Recent decisions + Confidence routing) renders below the left column on mobile
- [x] 2.4 Confirm result header wraps cleanly when a result is present on mobile
