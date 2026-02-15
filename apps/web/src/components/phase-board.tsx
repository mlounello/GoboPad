const phases = [
  { name: "Upload", state: "Ready", detail: "Drag files or browse from device." },
  { name: "Settings", state: "Ready", detail: "Choose percentages, quality, and prefix mode." },
  { name: "Generate", state: "Pending", detail: "Client-side canvas pipeline (no server compute)." },
  { name: "Export", state: "Pending", detail: "ZIP download and optional Google Drive upload." }
];

export function PhaseBoard() {
  return (
    <div className="status-list">
      {phases.map((phase) => (
        <div key={phase.name}>
          <h6>{phase.name}</h6>
          <p>
            <strong>{phase.state}.</strong> {phase.detail}
          </p>
        </div>
      ))}
    </div>
  );
}
