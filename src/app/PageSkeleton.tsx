/** Shown the moment a menu item is clicked, while the page loads. */
export function PageSkeleton() {
  return (
    <div className="skeleton" role="status" aria-label="Loading">
      <span className="sk-line" />
      <span className="sk-block" />
      <span className="sk-block short" />
    </div>
  );
}
