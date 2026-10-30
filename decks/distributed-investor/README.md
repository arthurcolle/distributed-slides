# Distributed Systems investor presentation

A source-backed investor story, authored as a flagship example of Distributed-Slides itself. Sixteen scenes connect the autonomous-organization vision to the actual DSCO harness, action layer, routing and memory components, the HEAT application, commercial approach and proposed financing.

## Run

```sh
npm run investor
# Presenter: http://127.0.0.1:4621/
# Audience:  http://127.0.0.1:4621/?audience=1
npm run test:investor
npm run export-pdf -- distributed-investor
npm run export-gifs -- distributed-investor --route=technical
```

The generated `dist/` folder is portable and offline. `index.html` provides the presenter desk and synchronized audience window. `print.html` is the notes-free static storyboard. The scene index provides a full investor route, a short introduction and a technical-evidence route.

## Animation contract

Three bespoke SVG scenes progressively assemble the architecture, illustrate admission before execution, and explain organization state across changing workers. They use the existing engine's deterministic presenter clock. Reverse seeking, replay and reduced motion resolve from the same state function. These animations explain architecture. They are not live telemetry, execution receipts or performance measurements.

## Evidence and boundaries

- Sources live in each scene's `source` and presenter `notes` fields.
- Public product descriptions: https://distributed.systems/
- Founder video links: https://www.youtube.com/watch?v=YUNJ2eLQWhw · https://www.youtube.com/watch?v=qFJYxZnNPhM&t=811s · https://www.youtube.com/watch?v=P45b2Fd7kC4&t=1s · https://www.youtube.com/watch?v=bj933QQfI3k
- An October 30, 2026 read-only review inspected DSCO CLI, Tool Management, Router, GraphSub and HEAT source/runtime documentation. It did not execute fresh production integration tests.
- Revenue is founder-reported services revenue from one client, not independently verified financials or ARR.
- Financing is a proposed ask. Approximate allocations are arithmetic implications, not a costed budget or money raised.
- HEAT is a research and operations application. Its documented order-placement schedules were paused at review. Autonomous live trading and investment returns are not claimed.
- Mainline Protocol remains a spinout in process. Organization Compiler remains prototype architecture.
- No unsupported efficiency percentage, customer count, market size, GPU fleet, profitability or benchmark claim appears in this deck.

This example does not publish itself or send investor email. Review the source and storyboard before external use.
