import { PhaseBoard } from "@/components/phase-board";

export default function HomePage() {
  return (
    <main className="page-wrap">
      <section className="panel hero">
        <h2>GoboPad</h2>
        <h1>Browser-Based Gobo Variant Generator</h1>
        <p>
          Phase 1 foundation is now set to your brand system. Next build steps are processing utilities, upload UX,
          and export flow.
        </p>
        <div className="btn-row">
          <button className="btn btn-primary" type="button">
            Start Upload Flow
          </button>
          <button className="btn btn-secondary" type="button">
            Open Build Checklist
          </button>
        </div>
      </section>

      <section className="grid">
        <article className="panel card span-8">
          <h3>What Is Locked In</h3>
          <p>
            Stateless architecture, local image processing, local ZIP export, and optional Google Drive direct upload.
            No database dependency for v1.
          </p>
          <PhaseBoard />
        </article>
        <article className="panel card span-4">
          <h4>Brand Tokens</h4>
          <p>
            Primary Blue: <strong>#284357</strong>
          </p>
          <p>
            Primary Gold: <strong>#998456</strong>
          </p>
          <p>
            Primary White: <strong>#F9F9F8</strong>
          </p>
          <p>
            Gradient: <strong>#2B5572</strong> to <strong>#193245</strong>
          </p>
        </article>
      </section>
    </main>
  );
}
