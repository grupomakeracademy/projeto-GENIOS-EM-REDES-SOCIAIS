export default function Loading() {
  return (
    <div aria-busy="true" className="grid two">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
